
const urlParams = new URLSearchParams(window.location.search);
const requestId = Number(urlParams.get("id"));
const validRequestId =
    Number.isSafeInteger(requestId) && requestId > 0;

let currentEvidenceHash = "";
const SCROLL_STORAGE_KEY = "request_page_scroll_y";

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
        restoreScrollPosition();

    } catch (err) {
        console.error("Ошибка инициализации страницы заявки:", err);

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

function saveScrollPosition() {
    try {
        sessionStorage.setItem(
            SCROLL_STORAGE_KEY,
            String(window.scrollY || 0)
        );
    } catch (err) {
        console.warn(
            "Не удалось сохранить позицию прокрутки:",
            err
        );
    }
}

function restoreScrollPosition() {
    try {
        const raw = sessionStorage.getItem(
            SCROLL_STORAGE_KEY
        );

        if (raw === null) return;

        sessionStorage.removeItem(SCROLL_STORAGE_KEY);

        const y = Number(raw);

        if (Number.isFinite(y) && y > 0) {
            requestAnimationFrame(() => {
                window.scrollTo({
                    top: y,
                    behavior: "instant"
                });
            });
        }
    } catch (err) {
        console.warn(
            "Не удалось восстановить позицию прокрутки:",
            err
        );
    }
}

function reloadPreservingScroll() {
    saveScrollPosition();
    window.location.reload();
}

async function runWithButtonLock(
    buttonEl,
    busyText,
    actionFn
) {
    if (buttonEl?.dataset.busy === "1") {
        return;
    }

    const originalText = buttonEl
        ? buttonEl.textContent
        : "";

    const originalDisabled = buttonEl
        ? buttonEl.disabled
        : false;

    if (buttonEl) {
        buttonEl.dataset.busy = "1";
        buttonEl.disabled = true;

        if (busyText) {
            buttonEl.textContent = busyText;
        }
    }

    try {
        return await actionFn();
    } finally {
        if (buttonEl) {
            delete buttonEl.dataset.busy;
            buttonEl.disabled = originalDisabled;

            if (busyText) {
                buttonEl.textContent = originalText;
            }
        }
    }
}

function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]
    );
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
        return ethers.formatEther(value ?? 0n);
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

