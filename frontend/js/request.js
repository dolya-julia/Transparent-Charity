
const urlParams = new URLSearchParams(window.location.search);
const requestId = Number(urlParams.get("id"));

const validRequestId =
    Number.isSafeInteger(requestId) && requestId > 0;

let currentEvidenceHash = "";


// =========================================================
// 1. ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ
// =========================================================

window.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById(
        "requestDetailsContainer"
    );

    if (!validRequestId) {
        if (container) {
            container.innerHTML =
                "<p>Не указан или некорректен ID заявки.</p>";
        }
        return;
    }

    try {
        const ready = await initWeb3();

        if (!ready) return;

        await loadRequestDetails();

    } catch (err) {
        console.error(
            "Ошибка инициализации страницы заявки:",
            err
        );

        if (container) {
            container.innerHTML = `
                <p style="color:var(--danger);">
                    Не удалось подключить блокчейн:
                    ${escapeHtml(getErrorMessage(err))}
                </p>
            `;
        }
    }
});


// =========================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================================

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}


function safeHttpUrl(value) {
    if (!value) return "";

    try {
        const url = new URL(
            value,
            window.location.origin
        );

        if (
            url.protocol === "http:" ||
            url.protocol === "https:"
        ) {
            return escapeHtml(url.href);
        }

    } catch (err) {
        console.warn("Некорректный URL:", value);
    }

    return "";
}


function formatEth(value) {
    try {
        return ethers.formatEther(value);
    } catch (err) {
        console.warn("Ошибка форматирования ETH:", err);
        return "0";
    }
}


function requireContract(instance, name) {
    if (!instance) {
        throw new Error(
            `${name} не инициализирован.`
        );
    }
}


function requireMethod(instance, methodName, contractName) {
    requireContract(instance, contractName);

    if (typeof instance[methodName] !== "function") {
        throw new Error(
            `В ABI ${contractName} отсутствует функция ${methodName}().`
        );
    }
}


function isWalletConnected() {
    return (
        typeof signer !== "undefined" &&
        Boolean(signer) &&
        typeof userAddress !== "undefined" &&
        Boolean(userAddress)
    );
}


function isDaoMember() {
    return (
        typeof userRoles !== "undefined" &&
        Boolean(userRoles?.isMember)
    );
}


function isRequesterAddress(requester) {
    return (
        isWalletConnected() &&
        String(requester).toLowerCase() ===
        String(userAddress).toLowerCase()
    );
}


function getStatusInfo(status) {
    const statusNum = Number(status);

    if (
        typeof STATUS_LABELS !== "undefined" &&
        STATUS_LABELS[statusNum]
    ) {
        return STATUS_LABELS[statusNum];
    }

    const fallback = {
        0: { text: "На проверке", cls: "badge-yellow" },
        1: { text: "Требуются изменения", cls: "badge-yellow" },
        2: { text: "Голосование", cls: "badge-blue" },
        3: { text: "Одобрена", cls: "badge-green" },
        4: { text: "Отклонена", cls: "badge-red" },
        5: { text: "Завершена", cls: "badge-green" },
        6: { text: "Отменена", cls: "badge-gray" }
    };

    return fallback[statusNum] || {
        text: "Неизвестный статус",
        cls: "badge-gray"
    };
}


function isPreparationStatus(status) {
    return (
        Number(status) === REQUEST_STATUS.UNDER_REVIEW ||
        Number(status) === REQUEST_STATUS.CHANGES_REQUESTED
    );
}


// Проверка существования этапа.
//
// В актуальном ABI getMilestone() может возвращать структуру
// без поля exists. В таком случае проверяем основные поля
// самого этапа. Если поле exists присутствует в ABI,
// учитываем его значение.

function isValidMilestone(ms) {
    if (!ms) return false;

    if (ms.exists !== undefined) {
        return Boolean(ms.exists);
    }

    const description = String(ms.description ?? "").trim();
    const recipient = String(ms.recipient ?? "");

    return (
        description.length > 0 &&
        ethers.isAddress(recipient) &&
        recipient.toLowerCase() !== ethers.ZeroAddress.toLowerCase()
    );
}


function getTransactionError(err) {
    if (err?.code === 4001) {
        return "Вы отклонили транзакцию в MetaMask.";
    }

    return getErrorMessage(err);
}


// =========================================================
// 3. ЗАГРУЗКА ИНФОРМАЦИИ О ЗАЯВКЕ
// =========================================================

