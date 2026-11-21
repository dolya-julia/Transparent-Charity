
// =========================================================
// 1. ПАРАМЕТРЫ СТРАНИЦЫ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================================

const urlParams = new URLSearchParams(window.location.search);
const requestId = Number(urlParams.get("id"));

let currentEvidenceHash = "";

const REQUEST_STATUS = {
    UNDER_REVIEW: 0,
    CHANGES_REQUESTED: 1,
    APPROVED: 2,
    REJECTED: 3,
    COMPLETED: 4,
    CANCELLED: 5
};


function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}


function formatEth(value) {
    try {
        return ethers.formatEther(value ?? 0n);
    } catch (err) {
        console.warn("Ошибка форматирования ETH:", err);
        return "0";
    }
}


function formatAddress(value) {
    if (!value) return "Не указан";
    return shortAddr(value);
}


function safeHttpUrl(value) {
    if (!value) return "";

    try {
        const url = new URL(String(value));

        if (
            url.protocol !== "https:" &&
            url.protocol !== "http:"
        ) {
            return "";
        }

        return url.href;
    } catch (err) {
        return "";
    }
}


function isCurrentUserRequester(requester) {
    return Boolean(
        userAddress &&
        requester &&
        requester.toLowerCase() === userAddress.toLowerCase()
    );
}


function requireContractMethod(instance, methodName, contractName) {
    if (!instance) {
        throw new Error(`${contractName} не инициализирован.`);
    }

    if (typeof instance[methodName] !== "function") {
        throw new Error(
            `В ABI ${contractName} отсутствует функция ${methodName}().`
        );
    }
}


// =========================================================
// 2. СТАТУСЫ ЗАЯВОК
// =========================================================

function getRequestStatusInfo(status) {
    const labels = {
        0: {
            text: "На проверке",
            cls: "badge-yellow"
        },

        1: {
            text: "Требуются изменения",
            cls: "badge-orange"
        },

        2: {
            text: "Одобрена · финансирование этапов",
            cls: "badge-green"
        },

        3: {
            text: "Отклонена",
            cls: "badge-red"
        },

        4: {
            text: "Завершена",
            cls: "badge-green"
        },

        5: {
            text: "Отменена",
            cls: "badge-gray"
        }
    };

    return labels[Number(status)] || {
        text: "Неизвестный статус",
        cls: "badge-gray"
    };
}


function getStatusDescription(status, isRequester) {
    switch (Number(status)) {

        case REQUEST_STATUS.UNDER_REVIEW:
            return isRequester
                ? "Заявка отправлена на проверку администратору. Пока она не опубликована, вы можете добавлять и редактировать этапы финансирования."
                : "Заявка находится на проверке администратора. После проверки администратор сможет одобрить и опубликовать её.";

        case REQUEST_STATUS.CHANGES_REQUESTED:
            return isRequester
                ? "Администратор запросил изменения. Вы можете скорректировать описание и этапы финансирования, после чего повторно отправить заявку на проверку."
                : "Заявка возвращена инициатору на доработку.";

        case REQUEST_STATUS.APPROVED:
            return "Заявка проверена и одобрена администратором. Пользователи могут направлять адресные пожертвования. Каждый этап финансируется отдельно: сначала используются целевые пожертвования, затем при необходимости средства общего фонда. После резервирования средств инициатор сможет отправить отчёт о выполнении этапа.";

        case REQUEST_STATUS.REJECTED:
            return "Заявка отклонена администратором. Адресное финансирование для неё недоступно.";

        case REQUEST_STATUS.COMPLETED:
            return "Все этапы заявки профинансированы, выполнены, проверены необходимым количеством валидаторов и оплачены.";

        case REQUEST_STATUS.CANCELLED:
            return "Заявка отменена. Неиспользованные адресные пожертвования переводятся в общий фонд согласно правилам контракта.";

        default:
            return "";
    }
}


// =========================================================
// 3. ПОЛУЧЕНИЕ ФИНАНСОВОЙ ИНФОРМАЦИИ
// =========================================================

async function getRequestFinancialStats(requestId) {
    requireContractMethod(
        contract,
        "getRequestFinancialStats",
        "RescueDAO"
    );

    const result = await contract.getRequestFinancialStats(requestId);

    return {
        requestedAmount: result.requestedAmount ?? result[0],
        milestoneTotal: result.milestoneTotal ?? result[1],
        releasedAmount: result.releasedAmount ?? result[2],
        milestoneCount: result.milestoneCount ?? result[3],
        completedMilestones: result.completedMilestones ?? result[4],
        status: result.status ?? result[5]
    };
}


// =========================================================
// 4. ПРОВЕРКА АДМИНИСТРАТОРА
// =========================================================

async function isCurrentUserAdmin() {
    if (!userAddress || !contract) return false;

    try {
        requireContractMethod(
            contract,
            "admin",
            "RescueDAO"
        );

        const adminAddress = await contract.admin();

        return (
            adminAddress &&
            adminAddress.toLowerCase() === userAddress.toLowerCase()
        );

    } catch (err) {
        console.warn(
            "Не удалось проверить администратора DAO:",
            err
        );

        return false;
    }
}


// =========================================================
// 5. ИНФОРМАЦИЯ О ФИНАНСИРОВАНИИ ЭТАПА
// =========================================================

