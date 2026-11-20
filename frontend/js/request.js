
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

/**
 * Экранирование текста перед вставкой в innerHTML.
 */
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

/**
 * Разрешаем только HTTP(S)-ссылки.
 */
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

/**
 * Получение сообщения об ошибке.
 */
function getErrorMessage(err) {
    return (
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Неизвестная ошибка"
    );
}

/**
 * Безопасное форматирование ETH.
 */
function formatEth(value) {
    try {
        return ethers.formatEther(value);
    } catch (err) {
        console.warn(
            "Ошибка форматирования ETH:",
            err
        );

        return "0";
    }
}

/**
 * Сокращение адреса или хэша.
 */
function shortAddr(value) {
    if (!value) return "—";

    const str = String(value);

    if (str.length <= 14) {
        return str;
    }

    return `${str.slice(0, 8)}...${str.slice(-6)}`;
}

/**
 * Проверка наличия контракта.
 */
function requireContract(instance, name) {
    if (!instance) {
        throw new Error(
            `${name} не инициализирован.`
        );
    }
}

/**
 * Проверка наличия метода контракта.
 */
function requireMethod(instance, methodName, contractName) {
    requireContract(instance, contractName);

    if (typeof instance[methodName] !== "function") {
        throw new Error(
            `В ABI ${contractName} отсутствует функция ${methodName}().`
        );
    }
}

/**
 * Проверка подключения кошелька.
 */
function isWalletConnected() {
    return (
        typeof signer !== "undefined" &&
        Boolean(signer) &&
        typeof userAddress !== "undefined" &&
        Boolean(userAddress)
    );
}

/**
 * Проверка роли участника DAO.
 */
function isDaoMember() {
    return (
        typeof userRoles !== "undefined" &&
        Boolean(userRoles?.isMember)
    );
}

/**
 * Получение статуса заявки.
 */
function getStatusInfo(status) {
    const statusNum = Number(status);

    if (
        typeof STATUS_LABELS !== "undefined" &&
        STATUS_LABELS[statusNum]
    ) {
        return STATUS_LABELS[statusNum];
    }

    return {
        text: "Неизвестный статус",
        cls: "badge-gray"
    };
}


// =========================================================
// 3. ЗАГРУЗКА ИНФОРМАЦИИ О ЗАЯВКЕ
// =========================================================