async function loadRequestDetails() {
    const container = document.getElementById(
        "requestDetailsContainer"
    );

    if (!container) {
        console.error("Не найден requestDetailsContainer.");
        return;
    }

    try {
        requireMethod(
            daoViewContract,
            "getAidRequestInfo",
            "RescueDAOView"
        );

        requireMethod(
            daoViewContract,
            "getAidRequestStats",
            "RescueDAOView"
        );

        requireMethod(
            daoViewContract,
            "hasParticipantVoted",
            "RescueDAOView"
        );

        requireContract(contract, "RescueDAO");
        requireContract(milestonesContract, "RescueMilestones");
        requireContract(treasuryContract, "RescueTreasury");

        // -------------------------------------------------
        // Получение данных заявки
        // -------------------------------------------------

        const [info, stats] = await Promise.all([
            daoViewContract.getAidRequestInfo(requestId),
            daoViewContract.getAidRequestStats(requestId)
        ]);

        const statusNum = Number(stats.status);

        const statusObj = getStatusInfo(statusNum);

        const isRequester = isRequesterAddress(
            info.requester
        );

        // -------------------------------------------------
        // Дополнительные данные с backend
        // -------------------------------------------------

        let meta = {
            photoUrl: "",
            docUrl: "",
            fullStory: ""
        };

        try {
            const response = await fetch(
                `${API_URL}/requests/${requestId}`
            );

            if (response.ok) {
                const responseData = await response.json();

                meta = {
                    ...meta,
                    ...(responseData.data || responseData)
                };
            }

        } catch (err) {
            console.warn(
                "Не удалось загрузить метаданные заявки:",
                err
            );
        }

        currentEvidenceHash = String(
            info.evidenceHash || ""
        );

        // -------------------------------------------------
        // Срок голосования
        // -------------------------------------------------

        const votingEndsAt = Number(
            stats.votingEndsAt
        );

        const endsDate = votingEndsAt > 0
            ? new Date(votingEndsAt * 1000).toLocaleString("ru-RU")
            : "Ещё не назначено";

        const nowSec = Math.floor(Date.now() / 1000);

        const votingEnded =
            votingEndsAt > 0 && nowSec >= votingEndsAt;

        // -------------------------------------------------
        // Проверка голоса пользователя
        // -------------------------------------------------

        const voted = userAddress
            ? await daoViewContract.hasParticipantVoted(
                requestId,
                userAddress
            )
            : false;

        // =================================================
        // ЦЕЛЕВЫЕ ПОЖЕРТВОВАНИЯ
        // =================================================

        let targetDonations = 0n;
        let personalDonations = 0n;

        let treasuryAvailable = false;
        let treasuryError = "";

        try {
            requireMethod(
                treasuryContract,
                "requestDonations",
                "RescueTreasury"
            );

            requireMethod(
                treasuryContract,
                "userRequestDonations",
                "RescueTreasury"
            );

            const [totalDonations, myDonations] =
                await Promise.all([
                    treasuryContract.requestDonations(requestId),

                    userAddress
                        ? treasuryContract.userRequestDonations(
                            requestId,
                            userAddress
                        )
                        : Promise.resolve(0n)
                ]);

            targetDonations = BigInt(totalDonations);
            personalDonations = BigInt(myDonations);
            treasuryAvailable = true;

        } catch (err) {
            treasuryError = getErrorMessage(err);

            console.error(
                "Ошибка чтения целевых пожертвований:",
                err
            );
        }

        // -------------------------------------------------
        // Расчёт прогресса финансирования
        // -------------------------------------------------

        const requestedAmount = BigInt(
            stats.requestedAmount
        );

        const remainingAmount =
            requestedAmount > targetDonations
                ? requestedAmount - targetDonations
                : 0n;

        const fundingProgress =
            requestedAmount > 0n
                ? Number(
                    targetDonations >= requestedAmount
                        ? 100n
                        : targetDonations * 100n / requestedAmount
                )
                : 0;

        // Целевые пожертвования принимаются только
        // во время голосования.
        const canDonateToRequest =
            statusNum === REQUEST_STATUS.VOTING &&
            !votingEnded &&
            remainingAmount > 0n &&
            treasuryAvailable &&
            isWalletConnected();

        // =================================================
        // ФОТОГРАФИЯ
        // =================================================

        const photoUrl = safeHttpUrl(meta.photoUrl);

        const photoBlock = photoUrl
            ? `
                <img
                    src="${photoUrl}"
                    alt="${escapeHtml(info.animalName)}"
                    class="details-hero-img"
                    style="
                        width:100%;
                        max-height:340px;
                        object-fit:cover;
                        border-radius:0.75rem;
                        margin:1rem 0;
                    "
                >
            `
            : `
                <div
                    class="card-img"
                    style="
                        border-radius:0.75rem;
                        margin:1rem 0;
                        text-align:center;
                        padding:2rem;
                        background:#f1f5f9;
                    "
                >
                    🐾
                </div>
            `;

        // =================================================
        // ДОКУМЕНТ ЗАЯВКИ
        // =================================================

        const docUrl = safeHttpUrl(meta.docUrl);

        const downloadDocLink = docUrl
            ? `
                <div style="margin-top:0.4rem;">
                    <a
                        href="${docUrl}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="tx-link"
                    >
                        📄 Скачать документ для проверки хэша &nearr;
                    </a>
                </div>
            `
            : "";

        // =================================================
        // ИНФОРМАЦИОННОЕ СООБЩЕНИЕ О СТАДИИ ЗАЯВКИ
        // =================================================

        let lifecycleMessage = "";

        if (statusNum === REQUEST_STATUS.UNDER_REVIEW) {
            lifecycleMessage = `
                <div class="box" style="margin-top:1rem;">
                    <strong>Заявка находится на проверке.</strong>
                    <p style="margin-top:0.4rem;color:var(--text-muted);">
                        Администратор проверяет материалы заявки.
                        Инициатор может дополнять описание и редактировать
                        этапы финансирования до публикации заявки.
                    </p>
                </div>
            `;

        } else if (statusNum === REQUEST_STATUS.CHANGES_REQUESTED) {
            lifecycleMessage = `
                <div class="box" style="margin-top:1rem;border-left:4px solid var(--warning);">
                    <strong>По заявке требуются изменения.</strong>
                    <p style="margin-top:0.4rem;color:var(--text-muted);">
                        Инициатор может исправить материалы и этапы,
                        после чего повторно отправить заявку на проверку.
                    </p>
                </div>
            `;

        } else if (statusNum === REQUEST_STATUS.VOTING) {
            lifecycleMessage = `
                <div class="box" style="margin-top:1rem;">
                    <strong>Заявка опубликована.</strong>
                    <p style="margin-top:0.4rem;color:var(--text-muted);">
                        Состав и суммы этапов зафиксированы.
                        Изменение этапов на этой стадии недоступно.
                    </p>
                </div>
            `;

        } else if (statusNum === REQUEST_STATUS.APPROVED) {
            lifecycleMessage = `
                <div class="box" style="margin-top:1rem;">
                    <strong>Заявка одобрена.</strong>
                    <p style="margin-top:0.4rem;color:var(--text-muted);">
                        Инициатор может отправлять подтверждающие документы
                        по этапам. После проверки валидаторами средства
                        перечисляются соответствующим получателям.
                    </p>
                </div>
            `;
        }

        // =================================================
        // ГОЛОСОВАНИЕ DAO
        // =================================================

        let votingControls = "";

        if (statusNum === REQUEST_STATUS.VOTING) {

            if (!votingEnded && isDaoMember() && !voted && isWalletConnected()) {
                votingControls = `
                    <div style="
                        display:flex;
                        gap:0.75rem;
                        margin-top:1rem;
                    ">
                        <button
                            class="btn btn-primary"
                            style="flex:1;"
                            onclick="castVote(true)"
                        >
                            👍 Голосовать ЗА
                        </button>

                        <button
                            class="btn btn-danger"
                            style="flex:1;"
                            onclick="castVote(false)"
                        >
                            👎 Голосовать ПРОТИВ
                        </button>
                    </div>
                `;

            } else if (voted) {
                votingControls = `
                    <p style="margin-top:0.75rem;" class="badge badge-blue">
                        Вы уже проголосовали по этой заявке
                    </p>
                `;

            } else if (!isWalletConnected()) {
                votingControls = `
                    <p style="margin-top:0.75rem;color:var(--text-muted);">
                        Подключите кошелёк, чтобы проголосовать.
                    </p>
                `;

            } else if (!isDaoMember()) {
                votingControls = `
                    <p style="margin-top:0.75rem;color:var(--text-muted);">
                        Голосовать могут только зарегистрированные
                        участники DAO.
                    </p>
                `;
            }

            if (votingEnded) {
                votingControls += `
                    <button
                        class="btn btn-dark"
                        style="width:100%;margin-top:1rem;"
                        onclick="finalizeReq()"
                    >
                        Подвести итоги голосования
                    </button>
                `;
            }
        }

        // =================================================
        // БЛОК ЦЕЛЕВОГО ФИНАНСИРОВАНИЯ
        // =================================================

        let targetFundingBlock = "";

        if (treasuryAvailable) {
            targetFundingBlock = `
                <div class="box" style="margin-top:1rem;border:1px solid var(--border);">

                    <h3 style="margin-bottom:0.75rem;">
                        🎯 Целевое финансирование заявки
                    </h3>

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        gap:0.5rem;
                        margin-bottom:0.5rem;
                        font-size:0.9rem;
                    ">
                        <span>Собрано:</span>
                        <strong>${formatEth(targetDonations)} ETH</strong>
                    </div>

                    <div style="
                        width:100%;
                        height:12px;
                        background:var(--border);
                        border-radius:999px;
                        overflow:hidden;
                        margin-bottom:0.5rem;
                    ">
                        <div style="
                            width:${fundingProgress}%;
                            height:100%;
                            background:var(--primary);
                            border-radius:999px;
                            transition:width 0.3s ease;
                        "></div>
                    </div>

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        gap:0.5rem;
                        font-size:0.82rem;
                        color:var(--text-muted);
                    ">
                        <span>Прогресс сбора</span>
                        <strong>${fundingProgress}%</strong>
                    </div>

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        gap:0.5rem;
                        margin-top:0.9rem;
                        font-size:0.9rem;
                    ">
                        <span>Цель сбора:</span>
                        <strong>${formatEth(requestedAmount)} ETH</strong>
                    </div>

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        gap:0.5rem;
                        margin-top:0.4rem;
                        font-size:0.9rem;
                    ">
                        <span>Осталось собрать:</span>
                        <strong style="color:var(--primary);">
                            ${formatEth(remainingAmount)} ETH
                        </strong>
                    </div>

                    ${
                        userAddress
                            ? `
                                <div style="
                                    display:flex;
                                    justify-content:space-between;
                                    gap:0.5rem;
                                    margin-top:0.4rem;
                                    font-size:0.9rem;
                                ">
                                    <span>Ваш вклад:</span>
                                    <strong>
                                        ${formatEth(personalDonations)} ETH
                                    </strong>
                                </div>
                            `
                            : `
                                <p style="
                                    margin-top:0.75rem;
                                    font-size:0.85rem;
                                    color:var(--text-muted);
                                ">
                                    Подключите кошелёк, чтобы увидеть
                                    свой вклад в финансирование заявки.
                                </p>
                            `
                    }

                    ${
                        canDonateToRequest
                            ? `
                                <div style="
                                    margin-top:1rem;
                                    padding-top:0.85rem;
                                    border-top:1px solid var(--border);
                                ">
                                    <h4 style="margin-bottom:0.5rem;">
                                        Поддержать эту заявку
                                    </h4>

                                    <p style="
                                        font-size:0.83rem;
                                        color:var(--text-muted);
                                        margin-bottom:0.65rem;
                                    ">
                                        Пожертвование будет учтено отдельно
                                        от общего фонда и привязано к заявке
                                        #${requestId}.
                                    </p>

                                    <div class="form-group">
                                        <label for="targetDonationAmount">
                                            Сумма пожертвования (ETH)
                                        </label>

                                        <input
                                            type="number"
                                            id="targetDonationAmount"
                                            class="input-field"
                                            step="0.001"
                                            min="0.000000000000000001"
                                            max="${formatEth(remainingAmount)}"
                                            placeholder="Например, 0.01"
                                            style="
                                                width:100%;
                                                padding:0.6rem;
                                                margin-top:0.25rem;
                                            "
                                        >
                                    </div>

                                    <button
                                        class="btn btn-primary"
                                        style="width:100%;margin-top:0.75rem;"
                                        onclick="donateToCurrentRequest()"
                                    >
                                        ❤️ Пожертвовать на эту заявку
                                    </button>
                                </div>
                            `
                            : statusNum !== REQUEST_STATUS.VOTING
                                ? `
                                    <p style="
                                        margin-top:1rem;
                                        font-size:0.85rem;
                                        color:var(--text-muted);
                                    ">
                                        Приём целевых пожертвований откроется
                                        после публикации заявки и завершится
                                        вместе с голосованием.
                                    </p>
                                `
                                : votingEnded
                                    ? `
                                        <p style="
                                            margin-top:1rem;
                                            font-size:0.85rem;
                                            color:var(--text-muted);
                                        ">
                                            Время голосования завершилось.
                                            Целевые пожертвования больше не принимаются.
                                        </p>
                                    `
                                    : remainingAmount === 0n
                                        ? `
                                            <p style="
                                                margin-top:1rem;
                                                font-size:0.85rem;
                                                color:var(--primary);
                                                font-weight:600;
                                            ">
                                                Целевая сумма собрана полностью.
                                            </p>
                                        `
                                        : !isWalletConnected()
                                            ? `
                                                <p style="
                                                    margin-top:1rem;
                                                    font-size:0.85rem;
                                                    color:var(--text-muted);
                                                ">
                                                    Подключите MetaMask, чтобы
                                                    поддержать эту заявку.
                                                </p>
                                            `
                                            : ""
                    }
                </div>
            `;

        } else {
            targetFundingBlock = `
                <div class="box" style="margin-top:1rem;">
                    <h3>🎯 Целевое финансирование</h3>

                    <p style="
                        margin-top:0.5rem;
                        font-size:0.85rem;
                        color:var(--text-muted);
                    ">
                        Не удалось получить информацию из Treasury.
                        Проверьте адрес RescueTreasury и наличие функций
                        requestDonations и userRequestDonations.
                    </p>

                    <p style="
                        margin-top:0.4rem;
                        font-size:0.78rem;
                        color:var(--text-muted);
                        word-break:break-word;
                    ">
                        ${escapeHtml(treasuryError)}
                    </p>
                </div>
            `;
        }

        // =================================================
        // ФОРМА ДОБАВЛЕНИЯ ЭТАПА
        // =================================================

        const canPrepareMilestones =
            isPreparationStatus(statusNum) &&
            isRequester;

        const addMilestoneBlock = canPrepareMilestones
            ? `
                <div class="box" style="margin-top:1rem;">

                    <h3>Добавить этап финансирования</h3>

                    <p style="
                        font-size:0.85rem;
                        color:var(--text-muted);
                        margin-bottom:0.75rem;
                    ">
                        Распределено по этапам:

                        <strong>
                            ${formatEth(stats.milestoneTotal)}
                            /
                            ${formatEth(stats.requestedAmount)}
                            ETH
                        </strong>.

                        Сумма всех этапов должна совпадать
                        с запрошенной суммой до публикации заявки.
                    </p>

                    <div class="form-group" style="margin-bottom:0.75rem;">
                        <label for="msDesc">Название этапа</label>

                        <input
                            type="text"
                            id="msDesc"
                            class="input-field"
                            maxlength="200"
                            placeholder="Например: Операция в ветклинике"
                            style="width:100%;padding:0.5rem;margin-top:0.25rem;"
                        >
                    </div>

                    <div class="form-group" style="margin-bottom:0.75rem;">
                        <label for="msRecipient">
                            Адрес получателя (клиника / аптека)
                        </label>

                        <input
                            type="text"
                            id="msRecipient"
                            class="input-field"
                            placeholder="0x..."
                            style="width:100%;padding:0.5rem;margin-top:0.25rem;"
                        >
                    </div>

                    <div class="form-group" style="margin-bottom:0.75rem;">
                        <label for="msAmount">Сумма этапа (ETH)</label>

                        <input
                            type="number"
                            id="msAmount"
                            class="input-field"
                            step="0.001"
                            min="0"
                            placeholder="0.003"
                            style="width:100%;padding:0.5rem;margin-top:0.25rem;"
                        >
                    </div>

                    <button
                        class="btn btn-primary"
                        style="width:100%;"
                        onclick="createNewMilestone()"
                    >
                        Добавить этап
                    </button>

                </div>
            `
            : "";

        // =================================================
        // ОСНОВНАЯ РАЗМЕТКА СТРАНИЦЫ
        // =================================================

        container.innerHTML = `
            <div class="details-layout">

                <div>

                    <div class="box">

                        <div
                            class="card-title-row"
                            style="
                                display:flex;
                                justify-content:space-between;
                                align-items:center;
                                gap:0.75rem;
                                margin-bottom:0.75rem;
                            "
                        >
                            <h1>
                                Заявка #${requestId}:
                                ${escapeHtml(info.animalName)}
                            </h1>

                            <span
                                class="badge ${escapeHtml(statusObj.cls)}"
                                style="padding:0.3rem 0.6rem;border-radius:4px;"
                            >
                                ${escapeHtml(statusObj.text)}
                            </span>
                        </div>

                        <p class="mono">
                            Инициатор:
                            ${escapeHtml(info.requester)}
                        </p>

                        ${photoBlock}

                        <h3 style="margin-top:1rem;">
                            Описание ситуации
                        </h3>

                        <p style="
                            margin:0.5rem 0;
                            color:#334155;
                            white-space:pre-wrap;
                        ">
                            ${escapeHtml(
                                meta.fullStory || info.description
                            )}
                        </p>

                        <div
                            id="nftPassportSection"
                            style="margin-top:1.25rem;"
                        ></div>

                        <div style="
                            font-size:0.88rem;
                            background:#f1f5f9;
                            padding:0.85rem;
                            border-radius:0.6rem;
                            margin-top:1rem;
                        ">

                            <div>
                                <strong>Документы (URI):</strong>
                                ${escapeHtml(info.evidenceURI)}
                            </div>

                            <div class="mono" style="margin-top:0.25rem;">
                                <strong>Хэш в блокчейне:</strong>
                                ${escapeHtml(info.evidenceHash)}
                            </div>

                            ${downloadDocLink}

                            <div style="
                                margin-top:0.75rem;
                                padding-top:0.6rem;
                                border-top:1px solid #cbd5e1;
                            ">
                                <label style="
                                    display:block;
                                    font-size:0.8rem;
                                    font-weight:600;
                                    margin-bottom:0.25rem;
                                ">
                                    Проверить подлинность файла по хэшу:
                                </label>

                                <input
                                    type="file"
                                    id="verifyFileInput"
                                    onchange="verifyDocumentHash()"
                                >

                                <span
                                    id="verifyResult"
                                    style="
                                        font-weight:600;
                                        font-size:0.85rem;
                                        margin-left:0.5rem;
                                    "
                                ></span>
                            </div>

                        </div>

                    </div>

                    ${lifecycleMessage}

                    ${addMilestoneBlock}

                    <div class="box" style="margin-top:1rem;">

                        <h3 style="margin-bottom:1rem;">
                            Этапы финансирования (Milestones)
                        </h3>

                        <div id="milestonesContainer">
                            Загрузка этапов...
                        </div>

                    </div>

                </div>

                <div
                    class="request-sidebar"
                    style="
                        align-self:start;
                        position:sticky;
                        top:90px;
                        display:flex;
                        flex-direction:column;
                        gap:1rem;
                        min-width:0;
                    "
                >

                    ${targetFundingBlock}

                    <div class="box">

                        <h3>Статус и голосование DAO</h3>

                        <div style="
                            display:flex;
                            flex-direction:column;
                            gap:0.65rem;
                            font-size:0.92rem;
                            margin:1rem 0;
                        ">

                            <div style="display:flex;justify-content:space-between;gap:1rem;">
                                <span>Запрошено:</span>
                                <strong>${formatEth(stats.requestedAmount)} ETH</strong>
                            </div>

                            <div style="display:flex;justify-content:space-between;gap:1rem;">
                                <span>Запланировано этапов:</span>
                                <strong>${formatEth(stats.milestoneTotal)} ETH</strong>
                            </div>

                            <div style="display:flex;justify-content:space-between;gap:1rem;">
                                <span>Выплачено:</span>
                                <strong style="color:var(--primary);">
                                    ${formatEth(stats.releasedAmount)} ETH
                                </strong>
                            </div>

                            <div style="display:flex;justify-content:space-between;gap:1rem;">
                                <span>Окончание голосования:</span>
                                <strong style="text-align:right;">
                                    ${endsDate}
                                </strong>
                            </div>

                            <div style="display:flex;justify-content:space-between;gap:1rem;">
                                <span>Голоса ЗА:</span>
                                <strong style="color:var(--primary);">
                                    ${stats.yesVotes}
                                </strong>
                            </div>

                            <div style="display:flex;justify-content:space-between;gap:1rem;">
                                <span>Голоса ПРОТИВ:</span>
                                <strong style="color:var(--danger);">
                                    ${stats.noVotes}
                                </strong>
                            </div>

                        </div>

                        ${votingControls}

                    </div>

                </div>

            </div>
        `;

        // -------------------------------------------------
        // Загрузка этапов
        // -------------------------------------------------

        await loadMilestonesList(
            Number(stats.milestoneCount),
            statusNum,
            isRequester
        );

        // -------------------------------------------------
        // Загрузка NFT-паспорта
        //
        // Передаём статус заявки, чтобы не обращаться
        // к NFT-контракту до публикации заявки.
        // -------------------------------------------------

        await loadNftPassport(
            requestId,
            statusNum
        );

    } catch (err) {
        console.error("Ошибка загрузки заявки:", err);

        container.innerHTML = `
            <p style="color:var(--danger);">
                Ошибка загрузки заявки:
                ${escapeHtml(getErrorMessage(err))}
            </p>
        `;
    }
}