async function getMilestoneFunding(requestId, milestoneId) {
    requireContractMethod(
        milestonesContract,
        "getMilestoneFundingStatus",
        "RescueMilestones"
    );

    const result =
        await milestonesContract.getMilestoneFundingStatus(
            requestId,
            milestoneId
        );

    return {
        funded: Boolean(result.funded ?? result[0]),
        targetReserved: result.targetReserved ?? result[1],
        generalReserved: result.generalReserved ?? result[2],
        released: Boolean(result.released ?? result[3])
    };
}


// =========================================================
// 6. ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ
// =========================================================

window.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("campaignContent");

    if (!container) {
        console.error("Не найден элемент campaignContent.");
        return;
    }

    if (
        !requestId ||
        !Number.isInteger(requestId) ||
        requestId <= 0
    ) {
        container.innerHTML = `
            <p style="color:var(--danger);">
                Не указан корректный ID заявки.
            </p>
        `;
        return;
    }

    try {
        const ready = await initWeb3();

        if (!ready) {
            container.innerHTML = `
                <p style="color:var(--danger);">
                    Не удалось подключиться к блокчейну.
                    Проверьте подключение кошелька и выбранную сеть.
                </p>
            `;
            return;
        }

        if (
            !contract ||
            !daoViewContract ||
            !milestonesContract ||
            !nftContract ||
            !treasuryContract
        ) {
            throw new Error(
                "Не все контракты инициализированы. Проверьте config.js и wallet.js."
            );
        }

        await loadRequestDetails();

    } catch (err) {
        console.error(
            "Ошибка инициализации страницы заявки:",
            err
        );

        container.innerHTML = `
            <p style="color:var(--danger);">
                Ошибка инициализации:
                ${escapeHtml(getErrorMessage(err))}
            </p>
        `;
    }
});


// =========================================================
// 7. ЗАГРУЗКА ИНФОРМАЦИИ О ЗАЯВКЕ
// =========================================================