async function loadRequestDetails() {
    const container = document.getElementById(
        "requestDetailsContainer"
    );

    if (!container) {
        console.error(
            "Не найден requestDetailsContainer."
        );

        return;
    }

    try {

        // -------------------------------------------------
        // Проверка необходимых контрактов
        // -------------------------------------------------

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

        requireContract(
            contract,
            "RescueDAO"
        );

        requireContract(
            milestonesContract,
            "RescueMilestones"
        );

        // -------------------------------------------------
        // Получение данных заявки через RescueDAOView
        // -------------------------------------------------

        const [info, stats] = await Promise.all([
            daoViewContract.getAidRequestInfo(requestId),
            daoViewContract.getAidRequestStats(requestId)
        ]);

        // -------------------------------------------------
        // Получение дополнительных данных с backend
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
                const responseData =
                    await response.json();

                // Backend может возвращать данные
                // как response.data, так и напрямую.
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

        // -------------------------------------------------
        // Сохранение хэша документа
        // -------------------------------------------------

        currentEvidenceHash = String(
            info.evidenceHash || ""
        );

        // -------------------------------------------------
        // Статус заявки
        // -------------------------------------------------

        const statusNum = Number(stats.status);

        const statusObj = getStatusInfo(statusNum);

        const votingEndsAt = Number(
            stats.votingEndsAt
        );

        const endsDate = votingEndsAt > 0
            ? new Date(
                votingEndsAt * 1000
            ).toLocaleString("ru-RU")
            : "Не определено";

        const nowSec = Math.floor(
            Date.now() / 1000
        );

        const votingEnded =
            nowSec >= votingEndsAt;

        // -------------------------------------------------
        // Проверка инициатора
        // -------------------------------------------------

        const isRequester =
            Boolean(userAddress) &&
            String(info.requester).toLowerCase() ===
            String(userAddress).toLowerCase();

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
                    treasuryContract.requestDonations(
                        requestId
                    ),

                    userAddress
                        ? treasuryContract.userRequestDonations(
                            requestId,
                            userAddress
                        )
                        : Promise.resolve(0n)
                ]);

            targetDonations = BigInt(
                totalDonations
            );

            personalDonations = BigInt(
                myDonations
            );

            treasuryAvailable = true;

            console.log(
                "Целевое финансирование заявки:",
                {
                    requestId,
                    targetDonations: formatEth(
                        targetDonations
                    ),
                    personalDonations: formatEth(
                        personalDonations
                    ),
                    userAddress
                }
            );

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
                        : (
                            targetDonations * 100n /
                            requestedAmount
                        )
                )
                : 0;

        // Принимать целевые пожертвования можно,
        // пока заявка находится на голосовании.
        const canDonateToRequest =
            statusNum === 0 &&
            !votingEnded &&
            remainingAmount > 0n &&
            treasuryAvailable &&
            isWalletConnected();

        // =================================================
        // ФОТОГРАФИЯ ЖИВОТНОГО
        // =================================================

        const photoUrl = safeHttpUrl(
            meta.photoUrl
        );

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

        const docUrl = safeHttpUrl(
            meta.docUrl
        );

        const downloadDocLink = docUrl
            ? `
                <div style="margin-top:0.4rem;">
                    <a
                        href="${docUrl}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="tx-link"
                    >
                        📄 Скачать документ с сервера для проверки хэша &nearr;
                    </a>
                </div>
            `
            : "";

        // =================================================
        // ГОЛОСОВАНИЕ DAO
        // =================================================

        let votingControls = "";

        if (statusNum === 0) {

            if (
                !votingEnded &&
                isDaoMember() &&
                !voted &&
                isWalletConnected()
            ) {
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
                    <p
                        style="margin-top:0.75rem;"
                        class="badge badge-blue"
                    >
                        Вы уже проголосовали по этой заявке
                    </p>
                `;
            }

            if (votingEnded) {
                votingControls += `
                    <button
                        class="btn btn-dark"
                        style="
                            width:100%;
                            margin-top:1rem;
                        "
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
                <div
                    class="box"
                    style="
                        margin-top:1rem;
                        border:1px solid var(--border);
                    "
                >

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

                        <strong>
                            ${formatEth(targetDonations)} ETH
                        </strong>
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

                        <strong>
                            ${formatEth(requestedAmount)} ETH
                        </strong>
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
                                        style="
                                            width:100%;
                                            margin-top:0.75rem;
                                        "
                                        onclick="donateToCurrentRequest()"
                                    >
                                        ❤️ Пожертвовать на эту заявку
                                    </button>

                                </div>
                            `
                            : statusNum !== 0
                                ? `
                                    <p style="
                                        margin-top:1rem;
                                        font-size:0.85rem;
                                        color:var(--text-muted);
                                    ">
                                        Приём целевых пожертвований закрыт:
                                        заявка уже не находится на этапе голосования.
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

                    <h3>
                        🎯 Целевое финансирование
                    </h3>

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

        const addMilestoneBlock = (
            statusNum === 0 &&
            !votingEnded &&
            isRequester
        )
            ? `
                <div class="box" style="margin-top:1rem;">

                    <h3>
                        Добавить этап финансирования
                    </h3>

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

                        Для одобрения заявки сумма этапов должна
                        совпасть с запрошенной суммой!
                    </p>

                    <div class="form-group" style="margin-bottom:0.75rem;">

                        <label>Название этапа</label>

                        <input
                            type="text"
                            id="msDesc"
                            class="input-field"
                            placeholder="Например: Операция в ветклинике"
                            style="
                                width:100%;
                                padding:0.5rem;
                                margin-top:0.25rem;
                            "
                        >

                    </div>

                    <div class="form-group" style="margin-bottom:0.75rem;">

                        <label>
                            Адрес получателя (клиника / аптека)
                        </label>

                        <input
                            type="text"
                            id="msRecipient"
                            class="input-field"
                            placeholder="0x..."
                            style="
                                width:100%;
                                padding:0.5rem;
                                margin-top:0.25rem;
                            "
                        >

                    </div>

                    <div class="form-group" style="margin-bottom:0.75rem;">

                        <label>Сумма этапа (ETH)</label>

                        <input
                            type="number"
                            id="msAmount"
                            class="input-field"
                            step="0.001"
                            min="0"
                            placeholder="0.003"
                            style="
                                width:100%;
                                padding:0.5rem;
                                margin-top:0.25rem;
                            "
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
                                margin-bottom:0.75rem;
                            "
                        >

                            <h1>
                                Заявка #${requestId}:
                                ${escapeHtml(info.animalName)}
                            </h1>

                            <span
                                class="badge ${escapeHtml(statusObj.cls)}"
                                style="
                                    padding:0.3rem 0.6rem;
                                    border-radius:4px;
                                "
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
                                meta.fullStory ||
                                info.description
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

                            <div
                                class="mono"
                                style="margin-top:0.25rem;"
                            >
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
                                    Проверить подлинность файла по хэшу в блокчейне:
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

                        <h3>Статус и Голосование DAO</h3>

                        <div style="
                            display:flex;
                            flex-direction:column;
                            gap:0.65rem;
                            font-size:0.92rem;
                            margin:1rem 0;
                        ">

                            <div style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            ">
                                <span>Запрошено:</span>

                                <strong>
                                    ${formatEth(stats.requestedAmount)} ETH
                                </strong>
                            </div>

                            <div style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            ">
                                <span>Запланировано этапов:</span>

                                <strong>
                                    ${formatEth(stats.milestoneTotal)} ETH
                                </strong>
                            </div>

                            <div style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            ">
                                <span>Выплачено:</span>

                                <strong style="color:var(--primary);">
                                    ${formatEth(stats.releasedAmount)} ETH
                                </strong>
                            </div>

                            <div style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            ">
                                <span>Окончание голосования:</span>

                                <strong style="text-align:right;">
                                    ${endsDate}
                                </strong>
                            </div>

                            <div style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            ">
                                <span>Голоса ЗА:</span>

                                <strong style="color:var(--primary);">
                                    ${stats.yesVotes}
                                </strong>
                            </div>

                            <div style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            ">
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
        // -------------------------------------------------

        await loadNftPassport(requestId);

    } catch (err) {
        console.error(
            "Ошибка загрузки заявки:",
            err
        );

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

        // -------------------------------------------------
        // Проверки подключения и контрактов
        // -------------------------------------------------

        if (!isWalletConnected()) {
            throw new Error(
                "Сначала подключите MetaMask."
            );
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

        // -------------------------------------------------
        // Проверка суммы
        // -------------------------------------------------

        if (
            !amount ||
            !/^\d+(\.\d+)?$/.test(amount)
        ) {
            throw new Error(
                "Введите корректную сумму в ETH."
            );
        }

        const donationWei = ethers.parseEther(
            amount
        );

        if (donationWei <= 0n) {
            throw new Error(
                "Сумма пожертвования должна быть больше нуля."
            );
        }

        // -------------------------------------------------
        // Получение актуальной статистики
        // -------------------------------------------------

        const [targetDonations, stats] =
            await Promise.all([
                treasuryContract.requestDonations(
                    requestId
                ),

                daoViewContract.getAidRequestStats(
                    requestId
                )
            ]);

        const requestedAmount = BigInt(
            stats.requestedAmount
        );

        const currentDonations = BigInt(
            targetDonations
        );

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

        // -------------------------------------------------
        // Проверка статуса и срока голосования
        // -------------------------------------------------

        const statusNum = Number(stats.status);

        const votingEndsAt = Number(
            stats.votingEndsAt
        );

        const nowSec = Math.floor(
            Date.now() / 1000
        );

        if (statusNum !== 0) {
            throw new Error(
                "Целевые пожертвования принимаются только " +
                "для заявок на этапе голосования."
            );
        }

        if (nowSec >= votingEndsAt) {
            throw new Error(
                "Время голосования завершилось. " +
                "Целевые пожертвования больше не принимаются."
            );
        }

        // -------------------------------------------------
        // Подтверждение пользователя
        // -------------------------------------------------

        const confirmed = confirm(
            `Вы действительно хотите пожертвовать ${amount} ETH на заявку #${requestId}?`
        );

        if (!confirmed) return;

        // -------------------------------------------------
        // Отправка через RescueDAO
        // -------------------------------------------------

        /*
         * RescueDAO выполняет проверку:
         * - существования заявки;
         * - статуса Voting;
         * - срока голосования;
         * - суммы пожертвования;
         * - ограничения запрошенной суммы.
         *
         * RescueTreasury учитывает общий и персональный вклад.
         */

        const tx = await contract.donateToRequest(
            requestId,
            {
                value: donationWei
            }
        );

        alert(
            "Пожертвование отправлено. " +
            "Ожидаем подтверждения транзакции..."
        );

        const receipt = await tx.wait();

        if (
            !receipt ||
            Number(receipt.status) !== 1
        ) {
            throw new Error(
                "Транзакция пожертвования не была успешно подтверждена."
            );
        }

        alert(
            "Спасибо! Ваше целевое пожертвование успешно учтено."
        );

        window.location.reload();

    } catch (err) {
        console.error(
            "Ошибка целевого пожертвования:",
            err
        );

        alert(
            "Не удалось выполнить пожертвование:\n" +
            getErrorMessage(err)
        );
    }
}