// =========================================================
// 4. ЦЕЛЕВОЕ ПОЖЕРТВОВАНИЕ НА ЗАЯВКУ
// =========================================================

async function donateToCurrentRequest() {
    const amountInput = document.getElementById(
        "targetDonationAmount"
    );

    const amount = amountInput?.value?.trim();

    try {
        if (!isWalletConnected()) {
            throw new Error("Сначала подключите MetaMask.");
        }

        requireMethod(
            contract,
            "donateToRequest",
            "RescueDAO"
        );

        requireMethod(
            daoViewContract,
            "getAidRequestStats",
            "RescueDAOView"
        );

        requireMethod(
            treasuryContract,
            "requestDonations",
            "RescueTreasury"
        );

        if (
            !amount ||
            !/^\d+(\.\d+)?$/.test(amount)
        ) {
            throw new Error("Введите корректную сумму в ETH.");
        }

        const donationWei = ethers.parseEther(amount);

        if (donationWei <= 0n) {
            throw new Error(
                "Сумма пожертвования должна быть больше нуля."
            );
        }

        const [targetDonations, stats] =
            await Promise.all([
                treasuryContract.requestDonations(requestId),
                daoViewContract.getAidRequestStats(requestId)
            ]);

        const statusNum = Number(stats.status);

        if (statusNum !== REQUEST_STATUS.VOTING) {
            throw new Error(
                "Целевые пожертвования принимаются только " +
                "для опубликованных заявок на этапе голосования."
            );
        }

        const votingEndsAt = Number(stats.votingEndsAt);
        const nowSec = Math.floor(Date.now() / 1000);

        if (
            votingEndsAt <= 0 ||
            nowSec >= votingEndsAt
        ) {
            throw new Error(
                "Время голосования завершилось. " +
                "Целевые пожертвования больше не принимаются."
            );
        }

        const requestedAmount = BigInt(stats.requestedAmount);
        const currentDonations = BigInt(targetDonations);

        const remainingAmount =
            requestedAmount > currentDonations
                ? requestedAmount - currentDonations
                : 0n;

        if (remainingAmount === 0n) {
            throw new Error(
                "Целевая сумма заявки уже собрана."
            );
        }

        if (donationWei > remainingAmount) {
            throw new Error(
                "Сумма пожертвования превышает остаток цели. " +
                "Осталось собрать: " +
                formatEth(remainingAmount) +
                " ETH."
            );
        }

        const confirmed = confirm(
            `Вы действительно хотите пожертвовать ${amount} ETH на заявку #${requestId}?`
        );

        if (!confirmed) return;

        const tx = await contract.donateToRequest(
            requestId,
            { value: donationWei }
        );

        alert(
            "Пожертвование отправлено. Ожидаем подтверждения транзакции..."
        );

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция пожертвования не была успешно подтверждена."
            );
        }

        alert(
            "Спасибо! Ваше целевое пожертвование успешно учтено."
        );

        window.location.reload();

    } catch (err) {
        console.error("Ошибка целевого пожертвования:", err);

        alert(
            "Не удалось выполнить пожертвование:\n" +
            getTransactionError(err)
        );
    }
}