async function loadRequestDetails() {
    const container = document.getElementById("campaignContent");

    try {
        requireContractMethod(
            daoViewContract,
            "requestExists",
            "RescueDAOView"
        );

        requireContractMethod(
            daoViewContract,
            "getAidRequestInfo",
            "RescueDAOView"
        );

        const exists =
            await daoViewContract.requestExists(requestId);

        if (!exists) {
            container.innerHTML = `
                <p style="color:var(--danger);">
                    Заявка #${requestId} не найдена.
                </p>
            `;
            return;
        }

        // Получаем текстовые данные через DAOView,
        // финансовые данные — из обновлённого RescueDAO.

        const [info, stats] = await Promise.all([
            daoViewContract.getAidRequestInfo(requestId),
            getRequestFinancialStats(requestId)
        ]);

        const statusNum = Number(stats.status);

        const isRequester =
            isCurrentUserRequester(info.requester);

        const isAdmin =
            await isCurrentUserAdmin();

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
            } else {
                console.warn(
                    "Backend не вернул дополнительные данные:",
                    response.status
                );
            }

        } catch (err) {
            console.warn(
                "Не удалось загрузить дополнительные данные:",
                err
            );
        }

        currentEvidenceHash =
            String(info.evidenceHash || "");

        const statusObj =
            getRequestStatusInfo(statusNum);

        // -------------------------------------------------
        // ФОТО ЖИВОТНОГО
        // -------------------------------------------------

        const photoUrl =
            safeHttpUrl(meta.photoUrl);

        const photoBlock = photoUrl
            ? `
                <img
                    src="${escapeHtml(photoUrl)}"
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
        // ДОКУМЕНТ ЗАЯВКИ
        // -------------------------------------------------

        const docUrl =
            safeHttpUrl(meta.docUrl);

        const downloadDocLink = docUrl
            ? `
                <div style="margin-top:0.4rem;">
                    <a
                        href="${escapeHtml(docUrl)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="tx-link"
                    >
                        📄 Скачать документ с сервера для проверки хэша ↗
                    </a>
                </div>
            `
            : "";

        // -------------------------------------------------
        // ПОЯСНЕНИЕ ПО СТАТУСУ
        // -------------------------------------------------

        const statusDescription =
            getStatusDescription(statusNum, isRequester);

        const statusDescriptionBlock =
            statusDescription
                ? `
                    <div
                        style="
                            margin-top:0.75rem;
                            padding:0.75rem;
                            border-radius:0.5rem;
                            background:#f1f5f9;
                            color:#334155;
                            font-size:0.88rem;
                        "
                    >
                        ${escapeHtml(statusDescription)}
                    </div>
                `
                : "";

        // -------------------------------------------------
        // ФОРМА ДОБАВЛЕНИЯ ЭТАПА
        // -------------------------------------------------

        const canManageMilestones =
            (
                statusNum === REQUEST_STATUS.UNDER_REVIEW ||
                statusNum === REQUEST_STATUS.CHANGES_REQUESTED
            ) &&
            isRequester;

        const addMilestoneBlock =
            canManageMilestones
                ? `
                    <div class="box" style="margin-top:1rem;">
                        <h3>Добавить этап финансирования</h3>

                        <p
                            style="
                                font-size:0.85rem;
                                color:var(--text-muted);
                                margin-bottom:0.75rem;
                            "
                        >
                            Распределено по этапам:
                            <strong>
                                ${escapeHtml(formatEth(stats.milestoneTotal))}
                                /
                                ${escapeHtml(formatEth(stats.requestedAmount))}
                                ETH
                            </strong>.
                            Для публикации заявки сумма всех этапов должна
                            совпадать с запрашиваемой суммой.
                        </p>

                        <div
                            class="form-group"
                            style="margin-bottom:0.75rem;"
                        >
                            <label>Название этапа</label>

                            <input
                                type="text"
                                id="msDesc"
                                class="input-field"
                                maxlength="300"
                                placeholder="Например: Операция в ветклинике"
                                style="
                                    width:100%;
                                    padding:0.5rem;
                                    margin-top:0.25rem;
                                "
                            >
                        </div>

                        <div
                            class="form-group"
                            style="margin-bottom:0.75rem;"
                        >
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

                        <div
                            class="form-group"
                            style="margin-bottom:0.75rem;"
                        >
                            <label>Сумма этапа (ETH)</label>

                            <input
                                type="number"
                                id="msAmount"
                                class="input-field"
                                step="0.000001"
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

        // -------------------------------------------------
        // ОСНОВНАЯ РАЗМЕТКА
        // -------------------------------------------------

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
                                gap:1rem;
                                margin-bottom:0.75rem;
                                flex-wrap:wrap;
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

                        <p style="margin:0.5rem 0; color:#334155;">
                            ${escapeHtml(meta.fullStory || info.description)}
                        </p>

                        <div
                            id="nftPassportSection"
                            style="margin-top:1.25rem;"
                        ></div>

                        <div
                            style="
                                font-size:0.88rem;
                                background:#f1f5f9;
                                padding:0.85rem;
                                border-radius:0.6rem;
                                margin-top:1rem;
                            "
                        >
                            <div>
                                <strong>Документы (URI):</strong>
                                ${escapeHtml(info.evidenceURI || "Не указаны")}
                            </div>

                            <div
                                class="mono"
                                style="
                                    margin-top:0.25rem;
                                    word-break:break-all;
                                "
                            >
                                <strong>Хэш в блокчейне:</strong>
                                ${escapeHtml(currentEvidenceHash || "Не указан")}
                            </div>

                            ${downloadDocLink}

                            ${
                                currentEvidenceHash
                                    ? `
                                        <div
                                            style="
                                                margin-top:0.75rem;
                                                padding-top:0.6rem;
                                                border-top:1px solid #cbd5e1;
                                            "
                                        >
                                            <label
                                                style="
                                                    display:block;
                                                    font-size:0.8rem;
                                                    font-weight:600;
                                                    margin-bottom:0.25rem;
                                                "
                                            >
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
                                    `
                                    : `
                                        <p
                                            style="
                                                margin-top:0.5rem;
                                                color:var(--text-muted);
                                                font-size:0.82rem;
                                            "
                                        >
                                            Хэш документа заявки пока не записан.
                                        </p>
                                    `
                            }
                        </div>
                    </div>

                    ${addMilestoneBlock}

                    <div class="box" style="margin-top:1rem;">
                        <h3 style="margin-bottom:1rem;">
                            Этапы финансирования
                        </h3>

                        <div id="milestonesContainer">
                            Загрузка этапов...
                        </div>
                    </div>

                </div>

                <div class="box" style="position:sticky; top:90px;">

                    <h3>Статус заявки</h3>

                    ${statusDescriptionBlock}

                    <div
                        style="
                            display:flex;
                            flex-direction:column;
                            gap:0.65rem;
                            font-size:0.92rem;
                            margin:1rem 0;
                        "
                    >

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            "
                        >
                            <span>Запрошено:</span>

                            <strong>
                                ${escapeHtml(formatEth(stats.requestedAmount))}
                                ETH
                            </strong>
                        </div>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            "
                        >
                            <span>Запланировано по этапам:</span>

                            <strong>
                                ${escapeHtml(formatEth(stats.milestoneTotal))}
                                ETH
                            </strong>
                        </div>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            "
                        >
                            <span>Количество этапов:</span>

                            <strong>
                                ${escapeHtml(stats.milestoneCount)}
                            </strong>
                        </div>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            "
                        >
                            <span>Завершено этапов:</span>

                            <strong>
                                ${escapeHtml(stats.completedMilestones)}
                                /
                                ${escapeHtml(stats.milestoneCount)}
                            </strong>
                        </div>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                                gap:1rem;
                            "
                        >
                            <span>Выплачено:</span>

                            <strong style="color:var(--primary);">
                                ${escapeHtml(formatEth(stats.releasedAmount))}
                                ETH
                            </strong>
                        </div>

                    </div>

                    ${
                        statusNum === REQUEST_STATUS.APPROVED
                            ? `
                                <div
                                    style="
                                        margin-top:0.75rem;
                                        padding:0.75rem;
                                        background:#f1f5f9;
                                        border-radius:0.5rem;
                                        font-size:0.85rem;
                                    "
                                >
                                    💚 Поддержать заявку можно адресным
                                    пожертвованием. Средства будут учитываться
                                    при финансировании её этапов.
                                </div>
                            `
                            : ""
                    }

                </div>

            </div>
        `;

        await loadMilestonesList(
            Number(stats.milestoneCount),
            statusNum,
            isRequester,
            isAdmin
        );

        await loadNftPassport(requestId);

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
// 8. ЗАГРУЗКА NFT-ПАСПОРТА
// =========================================================

async function loadNftPassport(requestId) {
    const nftContainer =
        document.getElementById("nftPassportSection");

    if (!nftContainer) return;

    try {
        requireContractMethod(
            contract,
            "rescueNftContract",
            "RescueDAO"
        );

        requireContractMethod(
            nftContract,
            "getTokenIdForRequest",
            "RescueNFT"
        );

        const nftAddress =
            await contract.rescueNftContract();

        if (
            !nftAddress ||
            nftAddress.toLowerCase() ===
                ethers.ZeroAddress.toLowerCase()
        ) {
            nftContainer.innerHTML = `
                <p style="color:var(--text-muted);">
                    NFT-контракт пока не привязан к DAO.
                </p>
            `;
            return;
        }

        if (
            typeof NFT_ADDRESS !== "undefined" &&
            NFT_ADDRESS &&
            ethers.getAddress(nftAddress) !==
                ethers.getAddress(NFT_ADDRESS)
        ) {
            nftContainer.innerHTML = `
                <p style="color:var(--danger);">
                    Адрес NFT в DAO не совпадает с NFT_ADDRESS в config.js.
                </p>
            `;
            return;
        }

        const tokenId =
            await nftContract.getTokenIdForRequest(requestId);

        if (tokenId === 0n) {
            nftContainer.innerHTML = `
                <p style="color:var(--text-muted);">
                    NFT-паспорт для заявки #${requestId} ещё не выпущен.
                </p>
            `;
            return;
        }

        requireContractMethod(
            nftContract,
            "ownerOf",
            "RescueNFT"
        );

        requireContractMethod(
            nftContract,
            "tokenURI",
            "RescueNFT"
        );

        const [owner, uri] = await Promise.all([
            nftContract.ownerOf(tokenId),
            nftContract.tokenURI(tokenId)
        ]);

        if (
            !uri.startsWith("data:application/json;base64,")
        ) {
            nftContainer.innerHTML = `
                <p class="mono">
                    NFT #${tokenId} выпущен.
                    URI: ${escapeHtml(uri)}
                </p>
            `;
            return;
        }

        const base64Json = uri.split(",")[1];

        const binaryString =
            window.atob(base64Json);

        const bytes = Uint8Array.from(
            binaryString,
            char => char.charCodeAt(0)
        );

        const metadata = JSON.parse(
            new TextDecoder().decode(bytes)
        );

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

        nftContainer.innerHTML = `
            <div
                style="
                    border:1px solid #cbd5e1;
                    border-radius:0.75rem;
                    padding:1rem;
                    background:#ffffff;
                "
            >
                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:0.5rem;
                        flex-wrap:wrap;
                        margin-bottom:0.75rem;
                    "
                >
                    <h4 style="margin:0;">
                        🐾 Цифровой NFT-паспорт #${tokenId}
                    </h4>

                    <span class="badge badge-green">
                        On-Chain SVG
                    </span>
                </div>

                <div
                    style="
                        display:flex;
                        gap:1rem;
                        flex-wrap:wrap;
                        align-items:center;
                    "
                >
                    <img
                        id="nftPassportImage"
                        alt="${escapeHtml(metadata.name || "NFT-паспорт")}"
                        style="
                            width:200px;
                            height:auto;
                            border-radius:0.5rem;
                            border:1px solid #e2e8f0;
                        "
                    >

                    <div style="flex:1; min-width:200px;">

                        <div
                            style="
                                font-weight:600;
                                font-size:1.05rem;
                                margin-bottom:0.35rem;
                            "
                        >
                            ${escapeHtml(metadata.name || "NFT-паспорт животного")}
                        </div>

                        <p
                            style="
                                font-size:0.88rem;
                                color:#475569;
                                margin-bottom:0.6rem;
                            "
                        >
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

        const imageElement =
            document.getElementById("nftPassportImage");

        if (
            imageElement &&
            typeof metadata.image === "string" &&
            metadata.image.startsWith("data:image/svg+xml;base64,")
        ) {
            imageElement.src = metadata.image;

        } else if (imageElement) {
            imageElement.alt =
                "Изображение NFT недоступно";

            imageElement.style.display = "none";
        }

    } catch (err) {
        console.error(
            `Ошибка загрузки NFT для заявки #${requestId}:`,
            err
        );

        nftContainer.innerHTML = `
            <div
                style="
                    font-size:0.85rem;
                    color:var(--text-muted);
                    padding:0.5rem 0;
                "
            >
                Не удалось загрузить NFT-паспорт.
                Проверьте привязку NFT-контракта и наличие токена.
            </div>
        `;
    }
}


