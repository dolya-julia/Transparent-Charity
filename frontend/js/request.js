
const urlParams = new URLSearchParams(window.location.search);
const requestId = Number(urlParams.get("id"));

const validRequestId =
    Number.isSafeInteger(requestId) && requestId > 0;

let currentEvidenceHash = "";

// Минимальный ABI RescueTreasury для чтения целевых пожертвований.
const REQUEST_TREASURY_ABI = [
    "function requestDonations(uint256 requestId) view returns (uint256)",
    "function userRequestDonations(uint256 requestId, address donor) view returns (uint256)"
];


// =========================================================
// 1. ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ
// =========================================================

window.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("requestDetailsContainer");

    if (!validRequestId) {
        if (container) {
            container.innerHTML =
                "<p>Не указан или некорректен ID заявки.</p>";
        }
        return;
    }

    const ready = await initWeb3();
    if (!ready) return;

    await loadRequestDetails();
});


// =========================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================================

// Экранирование текста, который выводится через innerHTML.
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

// Разрешаем HTTP(S)-ссылки для серверных файлов.
function safeHttpUrl(value) {
    if (!value) return "";

    try {
        const url = new URL(value, window.location.origin);

        if (url.protocol === "http:" || url.protocol === "https:") {
            return escapeHtml(url.href);
        }
    } catch (err) {
        console.warn("Некорректный URL:", value);
    }

    return "";
}

function getErrorMessage(err) {
    return (
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Неизвестная ошибка"
    );
}

// Безопасное форматирование ETH.
function formatEth(value) {
    try {
        return ethers.formatEther(value);
    } catch (err) {
        console.warn("Ошибка форматирования ETH:", err);
        return "0";
    }
}

// Получение контракта Treasury для чтения.
async function getRequestTreasuryReader() {
    if (!provider) {
        throw new Error("Provider не инициализирован.");
    }

    let treasuryAddress = null;

    // Сначала пробуем получить адрес из RescueDAO.
    try {
        if (contract && typeof contract.treasuryContract === "function") {
            treasuryAddress = await contract.treasuryContract();
        }
    } catch (err) {
        console.warn(
            "Не удалось получить адрес Treasury из DAO:",
            err
        );
    }

    // Если getter недоступен, используем адрес из config.js.
    if (
        !treasuryAddress ||
        treasuryAddress === ethers.ZeroAddress
    ) {
        if (
            typeof TREASURY_ADDRESS !== "undefined" &&
            ethers.isAddress(TREASURY_ADDRESS)
        ) {
            treasuryAddress = TREASURY_ADDRESS;
        }
    }

    if (
        !treasuryAddress ||
        !ethers.isAddress(treasuryAddress) ||
        treasuryAddress === ethers.ZeroAddress
    ) {
        throw new Error(
            "Не удалось определить корректный адрес RescueTreasury."
        );
    }

    console.log(
        "Используется RescueTreasury:",
        treasuryAddress
    );

    return new ethers.Contract(
        treasuryAddress,
        REQUEST_TREASURY_ABI,
        provider
    );
}


// =========================================================
// 3. ЗАГРУЗКА ИНФОРМАЦИИ О ЗАЯВКЕ
// =========================================================