// =========================================================
// 5. ЗАГРУЗКА NFT-ПАСПОРТА
// =========================================================

async function loadNftPassport(requestId) {
    const nftContainer = document.getElementById(
        "nftPassportSection"
    );

    if (!nftContainer) return;

    try {

        // -------------------------------------------------
        // Проверка глобального NFT-контракта
        // -------------------------------------------------

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
        // Получение ID токена по ID заявки
        // -------------------------------------------------

        const tokenId =
            await nftContract.getTokenIdForRequest(
                requestId
            );

        if (BigInt(tokenId) === 0n) {
            nftContainer.innerHTML = `
                <p style="color:var(--text-muted);">
                    NFT-паспорт для заявки #${requestId}
                    ещё не выпущен.
                </p>
            `;

            return;
        }

        // -------------------------------------------------
        // Получение владельца и URI
        // -------------------------------------------------

        const [owner, uri] = await Promise.all([
            nftContract.ownerOf(tokenId),
            nftContract.tokenURI(tokenId)
        ]);

        // -------------------------------------------------
        // Проверка формата URI
        // -------------------------------------------------

        if (
            !String(uri).startsWith(
                "data:application/json;base64,"
            )
        ) {
            nftContainer.innerHTML = `
                <p class="mono">
                    NFT #${escapeHtml(tokenId)} выпущен.

                    URI:
                    ${escapeHtml(uri)}
                </p>
            `;

            return;
        }

        // -------------------------------------------------
        // Декодирование Base64 JSON
        // -------------------------------------------------

        const base64Json = String(uri).split(",")[1];

        const binaryString = window.atob(
            base64Json
        );

        const bytes = Uint8Array.from(
            binaryString,
            char => char.charCodeAt(0)
        );

        const jsonString = new TextDecoder().decode(
            bytes
        );

        const metadata = JSON.parse(
            jsonString
        );

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

        const imageUrl = String(
            metadata.image || ""
        );

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
                    alt="${escapeHtml(
                        metadata.name || "NFT-паспорт"
                    )}"
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

                    <div style="
                        flex:1;
                        min-width:200px;
                    ">

                        <div style="
                            font-weight:600;
                            font-size:1.05rem;
                            margin-bottom:0.35rem;
                        ">
                            ${escapeHtml(
                                metadata.name ||
                                "NFT-паспорт животного"
                            )}
                        </div>

                        <p style="
                            font-size:0.88rem;
                            color:#475569;
                            margin-bottom:0.6rem;
                        ">
                            ${escapeHtml(
                                metadata.description || ""
                            )}
                        </p>

                        <div
                            class="mono"
                            style="
                                font-size:0.78rem;
                                margin-bottom:0.6rem;
                                word-break:break-all;
                            "
                        >
                            Владелец:
                            ${escapeHtml(owner)}
                        </div>

                        <div>
                            ${attributesHtml}
                        </div>

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
                Проверьте привязку NFT-контракта,
                его ABI и наличие токена.
            </div>
        `;
    }
}


// =========================================================
// 6. ПРОВЕРКА ХЭША ДОКУМЕНТА ЗАЯВКИ
// =========================================================

async function verifyDocumentHash() {
    const input = document.getElementById(
        "verifyFileInput"
    );

    const resSpan = document.getElementById(
        "verifyResult"
    );

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
        console.error(
            "Ошибка проверки документа:",
            err
        );

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

        // -------------------------------------------------
        // Проверки
        // -------------------------------------------------

        if (!isWalletConnected()) {
            throw new Error(
                "Сначала подключите MetaMask!"
            );
        }

        if (!isDaoMember()) {
            throw new Error(
                "Голосовать могут только зарегистрированные участники DAO."
            );
        }

        requireMethod(
            contract,
            "vote",
            "RescueDAO"
        );

        // -------------------------------------------------
        // Отправка голоса через RescueDAO
        // -------------------------------------------------

        const tx = await contract.vote(
            requestId,
            Boolean(support)
        );

        alert(
            "Голос отправлен! Ожидаем подтверждения..."
        );

        const receipt = await tx.wait();

        if (
            !receipt ||
            Number(receipt.status) !== 1
        ) {
            throw new Error(
                "Транзакция голосования не подтверждена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error(
            "Ошибка голосования:",
            err
        );

        alert(
            "Ошибка голосования: " +
            getErrorMessage(err)
        );
    }
}


// =========================================================
// 8. ФИНАЛИЗАЦИЯ ЗАЯВКИ
// =========================================================

async function finalizeReq() {
    try {

        // -------------------------------------------------
        // Проверки
        // -------------------------------------------------

        if (!isWalletConnected()) {
            throw new Error(
                "Сначала подключите MetaMask!"
            );
        }

        requireMethod(
            contract,
            "finalizeRequest",
            "RescueDAO"
        );

        // -------------------------------------------------
        // Финализация через RescueDAO
        // -------------------------------------------------

        const tx = await contract.finalizeRequest(
            requestId
        );

        alert(
            "Подводим итоги голосования..."
        );

        const receipt = await tx.wait();

        if (
            !receipt ||
            Number(receipt.status) !== 1
        ) {
            throw new Error(
                "Транзакция финализации не подтверждена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error(
            "Ошибка финализации:",
            err
        );

        alert(
            "Ошибка финализации: " +
            getErrorMessage(err)
        );
    }
}


// =========================================================
// 9. ДОБАВЛЕНИЕ ЭТАПА ФИНАНСИРОВАНИЯ
// =========================================================

async function createNewMilestone() {
    const desc = document.getElementById(
        "msDesc"
    )?.value.trim();

    const recipient = document.getElementById(
        "msRecipient"
    )?.value.trim();

    const amount = document.getElementById(
        "msAmount"
    )?.value.trim();

    try {

        // -------------------------------------------------
        // Проверки
        // -------------------------------------------------

        if (!isWalletConnected()) {
            throw new Error(
                "Сначала подключите MetaMask!"
            );
        }

        requireMethod(
            milestonesContract,
            "addMilestone",
            "RescueMilestones"
        );

        if (
            !desc ||
            !recipient ||
            !ethers.isAddress(recipient) ||
            recipient === ethers.ZeroAddress ||
            !amount ||
            !Number.isFinite(Number(amount)) ||
            Number(amount) <= 0
        ) {
            throw new Error(
                "Проверьте описание, корректность адреса получателя и сумму."
            );
        }

        const amountWei = ethers.parseEther(
            amount
        );

        if (amountWei <= 0n) {
            throw new Error(
                "Сумма этапа должна быть больше нуля."
            );
        }

        // -------------------------------------------------
        // Добавление этапа через RescueMilestones
        // -------------------------------------------------

        const tx = await milestonesContract.addMilestone(
            requestId,
            desc,
            recipient,
            amountWei
        );

        alert(
            "Этап добавляется в блокчейн..."
        );

        const receipt = await tx.wait();

        if (
            !receipt ||
            Number(receipt.status) !== 1
        ) {
            throw new Error(
                "Транзакция добавления этапа не подтверждена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error(
            "Ошибка добавления этапа:",
            err
        );

        alert(
            "Ошибка добавления этапа: " +
            getErrorMessage(err)
        );
    }
}


// =========================================================
// 10. ЗАГРУЗКА СПИСКА ЭТАПОВ
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
            <p style="
                color:var(--text-muted);
                font-size:0.9rem;
            ">
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

        for (let m = 1; m <= mCount; m++) {

            // ---------------------------------------------
            // Чтение этапа из RescueMilestones
            // ---------------------------------------------

            const ms = await milestonesContract.getMilestone(
                requestId,
                m
            );

            // ---------------------------------------------
            // Статус этапа
            // ---------------------------------------------

            let statusBadge = `
                <span class="badge badge-gray">
                    Ожидает одобрения заявки
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

            } else if (reqStatus === 1) {
                statusBadge = `
                    <span class="badge badge-yellow">
                        Ожидает отчёт инициатора
                    </span>
                `;
            }

            // ---------------------------------------------
            // Форма отправки доказательства
            // ---------------------------------------------

            const evidenceForm = (
                reqStatus === 1 &&
                isRequester &&
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

                        <strong>
                            ${formatEth(ms.amount)} ETH
                        </strong>

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
                                    ${escapeHtml(
                                        shortAddr(ms.evidenceHash)
                                    )}
                                </div>
                            `
                            : ""
                    }

                </div>

                ${evidenceForm}
            `;

            box.appendChild(item);
        }

    } catch (err) {
        console.error(
            "Ошибка загрузки этапов:",
            err
        );

        box.innerHTML = `
            <p style="color:var(--danger);">
                Не удалось загрузить этапы финансирования:
                ${escapeHtml(getErrorMessage(err))}
            </p>
        `;
    }
}


// =========================================================
// 11. ОТПРАВКА ОТЧЁТА ПО ЭТАПУ
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

        // -------------------------------------------------
        // Проверки
        // -------------------------------------------------

        if (!isWalletConnected()) {
            throw new Error(
                "Сначала подключите MetaMask."
            );
        }

        requireMethod(
            milestonesContract,
            "submitMilestoneEvidence",
            "RescueMilestones"
        );

        if (!file) {
            throw new Error(
                "Выберите файл отчёта."
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

        formData.append(
            "milestoneDoc",
            file
        );

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

        if (
            !receipt ||
            Number(receipt.status) !== 1
        ) {
            throw new Error(
                "Транзакция не была успешно подтверждена."
            );
        }

        alert(
            "Отчёт успешно отправлен и записан в блокчейн!"
        );

        window.location.reload();

    } catch (err) {
        console.error(
            "Ошибка отправки отчёта:",
            err
        );

        alert(
            "Не удалось отправить отчёт:\n" +
            getErrorMessage(err)
        );
    }
}