// =========================================================
// 9. ПРОВЕРКА ХЭША ДОКУМЕНТА
// =========================================================

async function verifyDocumentHash() {
    const input =
        document.getElementById("verifyFileInput");

    const resSpan =
        document.getElementById("verifyResult");

    if (!input?.files?.length) return;

    if (!currentEvidenceHash) {
        resSpan.textContent =
            "В блокчейне нет хэша для сравнения.";

        resSpan.style.color = "var(--danger)";
        return;
    }

    try {
        const buffer =
            await input.files[0].arrayBuffer();

        const calculatedHash =
            ethers.keccak256(new Uint8Array(buffer));

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
            "Не удалось проверить файл.";

        resSpan.style.color = "var(--danger)";
    }
}


// =========================================================
// 10. ДОБАВЛЕНИЕ ЭТАПА ФИНАНСИРОВАНИЯ
// =========================================================

async function createNewMilestone() {
    const desc =
        document.getElementById("msDesc")?.value.trim();

    const recipient =
        document.getElementById("msRecipient")?.value.trim();

    const amount =
        document.getElementById("msAmount")?.value.trim();

    if (!desc || desc.length > 300) {
        alert(
            "Введите название этапа длиной не более 300 символов."
        );
        return;
    }

    if (
        !recipient ||
        !ethers.isAddress(recipient) ||
        recipient === ethers.ZeroAddress
    ) {
        alert(
            "Введите корректный Ethereum-адрес получателя."
        );
        return;
    }

    if (
        !amount ||
        !Number.isFinite(Number(amount)) ||
        Number(amount) <= 0
    ) {
        alert("Введите корректную сумму этапа.");
        return;
    }

    try {
        if (!userAddress || !signer) {
            throw new Error("Сначала подключите кошелёк.");
        }

        requireContractMethod(
            milestonesContract,
            "addMilestone",
            "RescueMilestones"
        );

        const [info, stats] = await Promise.all([
            daoViewContract.getAidRequestInfo(requestId),
            getRequestFinancialStats(requestId)
        ]);

        const status = Number(stats.status);

        if (
            status !== REQUEST_STATUS.UNDER_REVIEW &&
            status !== REQUEST_STATUS.CHANGES_REQUESTED
        ) {
            throw new Error(
                "Добавлять этапы можно только до публикации заявки."
            );
        }

        if (!isCurrentUserRequester(info.requester)) {
            throw new Error(
                "Добавлять этапы может только инициатор заявки."
            );
        }

        const amountWei =
            ethers.parseEther(amount);

        if (amountWei <= 0n) {
            throw new Error(
                "Сумма этапа должна быть больше нуля."
            );
        }

        const tx =
            await milestonesContract.addMilestone(
                requestId,
                desc,
                recipient,
                amountWei
            );

        alert("Этап добавляется в блокчейн...");

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция добавления этапа не выполнена."
            );
        }

        alert("Этап успешно добавлен.");

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
// 11. ФИНАНСИРОВАНИЕ ОТДЕЛЬНОГО ЭТАПА
// =========================================================