// =========================================================
// 5. ЗАГРУЗКА NFT-ПАСПОРТА
// =========================================================

async function loadNftPassport(requestId, statusNum) {
    const nftContainer = document.getElementById(
        "nftPassportSection"
    );

    if (!nftContainer) return;

    // -----------------------------------------------------
    // До публикации заявки NFT-паспорт не существует.
    //
    // Статусы:
    // 0 — UnderReview
    // 1 — ChangesRequested
    //
    // В этих случаях не вызываем getTokenIdForRequest(),
    // поскольку контракт может делать revert, если паспорта нет.
    // -----------------------------------------------------

    if (
        Number(statusNum) === REQUEST_STATUS.UNDER_REVIEW ||
        Number(statusNum) === REQUEST_STATUS.CHANGES_REQUESTED
    ) {
        nftContainer.innerHTML = `
            <div style="
                padding:0.85rem 1rem;
                border:1px dashed var(--border);
                border-radius:0.6rem;
                background:var(--surface);
            ">
                <strong>
                    🐾 NFT-паспорт ещё не выпущен
                </strong>

                <p style="
                    margin-top:0.4rem;
                    font-size:0.88rem;
                    color:var(--text-muted);
                ">
                    NFT-паспорт будет автоматически создан
                    после публикации заявки администратором.
                    Сейчас заявка находится на стадии подготовки
                    и проверки материалов.
                </p>
            </div>
        `;

        return;
    }

    try {
        requireMethod(
            nftContract,
            "getTokenIdForRequest",
            "RescueNFT"
        );

        requireMethod(
            nftContract,
            "ownerOf",
            "RescueNFT"
        );

        requireMethod(
            nftContract,
            "tokenURI",
            "RescueNFT"
        );

        // -------------------------------------------------
        // Получение ID токена
        // -------------------------------------------------

        const tokenId =
            await nftContract.getTokenIdForRequest(requestId);

        if (BigInt(tokenId) === 0n) {
            nftContainer.innerHTML = `
                <p style="color:var(--text-muted);">
                    NFT-паспорт для заявки #${requestId}
                    ещё не выпущен.
                    Он создаётся после публикации заявки.
                </p>
            `;

            return;
        }

        // -------------------------------------------------
        // Получение владельца и метаданных
        // -------------------------------------------------

        const [owner, uri] = await Promise.all([
            nftContract.ownerOf(tokenId),
            nftContract.tokenURI(tokenId)
        ]);

        if (
            !String(uri).startsWith(
                "data:application/json;base64,"
            )
        ) {
            nftContainer.innerHTML = `
                <p class="mono">
                    NFT #${escapeHtml(tokenId)} выпущен.
                    URI: ${escapeHtml(uri)}
                </p>
            `;

            return;
        }

        // -------------------------------------------------
        // Декодирование JSON metadata
        // -------------------------------------------------

        const base64Json = String(uri).split(",")[1];
        const binaryString = window.atob(base64Json);

        const bytes = Uint8Array.from(
            binaryString,
            char => char.charCodeAt(0)
        );

        const jsonString = new TextDecoder().decode(bytes);
        const metadata = JSON.parse(jsonString);

        // -------------------------------------------------
        // Атрибуты NFT
        // -------------------------------------------------

        const attributesHtml =
            (Array.isArray(metadata.attributes)
                ? metadata.attributes
                : []
            )
                .map(attr => `
                    <span
                        class="badge badge-blue"
                        style="
                            margin-right:0.4rem;
                            margin-bottom:0.3rem;
                            display:inline-block;
                        "
                    >
                        ${escapeHtml(attr.trait_type)}:
                        ${escapeHtml(attr.value)}
                    </span>
                `)
                .join("");

        // -------------------------------------------------
        // Изображение NFT
        // -------------------------------------------------

        const imageUrl = String(metadata.image || "");

        const isDataImage =
            /^data:image\/(svg\+xml|png|jpeg|jpg|webp);base64,/i
                .test(imageUrl);

        const httpImageUrl = isDataImage
            ? ""
            : safeHttpUrl(imageUrl);

        const safeImageUrl = isDataImage
            ? imageUrl
            : httpImageUrl;

        const imageBlock = safeImageUrl
            ? `
                <img
                    src="${safeImageUrl}"
                    alt="${escapeHtml(metadata.name || "NFT-паспорт")}"
                    style="
                        width:200px;
                        height:auto;
                        border-radius:0.5rem;
                        border:1px solid #e2e8f0;
                    "
                >
            `
            : "";

        // -------------------------------------------------
        // Отображение NFT-паспорта
        // -------------------------------------------------

        nftContainer.innerHTML = `
            <div style="
                border:1px solid #cbd5e1;
                border-radius:0.75rem;
                padding:1rem;
                background:#ffffff;
            ">

                <div
                    class="row-between"
                    style="margin-bottom:0.75rem;"
                >
                    <h4 style="margin:0;">
                        🐾 Цифровой NFT-паспорт #${escapeHtml(tokenId)}
                    </h4>

                    <span class="badge badge-green">
                        On-Chain SVG
                    </span>
                </div>

                <div style="
                    display:flex;
                    gap:1rem;
                    flex-wrap:wrap;
                    align-items:center;
                ">
                    ${imageBlock}

                    <div style="flex:1;min-width:200px;">
                        <div style="
                            font-weight:600;
                            font-size:1.05rem;
                            margin-bottom:0.35rem;
                        ">
                            ${escapeHtml(
                                metadata.name || "NFT-паспорт животного"
                            )}
                        </div>

                        <p style="
                            font-size:0.88rem;
                            color:#475569;
                            margin-bottom:0.6rem;
                        ">
                            ${escapeHtml(metadata.description || "")}
                        </p>

                        <div
                            class="mono"
                            style="
                                font-size:0.78rem;
                                margin-bottom:0.6rem;
                                word-break:break-all;
                            "
                        >
                            Владелец: ${escapeHtml(owner)}
                        </div>

                        <div>${attributesHtml}</div>
                    </div>
                </div>
            </div>
        `;

    } catch (err) {
        console.error(
            `Ошибка загрузки NFT для заявки #${requestId}:`,
            err
        );

        nftContainer.innerHTML = `
            <div style="
                font-size:0.85rem;
                color:var(--text-muted);
                padding:0.5rem 0;
            ">
                Не удалось загрузить NFT-паспорт.
                Проверьте состояние публикации заявки,
                привязку NFT-контракта и его ABI.
            </div>
        `;
    }
}


