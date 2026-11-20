
// =========================================================
// 1. ПАРАМЕТРЫ СТРАНИЦЫ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================================

const urlParams = new URLSearchParams(window.location.search);
const requestId = Number(urlParams.get("id"));

let currentEvidenceHash = "";

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function shortAddr(value) {
    const str = String(value ?? "");

    if (str.length <= 18) return str;

    return `${str.slice(0, 10)}...${str.slice(-8)}`;
}

function getErrorMessage(err) {
    return (
        err?.reason ||
        err?.shortMessage ||
        err?.message ||
        "Неизвестная ошибка"
    );
}


// =========================================================
// 2. ИНИЦИАЛИЗАЦИЯ
// =========================================================

window.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("campaignContent");

    if (!container) {
        console.error("Не найден элемент campaignContent.");
        return;
    }

    if (!requestId || !Number.isInteger(requestId) || requestId <= 0) {
        container.innerHTML =
            '<p style="color:var(--danger);">Не указан корректный ID заявки.</p>';
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

        // Проверяем, что все необходимые контракты инициализированы.
        if (
            typeof contract === "undefined" ||
            typeof daoViewContract === "undefined" ||
            typeof milestonesContract === "undefined" ||
            typeof nftContract === "undefined"
        ) {
            throw new Error(
                "Не все контракты инициализированы. Проверьте config.js и wallet.js."
            );
        }

        await loadRequestDetails();

    } catch (err) {
        console.error("Ошибка инициализации страницы заявки:", err);

        container.innerHTML = `
            <p style="color:var(--danger);">
                Ошибка инициализации:
                ${escapeHtml(getErrorMessage(err))}
            </p>
        `;
    }
});


// =========================================================
// 3. ЗАГРУЗКА ИНФОРМАЦИИ О ЗАЯВКЕ
// =========================================================