async function fundMilestone(milestoneId) {
    try {
        if (!userAddress || !signer) {
            throw new Error("Сначала подключите кошелёк.");
        }

        requireContractMethod(
            milestonesContract,
            "fundMilestone",
            "RescueMilestones"
        );

        const [info, stats, milestone, funding] =
            await Promise.all([
                daoViewContract.getAidRequestInfo(requestId),
                getRequestFinancialStats(requestId),
                milestonesContract.getMilestone(
                    requestId,
                    milestoneId
                ),
                getMilestoneFunding(
                    requestId,
                    milestoneId
                )
            ]);

        if (
            Number(stats.status) !==
            REQUEST_STATUS.APPROVED
        ) {
            throw new Error(
                "Финансировать этапы можно только после одобрения заявки."
            );
        }

        // ВАЖНО: здесь используется await.
        const isAdmin =
            await isCurrentUserAdmin();

        if (!isAdmin) {
            throw new Error(
                "Финансирование этапов доступно только администратору DAO."
            );
        }

        if (funding.funded) {
            throw new Error(
                "Этот этап уже профинансирован."
            );
        }

        if (funding.released || milestone.released) {
            throw new Error(
                "Этот этап уже выплачен."
            );
        }

        const amount =
            BigInt(milestone.amount);

        if (amount <= 0n) {
            throw new Error(
                "У этапа некорректная сумма."
            );
        }

        const targetAvailable = BigInt(
            await treasuryContract.getAvailableRequestDonations(
                requestId
            )
        );

        const generalAvailable = BigInt(
            await treasuryContract.getAvailableBalance()
        );

        const targetPart =
            targetAvailable >= amount
                ? amount
                : targetAvailable;

        const generalPart =
            amount - targetPart;

        if (generalAvailable < generalPart) {
            throw new Error(
                "Недостаточно средств для финансирования этапа.\n\n" +
                `Стоимость этапа: ${formatEth(amount)} ETH.\n` +
                `Доступные целевые пожертвования: ${formatEth(targetAvailable)} ETH.\n` +
                `Доступный общий баланс: ${formatEth(generalAvailable)} ETH.`
            );
        }

        const confirmationText =
            `Профинансировать этап #${milestoneId}?\n\n` +
            `Сумма этапа: ${formatEth(amount)} ETH\n` +
            `Из целевых пожертвований: ${formatEth(targetPart)} ETH\n` +
            `Из общего пула: ${formatEth(generalPart)} ETH\n\n` +
            `Средства будут зарезервированы для этого этапа.`;

        if (!confirm(confirmationText)) {
            return;
        }

        const tx =
            await milestonesContract.fundMilestone(
                requestId,
                milestoneId
            );

        alert(
            "Транзакция финансирования отправлена..."
        );

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция финансирования не выполнена."
            );
        }

        alert(
            `Этап #${milestoneId} успешно профинансирован. ` +
            "Теперь инициатор может отправить отчёт о его выполнении."
        );

        await loadRequestDetails();

    } catch (err) {
        console.error(
            "Ошибка финансирования этапа:",
            err
        );

        alert(
            "Не удалось профинансировать этап:\n" +
            getErrorMessage(err)
        );
    }
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
    const box =
        document.getElementById("milestonesContainer");

    if (!box) return;

    if (mCount === 0) {
        box.innerHTML = `
            <p style="color:var(--text-muted); font-size:0.9rem;">
                Этапы ещё не добавлены.
            </p>
        `;
        return;
    }

    box.innerHTML = `
        <p style="color:var(--text-muted);">
            Загрузка этапов...
        </p>
    `;

    try {
        const canManageMilestones =
            (
                reqStatus === REQUEST_STATUS.UNDER_REVIEW ||
                reqStatus === REQUEST_STATUS.CHANGES_REQUESTED
            ) &&
            isRequester;

        const canSubmitEvidence =
            reqStatus === REQUEST_STATUS.APPROVED &&
            isRequester;

        const canFundMilestones =
            reqStatus === REQUEST_STATUS.APPROVED &&
            isAdmin;

        let html = "";

        // Этапы нумеруются с 1.
        for (let m = 1; m <= mCount; m++) {
            const [ms, funding] =
                await Promise.all([
                    milestonesContract.getMilestone(
                        requestId,
                        m
                    ),

                    getMilestoneFunding(
                        requestId,
                        m
                    )
                ]);

            const approvalCount =
                Number(ms.approvalCount);

            const funded =
                funding.funded;

            const released =
                funding.released ||
                Boolean(ms.released);

            const evidenceSubmitted =
                Boolean(ms.evidenceSubmitted);

            // -------------------------------------------------
            // СТАТУС ЭТАПА
            // -------------------------------------------------

            let statusBadge = "";

            if (released) {
                statusBadge = `
                    <span class="badge badge-green">
                        Выплачено · ${approvalCount}/2 подтверждений
                    </span>
                `;

            } else if (
                reqStatus !== REQUEST_STATUS.APPROVED
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

            } else if (evidenceSubmitted) {
                statusBadge = `
                    <span class="badge badge-blue">
                        Отчёт на проверке · ${approvalCount}/2 подтверждений
                    </span>
                `;

            } else {
                statusBadge = `
                    <span class="badge badge-green">
                        Профинансирован · ожидает отчёт
                    </span>
                `;
            }

            // -------------------------------------------------
            // ИНФОРМАЦИЯ О РЕЗЕРВИРОВАНИИ
            // -------------------------------------------------

            let fundingInfo = "";

            if (funded || released) {
                fundingInfo = `
                    <div
                        style="
                            margin-top:0.65rem;
                            padding:0.65rem;
                            background:#f1f5f9;
                            border-radius:0.5rem;
                            font-size:0.84rem;
                        "
                    >
                        <strong>
                            Финансирование этапа:
                        </strong>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                                gap:0.5rem;
                                margin-top:0.35rem;
                            "
                        >
                            <span>Целевые пожертвования:</span>

                            <strong>
                                ${escapeHtml(formatEth(funding.targetReserved))}
                                ETH
                            </strong>
                        </div>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                                gap:0.5rem;
                                margin-top:0.25rem;
                            "
                        >
                            <span>Общий пул:</span>

                            <strong>
                                ${escapeHtml(formatEth(funding.generalReserved))}
                                ETH
                            </strong>
                        </div>
                    </div>
                `;
            }

            // -------------------------------------------------
            // КНОПКА ФИНАНСИРОВАНИЯ
            // -------------------------------------------------

            let fundingButton = "";

            if (
                canFundMilestones &&
                !funded &&
                !released
            ) {
                fundingButton = `
                    <div
                        style="
                            margin-top:0.75rem;
                            padding-top:0.75rem;
                            border-top:1px dashed var(--border);
                        "
                    >
                        <p
                            style="
                                font-size:0.82rem;
                                color:var(--text-muted);
                                margin-bottom:0.5rem;
                            "
                        >
                            Для этапа необходимо зарезервировать
                            ${escapeHtml(formatEth(ms.amount))} ETH.

                            Сначала будут использованы целевые пожертвования,
                            затем при необходимости — средства общего пула.
                        </p>

                        <button
                            class="btn btn-primary"
                            style="width:100%;"
                            onclick="fundMilestone(${m})"
                        >
                            💰 Профинансировать этап
                        </button>
                    </div>
                `;
            }

            // -------------------------------------------------
            // РЕДАКТИРОВАНИЕ ДО ПУБЛИКАЦИИ
            // -------------------------------------------------

            const editForm =
                canManageMilestones
                    ? `
                        <details
                            style="
                                width:100%;
                                margin-top:0.75rem;
                                padding-top:0.65rem;
                                border-top:1px dashed var(--border);
                            "
                        >
                            <summary
                                style="
                                    cursor:pointer;
                                    font-weight:600;
                                    font-size:0.88rem;
                                "
                            >
                                Редактировать этап
                            </summary>

                            <div style="margin-top:0.75rem;">

                                <div class="form-group">
                                    <label>Описание этапа</label>

                                    <input
                                        type="text"
                                        id="editMsDesc_${m}"
                                        maxlength="300"
                                        value="${escapeHtml(ms.description)}"
                                        style="
                                            width:100%;
                                            padding:0.5rem;
                                            margin-top:0.25rem;
                                        "
                                    >
                                </div>

                                <div
                                    class="form-group"
                                    style="margin-top:0.6rem;"
                                >
                                    <label>Адрес получателя</label>

                                    <input
                                        type="text"
                                        id="editMsRecipient_${m}"
                                        value="${escapeHtml(ms.recipient)}"
                                        style="
                                            width:100%;
                                            padding:0.5rem;
                                            margin-top:0.25rem;
                                        "
                                    >
                                </div>

                                <div
                                    class="form-group"
                                    style="margin-top:0.6rem;"
                                >
                                    <label>Сумма этапа (ETH)</label>

                                    <input
                                        type="number"
                                        id="editMsAmount_${m}"
                                        step="0.000001"
                                        min="0"
                                        value="${escapeHtml(formatEth(ms.amount))}"
                                        style="
                                            width:100%;
                                            padding:0.5rem;
                                            margin-top:0.25rem;
                                        "
                                    >
                                </div>

                                <p
                                    style="
                                        font-size:0.8rem;
                                        color:var(--text-muted);
                                        margin-top:0.5rem;
                                    "
                                >
                                    Изменение этапа возможно только
                                    до публикации заявки.
                                </p>

                                <button
                                    class="btn btn-outline"
                                    style="width:100%; margin-top:0.5rem;"
                                    onclick="updateExistingMilestone(${m})"
                                >
                                    Сохранить изменения
                                </button>

                            </div>
                        </details>
                    `
                    : "";

            // -------------------------------------------------
            // ФОРМА ОТПРАВКИ ОТЧЁТА
            // -------------------------------------------------

            let evidenceForm = "";

            if (
                canSubmitEvidence &&
                funded &&
                !released &&
                !evidenceSubmitted
            ) {
                evidenceForm = `
                    <div
                        style="
                            width:100%;
                            margin-top:0.75rem;
                            padding-top:0.75rem;
                            border-top:1px dashed var(--border);
                            display:flex;
                            gap:0.5rem;
                            flex-wrap:wrap;
                        "
                    >
                        <input
                            type="text"
                            id="evUri_${m}"
                            placeholder="Ссылка на чек/акт (например, https://...)"
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
                `;

            } else if (
                canSubmitEvidence &&
                !funded &&
                !released
            ) {
                evidenceForm = `
                    <p
                        class="badge badge-yellow"
                        style="margin-top:0.75rem;"
                    >
                        Отправка отчёта станет доступна после финансирования этапа.
                    </p>
                `;

            } else if (
                canSubmitEvidence &&
                evidenceSubmitted
            ) {
                evidenceForm = `
                    <p
                        class="badge badge-blue"
                        style="margin-top:0.75rem;"
                    >
                        Отчёт уже отправлен. Ожидается проверка валидаторов.
                    </p>
                `;
            }

            // -------------------------------------------------
            // ИНФОРМАЦИЯ О ДОКАЗАТЕЛЬСТВЕ
            // -------------------------------------------------

            const evidenceInfo =
                evidenceSubmitted
                    ? `
                        <div
                            class="mono"
                            style="
                                margin-top:0.35rem;
                                font-size:0.8rem;
                                word-break:break-all;
                            "
                        >
                            Отчёт: ${escapeHtml(ms.evidenceURI)}
                            <br>
                            Hash: ${escapeHtml(ms.evidenceHash)}
                        </div>
                    `
                    : "";

            // -------------------------------------------------
            // КАРТОЧКА ЭТАПА
            // -------------------------------------------------

            html += `
                <div
                    class="list-item"
                    style="
                        padding:0.75rem 0;
                        border-bottom:1px solid #e2e8f0;
                        align-items:flex-start;
                    "
                >
                    <div style="flex:1; min-width:0;">

                        <div
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

                        <div
                            style="
                                font-size:0.88rem;
                                margin-top:0.35rem;
                            "
                        >
                            Сумма:
                            <strong>
                                ${escapeHtml(formatEth(ms.amount))} ETH
                            </strong>

                            · Получатель:

                            <span class="mono">
                                ${escapeHtml(ms.recipient)}
                            </span>
                        </div>

                        ${fundingInfo}

                        ${fundingButton}

                        ${evidenceInfo}

                        ${editForm}

                        ${evidenceForm}

                    </div>
                </div>
            `;
        }

        box.innerHTML = html || `
            <p style="color:var(--text-muted);">
                Этапы не найдены.
            </p>
        `;

    } catch (err) {
        console.error(
            "Ошибка загрузки этапов:",
            err
        );

        box.innerHTML = `
            <p style="color:var(--danger);">
                Не удалось загрузить этапы:
                ${escapeHtml(getErrorMessage(err))}
            </p>
        `;
    }
}