// =========================================================
// 6. ПРОВЕРКА ХЭША ДОКУМЕНТА ЗАЯВКИ
// =========================================================

async function verifyDocumentHash() {
    const input = document.getElementById("verifyFileInput");
    const resSpan = document.getElementById("verifyResult");

    if (
        !input ||
        !input.files ||
        !input.files.length
    ) {
        return;
    }

    try {
        if (!currentEvidenceHash) {
            throw new Error(
                "Хэш документа не загружен из блокчейна."
            );
        }

        const buffer = await input.files[0].arrayBuffer();

        const calculatedHash = ethers.keccak256(
            new Uint8Array(buffer)
        );

        if (
            calculatedHash.toLowerCase() ===
            currentEvidenceHash.toLowerCase()
        ) {
            resSpan.textContent =
                "✅ Документ подлинный (хэш совпал)";

            resSpan.style.color = "var(--primary)";

        } else {
            resSpan.textContent =
                "❌ Внимание: хэш не совпадает!";

            resSpan.style.color = "var(--danger)";
        }

    } catch (err) {
        console.error("Ошибка проверки документа:", err);

        resSpan.textContent =
            "Не удалось проверить документ.";

        resSpan.style.color = "var(--danger)";
    }
}


// =========================================================
// 7. ГОЛОСОВАНИЕ DAO
// =========================================================