async function loadRequestDetails() {
    const container = document.getElementById("requestDetailsContainer");

    if (!container) {
        console.error("Не найден requestDetailsContainer.");
        return;
    }

    try {
        /*
         * RescueDAOView используется для чтения данных заявки.
         *
         * RescueDAO не должен использоваться для вызова
         * getAidRequestInfo и getAidRequestStats.
         */
        const [info, stats] = await Promise.all([
            daoViewContract.getAidRequestInfo(requestId),
            daoViewContract.getAidRequestStats(requestId)
        ]);

        // -------------------------------------------------
        // Метаданные с Node.js backend
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
                meta = {
                    ...meta,
                    ...(await response.json())
                };
            }
        } catch (err) {
            console.warn("Не удалось загрузить метаданные:", err);
        }

        currentEvidenceHash = info.evidenceHash;

        const statusNum = Number(stats.status);
        const statusObj =
            STATUS_LABELS[statusNum] || STATUS_LABELS[0];

        const votingEndsAt = Number(stats.votingEndsAt);

        const endsDate = new Date(
            votingEndsAt * 1000
        ).toLocaleString("ru-RU");

        const nowSec = Math.floor(Date.now() / 1000);
        const votingEnded = nowSec >= votingEndsAt;

        const isRequester =
            Boolean(userAddress) &&
            info.requester.toLowerCase() === userAddress.toLowerCase();

        // Проверяем, голосовал ли пользователь.
        const voted = userAddress
            ? await daoViewContract.hasParticipantVoted(
                requestId,
                userAddress
            )
            : false;

        // -------------------------------------------------
        // Целевые пожертвования
        // -------------------------------------------------

        let targetDonations = 0n;
        let personalDonations = 0n;
        let treasuryAvailable = false;
        let treasuryError = "";

        try {
            const treasuryReader = await getRequestTreasuryReader();

            const [totalDonations, myDonations] = await Promise.all([
                treasuryReader.requestDonations(requestId),

                userAddress
                    ? treasuryReader.userRequestDonations(
                        requestId,
                        userAddress
                    )
                    : Promise.resolve(0n)
            ]);

            targetDonations = BigInt(totalDonations);
            personalDonations = BigInt(myDonations);

            treasuryAvailable = true;

            console.log("Целевое финансирование заявки:", {
                requestId,
                targetDonations: formatEth(targetDonations),
                personalDonations: formatEth(personalDonations),
                userAddress
            });

        } catch (err) {
            treasuryError = getErrorMessage(err);

            console.error(
                "Ошибка чтения целевых пожертвований:",
                err
            );
        }

        const requestedAmount = BigInt(stats.requestedAmount);

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

        // Целевое финансирование доступно только
        // пока заявка находится на голосовании.
        const canDonateToRequest =
            statusNum === 0 &&
            !votingEnded &&
            remainingAmount > 0n &&
            treasuryAvailable;

        // -------------------------------------------------
        // Фото животного
        // -------------------------------------------------

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

        // -------------------------------------------------
        // Документ заявки
        // -------------------------------------------------

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
                        📄 Скачать документ с сервера для проверки хэша &nearr;
                    </a>
                </div>
            `
            : "";

        // -------------------------------------------------
        // Голосование DAO
        // -------------------------------------------------

        let votingControls = "";

        if (statusNum === 0) {

            if (
                !votingEnded &&
                userRoles?.isMember &&
                !voted
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
                        style="width:100%; margin-top:1rem;"
                        onclick="finalizeReq()"
                    >
                        Подвести итоги голосования
                    </button>
                `;
            }
        }

        // -------------------------------------------------
        // Блок целевого финансирования
        // -------------------------------------------------

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
                        Проверьте адрес Treasury и наличие функций
                        requestDonations и userRequestDonations.
                    </p>
                </div>
            `;
        }

        // -------------------------------------------------
        // Форма добавления этапа
        // -------------------------------------------------

        const addMilestoneBlock = (
            statusNum === 0 &&
            !votingEnded &&
            isRequester
        )
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
                            ${ethers.formatEther(stats.milestoneTotal)}
                            /
                            ${ethers.formatEther(stats.requestedAmount)}
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
                            style="width:100%; padding:0.5rem; margin-top:0.25rem;"
                        >
                    </div>

                    <div class="form-group" style="margin-bottom:0.75rem;">
                        <label>Адрес получателя (клиника / аптека)</label>

                        <input
                            type="text"
                            id="msRecipient"
                            class="input-field"
                            placeholder="0x..."
                            style="width:100%; padding:0.5rem; margin-top:0.25rem;"
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
                            style="width:100%; padding:0.5rem; margin-top:0.25rem;"
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

        // -------------------------------------------------
        // Основная разметка страницы
        // -------------------------------------------------

        container.innerHTML = `
            <div class="details-layout">

                <div>

                    <!-- Карточка заявки -->

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
                                class="badge ${statusObj.cls}"
                                style="
                                    padding:0.3rem 0.6rem;
                                    border-radius:4px;
                                "
                            >
                                ${escapeHtml(statusObj.text)}
                            </span>
                        </div>

                        <p class="mono">
                            Инициатор: ${escapeHtml(info.requester)}
                        </p>

                        ${photoBlock}

                        <h3 style="margin-top:1rem;">
                            Описание ситуации
                        </h3>

                        <p style="margin:0.5rem 0; color:#334155;">
                            ${escapeHtml(meta.fullStory || info.description)}
                        </p>

                        <!-- NFT-паспорт -->

                        <div
                            id="nftPassportSection"
                            style="margin-top:1.25rem;"
                        ></div>

                        <!-- Документы -->

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

                    <!-- Этапы финансирования -->

                    <div class="box" style="margin-top:1rem;">

                        <h3 style="margin-bottom:1rem;">
                            Этапы финансирования (Milestones)
                        </h3>

                        <div id="milestonesContainer">
                            Загрузка этапов...
                        </div>

                    </div>

                </div>

                <!-- Правая колонка -->

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

                    <!-- Целевое финансирование -->

                    ${targetFundingBlock}

                    <!-- Статус и голосование DAO -->

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

        // Загружаем этапы из RescueMilestones.
        await loadMilestonesList(
            Number(stats.milestoneCount),
            statusNum,
            isRequester
        );

        // Загружаем NFT-паспорт.
        await loadNftPassport(requestId);

    } catch (err) {
        console.error("Ошибка загрузки заявки:", err);

        container.innerHTML = `
            <p style="color:red;">
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
    const amountInput =
        document.getElementById("targetDonationAmount");

    const amount = amountInput?.value?.trim();

    try {
        if (!signer) {
            throw new Error(
                "Сначала подключите MetaMask."
            );
        }

        if (!contract) {
            throw new Error(
                "Контракт RescueDAO не инициализирован."
            );
        }

        if (!amount || !/^\d+(\.\d+)?$/.test(amount)) {
            throw new Error(
                "Введите корректную сумму в ETH."
            );
        }

        const donationWei = ethers.parseEther(amount);

        if (donationWei <= 0n) {
            throw new Error(
                "Сумма пожертвования должна быть больше нуля."
            );
        }

        // Получаем актуальные данные из Treasury.
        const treasuryReader =
            await getRequestTreasuryReader();

        const [targetDonations, requestedAmount] =
            await Promise.all([
                treasuryReader.requestDonations(requestId),
                (async () => {
                    const stats =
                        await daoViewContract.getAidRequestStats(
                            requestId
                        );

                    return BigInt(stats.requestedAmount);
                })()
            ]);

        const remainingAmount =
            requestedAmount > targetDonations
                ? requestedAmount - targetDonations
                : 0n;

        if (remainingAmount === 0n) {
            throw new Error(
                "Целевая сумма заявки уже собрана."
            );
        }

        if (donationWei > remainingAmount) {
            throw new Error(
                "Сумма пожертвования превышает остаток цели. Осталось собрать: " +
                formatEth(remainingAmount) +
                " ETH."
            );
        }

        // Дополнительно проверяем статус заявки и срок голосования.
        const info =
            await daoViewContract.getAidRequestStats(requestId);

        const statusNum = Number(info.status);
        const votingEndsAt = Number(info.votingEndsAt);
        const nowSec = Math.floor(Date.now() / 1000);

        if (statusNum !== 0) {
            throw new Error(
                "Целевые пожертвования принимаются только для заявок на этапе голосования."
            );
        }

        if (nowSec >= votingEndsAt) {
            throw new Error(
                "Время голосования завершилось. Целевые пожертвования больше не принимаются."
            );
        }

        const confirmed = confirm(
            `Вы действительно хотите пожертвовать ${amount} ETH на заявку #${requestId}?`
        );

        if (!confirmed) return;

        /*
         * Вызов выполняется через RescueDAO.
         *
         * DAO проверяет:
         * - существование заявки;
         * - статус Voting;
         * - срок голосования;
         * - ненулевую сумму;
         * - соблюдение лимита запрошенной суммы.
         *
         * Treasury учитывает вклад конкретного пользователя.
         */
        const tx = await contract.donateToRequest(
            requestId,
            {
                value: donationWei
            }
        );

        alert(
            "Пожертвование отправлено. Ожидаем подтверждения транзакции..."
        );

        const receipt = await tx.wait();

        if (!receipt || receipt.status !== 1) {
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
    const nftContainer =
        document.getElementById("nftPassportSection");

    if (!nftContainer) return;

    try {
        // Адрес NFT получаем из основного RescueDAO.
        const nftAddress = await contract.rescueNftContract();

        if (
            !nftAddress ||
            nftAddress === ethers.ZeroAddress
        ) {
            nftContainer.innerHTML = `
                <p style="color:var(--text-muted);">
                    NFT-контракт пока не привязан к DAO.
                </p>
            `;
            return;
        }

        // NFT-контракт используем только для чтения.
        const nftContract = new ethers.Contract(
            nftAddress,
            NFT_ABI,
            provider
        );

        // Получаем ID токена по ID заявки.
        const tokenId =
            await nftContract.getTokenIdForRequest(requestId);

        if (tokenId === 0n) {
            nftContainer.innerHTML = `
                <p style="color:var(--text-muted);">
                    NFT-паспорт для заявки #${requestId}
                    ещё не выпущен.
                </p>
            `;
            return;
        }

        const [owner, uri] = await Promise.all([
            nftContract.ownerOf(tokenId),
            nftContract.tokenURI(tokenId)
        ]);

        if (
            !uri.startsWith(
                "data:application/json;base64,"
            )
        ) {
            nftContainer.innerHTML = `
                <p class="mono">
                    NFT #${tokenId} выпущен.
                    URI: ${escapeHtml(uri)}
                </p>
            `;
            return;
        }

        // Декодируем Base64 JSON.
        const base64Json = uri.split(",")[1];
        const binaryString = window.atob(base64Json);

        const bytes = Uint8Array.from(
            binaryString,
            char => char.charCodeAt(0)
        );

        const jsonString =
            new TextDecoder().decode(bytes);

        const metadata = JSON.parse(jsonString);

        const attributesHtml =
            (metadata.attributes || [])
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

        // Изображение может быть встроенным SVG или другим data URI.
        const imageUrl = String(metadata.image || "");

        const allowedImage =
            imageUrl.startsWith("data:image/") ||
            Boolean(safeHttpUrl(imageUrl));

        const safeImageUrl = imageUrl.startsWith("data:image/")
            ? imageUrl
            : safeHttpUrl(imageUrl);

        const imageBlock = allowedImage
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
                        🐾 Цифровой NFT-паспорт #${tokenId}
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

                    <div style="flex:1; min-width:200px;">

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
                Проверьте привязку NFT-контракта и наличие токена.
            </div>
        `;
    }
}


// =========================================================
// 6. ПРОВЕРКА ХЭША ДОКУМЕНТА ЗАЯВКИ
// =========================================================

async function verifyDocumentHash() {
    const input =
        document.getElementById("verifyFileInput");

    const resSpan =
        document.getElementById("verifyResult");

    if (!input || !input.files || !input.files.length) {
        return;
    }

    try {
        const buffer =
            await input.files[0].arrayBuffer();

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
        if (!signer) {
            return alert("Сначала подключите MetaMask!");
        }

        // Голосование выполняется через RescueDAO.
        const tx = await contract.vote(
            requestId,
            support
        );

        alert(
            "Голос отправлен! Ожидаем подтверждения..."
        );

        const receipt = await tx.wait();

        if (!receipt || receipt.status !== 1) {
            throw new Error(
                "Транзакция голосования не подтверждена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error("Ошибка голосования:", err);

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
        if (!signer) {
            return alert("Сначала подключите MetaMask!");
        }

        // Финализация выполняется через RescueDAO.
        const tx = await contract.finalizeRequest(
            requestId
        );

        alert(
            "Подводим итоги голосования..."
        );

        const receipt = await tx.wait();

        if (!receipt || receipt.status !== 1) {
            throw new Error(
                "Транзакция финализации не подтверждена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error("Ошибка финализации:", err);

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
    const desc =
        document.getElementById("msDesc")?.value.trim();

    const recipient =
        document.getElementById("msRecipient")?.value.trim();

    const amount =
        document.getElementById("msAmount")?.value;

    if (!signer) {
        return alert("Сначала подключите MetaMask!");
    }

    if (
        !desc ||
        !recipient ||
        !ethers.isAddress(recipient) ||
        !amount ||
        !Number.isFinite(Number(amount)) ||
        Number(amount) <= 0
    ) {
        return alert(
            "Проверьте описание, корректность 0x-адреса получателя и сумму."
        );
    }

    try {
        /*
         * Добавление этапа выполняется через RescueMilestones,
         * а не через RescueDAO.
         */
        const tx = await milestonesContract.addMilestone(
            requestId,
            desc,
            recipient,
            ethers.parseEther(amount)
        );

        alert(
            "Этап добавляется в блокчейн..."
        );

        const receipt = await tx.wait();

        if (!receipt || receipt.status !== 1) {
            throw new Error(
                "Транзакция добавления этапа не подтверждена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error("Ошибка добавления этапа:", err);

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
    const box =
        document.getElementById("milestonesContainer");

    if (!box) return;

    if (!mCount || mCount === 0) {
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

    box.innerHTML = "";

    try {
        for (let m = 1; m <= mCount; m++) {

            /*
             * Информация об этапах читается
             * непосредственно из RescueMilestones.
             */
            const ms =
                await milestonesContract.getMilestone(
                    requestId,
                    m
                );

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

            // Форма отправки отчёта доступна инициатору
            // только после одобрения заявки.
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
                            style="flex:1; min-width:200px; padding:0.4rem;"
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

            box.innerHTML += `
                <div
                    class="list-item"
                    style="
                        padding:0.75rem 0;
                        border-bottom:1px solid #e2e8f0;
                    "
                >

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
                                ${ethers.formatEther(ms.amount)} ETH
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

                </div>
            `;
        }

    } catch (err) {
        console.error("Ошибка загрузки этапов:", err);

        box.innerHTML = `
            <p style="color:red;">
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
    const uriInput =
        document.getElementById(`evUri_${milestoneId}`);

    const fileInput =
        document.getElementById(`evFile_${milestoneId}`);

    const uri = uriInput?.value.trim();
    const file = fileInput?.files?.[0];

    try {
        if (!signer) {
            throw new Error(
                "Сначала подключите MetaMask."
            );
        }

        if (!userAddress) {
            throw new Error(
                "Не определён адрес подключённого кошелька."
            );
        }

        if (!file) {
            throw new Error(
                "Выберите файл отчёта."
            );
        }

        // -------------------------------------------------
        // 1. Вычисляем хэш исходного файла
        // -------------------------------------------------

        const buffer = await file.arrayBuffer();

        const hash = ethers.keccak256(
            new Uint8Array(buffer)
        );

        // -------------------------------------------------
        // 2. Загружаем файл на backend
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
                "Сервер не вернул ссылку на документ. Укажите URI вручную."
            );
        }

        // -------------------------------------------------
        // 3. Записываем URI и хэш в RescueMilestones
        // -------------------------------------------------

        /*
         * submitMilestoneEvidence находится в RescueMilestones,
         * поэтому вызываем milestonesContract.
         *
         * RescueDAO здесь не используется.
         */
        const tx =
            await milestonesContract.submitMilestoneEvidence(
                requestId,
                milestoneId,
                finalUri,
                hash
            );

        alert(
            "Транзакция отправлена. Ожидаем подтверждения в блокчейне..."
        );

        const receipt = await tx.wait();

        if (!receipt || receipt.status !== 1) {
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