// =========================================================
// 13. РЕДАКТИРОВАНИЕ СУЩЕСТВУЮЩЕГО ЭТАПА
// =========================================================

async function updateExistingMilestone(milestoneId) {
    const desc =
        document.getElementById(
            `editMsDesc_${milestoneId}`
        )?.value.trim();

    const recipient =
        document.getElementById(
            `editMsRecipient_${milestoneId}`
        )?.value.trim();

    const amount =
        document.getElementById(
            `editMsAmount_${milestoneId}`
        )?.value.trim();

    if (!desc || desc.length > 300) {
        alert(
            "Введите описание этапа длиной не более 300 символов."
        );
        return;
    }

    if (
        !recipient ||
        !ethers.isAddress(recipient) ||
        recipient === ethers.ZeroAddress
    ) {
        alert(
            "Введите корректный Ethereum-адрес получателя."
        );
        return;
    }

    if (
        !amount ||
        !Number.isFinite(Number(amount)) ||
        Number(amount) <= 0
    ) {
        alert("Введите корректную сумму этапа.");
        return;
    }

    try {
        if (!userAddress || !signer) {
            throw new Error("Сначала подключите кошелёк.");
        }

        requireContractMethod(
            milestonesContract,
            "updateMilestone",
            "RescueMilestones"
        );

        const [info, stats, milestone] =
            await Promise.all([
                daoViewContract.getAidRequestInfo(requestId),

                getRequestFinancialStats(requestId),

                milestonesContract.getMilestone(
                    requestId,
                    milestoneId
                )
            ]);

        const status =
            Number(stats.status);

        if (
            status !== REQUEST_STATUS.UNDER_REVIEW &&
            status !== REQUEST_STATUS.CHANGES_REQUESTED
        ) {
            throw new Error(
                "Редактировать этапы можно только до публикации заявки."
            );
        }

        if (!isCurrentUserRequester(info.requester)) {
            throw new Error(
                "Изменять этапы может только инициатор заявки."
            );
        }

        const funding =
            await getMilestoneFunding(
                requestId,
                milestoneId
            );

        if (
            funding.funded ||
            funding.released ||
            milestone.released
        ) {
            throw new Error(
                "Нельзя редактировать уже профинансированный или выплаченный этап."
            );
        }

        const amountWei =
            ethers.parseEther(amount);

        if (amountWei <= 0n) {
            throw new Error(
                "Сумма этапа должна быть больше нуля."
            );
        }

        const warning =
            milestone.evidenceSubmitted
                ? "\n\nУ этапа уже есть отчёт. После изменения этапа контракт должен сбросить этот отчёт и связанные подтверждения."
                : "";

        if (!confirm(
            `Сохранить изменения этапа #${milestoneId}?${warning}`
        )) {
            return;
        }

        const tx =
            await milestonesContract.updateMilestone(
                requestId,
                milestoneId,
                desc,
                recipient,
                amountWei
            );

        alert(
            "Изменение этапа отправлено в блокчейн..."
        );

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция изменения этапа не выполнена."
            );
        }

        alert("Этап успешно обновлён.");

        window.location.reload();

    } catch (err) {
        console.error(
            "Ошибка редактирования этапа:",
            err
        );

        alert(
            "Ошибка редактирования этапа: " +
            getErrorMessage(err)
        );
    }
}