async function castVote(support) {
    try {
        if (!isWalletConnected()) {
            throw new Error("Сначала подключите MetaMask!");
        }

        if (!isDaoMember()) {
            throw new Error(
                "Голосовать могут только зарегистрированные участники DAO."
            );
        }

        requireMethod(contract, "vote", "RescueDAO");

        const stats =
            await daoViewContract.getAidRequestStats(requestId);

        if (Number(stats.status) !== REQUEST_STATUS.VOTING) {
            throw new Error(
                "Голосование по этой заявке сейчас недоступно."
            );
        }

        const voted =
            await daoViewContract.hasParticipantVoted(
                requestId,
                userAddress
            );

        if (voted) {
            throw new Error(
                "Вы уже проголосовали по этой заявке."
            );
        }

        const votingEndsAt = Number(stats.votingEndsAt);

        if (
            votingEndsAt <= 0 ||
            Math.floor(Date.now() / 1000) >= votingEndsAt
        ) {
            throw new Error(
                "Срок голосования уже завершился."
            );
        }

        const tx = await contract.vote(
            requestId,
            Boolean(support)
        );

        alert("Голос отправлен! Ожидаем подтверждения...");

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция голосования не подтверждена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error("Ошибка голосования:", err);

        alert(
            "Ошибка голосования: " +
            getTransactionError(err)
        );
    }
}


// =========================================================
// 8. ФИНАЛИЗАЦИЯ ЗАЯВКИ
// =========================================================

async function finalizeReq() {
    try {
        if (!isWalletConnected()) {
            throw new Error("Сначала подключите MetaMask!");
        }

        requireMethod(
            contract,
            "finalizeRequest",
            "RescueDAO"
        );

        const stats =
            await daoViewContract.getAidRequestStats(requestId);

        if (Number(stats.status) !== REQUEST_STATUS.VOTING) {
            throw new Error(
                "Финализировать можно только заявку на этапе голосования."
            );
        }

        const votingEndsAt = Number(stats.votingEndsAt);

        if (
            votingEndsAt <= 0 ||
            Math.floor(Date.now() / 1000) < votingEndsAt
        ) {
            throw new Error(
                "Срок голосования ещё не завершился."
            );
        }

        const confirmed = confirm(
            `Подвести итоги голосования по заявке #${requestId}?`
        );

        if (!confirmed) return;

        const tx = await contract.finalizeRequest(requestId);

        alert("Подводим итоги голосования...");

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция финализации не подтверждена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error("Ошибка финализации:", err);

        alert(
            "Ошибка финализации: " +
            getTransactionError(err)
        );
    }
}


// =========================================================
// 9. ДОБАВЛЕНИЕ ЭТАПА ФИНАНСИРОВАНИЯ
// =========================================================

async function createNewMilestone() {
    const desc = document.getElementById("msDesc")?.value.trim();
    const recipient = document.getElementById("msRecipient")?.value.trim();
    const amount = document.getElementById("msAmount")?.value.trim();

    try {
        if (!isWalletConnected()) {
            throw new Error("Сначала подключите MetaMask!");
        }

        requireMethod(
            milestonesContract,
            "addMilestone",
            "RescueMilestones"
        );

        const stats =
            await daoViewContract.getAidRequestStats(requestId);

        const statusNum = Number(stats.status);

        if (!isPreparationStatus(statusNum)) {
            throw new Error(
                "Добавлять этапы можно только до публикации заявки."
            );
        }

        const info =
            await daoViewContract.getAidRequestInfo(requestId);

        if (!isRequesterAddress(info.requester)) {
            throw new Error(
                "Добавлять этапы может только инициатор заявки."
            );
        }

        if (!desc || desc.length > 200) {
            throw new Error(
                "Введите название этапа длиной не более 200 символов."
            );
        }

        if (
            !recipient ||
            !ethers.isAddress(recipient) ||
            recipient.toLowerCase() === ethers.ZeroAddress.toLowerCase()
        ) {
            throw new Error(
                "Укажите корректный адрес получателя."
            );
        }

        if (
            !amount ||
            !/^\d+(\.\d+)?$/.test(amount)
        ) {
            throw new Error("Введите корректную сумму этапа.");
        }

        const amountWei = ethers.parseEther(amount);

        if (amountWei <= 0n) {
            throw new Error(
                "Сумма этапа должна быть больше нуля."
            );
        }

        const currentTotal = BigInt(stats.milestoneTotal);
        const requestedAmount = BigInt(stats.requestedAmount);

        if (currentTotal + amountWei > requestedAmount) {
            throw new Error(
                "Сумма этапов превысит запрошенную сумму заявки. " +
                "Остаток для распределения: " +
                formatEth(requestedAmount - currentTotal) +
                " ETH."
            );
        }

        const tx = await milestonesContract.addMilestone(
            requestId,
            desc,
            recipient,
            amountWei
        );

        alert("Этап добавляется в блокчейн...");

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция добавления этапа не подтверждена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error("Ошибка добавления этапа:", err);

        alert(
            "Ошибка добавления этапа: " +
            getTransactionError(err)
        );
    }
}