async function loadRequestDetails() {
    const container = document.getElementById("campaignContent");

    try {
        // -------------------------------------------------
        // Проверяем существование заявки через RescueDAOView
        // -------------------------------------------------

        const exists = await daoViewContract.requestExists(requestId);

        if (!exists) {
            container.innerHTML = `
                <p style="color:var(--danger);">
                    Заявка #${requestId} не найдена.
                </p>
            `;
            return;
        }

        // -------------------------------------------------
        // Получаем информацию и статистику заявки
        // -------------------------------------------------

        const [info, stats] = await Promise.all([
            daoViewContract.getAidRequestInfo(requestId),
            daoViewContract.getAidRequestStats(requestId)
        ]);

        // -------------------------------------------------
        // Дополнительные данные с Node.js backend
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
                const serverData = await response.json();

                meta = {
                    ...meta,
                    ...serverData
                };
            }
        } catch (err) {
            console.warn(
                "Не удалось загрузить дополнительные данные:",
                err
            );
        }

        currentEvidenceHash = info.evidenceHash;

        const statusNum = Number(stats.status);

        const statusObj =
            STATUS_LABELS[statusNum] || STATUS_LABELS[0];

        const endsTimestamp = Number(stats.votingEndsAt);

        const endsDate = endsTimestamp
            ? new Date(endsTimestamp * 1000).toLocaleString("ru-RU")
            : "Не указано";

        const nowSec = Math.floor(Date.now() / 1000);

        const votingEnded = nowSec >= endsTimestamp;

        const isRequester =
            !!userAddress &&
            info.requester.toLowerCase() === userAddress.toLowerCase();

        // -------------------------------------------------
        // Проверяем, голосовал ли пользователь
        // -------------------------------------------------

        const voted = userAddress
            ? await daoViewContract.hasParticipantVoted(
                requestId,
                userAddress
            )
            : false;

        // =================================================
        // ФОТО ЖИВОТНОГО
        // =================================================

        let photoBlock = "";

        if (meta.photoUrl) {
            photoBlock = `
                <img
                    src="${escapeHtml(meta.photoUrl)}"
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
            `;
        } else {
            photoBlock = `
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
        }

        // =================================================
        // ССЫЛКА НА ДОКУМЕНТ
        // =================================================

        const downloadDocLink = meta.docUrl
            ? `
                <div style="margin-top:0.4rem;">
                    <a
                        href="${escapeHtml(meta.docUrl)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="tx-link"
                    >
                        📄 Скачать документ с сервера для проверки хэша ↗
                    </a>
                </div>
            `
            : "";

        // =================================================
        // БЛОК ГОЛОСОВАНИЯ DAO
        // =================================================

        let votingControls = "";

        if (statusNum === 0) {

            if (
                !votingEnded &&
                userRoles?.isMember &&
                !voted
            ) {
                votingControls = `
                    <div
                        style="
                            display:flex;
                            gap:0.75rem;
                            margin-top:1rem;
                        "
                    >
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
            } else if (!userRoles?.isMember && !votingEnded) {
                votingControls = `
                    <p
                        style="margin-top:0.75rem;"
                        class="badge badge-gray"
                    >
                        Голосование доступно участникам DAO
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
                        Подвести итоги голосования (Finalize)
                    </button>
                `;
            }
        }

        // =================================================
        // ФОРМА ДОБАВЛЕНИЯ ЭТАПА
        // =================================================

        const addMilestoneBlock =
            statusNum === 0 && !votingEnded && isRequester
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
                                ${ethers.formatEther(stats.milestoneTotal)}
                                /
                                ${ethers.formatEther(stats.requestedAmount)}
                                ETH
                            </strong>.

                            Для одобрения заявки сумма этапов должна
                            совпасть с запрашиваемой суммой!
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

                    <!-- Карточка заявки -->

                    <div class="box">

                        <div
                            class="card-title-row"
                            style="
                                display:flex;
                                justify-content:space-between;
                                align-items:center;
                                gap:1rem;
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

                        <p style="margin:0.5rem 0; color:#334155;">
                            ${escapeHtml(meta.fullStory || info.description)}
                        </p>

                        <!-- NFT-паспорт -->

                        <div
                            id="nftPassportSection"
                            style="margin-top:1.25rem;"
                        ></div>

                        <!-- Документы и проверка хэша -->

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
                                    Проверить подлинность файла по хэшу
                                    в блокчейне:
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

                    <!-- Список этапов финансирования -->

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
                    class="box"
                    style="position:sticky; top:90px;"
                >

                    <h3>Статус и голосование DAO</h3>

                    <div
                        style="
                            display:flex;
                            flex-direction:column;
                            gap:0.5rem;
                            font-size:0.92rem;
                            margin:1rem 0;
                        "
                    >

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                            "
                        >
                            <span>Запрошено:</span>

                            <strong>
                                ${ethers.formatEther(stats.requestedAmount)}
                                ETH
                            </strong>
                        </div>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                            "
                        >
                            <span>Запланировано этапов:</span>

                            <strong>
                                ${ethers.formatEther(stats.milestoneTotal)}
                                ETH
                            </strong>
                        </div>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                            "
                        >
                            <span>Выплачено:</span>

                            <strong style="color:var(--primary);">
                                ${ethers.formatEther(stats.releasedAmount)}
                                ETH
                            </strong>
                        </div>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                            "
                        >
                            <span>Окончание голосования:</span>

                            <strong>${escapeHtml(endsDate)}</strong>
                        </div>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                            "
                        >
                            <span>Голоса ЗА:</span>

                            <strong style="color:var(--primary);">
                                ${stats.yesVotes}
                            </strong>
                        </div>

                        <div
                            style="
                                display:flex;
                                justify-content:space-between;
                            "
                        >
                            <span>Голоса ПРОТИВ:</span>

                            <strong style="color:var(--danger);">
                                ${stats.noVotes}
                            </strong>
                        </div>

                    </div>

                    ${votingControls}

                </div>

            </div>
        `;

        // -------------------------------------------------
        // Загружаем этапы из RescueMilestones
        // -------------------------------------------------

        await loadMilestonesList(
            Number(stats.milestoneCount),
            statusNum,
            isRequester
        );

        // -------------------------------------------------
        // Загружаем NFT-паспорт из RescueNFT
        // -------------------------------------------------

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
// 4. ЗАГРУЗКА NFT-ПАСПОРТА
// =========================================================

async function loadNftPassport(requestId) {
    const nftContainer =
        document.getElementById("nftPassportSection");

    if (!nftContainer) return;

    try {
        // Адрес NFT-контракта читаем из основного RescueDAO.
        const nftAddress = await contract.rescueNftContract();

        if (
            !nftAddress ||
            nftAddress.toLowerCase() === ethers.ZeroAddress.toLowerCase()
        ) {
            nftContainer.innerHTML = `
                <p style="color:var(--text-muted);">
                    NFT-контракт пока не привязан к DAO.
                </p>
            `;
            return;
        }

        // Проверяем совпадение адреса в DAO с config.js.
        if (
            ethers.getAddress(nftAddress) !==
            ethers.getAddress(NFT_ADDRESS)
        ) {
            nftContainer.innerHTML = `
                <p style="color:var(--danger);">
                    Адрес NFT в DAO не совпадает с NFT_ADDRESS
                    в config.js. Проверьте настройки контрактов.
                </p>
            `;
            return;
        }

        // Получаем ID NFT, привязанного к заявке.
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

        // Получаем владельца и URI метаданных.
        const [owner, uri] = await Promise.all([
            nftContract.ownerOf(tokenId),
            nftContract.tokenURI(tokenId)
        ]);

        if (!uri.startsWith("data:application/json;base64,")) {
            nftContainer.innerHTML = `
                <p class="mono">
                    NFT #${tokenId} выпущен.
                    URI: ${escapeHtml(uri)}
                </p>
            `;
            return;
        }

        // Декодируем JSON из Base64.
        const base64Json = uri.split(",")[1];

        const binaryString = window.atob(base64Json);

        const bytes = Uint8Array.from(
            binaryString,
            char => char.charCodeAt(0)
        );

        const jsonString = new TextDecoder().decode(bytes);

        const metadata = JSON.parse(jsonString);

        // Формируем атрибуты NFT.
        const attributesHtml = (metadata.attributes || [])
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

        // Показываем NFT-паспорт.
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

                        <div>
                            ${attributesHtml}
                        </div>

                    </div>

                </div>

            </div>
        `;

        // Устанавливаем изображение после проверки формата URI.
        const imageElement =
            document.getElementById("nftPassportImage");

        if (
            imageElement &&
            typeof metadata.image === "string" &&
            metadata.image.startsWith("data:image/svg+xml;base64,")
        ) {
            imageElement.src = metadata.image;
        } else if (imageElement) {
            imageElement.alt = "Изображение NFT недоступно";
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
// 5. ПРОВЕРКА ХЭША ДОКУМЕНТА
// =========================================================

async function verifyDocumentHash() {
    const input =
        document.getElementById("verifyFileInput");

    const resSpan =
        document.getElementById("verifyResult");

    if (!input?.files?.length) return;

    try {
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
            "Не удалось проверить файл.";

        resSpan.style.color = "var(--danger)";
    }
}


// =========================================================
// 6. ГОЛОСОВАНИЕ
// =========================================================

async function castVote(support) {
    try {
        if (!userAddress) {
            throw new Error("Сначала подключите кошелёк.");
        }

        // Голосование выполняется через основной RescueDAO.
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
                "Транзакция голосования не выполнена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error("Ошибка голосования:", err);

        alert(
            "Ошибка голосования: " + getErrorMessage(err)
        );
    }
}


// =========================================================
// 7. ЗАВЕРШЕНИЕ ГОЛОСОВАНИЯ
// =========================================================

async function finalizeReq() {
    try {
        if (!userAddress) {
            throw new Error("Сначала подключите кошелёк.");
        }

        // Финализация выполняется через основной RescueDAO.
        const tx = await contract.finalizeRequest(
            requestId
        );

        alert("Подводим итоги голосования...");

        const receipt = await tx.wait();

        if (!receipt || receipt.status !== 1) {
            throw new Error(
                "Транзакция финализации не выполнена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error("Ошибка финализации:", err);

        alert(
            "Ошибка финализации: " + getErrorMessage(err)
        );
    }
}


// =========================================================
// 8. ДОБАВЛЕНИЕ ЭТАПА ФИНАНСИРОВАНИЯ
// =========================================================

async function createNewMilestone() {
    const desc =
        document.getElementById("msDesc")?.value.trim();

    const recipient =
        document.getElementById("msRecipient")?.value.trim();

    const amount =
        document.getElementById("msAmount")?.value;

    if (
        !desc ||
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
        if (!userAddress) {
            throw new Error("Сначала подключите кошелёк.");
        }

        // Добавление этапа выполняется через RescueMilestones.
        const tx = await milestonesContract.addMilestone(
            requestId,
            desc,
            recipient,
            ethers.parseEther(amount)
        );

        alert("Этап добавляется в блокчейн...");

        const receipt = await tx.wait();

        if (!receipt || receipt.status !== 1) {
            throw new Error(
                "Транзакция добавления этапа не выполнена."
            );
        }

        window.location.reload();

    } catch (err) {
        console.error("Ошибка добавления этапа:", err);

        alert(
            "Ошибка добавления этапа: " + getErrorMessage(err)
        );
    }
}


// =========================================================
// 9. ЗАГРУЗКА СПИСКА ЭТАПОВ
// =========================================================

async function loadMilestonesList(
    mCount,
    reqStatus,
    isRequester
) {
    const box =
        document.getElementById("milestonesContainer");

    if (!box) return;

    if (mCount === 0) {
        box.innerHTML = `
            <p
                style="
                    color:var(--text-muted);
                    font-size:0.9rem;
                "
            >
                Этапы ещё не добавлены.
            </p>
        `;
        return;
    }

    box.innerHTML = "";

    // Этапы нумеруются с 1.
    for (let m = 1; m <= mCount; m++) {

        // Получаем этап из RescueMilestones.
        const ms = await milestonesContract.getMilestone(
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

        // Форма отправки доказательства выполнения этапа.
        const evidenceForm =
            reqStatus === 1 &&
            isRequester &&
            !ms.released
                ? `
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

        // Информация о доказательстве.
        const evidenceInfo = ms.evidenceSubmitted
            ? `
                <div
                    class="mono"
                    style="
                        margin-top:0.25rem;
                        font-size:0.8rem;
                        word-break:break-all;
                    "
                >
                    Отчёт: ${escapeHtml(ms.evidenceURI)}
                    | Hash: ${escapeHtml(shortAddr(ms.evidenceHash))}
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
                            ${ethers.formatEther(ms.amount)} ETH
                        </strong>

                        · Получатель:

                        <span class="mono">
                            ${escapeHtml(ms.recipient)}
                        </span>
                    </div>

                    ${evidenceInfo}

                </div>

                ${evidenceForm}

            </div>
        `;
    }
}


// =========================================================
// 10. ОТПРАВКА ДОКАЗАТЕЛЬСТВА ВЫПОЛНЕНИЯ ЭТАПА
// =========================================================

async function submitEvidence(milestoneId) {
    const uriInput =
        document.getElementById(`evUri_${milestoneId}`)?.value.trim();

    const fileInput =
        document.getElementById(`evFile_${milestoneId}`);

    const file = fileInput?.files?.[0];

    try {
        if (!file && !uriInput) {
            alert("Выберите файл отчёта или укажите URI.");
            return;
        }

        if (!userAddress) {
            throw new Error(
                "Не определён адрес подключённого кошелька."
            );
        }

        let finalUri = uriInput;

        // ---------------------------------------------
        // Загрузка файла на Node.js backend
        // ---------------------------------------------

        if (file) {
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

            finalUri = uriInput || saved.docUrl;
        }

        if (!finalUri) {
            throw new Error(
                "Не удалось получить ссылку на документ отчёта."
            );
        }

        // ---------------------------------------------
        // Вычисление хэша документа
        // ---------------------------------------------

        let hash = ethers.keccak256(
            ethers.toUtf8Bytes(finalUri)
        );

        if (file) {
            const buffer = await file.arrayBuffer();

            hash = ethers.keccak256(
                new Uint8Array(buffer)
            );
        }

        // ---------------------------------------------
        // Отправка доказательства в RescueMilestones
        // ---------------------------------------------

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
        console.error("Ошибка отправки отчёта:", err);

        alert(
            "Не удалось отправить отчёт:\n" +
            getErrorMessage(err)
        );
    }
}