// =========================================================
// 14. ОТПРАВКА ДОКАЗАТЕЛЬСТВА ВЫПОЛНЕНИЯ ЭТАПА
// =========================================================

async function submitEvidence(milestoneId) {
    const uriInput =
        document.getElementById(
            `evUri_${milestoneId}`
        )?.value.trim();

    const fileInput =
        document.getElementById(
            `evFile_${milestoneId}`
        );

    const file =
        fileInput?.files?.[0];

    try {
        if (!file && !uriInput) {
            throw new Error(
                "Выберите файл отчёта или укажите URI."
            );
        }

        if (!userAddress || !signer) {
            throw new Error(
                "Необходимо подключить кошелёк."
            );
        }

        requireContractMethod(
            milestonesContract,
            "submitMilestoneEvidence",
            "RescueMilestones"
        );

        const [info, stats, milestone, funding] =
            await Promise.all([
                daoViewContract.getAidRequestInfo(requestId),

                getRequestFinancialStats(requestId),

                milestonesContract.getMilestone(
                    requestId,
                    milestoneId
                ),

                getMilestoneFunding(
                    requestId,
                    milestoneId
                )
            ]);

        if (
            Number(stats.status) !==
            REQUEST_STATUS.APPROVED
        ) {
            throw new Error(
                "Отправлять отчёты можно только по одобренной заявке."
            );
        }

        if (!isCurrentUserRequester(info.requester)) {
            throw new Error(
                "Отчёт по этапу может отправить только инициатор заявки."
            );
        }

        if (!funding.funded) {
            throw new Error(
                "Нельзя отправить отчёт: сначала этап должен быть профинансирован."
            );
        }

        if (funding.released || milestone.released) {
            throw new Error(
                "Этот этап уже оплачен."
            );
        }

        if (milestone.evidenceSubmitted) {
            throw new Error(
                "Отчёт по этому этапу уже отправлен."
            );
        }

        // -------------------------------------------------
        // ЗАГРУЗКА ФАЙЛА НА BACKEND
        // -------------------------------------------------

        let finalUri = uriInput;

        if (file) {
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

            const saved =
                await response.json();

            finalUri =
                uriInput || saved.docUrl;
        }

        if (!finalUri) {
            throw new Error(
                "Не удалось получить ссылку на документ отчёта."
            );
        }

        // -------------------------------------------------
        // ВЫЧИСЛЕНИЕ ХЭША
        // -------------------------------------------------

        let hash;

        if (file) {
            const buffer =
                await file.arrayBuffer();

            hash = ethers.keccak256(
                new Uint8Array(buffer)
            );

        } else {
            hash = ethers.keccak256(
                ethers.toUtf8Bytes(finalUri)
            );
        }

        // -------------------------------------------------
        // ОТПРАВКА ДОКАЗАТЕЛЬСТВА
        // -------------------------------------------------

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

        const receipt =
            await tx.wait();

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