// =========================================================
// 10. РЕДАКТИРОВАНИЕ ЭТАПА ДО ПУБЛИКАЦИИ
// =========================================================

async function updateMilestone(milestoneId) {
    const desc = document.getElementById(
        `editMsDesc_${milestoneId}`
    )?.value.trim();

    const recipient = document.getElementById(
        `editMsRecipient_${milestoneId}`
    )?.value.trim();

    const amount = document.getElementById(
        `editMsAmount_${milestoneId}`
    )?.value.trim();

    try {
        if (!isWalletConnected()) {
            throw new Error("Сначала подключите MetaMask.");
        }

        requireMethod(
            milestonesContract,
            "updateMilestone",
            "RescueMilestones"
        );

        const stats =
            await daoViewContract.getAidRequestStats(requestId);

        if (!isPreparationStatus(Number(stats.status))) {
            throw new Error(
                "Редактировать этапы можно только до публикации заявки."
            );
        }

        const info =
            await daoViewContract.getAidRequestInfo(requestId);

        if (!isRequesterAddress(info.requester)) {
            throw new Error(
                "Редактировать этапы может только инициатор заявки."
            );
        }

        if (!desc || desc.length > 200) {
            throw new Error(
                "Введите название этапа длиной не более 200 символов."
            );
        }

        if (
            !recipient ||
            !ethers.isAddress(recipient) ||
            recipient.toLowerCase() === ethers.ZeroAddress.toLowerCase()
        ) {
            throw new Error(
                "Укажите корректный адрес получателя."
            );
        }

        if (
            !amount ||
            !/^\d+(\.\d+)?$/.test(amount)
        ) {
            throw new Error("Введите корректную сумму этапа.");
        }

        const newAmountWei = ethers.parseEther(amount);

        if (newAmountWei <= 0n) {
            throw new Error(
                "Сумма этапа должна быть больше нуля."
            );
        }

        const oldMilestone =
            await milestonesContract.getMilestone(
                requestId,
                milestoneId
            );

        if (!isValidMilestone(oldMilestone)) {
            throw new Error(
                "Указанный этап не существует."
            );
        }

        if (oldMilestone.released) {
            throw new Error(
                "Нельзя изменить уже оплаченный этап."
            );
        }

        const oldAmountWei = BigInt(oldMilestone.amount);
        const currentTotal = BigInt(stats.milestoneTotal);
        const requestedAmount = BigInt(stats.requestedAmount);

        const updatedTotal =
            currentTotal - oldAmountWei + newAmountWei;

        if (updatedTotal > requestedAmount) {
            throw new Error(
                "После изменения сумма этапов превысит запрошенную сумму. " +
                "Максимально доступная сумма для этого этапа: " +
                formatEth(
                    requestedAmount - (currentTotal - oldAmountWei)
                ) +
                " ETH."
            );
        }

        const confirmed = confirm(
            `Сохранить изменения этапа #${milestoneId}?\n\n` +
            `Новое название: ${desc}\n` +
            `Новая сумма: ${amount} ETH\n\n` +
            "После изменения ранее загруженный отчёт этапа будет сброшен."
        );

        if (!confirmed) return;

        const tx = await milestonesContract.updateMilestone(
            requestId,
            milestoneId,
            desc,
            recipient,
            newAmountWei
        );

        alert("Изменение этапа отправлено в блокчейн...");

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция изменения этапа не подтверждена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error(
            `Ошибка изменения этапа #${milestoneId}:`,
            err
        );

        alert(
            "Не удалось изменить этап:\n" +
            getTransactionError(err)
        );
    }
}


// =========================================================
// 11. ЗАГРУЗКА СПИСКА ЭТАПОВ
// =========================================================