function requireMethod(
    instance,
    methodName,
    contractName
) {
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

function isRequesterAddress(requester) {
    return (
        isWalletConnected() &&
        String(requester).toLowerCase() ===
        String(userAddress).toLowerCase()
    );
}

function getStatusInfo(status) {
    const statusNum = Number(status);

    return STATUS_LABELS[statusNum] || {
        text: "Неизвестный статус",
        cls: "badge-gray"
    };
}

function isPreparationStatus(status) {
    const value = Number(status);

    return (
        value === REQUEST_STATUS.UNDER_REVIEW ||
        value === REQUEST_STATUS.CHANGES_REQUESTED
    );
}

function isValidMilestone(ms) {
    if (!ms) return false;

    if (ms.exists !== undefined) {
        return Boolean(ms.exists);
    }

    const description = String(
        ms.description ?? ""
    ).trim();

    const recipient = String(
        ms.recipient ?? ""
    );

    return (
        description.length > 0 &&
        ethers.isAddress(recipient) &&
        recipient.toLowerCase() !==
        ethers.ZeroAddress.toLowerCase()
    );
}

function getTransactionError(err) {
    if (err?.code === 4001) {
        return "Вы отклонили транзакцию в MetaMask.";
    }

    return getErrorMessage(err);
}

/**
 * Проверка администратора DAO.
 */
async function isDaoAdmin() {
    if (!isWalletConnected()) {
        return false;
    }

    requireMethod(
        contract,
        "admin",
        "RescueDAO"
    );

    const adminAddress = await contract.admin();

    return (
        String(adminAddress).toLowerCase() ===
        String(userAddress).toLowerCase()
    );
}

/**
 * Нормализация финансовой статистики.
 */
function normalizeRequestStats(raw) {
    if (!raw) {
        throw new Error(
            "RescueDAO не вернул финансовую статистику заявки."
        );
    }

    return {
        requestedAmount: raw.requestedAmount ?? raw[0] ?? 0n,
        milestoneTotal: raw.milestoneTotal ?? raw[1] ?? 0n,
        releasedAmount: raw.releasedAmount ?? raw[2] ?? 0n,
        milestoneCount: raw.milestoneCount ?? raw[3] ?? 0n,
        completedMilestones: raw.completedMilestones ?? raw[4] ?? 0n,
        status: raw.status ?? raw[5] ?? 0
    };
}

async function getRequestStats() {
    requireMethod(
        contract,
        "getRequestFinancialStats",
        "RescueDAO"
    );

    const raw = await contract.getRequestFinancialStats(
        requestId
    );

    return normalizeRequestStats(raw);
}

/**
 * Получение замечания администратора.
 */
async function getRequestChangeReason() {
    requireMethod(
        contract,
        "getRequestChangeReason",
        "RescueDAO"
    );

    const reason = await contract.getRequestChangeReason(
        requestId
    );

    return String(reason ?? "").trim();
}

function parseMilestoneFundingStatus(result) {
    if (!result) {
        throw new Error(
            "Контракт не вернул информацию о финансировании этапа."
        );
    }

    return {
        funded: Boolean(result.funded ?? result[0]),
        targetReserved: BigInt(
            result.targetReserved ?? result[1] ?? 0n
        ),
        generalReserved: BigInt(
            result.generalReserved ?? result[2] ?? 0n
        ),
        released: Boolean(result.released ?? result[3])
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
        console.error("Не найден requestDetailsContainer.");
        return;
    }

    try {
        requireMethod(
            daoViewContract,
            "getAidRequestInfo",
            "RescueDAOView"
        );

        requireContract(contract, "RescueDAO");
        requireContract(milestonesContract, "RescueMilestones");
        requireContract(treasuryContract, "RescueTreasury");

        const [info, stats] = await Promise.all([
            daoViewContract.getAidRequestInfo(requestId),
            getRequestStats()
        ]);

        const statusNum = Number(stats.status);
        const statusObj = getStatusInfo(statusNum);

        const isRequester = isRequesterAddress(
            info.requester
        );

        let changeRequestReason = "";

        if (
            statusNum === REQUEST_STATUS.CHANGES_REQUESTED
        ) {
            try {
                changeRequestReason =
                    await getRequestChangeReason();
            } catch (reasonErr) {
                console.error(
                    "Не удалось получить пояснение администратора:",
                    reasonErr
                );
            }
        }

        let isAdmin = false;

        try {
            isAdmin = await isDaoAdmin();
        } catch (adminErr) {
            console.warn(
                "Не удалось определить администратора DAO:",
                adminErr
            );
        }

        // -------------------------------------------------
        // Метаданные backend
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
                        : targetDonations * 100n /
                          requestedAmount
                )
                : 0;

        const isApproved =
            statusNum === REQUEST_STATUS.APPROVED;

        const canDonateToRequest = (
            isApproved &&
            remainingAmount > 0n &&
            treasuryAvailable &&
            isWalletConnected()
        );

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
        // СООБЩЕНИЕ О СТАДИИ ЗАЯВКИ
        // =================================================

        let lifecycleMessage = "";

        if (
            statusNum === REQUEST_STATUS.UNDER_REVIEW
        ) {
            lifecycleMessage = `
                <div class="box" style="margin-top:1rem;">
                    <strong>
                        Заявка находится на проверке.
                    </strong>

                    <p style="
                        margin-top:0.4rem;
                        color:var(--text-muted);
                    ">
                        Администратор проверяет материалы заявки.
                        Инициатор может дополнять описание и редактировать
                        этапы финансирования до публикации заявки.
                    </p>
                </div>
            `;

        } else if (
            statusNum === REQUEST_STATUS.CHANGES_REQUESTED
        ) {
            const reasonBlock = changeRequestReason
                ? `
                    <div style="
                        margin-top:0.85rem;
                        padding:0.85rem;
                        background:var(--surface);
                        border:1px solid var(--border);
                        border-radius:0.5rem;
                    ">
                        <strong>
                            Что необходимо исправить:
                        </strong>

                        <p style="
                            margin-top:0.5rem;
                            white-space:pre-wrap;
                            overflow-wrap:anywhere;
                            color:var(--text);
                        ">${escapeHtml(changeRequestReason)}</p>
                    </div>
                `
                : `
                    <div style="
                        margin-top:0.85rem;
                        padding:0.85rem;
                        background:var(--surface);
                        border:1px solid var(--border);
                        border-radius:0.5rem;
                    ">
                        <strong>
                            Пояснение администратора пока недоступно.
                        </strong>
                    </div>
                `;

            lifecycleMessage = `
                <div
                    class="box"
                    style="
                        margin-top:1rem;
                        border-left:4px solid var(--warning);
                    "
                >
                    <strong>
                        По заявке требуются изменения.
                    </strong>

                    <p style="
                        margin-top:0.4rem;
                        color:var(--text-muted);
                    ">
                        Администратор вернул заявку на доработку.
                        Ознакомьтесь с замечанием, исправьте материалы
                        и этапы финансирования, после чего повторно
                        отправьте заявку на проверку.
                    </p>

                    ${reasonBlock}
                </div>
            `;

        } else if (
            statusNum === REQUEST_STATUS.APPROVED
        ) {
            lifecycleMessage = `
                <div class="box" style="margin-top:1rem;">
                    <strong>
                        Заявка одобрена и опубликована.
                    </strong>

                    <p style="
                        margin-top:0.4rem;
                        color:var(--text-muted);
                    ">
                        Пользователи могут поддерживать заявку целевыми
                        пожертвованиями. Средства резервируются отдельно
                        для каждого этапа.
                    </p>
                </div>
            `;

        } else if (
            statusNum === REQUEST_STATUS.REJECTED
        ) {
            lifecycleMessage = `
                <div class="box" style="margin-top:1rem;">
                    <strong>
                        Заявка отклонена администратором.
                    </strong>

                    <p style="
                        margin-top:0.4rem;
                        color:var(--text-muted);
                    ">
                        Финансирование и выполнение этапов
                        по этой заявке недоступны.
                    </p>
                </div>
            `;

        } else if (
            statusNum === REQUEST_STATUS.COMPLETED
        ) {
            lifecycleMessage = `
                <div class="box" style="margin-top:1rem;">
                    <strong>Заявка завершена.</strong>

                    <p style="
                        margin-top:0.4rem;
                        color:var(--text-muted);
                    ">
                        Все этапы заявки выполнены, отчёты проверены,
                        средства выплачены.
                    </p>
                </div>
            `;

        } else if (
            statusNum === REQUEST_STATUS.CANCELLED
        ) {
            lifecycleMessage = `
                <div class="box" style="margin-top:1rem;">
                    <strong>Заявка отменена.</strong>

                    <p style="
                        margin-top:0.4rem;
                        color:var(--text-muted);
                    ">
                        Дальнейшее финансирование и выполнение этапов
                        по этой заявке недоступны.
                    </p>
                </div>
            `;
        }

        // =================================================
        // ФОРМА РЕДАКТИРОВАНИЯ ЗАЯВКИ
        // =================================================

        const canEditRequest =
            isPreparationStatus(statusNum) && isRequester;

        const requestEditBlock = canEditRequest
            ? `
                <div class="box" style="margin-top:1rem;">
                    <h3>✏️ Редактирование заявки</h3>

                    <p style="
                        font-size:0.85rem;
                        color:var(--text-muted);
                        margin:0.5rem 0 1rem;
                    ">
                        Исправьте данные заявки с учётом замечаний
                        администратора.
                    </p>

                    <div class="form-group"
                         style="margin-bottom:0.75rem;">

                        <label for="editRequestAnimalName">
                            Название / имя животного
                        </label>

                        <input
                            type="text"
                            id="editRequestAnimalName"
                            maxlength="100"
                            value="${escapeHtml(info.animalName)}"
                            class="input-field"
                            style="width:100%;padding:0.6rem;"
                        >
                    </div>

                    <div class="form-group"
                         style="margin-bottom:0.75rem;">

                        <label for="editRequestDescription">
                            Описание ситуации
                        </label>

                        <textarea
                            id="editRequestDescription"
                            maxlength="5000"
                            rows="6"
                            class="input-field"
                            style="
                                width:100%;
                                padding:0.6rem;
                                resize:vertical;
                            "
                        >${escapeHtml(info.description)}</textarea>
                    </div>

                    <div class="form-group"
                         style="margin-bottom:0.75rem;">

                        <label for="editRequestEvidenceURI">
                            URI документа
                        </label>

                        <input
                            type="text"
                            id="editRequestEvidenceURI"
                            value="${escapeHtml(info.evidenceURI)}"
                            class="input-field"
                            placeholder="https://... или ipfs://..."
                            style="width:100%;padding:0.6rem;"
                        >
                    </div>

                    <div class="form-group"
                         style="margin-bottom:0.75rem;">

                        <label for="editRequestEvidenceFile">
                            Новый файл документа
                        </label>

                        <input
                            type="file"
                            id="editRequestEvidenceFile"
                            style="display:block;width:100%;margin-top:0.4rem;"
                        >

                        <p style="
                            font-size:0.8rem;
                            color:var(--text-muted);
                            margin-top:0.35rem;
                        ">
                            При выборе нового файла его хэш будет
                            пересчитан. Файл предварительно загрузите
                            на сервер или IPFS и укажите новый URI.
                        </p>
                    </div>

                    <div class="form-group"
                         style="margin-bottom:0.75rem;">

                        <label for="editRequestAmount">
                            Запрашиваемая сумма (ETH)
                        </label>

                        <input
                            type="number"
                            id="editRequestAmount"
                            value="${escapeHtml(formatEth(stats.requestedAmount))}"
                            step="0.001"
                            min="0"
                            class="input-field"
                            style="width:100%;padding:0.6rem;"
                        >
                    </div>

                    <button
                        class="btn btn-primary"
                        style="width:100%;"
                        onclick="saveRequestChanges(this)"
                    >
                        💾 Сохранить изменения заявки
                    </button>
                </div>
            `
            : "";

        // =================================================
        // ПОВТОРНАЯ ОТПРАВКА ЗАЯВКИ
        // =================================================

        const resubmitBlock =
            statusNum === REQUEST_STATUS.CHANGES_REQUESTED &&
            isRequester
                ? `
                    <div class="box" style="
                        margin-top:1rem;
                        border-left:4px solid var(--primary);
                    ">
                        <h3>📨 Повторная отправка заявки</h3>

                        <p style="
                            margin:0.5rem 0 0.85rem;
                            color:var(--text-muted);
                            font-size:0.88rem;
                        ">
                            После исправления замечаний, сохранения
                            данных заявки и корректировки этапов
                            отправьте её на повторную проверку.
                        </p>

                        <button
                            class="btn btn-primary"
                            style="width:100%;"
                            onclick="resubmitCurrentRequest(this)"
                        >
                            Отправить исправленную заявку на проверку
                        </button>
                    </div>
                `
                : "";

        // =================================================
        // БЛОК ЦЕЛЕВОГО ФИНАНСИРОВАНИЯ
        // =================================================

        let targetFundingBlock = "";

        if (treasuryAvailable) {
            let donationMessage = "";

            if (canDonateToRequest) {
                donationMessage = `
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
                `;

            } else if (remainingAmount === 0n) {
                donationMessage = `
                    <p style="
                        margin-top:1rem;
                        font-size:0.85rem;
                        color:var(--primary);
                        font-weight:600;
                    ">
                        Целевая сумма собрана полностью.
                    </p>
                `;

            } else if (
                statusNum === REQUEST_STATUS.APPROVED &&
                !isWalletConnected()
            ) {
                donationMessage = `
                    <p style="
                        margin-top:1rem;
                        font-size:0.85rem;
                        color:var(--text-muted);
                    ">
                        Подключите MetaMask, чтобы поддержать
                        одобренную заявку.
                    </p>
                `;

            } else if (
                statusNum === REQUEST_STATUS.APPROVED
            ) {
                donationMessage = `
                    <p style="
                        margin-top:1rem;
                        font-size:0.85rem;
                        color:var(--text-muted);
                    ">
                        Для этой заявки пока невозможно внести
                        целевое пожертвование.
                    </p>
                `;

            } else {
                donationMessage = `
                    <p style="
                        margin-top:1rem;
                        font-size:0.85rem;
                        color:var(--text-muted);
                    ">
                        Целевые пожертвования станут доступны
                        после одобрения заявки.
                    </p>
                `;
            }

            targetFundingBlock = `
                <div class="box" style="
                    margin-top:1rem;
                    border:1px solid var(--border);
                ">
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
                                    свой вклад.
                                </p>
                            `
                    }

                    ${donationMessage}
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
            isPreparationStatus(statusNum) && isRequester;

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
                            ${formatEth(stats.milestoneTotal)} /
                            ${formatEth(stats.requestedAmount)} ETH
                        </strong>.
                        Сумма этапов не должна превышать
                        запрошенную сумму.
                    </p>

                    <div class="form-group"
                         style="margin-bottom:0.75rem;">

                        <label for="msDesc">
                            Название этапа
                        </label>

                        <input
                            type="text"
                            id="msDesc"
                            class="input-field"
                            maxlength="200"
                            placeholder="Например: Операция в ветклинике"
                            style="width:100%;padding:0.5rem;margin-top:0.25rem;"
                        >
                    </div>

                    <div class="form-group"
                         style="margin-bottom:0.75rem;">

                        <label for="msRecipient">
                            Адрес получателя
                        </label>

                        <input
                            type="text"
                            id="msRecipient"
                            class="input-field"
                            placeholder="0x..."
                            style="width:100%;padding:0.5rem;margin-top:0.25rem;"
                        >
                    </div>

                    <div class="form-group"
                         style="margin-bottom:0.75rem;">

                        <label for="msAmount">
                            Сумма этапа (ETH)
                        </label>

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
                        onclick="createNewMilestone(this)"
                    >
                        Добавить этап
                    </button>
                </div>
            `
            : "";

        // =================================================
        // ОСНОВНАЯ РАЗМЕТКА
        // =================================================

        container.innerHTML = `
            <div class="details-layout">
                <div>
                    <div class="box">
                        <div class="card-title-row" style="
                            display:flex;
                            justify-content:space-between;
                            align-items:center;
                            gap:0.75rem;
                            margin-bottom:0.75rem;
                        ">
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

                    ${requestEditBlock}

                    ${addMilestoneBlock}

                    ${resubmitBlock}

                    <div class="box" style="margin-top:1rem;">
                        <h3 style="margin-bottom:1rem;">
                            Этапы финансирования (Milestones)
                        </h3>

                        <div id="milestonesContainer">
                            Загрузка этапов...
                        </div>
                    </div>
                </div>

                <div class="request-sidebar" style="
                    align-self:start;
                    position:sticky;
                    top:90px;
                    display:flex;
                    flex-direction:column;
                    gap:1rem;
                    min-width:0;
                ">
                    ${targetFundingBlock}

                    <div class="box">
                        <h3>Статус заявки</h3>

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
                                <span>Всего этапов:</span>
                                <strong>
                                    ${Number(stats.milestoneCount)}
                                </strong>
                            </div>

                            <div style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            ">
                                <span>Завершено этапов:</span>
                                <strong style="color:var(--primary);">
                                    ${Number(stats.completedMilestones)}
                                </strong>
                            </div>

                            <div style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            ">
                                <span>Текущий статус:</span>
                                <strong style="text-align:right;">
                                    ${escapeHtml(statusObj.text)}
                                </strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await loadMilestonesList(
            Number(stats.milestoneCount),
            statusNum,
            isRequester,
            isAdmin
        );

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
// 4. СОХРАНЕНИЕ ИЗМЕНЕНИЙ ЗАЯВКИ
// =========================================================

async function saveRequestChanges(btnEl = null) {
    return runWithButtonLock(
        btnEl,
        "Сохранение...",
        async () => {
            try {
                if (!isWalletConnected()) {
                    throw new Error(
                        "Сначала подключите MetaMask."
                    );
                }

                requireMethod(
                    contract,
                    "updateRequestDetails",
                    "RescueDAO"
                );

                const animalName = document
                    .getElementById("editRequestAnimalName")
                    ?.value.trim();

                const description = document
                    .getElementById("editRequestDescription")
                    ?.value.trim();

                const evidenceURI = document
                    .getElementById("editRequestEvidenceURI")
                    ?.value.trim();

                const amount = document
                    .getElementById("editRequestAmount")
                    ?.value.trim();

                const evidenceFile = document
                    .getElementById("editRequestEvidenceFile")
                    ?.files?.[0];

                if (!animalName) {
                    throw new Error(
                        "Укажите название или имя животного."
                    );
                }

                if (animalName.length > 100) {
                    throw new Error(
                        "Название животного слишком длинное."
                    );
                }

                if (!description) {
                    throw new Error(
                        "Заполните описание ситуации."
                    );
                }

                if (description.length > 5000) {
                    throw new Error(
                        "Описание не должно превышать 5000 символов."
                    );
                }

                if (!evidenceURI) {
                    throw new Error(
                        "Укажите URI документа."
                    );
                }

                if (!amount || !/^\d+(\.\d+)?$/.test(amount)) {
                    throw new Error(
                        "Введите корректную запрашиваемую сумму."
                    );
                }

                const requestedAmount =
                    ethers.parseEther(amount);

                if (requestedAmount <= 0n) {
                    throw new Error(
                        "Запрашиваемая сумма должна быть больше нуля."
                    );
                }

                const stats = await getRequestStats();

                if (!isPreparationStatus(Number(stats.status))) {
                    throw new Error(
                        "Изменять заявку можно только на стадии подготовки."
                    );
                }

                const info =
                    await daoViewContract.getAidRequestInfo(requestId);

                if (!isRequesterAddress(info.requester)) {
                    throw new Error(
                        "Редактировать заявку может только её инициатор."
                    );
                }

                const milestoneTotal =
                    BigInt(stats.milestoneTotal);

                if (milestoneTotal > requestedAmount) {
                    throw new Error(
                        "Запрашиваемая сумма не может быть меньше " +
                        "общей суммы уже добавленных этапов.\n\n" +
                        "Сумма этапов: " +
                        formatEth(milestoneTotal) +
                        " ETH."
                    );
                }

                // Используем текущий хэш, если файл не заменяли.
                let newEvidenceHash = String(
                    info.evidenceHash || ""
                );

                // Если выбран новый файл, рассчитываем его хэш.
                if (evidenceFile) {
                    const buffer =
                        await evidenceFile.arrayBuffer();

                    newEvidenceHash = ethers.keccak256(
                        new Uint8Array(buffer)
                    );
                }

                if (!ethers.isHexString(newEvidenceHash, 32)) {
                    throw new Error(
                        "Хэш документа некорректен."
                    );
                }

                if (
                    newEvidenceHash.toLowerCase() ===
                    ethers.ZeroHash.toLowerCase()
                ) {
                    throw new Error(
                        "Хэш документа не может быть нулевым."
                    );
                }

                const confirmed = confirm(
                    `Сохранить изменения заявки #${requestId}?\n\n` +
                    `Животное: ${animalName}\n` +
                    `Запрашиваемая сумма: ${amount} ETH\n\n` +
                    "Проверьте, что URI соответствует выбранному " +
                    "файлу документа."
                );

                if (!confirmed) return;

                const tx = await contract.updateRequestDetails(
                    requestId,
                    animalName,
                    description,
                    evidenceURI,
                    newEvidenceHash,
                    requestedAmount
                );

                alert(
                    "Изменения заявки отправлены в блокчейн. " +
                    "Ожидаем подтверждения транзакции..."
                );

                const receipt = await tx.wait();

                if (
                    !receipt ||
                    Number(receipt.status) !== 1
                ) {
                    throw new Error(
                        "Транзакция сохранения изменений не подтверждена."
                    );
                }

                alert(
                    "Изменения заявки успешно сохранены."
                );

                reloadPreservingScroll();

            } catch (err) {
                console.error(
                    "Ошибка сохранения заявки:",
                    err
                );

                alert(
                    "Не удалось сохранить изменения заявки:\n" +
                    getTransactionError(err)
                );
            }
        }
    );
}

// =========================================================
// 5. ПОВТОРНАЯ ОТПРАВКА ИСПРАВЛЕННОЙ ЗАЯВКИ
// =========================================================

async function resubmitCurrentRequest(btnEl = null) {
    return runWithButtonLock(
        btnEl,
        "Отправка...",
        async () => {
            try {
                if (!isWalletConnected()) {
                    throw new Error(
                        "Сначала подключите MetaMask."
                    );
                }

                requireMethod(
                    contract,
                    "resubmitForReview",
                    "RescueDAO"
                );

                const stats = await getRequestStats();

                if (
                    Number(stats.status) !==
                    REQUEST_STATUS.CHANGES_REQUESTED
                ) {
                    throw new Error(
                        "Повторно отправить можно только заявку, " +
                        "возвращённую администратором на доработку."
                    );
                }

                const info =
                    await daoViewContract.getAidRequestInfo(requestId);

                if (!isRequesterAddress(info.requester)) {
                    throw new Error(
                        "Повторно отправить заявку может только её инициатор."
                    );
                }

                const milestoneCount =
                    Number(stats.milestoneCount);

                const milestoneTotal =
                    BigInt(stats.milestoneTotal);

                const requestedAmount =
                    BigInt(stats.requestedAmount);

                if (milestoneCount <= 0) {
                    throw new Error(
                        "Добавьте хотя бы один этап финансирования."
                    );
                }

                if (milestoneTotal !== requestedAmount) {
                    const difference =
                        requestedAmount > milestoneTotal
                            ? requestedAmount - milestoneTotal
                            : milestoneTotal - requestedAmount;

                    throw new Error(
                        "Сумма этапов должна полностью совпадать " +
                        "с запрашиваемой суммой.\n\n" +
                        "Запрошено: " +
                        formatEth(requestedAmount) +
                        " ETH\n" +
                        "Распределено по этапам: " +
                        formatEth(milestoneTotal) +
                        " ETH\n" +
                        "Разница: " +
                        formatEth(difference) +
                        " ETH."
                    );
                }

                const confirmed = confirm(
                    `Отправить исправленную заявку #${requestId} ` +
                    "на повторную проверку?\n\n" +
                    `Количество этапов: ${milestoneCount}\n` +
                    `Общая сумма этапов: ${formatEth(milestoneTotal)} ETH\n\n` +
                    "После отправки статус заявки изменится " +
                    "на «На проверке»."
                );

                if (!confirmed) return;

                const tx = await contract.resubmitForReview(
                    requestId
                );

                alert(
                    "Заявка отправлена на повторную проверку. " +
                    "Ожидаем подтверждения транзакции..."
                );

                const receipt = await tx.wait();

                if (
                    !receipt ||
                    Number(receipt.status) !== 1
                ) {
                    throw new Error(
                        "Транзакция повторной отправки не подтверждена."
                    );
                }

                alert(
                    "Исправленная заявка успешно отправлена " +
                    "на повторную проверку администратору DAO."
                );

                reloadPreservingScroll();

            } catch (err) {
                console.error(
                    "Ошибка повторной отправки заявки:",
                    err
                );

                alert(
                    "Не удалось повторно отправить заявку:\n" +
                    getTransactionError(err)
                );
            }
        }
    );
}

// =========================================================
// 6. ЦЕЛЕВОЕ ПОЖЕРТВОВАНИЕ
// =========================================================

async function donateToCurrentRequest() {
    const amountInput = document.getElementById(
        "targetDonationAmount"
    );

    const amount = amountInput?.value?.trim();

    try {
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
            treasuryContract,
            "requestDonations",
            "RescueTreasury"
        );

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

        const [targetDonations, stats] =
            await Promise.all([
                treasuryContract.requestDonations(requestId),
                getRequestStats()
            ]);

        if (
            Number(stats.status) !==
            REQUEST_STATUS.APPROVED
        ) {
            throw new Error(
                "Целевые пожертвования принимаются только " +
                "для одобренных и опубликованных заявок."
            );
        }

        const requestedAmount =
            BigInt(stats.requestedAmount);

        const currentDonations =
            BigInt(targetDonations);

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
            `Вы действительно хотите пожертвовать ${amount} ETH ` +
            `на заявку #${requestId}?`
        );

        if (!confirmed) return;

        const tx = await contract.donateToRequest(
            requestId,
            { value: donationWei }
        );

        alert(
            "Пожертвование отправлено. " +
            "Ожидаем подтверждения транзакции..."
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

        reloadPreservingScroll();

    } catch (err) {
        console.error(
            "Ошибка целевого пожертвования:",
            err
        );

        alert(
            "Не удалось выполнить пожертвование:\n" +
            getTransactionError(err)
        );
    }
}

// =========================================================
// 7. ЗАГРУЗКА NFT-ПАСПОРТА
// =========================================================


async function loadNftPassport(requestId, statusNum) {
    const nftContainer = document.getElementById(
        "nftPassportSection"
    );

    if (!nftContainer) return;

    const status = Number(statusNum);

    // Заявка ещё проверяется или требует исправлений.
    // NFT выпускается только после одобрения.
    if (
        status === REQUEST_STATUS.UNDER_REVIEW ||
        status === REQUEST_STATUS.CHANGES_REQUESTED
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
                    после одобрения заявки администратором.
                </p>
            </div>
        `;

        return;
    }

    try {
        // Проверяем наличие необходимых методов в ABI.
        requireMethod(
            nftContract,
            "requestToToken",
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

        // Получаем Token ID через публичный mapping.
        // Если паспорт отсутствует, контракт вернёт 0.
        const tokenId = await nftContract.requestToToken(
            requestId
        );

        // NFT ещё не выпускался.
        if (BigInt(tokenId) === 0n) {
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
                        Для заявки #${escapeHtml(requestId)}
                        пока не найден выпущенный NFT-паспорт.
                        Он будет доступен после одобрения заявки.
                    </p>
                </div>
            `;

            return;
        }

        // Получаем владельца и metadata NFT.
        const [owner, uri] = await Promise.all([
            nftContract.ownerOf(tokenId),
            nftContract.tokenURI(tokenId)
        ]);

        // Если URI не содержит JSON Base64,
        // показываем информацию о токене без разбора metadata.
        if (
            !String(uri).startsWith(
                "data:application/json;base64,"
            )
        ) {
            nftContainer.innerHTML = `
                <div style="
                    padding:1rem;
                    border:1px solid var(--border);
                    border-radius:0.75rem;
                    background:var(--surface);
                ">
                    <strong>
                        🐾 NFT-паспорт #${escapeHtml(tokenId)} выпущен
                    </strong>

                    <p class="mono" style="
                        margin-top:0.6rem;
                        font-size:0.78rem;
                        word-break:break-all;
                    ">
                        URI: ${escapeHtml(uri)}
                    </p>

                    <p class="mono" style="
                        font-size:0.78rem;
                        word-break:break-all;
                    ">
                        Владелец: ${escapeHtml(owner)}
                    </p>
                </div>
            `;

            return;
        }

        // Декодируем Base64 JSON.
        const base64Json = String(uri).split(",")[1];

        const binaryString = window.atob(base64Json);

        const bytes = Uint8Array.from(
            binaryString,
            char => char.charCodeAt(0)
        );

        const jsonString = new TextDecoder().decode(bytes);

        const metadata = JSON.parse(jsonString);

        // Формируем список атрибутов NFT.
        const attributesHtml = (
            Array.isArray(metadata.attributes)
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

        // Получаем изображение из metadata.
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

        // Отображаем готовую карточку NFT.
        nftContainer.innerHTML = `
            <div style="
                border:1px solid #cbd5e1;
                border-radius:0.75rem;
                padding:1rem;
                background:#ffffff;
            ">
                <div class="row-between" style="
                    margin-bottom:0.75rem;
                ">
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

                        <div class="mono" style="
                            font-size:0.78rem;
                            margin-bottom:0.6rem;
                            word-break:break-all;
                        ">
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
                Проверьте подключение к блокчейну,
                адрес RescueNFT и ABI контракта.
            </div>
        `;
    }
}

// =========================================================
// 8. ПРОВЕРКА ХЭША ДОКУМЕНТА
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
// 9. ДОБАВЛЕНИЕ ЭТАПА ФИНАНСИРОВАНИЯ
// =========================================================

async function createNewMilestone(btnEl = null) {
    return runWithButtonLock(
        btnEl,
        "Добавление...",
        async () => {
            const desc = document
                .getElementById("msDesc")
                ?.value.trim();

            const recipient = document
                .getElementById("msRecipient")
                ?.value.trim();

            const amount = document
                .getElementById("msAmount")
                ?.value.trim();

            try {
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

                const stats = await getRequestStats();

                if (!isPreparationStatus(Number(stats.status))) {
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
                    recipient.toLowerCase() ===
                    ethers.ZeroAddress.toLowerCase()
                ) {
                    throw new Error(
                        "Укажите корректный адрес получателя."
                    );
                }

                if (!amount || !/^\d+(\.\d+)?$/.test(amount)) {
                    throw new Error(
                        "Введите корректную сумму этапа."
                    );
                }

                const amountWei = ethers.parseEther(amount);

                if (amountWei <= 0n) {
                    throw new Error(
                        "Сумма этапа должна быть больше нуля."
                    );
                }

                const currentTotal =
                    BigInt(stats.milestoneTotal);

                const requestedAmount =
                    BigInt(stats.requestedAmount);

                if (
                    currentTotal + amountWei >
                    requestedAmount
                ) {
                    throw new Error(
                        "Сумма этапов превысит запрошенную сумму заявки. " +
                        "Остаток для распределения: " +
                        formatEth(
                            requestedAmount - currentTotal
                        ) +
                        " ETH."
                    );
                }

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

                reloadPreservingScroll();

            } catch (err) {
                console.error(
                    "Ошибка добавления этапа:",
                    err
                );

                alert(
                    "Ошибка добавления этапа: " +
                    getTransactionError(err)
                );
            }
        }
    );
}

// =========================================================
// 10. РЕДАКТИРОВАНИЕ ЭТАПА
// =========================================================

async function updateMilestone(
    milestoneId,
    btnEl = null
) {
    return runWithButtonLock(
        btnEl,
        "Сохранение...",
        async () => {
            const desc = document
                .getElementById(`editMsDesc_${milestoneId}`)
                ?.value.trim();

            const recipient = document
                .getElementById(`editMsRecipient_${milestoneId}`)
                ?.value.trim();

            const amount = document
                .getElementById(`editMsAmount_${milestoneId}`)
                ?.value.trim();

            try {
                if (!isWalletConnected()) {
                    throw new Error(
                        "Сначала подключите MetaMask."
                    );
                }

                requireMethod(
                    milestonesContract,
                    "updateMilestone",
                    "RescueMilestones"
                );

                const stats = await getRequestStats();

                if (
                    !isPreparationStatus(Number(stats.status))
                ) {
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
                    recipient.toLowerCase() ===
                    ethers.ZeroAddress.toLowerCase()
                ) {
                    throw new Error(
                        "Укажите корректный адрес получателя."
                    );
                }

                if (!amount || !/^\d+(\.\d+)?$/.test(amount)) {
                    throw new Error(
                        "Введите корректную сумму этапа."
                    );
                }

                const newAmountWei =
                    ethers.parseEther(amount);

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

                const oldAmountWei =
                    BigInt(oldMilestone.amount);

                const currentTotal =
                    BigInt(stats.milestoneTotal);

                const requestedAmount =
                    BigInt(stats.requestedAmount);

                const updatedTotal =
                    currentTotal - oldAmountWei + newAmountWei;

                if (updatedTotal > requestedAmount) {
                    throw new Error(
                        "После изменения сумма этапов превысит " +
                        "запрошенную сумму. Максимально доступная " +
                        "сумма для этого этапа: " +
                        formatEth(
                            requestedAmount -
                            (currentTotal - oldAmountWei)
                        ) +
                        " ETH."
                    );
                }

                const confirmed = confirm(
                    `Сохранить изменения этапа #${milestoneId}?\n\n` +
                    `Новое название: ${desc}\n` +
                    `Новая сумма: ${amount} ETH`
                );

                if (!confirmed) return;

                const tx =
                    await milestonesContract.updateMilestone(
                        requestId,
                        milestoneId,
                        desc,
                        recipient,
                        newAmountWei
                    );

                alert(
                    "Изменение этапа отправлено в блокчейн..."
                );

                const receipt = await tx.wait();

                if (
                    !receipt ||
                    Number(receipt.status) !== 1
                ) {
                    throw new Error(
                        "Транзакция изменения этапа не подтверждена."
                    );
                }

                reloadPreservingScroll();

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
    );
}

// =========================================================
// 11. РЕЗЕРВИРОВАНИЕ СРЕДСТВ
// =========================================================

async function fundMilestone(
    milestoneId,
    btnEl = null
) {
    return runWithButtonLock(
        btnEl,
        "Резервирование...",
        async () => {
            try {
                if (!isWalletConnected()) {
                    throw new Error(
                        "Сначала подключите MetaMask."
                    );
                }

                requireMethod(
                    milestonesContract,
                    "fundMilestone",
                    "RescueMilestones"
                );

                requireMethod(
                    milestonesContract,
                    "getMilestone",
                    "RescueMilestones"
                );

                requireMethod(
                    milestonesContract,
                    "getMilestoneFundingStatus",
                    "RescueMilestones"
                );

                const admin = await isDaoAdmin();

                if (!admin) {
                    throw new Error(
                        "Резервировать средства этапов может только администратор DAO."
                    );
                }

                const stats = await getRequestStats();

                if (
                    Number(stats.status) !==
                    REQUEST_STATUS.APPROVED
                ) {
                    throw new Error(
                        "Резервировать средства можно только для одобренной заявки."
                    );
                }

                const milestone =
                    await milestonesContract.getMilestone(
                        requestId,
                        milestoneId
                    );

                if (!isValidMilestone(milestone)) {
                    throw new Error(
                        "Указанный этап не существует."
                    );
                }

                const fundingResult =
                    await milestonesContract.getMilestoneFundingStatus(
                        requestId,
                        milestoneId
                    );

                const funding =
                    parseMilestoneFundingStatus(fundingResult);

                if (
                    funding.released ||
                    milestone.released
                ) {
                    throw new Error(
                        "Этот этап уже оплачен."
                    );
                }

                if (funding.funded) {
                    throw new Error(
                        "Средства для этого этапа уже зарезервированы."
                    );
                }

                const milestoneAmount =
                    BigInt(milestone.amount);

                const confirmed = confirm(
                    `Зарезервировать средства для этапа #${milestoneId}?\n\n` +
                    `Этап: ${milestone.description}\n` +
                    `Сумма: ${formatEth(milestoneAmount)} ETH\n\n` +
                    "Сначала будут использованы доступные целевые пожертвования " +
                    "этой заявки, а недостающая сумма — из общего фонда."
                );

                if (!confirmed) return;

                const tx =
                    await milestonesContract.fundMilestone(
                        requestId,
                        milestoneId
                    );

                alert(
                    "Резервирование средств отправлено. " +
                    "Ожидаем подтверждения транзакции..."
                );

                const receipt = await tx.wait();

                if (
                    !receipt ||
                    Number(receipt.status) !== 1
                ) {
                    throw new Error(
                        "Транзакция резервирования средств не подтверждена."
                    );
                }

                alert(
                    `Средства для этапа #${milestoneId} успешно зарезервированы.`
                );

                reloadPreservingScroll();

            } catch (err) {
                console.error(
                    `Ошибка резервирования этапа #${milestoneId}:`,
                    err
                );

                alert(
                    "Не удалось зарезервировать средства:\n" +
                    getTransactionError(err)
                );
            }
        }
    );
}

// =========================================================
// 12. ЗАГРУЗКА СПИСКА ЭТАПОВ
// =========================================================

async function loadMilestonesList(
    mCount,
    reqStatus,
    isRequester,
    isAdmin
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

        requireMethod(
            milestonesContract,
            "getMilestoneFundingStatus",
            "RescueMilestones"
        );

        box.innerHTML = "";

        const canEdit =
            isPreparationStatus(reqStatus) && isRequester;

        const canSubmitEvidence =
            Number(reqStatus) === REQUEST_STATUS.APPROVED &&
            isRequester;

        for (let m = 1; m <= mCount; m++) {
            const ms =
                await milestonesContract.getMilestone(
                    requestId,
                    m
                );

            if (!isValidMilestone(ms)) {
                console.warn(
                    `Этап #${m} не существует или содержит некорректные данные.`
                );

                continue;
            }

            const fundingResult =
                await milestonesContract.getMilestoneFundingStatus(
                    requestId,
                    m
                );

            const funding =
                parseMilestoneFundingStatus(fundingResult);

            const funded = funding.funded;

            const released =
                funding.released || Boolean(ms.released);

            const targetReserved =
                funding.targetReserved;

            const generalReserved =
                funding.generalReserved;

            const totalReserved =
                targetReserved + generalReserved;

            // -------------------------------------------------
            // Статус этапа
            // -------------------------------------------------

            let statusBadge = "";

            if (released) {
                statusBadge = `
                    <span class="badge badge-green">
                        Оплачено (${ms.approvalCount}/2)
                    </span>
                `;

            } else if (
                Number(reqStatus) !== REQUEST_STATUS.APPROVED
            ) {
                statusBadge = `
                    <span class="badge badge-gray">
                        Ожидает одобрения заявки
                    </span>
                `;

            } else if (!funded) {
                statusBadge = `
                    <span class="badge badge-yellow">
                        Ожидает финансирования
                    </span>
                `;

            } else if (ms.evidenceSubmitted) {
                statusBadge = `
                    <span class="badge badge-blue">
                        Отчёт загружен (${ms.approvalCount}/2 подтверждений)
                    </span>
                `;

            } else {
                statusBadge = `
                    <span class="badge badge-blue">
                        Средства зарезервированы · ожидает отчёт
                    </span>
                `;
            }

            // -------------------------------------------------
            // Информация о резервировании
            // -------------------------------------------------

            let fundingDetails = "";

            if (funded || released) {
                fundingDetails = `
                    <div style="
                        margin-top:0.65rem;
                        padding:0.65rem;
                        background:#f8fafc;
                        border-radius:0.5rem;
                        font-size:0.84rem;
                    ">
                        <div style="
                            display:flex;
                            justify-content:space-between;
                            gap:0.5rem;
                        ">
                            <span>Всего зарезервировано:</span>
                            <strong>
                                ${formatEth(totalReserved)} ETH
                            </strong>
                        </div>

                        <div style="
                            display:flex;
                            justify-content:space-between;
                            gap:0.5rem;
                            margin-top:0.3rem;
                        ">
                            <span>Из целевых пожертвований:</span>
                            <strong>
                                ${formatEth(targetReserved)} ETH
                            </strong>
                        </div>

                        <div style="
                            display:flex;
                            justify-content:space-between;
                            gap:0.5rem;
                            margin-top:0.3rem;
                        ">
                            <span>Из общего фонда:</span>
                            <strong>
                                ${formatEth(generalReserved)} ETH
                            </strong>
                        </div>
                    </div>
                `;

            } else if (
                Number(reqStatus) === REQUEST_STATUS.APPROVED
            ) {
                fundingDetails = `
                    <p style="
                        margin-top:0.55rem;
                        font-size:0.83rem;
                        color:var(--text-muted);
                    ">
                        Средства для этапа ещё не зарезервированы.
                    </p>
                `;
            }

            // -------------------------------------------------
            // Кнопка резервирования
            // -------------------------------------------------

            const fundButton = (
                Number(reqStatus) === REQUEST_STATUS.APPROVED &&
                isAdmin &&
                !funded &&
                !released
            )
                ? `
                    <div style="
                        margin-top:0.75rem;
                        padding-top:0.65rem;
                        border-top:1px dashed var(--border);
                    ">
                        <p style="
                            font-size:0.82rem;
                            color:var(--text-muted);
                            margin-bottom:0.55rem;
                        ">
                            Администратор DAO может зарезервировать
                            полную сумму этого этапа.
                        </p>

                        <button
                            class="btn btn-primary"
                            style="width:100%;"
                            onclick="fundMilestone(${m}, this)"
                        >
                            Зарезервировать средства этапа
                        </button>
                    </div>
                `
                : "";

            // -------------------------------------------------
            // Форма редактирования этапа
            // -------------------------------------------------

            const editForm = (
                canEdit && !released
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

                            <button
                                class="btn btn-outline"
                                onclick="updateMilestone(${m}, this)"
                            >
                                Сохранить изменения
                            </button>
                        </div>
                    </details>
                `
                : "";

            // -------------------------------------------------
            // Форма отправки отчёта
            // -------------------------------------------------

            let evidenceForm = "";

            if (
                canSubmitEvidence &&
                !released &&
                !ms.evidenceSubmitted &&
                funded
            ) {
                evidenceForm = `
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
                            onclick="submitEvidence(${m}, this)"
                        >
                            Отправить отчёт
                        </button>
                    </div>
                `;

            } else if (
                canSubmitEvidence &&
                !released &&
                !ms.evidenceSubmitted &&
                !funded
            ) {
                evidenceForm = `
                    <p style="
                        margin-top:0.75rem;
                        padding:0.65rem;
                        background:#fffbeb;
                        border-radius:0.5rem;
                        color:#92400e;
                        font-size:0.84rem;
                    ">
                        Отправка отчёта пока недоступна.
                        Сначала администратор DAO должен
                        зарезервировать средства для этого этапа.
                    </p>
                `;
            }

            // -------------------------------------------------
            // Карточка этапа
            // -------------------------------------------------

            const item = document.createElement("div");

            item.className = "list-item";

            item.style.cssText = `
                padding:0.75rem 0;
                border-bottom:1px solid #e2e8f0;
            `;

            item.innerHTML = `
                <div style="flex:1;">
                    <div class="row-between" style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:0.5rem;
                        flex-wrap:wrap;
                    ">
                        <strong>
                            Этап #${m}: ${escapeHtml(ms.description)}
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

                    ${fundingDetails}

                    ${
                        ms.evidenceSubmitted
                            ? `
                                <div class="mono" style="
                                    margin-top:0.5rem;
                                    font-size:0.8rem;
                                    word-break:break-all;
                                ">
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

                    ${fundButton}
                    ${editForm}
                    ${evidenceForm}
                </div>
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
// 13. ОТПРАВКА ОТЧЁТА ПО ЭТАПУ
// =========================================================

async function submitEvidence(
    milestoneId,
    btnEl = null
) {
    return runWithButtonLock(
        btnEl,
        "Отправка...",
        async () => {
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
                    throw new Error(
                        "Сначала подключите MetaMask."
                    );
                }

                requireMethod(
                    milestonesContract,
                    "submitMilestoneEvidence",
                    "RescueMilestones"
                );

                requireMethod(
                    milestonesContract,
                    "getMilestoneFundingStatus",
                    "RescueMilestones"
                );

                const stats = await getRequestStats();

                if (
                    Number(stats.status) !==
                    REQUEST_STATUS.APPROVED
                ) {
                    throw new Error(
                        "Отчёты по этапам можно отправлять " +
                        "только после одобрения заявки."
                    );
                }

                const info =
                    await daoViewContract.getAidRequestInfo(requestId);

                if (!isRequesterAddress(info.requester)) {
                    throw new Error(
                        "Отправлять отчёты может только инициатор заявки."
                    );
                }

                const milestone =
                    await milestonesContract.getMilestone(
                        requestId,
                        milestoneId
                    );

                if (!isValidMilestone(milestone)) {
                    throw new Error(
                        "Указанный этап не существует."
                    );
                }

                if (milestone.released) {
                    throw new Error(
                        "Этот этап уже оплачен."
                    );
                }

                if (milestone.evidenceSubmitted) {
                    throw new Error(
                        "Отчёт по этому этапу уже отправлен."
                    );
                }

                const fundingResult =
                    await milestonesContract.getMilestoneFundingStatus(
                        requestId,
                        milestoneId
                    );

                const funding =
                    parseMilestoneFundingStatus(fundingResult);

                if (!funding.funded) {
                    throw new Error(
                        "Сначала администратор DAO должен " +
                        "зарезервировать средства для этого этапа."
                    );
                }

                if (funding.released) {
                    throw new Error(
                        "Средства по этому этапу уже выплачены."
                    );
                }

                if (!file) {
                    throw new Error(
                        "Выберите файл отчёта."
                    );
                }

                // Хэш файла

                const buffer = await file.arrayBuffer();

                const hash = ethers.keccak256(
                    new Uint8Array(buffer)
                );

                // Загрузка файла на backend

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
                    const errorText =
                        await response.text();

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

                // Запись отчёта в блокчейн

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

                reloadPreservingScroll();

            } catch (err) {
                console.error(
                    "Ошибка отправки отчёта:",
                    err
                );

                alert(
                    "Не удалось отправить отчёт:\n" +
                    getTransactionError(err)
                );
            }
        }
    );
}