async function loadMilestonesList(
    mCount,
    reqStatus,
    isRequester
) {
    const box = document.getElementById(
        "milestonesContainer"
    );

    if (!box) return;

    if (!Number.isInteger(mCount) || mCount <= 0) {
        box.innerHTML = `
            <p style="color:var(--text-muted);font-size:0.9rem;">
                Этапы ещё не добавлены.
            </p>
        `;
        return;
    }

    try {
        requireMethod(
            milestonesContract,
            "getMilestone",
            "RescueMilestones"
        );

        box.innerHTML = "";

        const canEdit =
            isPreparationStatus(reqStatus) &&
            isRequester;

        const canSubmitEvidence =
            Number(reqStatus) === REQUEST_STATUS.APPROVED &&
            isRequester;

        for (let m = 1; m <= mCount; m++) {
            const ms = await milestonesContract.getMilestone(
                requestId,
                m
            );

            if (!isValidMilestone(ms)) {
                console.warn(
                    `Этап #${m} не существует или содержит некорректные данные.`
                );
                continue;
            }

            // ---------------------------------------------
            // Статус этапа
            // ---------------------------------------------

            let statusBadge = `
                <span class="badge badge-gray">
                    Ожидает публикации заявки
                </span>
            `;

            if (ms.released) {
                statusBadge = `
                    <span class="badge badge-green">
                        Оплачено (${ms.approvalCount}/2)
                    </span>
                `;

            } else if (ms.evidenceSubmitted) {
                statusBadge = `
                    <span class="badge badge-blue">
                        Отчёт загружен (${ms.approvalCount}/2 подтверждений)
                    </span>
                `;

            } else if (Number(reqStatus) === REQUEST_STATUS.APPROVED) {
                statusBadge = `
                    <span class="badge badge-yellow">
                        Ожидает отчёт инициатора
                    </span>
                `;

            } else if (Number(reqStatus) === REQUEST_STATUS.VOTING) {
                statusBadge = `
                    <span class="badge badge-blue">
                        Этап зафиксирован
                    </span>
                `;
            }

            // ---------------------------------------------
            // Форма редактирования этапа
            // ---------------------------------------------

            const editForm = (
                canEdit &&
                !ms.released
            )
                ? `
                    <details style="
                        margin-top:0.75rem;
                        padding-top:0.65rem;
                        border-top:1px dashed var(--border);
                    ">
                        <summary style="
                            cursor:pointer;
                            font-weight:600;
                            font-size:0.88rem;
                        ">
                            ✏️ Изменить этап
                        </summary>

                        <div style="
                            display:flex;
                            flex-direction:column;
                            gap:0.55rem;
                            margin-top:0.65rem;
                        ">
                            <div>
                                <label for="editMsDesc_${m}">
                                    Название этапа
                                </label>

                                <input
                                    type="text"
                                    id="editMsDesc_${m}"
                                    value="${escapeHtml(ms.description)}"
                                    maxlength="200"
                                    class="input-field"
                                    style="width:100%;padding:0.5rem;"
                                >
                            </div>

                            <div>
                                <label for="editMsRecipient_${m}">
                                    Адрес получателя
                                </label>

                                <input
                                    type="text"
                                    id="editMsRecipient_${m}"
                                    value="${escapeHtml(ms.recipient)}"
                                    class="input-field"
                                    style="width:100%;padding:0.5rem;"
                                >
                            </div>

                            <div>
                                <label for="editMsAmount_${m}">
                                    Новая сумма (ETH)
                                </label>

                                <input
                                    type="number"
                                    id="editMsAmount_${m}"
                                    value="${escapeHtml(formatEth(ms.amount))}"
                                    step="0.001"
                                    min="0"
                                    class="input-field"
                                    style="width:100%;padding:0.5rem;"
                                >
                            </div>

                            <p style="
                                font-size:0.8rem;
                                color:var(--text-muted);
                            ">
                                Изменение этапа сбросит ранее загруженный
                                отчёт, если он был добавлен.
                            </p>

                            <button
                                class="btn btn-outline"
                                onclick="updateMilestone(${m})"
                            >
                                Сохранить изменения
                            </button>
                        </div>
                    </details>
                `
                : "";

            // ---------------------------------------------
            // Форма отправки отчёта
            // ---------------------------------------------

            const evidenceForm = (
                canSubmitEvidence &&
                !ms.released &&
                !ms.evidenceSubmitted
            )
                ? `
                    <div style="
                        width:100%;
                        margin-top:0.75rem;
                        padding-top:0.75rem;
                        border-top:1px dashed var(--border);
                        display:flex;
                        gap:0.5rem;
                        flex-wrap:wrap;
                    ">
                        <input
                            type="text"
                            id="evUri_${m}"
                            placeholder="Ссылка на чек/акт (ipfs://...)"
                            style="
                                flex:1;
                                min-width:200px;
                                padding:0.4rem;
                            "
                        >

                        <input
                            type="file"
                            id="evFile_${m}"
                        >

                        <button
                            class="btn btn-primary"
                            onclick="submitEvidence(${m})"
                        >
                            Отправить отчёт
                        </button>
                    </div>
                `
                : "";

            // ---------------------------------------------
            // Отображение этапа
            // ---------------------------------------------

            const item = document.createElement("div");

            item.className = "list-item";

            item.style.cssText = `
                padding:0.75rem 0;
                border-bottom:1px solid #e2e8f0;
            `;

            item.innerHTML = `
                <div style="flex:1;">

                    <div
                        class="row-between"
                        style="
                            display:flex;
                            justify-content:space-between;
                            align-items:center;
                            gap:0.5rem;
                            flex-wrap:wrap;
                        "
                    >
                        <strong>
                            Этап #${m}:
                            ${escapeHtml(ms.description)}
                        </strong>

                        ${statusBadge}
                    </div>

                    <div style="
                        font-size:0.88rem;
                        margin-top:0.35rem;
                    ">
                        Сумма:
                        <strong>${formatEth(ms.amount)} ETH</strong>
                        · Получатель:
                        <span class="mono">
                            ${escapeHtml(ms.recipient)}
                        </span>
                    </div>

                    ${
                        ms.evidenceSubmitted
                            ? `
                                <div
                                    class="mono"
                                    style="
                                        margin-top:0.25rem;
                                        font-size:0.8rem;
                                        word-break:break-all;
                                    "
                                >
                                    Отчёт:
                                    ${escapeHtml(ms.evidenceURI)}
                                    | Hash:
                                    ${escapeHtml(shortAddr(ms.evidenceHash))}
                                </div>
                            `
                            : ""
                    }

                    ${editForm}
                    ${evidenceForm}

                </div>
            `;

            box.appendChild(item);
        }

    } catch (err) {
        console.error("Ошибка загрузки этапов:", err);

        box.innerHTML = `
            <p style="color:var(--danger);">
                Не удалось загрузить этапы финансирования:
                ${escapeHtml(getErrorMessage(err))}
            </p>
        `;
    }
}


// =========================================================
// 12. ОТПРАВКА ОТЧЁТА ПО ЭТАПУ
// =========================================================

async function submitEvidence(milestoneId) {
    const uriInput = document.getElementById(
        `evUri_${milestoneId}`
    );

    const fileInput = document.getElementById(
        `evFile_${milestoneId}`
    );

    const uri = uriInput?.value.trim();
    const file = fileInput?.files?.[0];

    try {
        if (!isWalletConnected()) {
            throw new Error("Сначала подключите MetaMask.");
        }

        requireMethod(
            milestonesContract,
            "submitMilestoneEvidence",
            "RescueMilestones"
        );

        const stats =
            await daoViewContract.getAidRequestStats(requestId);

        if (Number(stats.status) !== REQUEST_STATUS.APPROVED) {
            throw new Error(
                "Отчёты по этапам можно отправлять только после одобрения заявки."
            );
        }

        const info =
            await daoViewContract.getAidRequestInfo(requestId);

        if (!isRequesterAddress(info.requester)) {
            throw new Error(
                "Отправлять отчёты может только инициатор заявки."
            );
        }

        if (!file) {
            throw new Error("Выберите файл отчёта.");
        }

        const milestone =
            await milestonesContract.getMilestone(
                requestId,
                milestoneId
            );

        if (!isValidMilestone(milestone)) {
            throw new Error(
                "Указанный этап не существует или содержит некорректные данные."
            );
        }

        if (milestone.released) {
            throw new Error("Этот этап уже оплачен.");
        }

        if (milestone.evidenceSubmitted) {
            throw new Error(
                "Отчёт по этому этапу уже отправлен."
            );
        }

        // -------------------------------------------------
        // ШАГ 1. Вычисление хэша исходного файла
        // -------------------------------------------------

        const buffer = await file.arrayBuffer();

        const hash = ethers.keccak256(
            new Uint8Array(buffer)
        );

        // -------------------------------------------------
        // ШАГ 2. Загрузка файла на backend
        // -------------------------------------------------

        const formData = new FormData();

        formData.append("milestoneDoc", file);

        const response = await fetch(
            `${API_URL}/requests/${requestId}/milestones/${milestoneId}`,
            {
                method: "POST",
                body: formData
            }
        );

        if (!response.ok) {
            const errorText = await response.text();

            throw new Error(
                `Ошибка сервера (${response.status}): ${errorText}`
            );
        }

        const saved = await response.json();

        const serverDocUrl =
            saved.data?.docUrl ||
            saved.docUrl ||
            saved.data?.documentUrl ||
            saved.documentUrl;

        const finalUri = uri || serverDocUrl;

        if (!finalUri) {
            throw new Error(
                "Сервер не вернул ссылку на документ. " +
                "Укажите URI вручную."
            );
        }

        // -------------------------------------------------
        // ШАГ 3. Запись URI и хэша в RescueMilestones
        // -------------------------------------------------

        const tx =
            await milestonesContract.submitMilestoneEvidence(
                requestId,
                milestoneId,
                finalUri,
                hash
            );

        alert(
            "Транзакция отправлена. " +
            "Ожидаем подтверждения в блокчейне..."
        );

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция не была успешно подтверждена."
            );
        }

        alert(
            "Отчёт успешно отправлен и записан в блокчейн!"
        );

        window.location.reload();

    } catch (err) {
        console.error("Ошибка отправки отчёта:", err);

        alert(
            "Не удалось отправить отчёт:\n" +
            getTransactionError(err)
        );
    }
}
