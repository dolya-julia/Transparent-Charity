
window.addEventListener("DOMContentLoaded", async () => {
    try {
        const ready = await initWeb3();

        if (!ready) return;

        await Promise.all([
            loadPoolStats(),
            loadTargetDonationStats()
        ]);

        await loadAllRequests();

    } catch (err) {
        console.error("Ошибка запуска главной страницы:", err);
    }
});


// =========================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================================

/**
 * Проверка доступности контракта.
 */
function requireContract(instance, name) {
    if (!instance) {
        throw new Error(`${name} не инициализирован.`);
    }
}

/**
 * Проверка наличия метода в контракте.
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
 * Экранирование текста перед вставкой в HTML.
 */
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[char];
    });
}

/**
 * Получение статуса заявки.
 */
function getRequestStatus(status) {
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

/**
 * Проверка наличия HTML-элемента.
 */
function getElement(id) {
    const element = document.getElementById(id);

    if (!element) {
        throw new Error(`Не найден HTML-элемент #${id}.`);
    }

    return element;
}

/**
 * Форматирование ETH.
 */
function formatEth(value) {
    return ethers.formatEther(value);
}

/**
 * Проверка подключения кошелька.
 */
function isWalletConnected() {
    return (
        typeof signer !== "undefined" &&
        signer &&
        typeof userAddress !== "undefined" &&
        userAddress
    );
}


// =========================================================
// 1. СТАТИСТИКА ОБЩЕГО ФОНДА
// =========================================================

async function loadPoolStats() {
    try {
        requireContract(
            treasuryContract,
            "RescueTreasury"
        );

        const [
            donated,
            reserved,
            spent,
            available
        ] = await Promise.all([
            treasuryContract.totalDonated(),
            treasuryContract.totalReserved(),
            treasuryContract.totalSpent(),
            treasuryContract.getAvailableBalance()
        ]);

        getElement("statDonated").textContent =
            `${formatEth(donated)} ETH`;

        getElement("statAvailable").textContent =
            `${formatEth(available)} ETH`;

        getElement("statReserved").textContent =
            `${formatEth(reserved)} ETH`;

        getElement("statSpent").textContent =
            `${formatEth(spent)} ETH`;

    } catch (err) {
        console.error(
            "Ошибка загрузки статистики фонда:",
            err
        );
    }
}


/**
 * Загрузка общей статистики целевых пожертвований.
 */
async function loadTargetDonationStats() {
    const targetElement = document.getElementById(
        "statTargetDonated"
    );

    if (!targetElement) return;

    try {
        requireContract(
            treasuryContract,
            "RescueTreasury"
        );

        if (
            typeof treasuryContract.totalTargetDonations !== "function"
        ) {
            targetElement.textContent = "Недоступно";

            console.warn(
                "В ABI RescueTreasury отсутствует totalTargetDonations()."
            );

            return;
        }

        const total =
            await treasuryContract.totalTargetDonations();

        targetElement.textContent =
            `${formatEth(total)} ETH`;

    } catch (err) {
        console.error(
            "Ошибка загрузки статистики целевых пожертвований:",
            err
        );

        targetElement.textContent =
            "Не удалось загрузить";
    }
}


// =========================================================
// 2. ПОЖЕРТВОВАНИЕ В ОБЩИЙ ФОНД
// =========================================================

async function donateToPool() {

    // -----------------------------------------------------
    // Проверка подключения кошелька
    // -----------------------------------------------------

    if (!isWalletConnected()) {
        alert("Сначала подключите MetaMask!");
        return;
    }

    // -----------------------------------------------------
    // Проверка RescueDAO
    // -----------------------------------------------------

    try {
        requireMethod(
            contract,
            "donate",
            "RescueDAO"
        );
    } catch (err) {
        alert(err.message);
        return;
    }

    // -----------------------------------------------------
    // Получение суммы пожертвования
    // -----------------------------------------------------

    const amountInput = document.getElementById(
        "donateAmount"
    );

    if (!amountInput) {
        alert("Не найдено поле суммы пожертвования.");
        return;
    }

    const val = amountInput.value.trim();

    if (
        !val ||
        !Number.isFinite(Number(val)) ||
        Number(val) <= 0
    ) {
        alert("Введите корректную сумму больше 0 ETH.");
        return;
    }

    try {
        const amountWei = ethers.parseEther(val);

        // Пожертвование отправляется в основной RescueDAO.
        // RescueDAO должен перенаправить средства в RescueTreasury.

        const tx = await contract.donate({
            value: amountWei
        });

        alert(
            "Пожертвование отправлено! " +
            "Ожидаем подтверждения транзакции..."
        );

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция пожертвования не подтверждена."
            );
        }

        alert(
            "Спасибо! Средства зачислены в общий фонд RescueDAO."
        );

        amountInput.value = "";

        // Обновляем статистику после подтверждения транзакции.
        await Promise.all([
            loadPoolStats(),
            loadTargetDonationStats()
        ]);

    } catch (err) {
        console.error(
            "Ошибка пожертвования:",
            err
        );

        alert(
            "Ошибка пожертвования: " +
            getErrorMessage(err)
        );
    }
}


// =========================================================
// 3. СОЗДАНИЕ ЗАЯВКИ
// =========================================================

async function submitAidRequest() {

    // -----------------------------------------------------
    // Проверка подключения кошелька
    // -----------------------------------------------------

    if (!isWalletConnected()) {
        alert("Подключите MetaMask!");
        return;
    }

    // -----------------------------------------------------
    // Проверка основного DAO
    // -----------------------------------------------------

    try {
        requireMethod(
            contract,
            "createAidRequest",
            "RescueDAO"
        );
    } catch (err) {
        alert(err.message);
        return;
    }

    // -----------------------------------------------------
    // Проверка роли участника
    // -----------------------------------------------------

    if (
        typeof userRoles === "undefined" ||
        !userRoles ||
        !userRoles.isMember
    ) {
        alert(
            "Создавать заявки могут только " +
            "зарегистрированные участники DAO."
        );

        return;
    }

    // -----------------------------------------------------
    // Получение данных формы
    // -----------------------------------------------------

    const name = getElement("reqAnimalName").value.trim();

    const desc = getElement("reqDescription").value.trim();

    const amountEth = getElement("reqAmount").value.trim();

    const durationMin = Number(
        getElement("reqDuration").value
    );

    const uri = getElement("reqEvidenceUri").value.trim();

    const fileInput = document.getElementById(
        "reqEvidenceFile"
    );

    const photoInput = document.getElementById(
        "reqPhotoFile"
    );

    const evidenceFile = fileInput?.files?.[0];

    const photoFile = photoInput?.files?.[0];

    // -----------------------------------------------------
    // Проверка обязательных полей
    // -----------------------------------------------------

    if (!name) {
        alert("Укажите имя животного.");
        return;
    }

    if (!desc) {
        alert("Укажите описание проблемы и лечения.");
        return;
    }

    if (!uri) {
        alert("Укажите ссылку на подтверждающие документы.");
        return;
    }

    if (
        !amountEth ||
        !Number.isFinite(Number(amountEth)) ||
        Number(amountEth) <= 0
    ) {
        alert("Введите корректную сумму заявки.");
        return;
    }

    if (
        !Number.isInteger(durationMin) ||
        durationMin < 1 ||
        durationMin > 43200
    ) {
        alert(
            "Срок голосования должен составлять " +
            "от 1 до 43200 минут."
        );

        return;
    }

    try {

        // -------------------------------------------------
        // ШАГ 1. Вычисление хэша документа
        // -------------------------------------------------

        const docHash = await hashFileOrDefault(
            fileInput,
            `${name}-${Date.now()}`
        );

        if (
            !docHash ||
            docHash === ethers.ZeroHash
        ) {
            throw new Error(
                "Не удалось сформировать хэш документа."
            );
        }

        // -------------------------------------------------
        // ШАГ 2. Создание заявки в RescueDAO
        // -------------------------------------------------

        const requestedAmount =
            ethers.parseEther(amountEth);

        const votingDuration =
            BigInt(durationMin) * 60n;

        const tx = await contract.createAidRequest(
            name,
            desc,
            uri,
            docHash,
            requestedAmount,
            votingDuration
        );

        alert(
            "Заявка отправлена в блокчейн. " +
            "Ожидаем подтверждения транзакции..."
        );

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция создания заявки не подтверждена."
            );
        }

        // -------------------------------------------------
        // ШАГ 3. Получение ID через RescueDAOView
        // -------------------------------------------------

        requireMethod(
            daoViewContract,
            "getRequestCount",
            "RescueDAOView"
        );

        const newId = Number(
            await daoViewContract.getRequestCount()
        );

        if (
            !Number.isInteger(newId) ||
            newId <= 0
        ) {
            throw new Error(
                "Не удалось определить ID созданной заявки."
            );
        }

        // -------------------------------------------------
        // ШАГ 4. Сохранение медиафайлов на backend
        // -------------------------------------------------

        const formData = new FormData();

        formData.append(
            "fullStory",
            desc
        );

        if (photoFile) {
            formData.append(
                "photo",
                photoFile
            );
        }

        if (evidenceFile) {
            formData.append(
                "document",
                evidenceFile
            );
        }

        try {
            const response = await fetch(
                `${API_URL}/requests/${newId}`,
                {
                    method: "POST",
                    body: formData
                }
            );

            if (!response.ok) {
                const errorText =
                    await response.text();

                throw new Error(
                    `Ошибка backend (${response.status}): ${errorText}`
                );
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(
                    "Backend не подтвердил сохранение данных."
                );
            }

            console.log(
                "Медиафайлы заявки сохранены:",
                result.data
            );

        } catch (apiErr) {
            console.error(
                "Заявка создана в блокчейне, " +
                "но медиафайлы не сохранены:",
                apiErr
            );

            alert(
                "Заявка создана в блокчейне, но не удалось " +
                "сохранить фотографии или документы на сервере. " +
                "Проверьте, запущен ли backend."
            );
        }

        // -------------------------------------------------
        // ШАГ 5. Завершение
        // -------------------------------------------------

        alert(
            `Заявка #${newId} успешно опубликована! ` +
            "Теперь можно добавить этапы финансирования."
        );

        window.location.reload();

    } catch (err) {
        console.error(
            "Ошибка создания заявки:",
            err
        );

        alert(
            "Ошибка создания заявки: " +
            getErrorMessage(err)
        );
    }
}


// =========================================================
// 4. ЗАГРУЗКА ВСЕХ ЗАЯВОК
// =========================================================

async function loadAllRequests() {

    const grid = document.getElementById(
        "requestsGrid"
    );

    if (!grid) {
        console.error(
            "Не найден элемент requestsGrid."
        );

        return;
    }

    try {

        // -------------------------------------------------
        // Проверка RescueDAOView
        // -------------------------------------------------

        requireMethod(
            daoViewContract,
            "getRequestCount",
            "RescueDAOView"
        );

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

        // -------------------------------------------------
        // Получение количества заявок
        // -------------------------------------------------

        const count = Number(
            await daoViewContract.getRequestCount()
        );

        if (!Number.isInteger(count) || count < 0) {
            throw new Error(
                "RescueDAOView вернул некорректное количество заявок."
            );
        }

        if (count === 0) {
            grid.innerHTML =
                "<p>Заявок пока нет. Создайте первую заявку выше!</p>";

            return;
        }

        grid.innerHTML = "";

        // -------------------------------------------------
        // Отображение от новых заявок к старым
        // -------------------------------------------------

        for (let i = count; i >= 1; i--) {

            // ---------------------------------------------
            // Получение данных через RescueDAOView
            // ---------------------------------------------

            const [info, stats] = await Promise.all([
                daoViewContract.getAidRequestInfo(i),
                daoViewContract.getAidRequestStats(i)
            ]);

            // ---------------------------------------------
            // Получение дополнительных данных с backend
            // ---------------------------------------------

            let meta = {
                photoUrl: ""
            };

            try {
                const res = await fetch(
                    `${API_URL}/requests/${i}`
                );

                if (res.ok) {
                    const responseData =
                        await res.json();

                    meta =
                        responseData.data || responseData;
                }

            } catch (apiErr) {
                console.warn(
                    `Не удалось загрузить медиафайлы заявки #${i}:`,
                    apiErr
                );
            }

            // ---------------------------------------------
            // Подготовка изображения
            // ---------------------------------------------

            let imgTag = "";

            if (meta.photoUrl) {
                const photoUrl =
                    escapeHtml(meta.photoUrl);

                imgTag = `
                    <img
                        src="${photoUrl}"
                        alt="${escapeHtml(info.animalName)}"
                        style="
                            width:100%;
                            height:180px;
                            object-fit:cover;
                            border-radius:0.65rem;
                            margin-bottom:0.75rem;
                        "
                    >
                `;
            }

            // ---------------------------------------------
            // Подготовка статуса
            // ---------------------------------------------

            const statusObj = getRequestStatus(
                stats.status
            );

            // ---------------------------------------------
            // Форматирование числовых данных
            // ---------------------------------------------

            const reqEth = formatEth(
                stats.requestedAmount
            );

            const relEth = formatEth(
                stats.releasedAmount
            );

            const yesVotes =
                stats.yesVotes.toString();

            const noVotes =
                stats.noVotes.toString();

            const completedMilestones =
                stats.completedMilestones.toString();

            const milestoneCount =
                stats.milestoneCount.toString();

            // ---------------------------------------------
            // Получение адресных пожертвований
            // из RescueTreasury
            // ---------------------------------------------

            let targetDonatedWei = 0n;
            let targetFundingAvailable = false;

            try {
                if (
                    treasuryContract &&
                    typeof treasuryContract.requestDonations === "function"
                ) {
                    targetDonatedWei =
                        await treasuryContract.requestDonations(i);

                    targetFundingAvailable = true;
                }

            } catch (targetErr) {
                console.warn(
                    `Не удалось получить целевые пожертвования заявки #${i}:`,
                    targetErr
                );
            }

            // ---------------------------------------------
            // Расчёт прогресса целевого финансирования
            // ---------------------------------------------

            const targetDonatedEth = Number(
                formatEth(targetDonatedWei)
            );

            const requestedEthNumber = Number(reqEth);

            const targetFundingPercent =
                targetFundingAvailable && requestedEthNumber > 0
                    ? Math.min(
                        100,
                        (
                            targetDonatedEth /
                            requestedEthNumber
                        ) * 100
                    )
                    : 0;

            const targetFundingHtml =
                targetFundingAvailable
                    ? `
                        <div style="margin-top:0.85rem;">

                            <div
                                class="row-between"
                                style="
                                    gap:0.5rem;
                                    margin-bottom:0.35rem;
                                "
                            >
                                <span>
                                    Целевые пожертвования:
                                </span>

                                <strong style="color:var(--text-main);">
                                    ${formatEth(targetDonatedWei)}
                                    /
                                    ${reqEth} ETH
                                </strong>

                            </div>

                            <div
                                role="progressbar"
                                aria-label="Прогресс целевого финансирования заявки"
                                aria-valuemin="0"
                                aria-valuemax="100"
                                aria-valuenow="${targetFundingPercent.toFixed(1)}"
                                style="
                                    width:100%;
                                    height:8px;
                                    overflow:hidden;
                                    background:#e2e8f0;
                                    border-radius:999px;
                                "
                            >
                                <div
                                    style="
                                        width:${targetFundingPercent.toFixed(2)}%;
                                        height:100%;
                                        background:var(--primary);
                                        border-radius:999px;
                                        transition:width 0.25s ease;
                                    "
                                ></div>
                            </div>

                            <div
                                style="
                                    font-size:0.78rem;
                                    color:var(--text-muted);
                                    margin-top:0.3rem;
                                "
                            >
                                Собрано адресно:
                                ${targetFundingPercent.toFixed(1)}%
                            </div>

                        </div>
                    `
                    : `
                        <div
                            style="
                                margin-top:0.75rem;
                                font-size:0.82rem;
                                color:var(--text-muted);
                            "
                        >
                            Статистика целевых пожертвований временно недоступна.
                        </div>
                    `;

            // ---------------------------------------------
            // Подготовка текста
            // ---------------------------------------------

            const animalName =
                escapeHtml(info.animalName);

            const description =
                escapeHtml(info.description);

            const statusText =
                escapeHtml(statusObj.text);

            const statusClass =
                escapeHtml(statusObj.cls);

            // ---------------------------------------------
            // Формирование карточки заявки
            // ---------------------------------------------

            const card = document.createElement("div");

            card.className = "card";

            card.innerHTML = `
                <div>

                    ${imgTag}

                    <div
                        class="row-between"
                        style="margin-bottom:0.75rem;"
                    >

                        <strong style="font-size:1.2rem;">
                            #${i} · ${animalName}
                        </strong>

                        <span class="badge ${statusClass}">
                            ${statusText}
                        </span>

                    </div>

                    <p
                        style="
                            font-size:0.92rem;
                            color:#334155;
                            margin-bottom:0.9rem;
                            white-space:pre-wrap;
                        "
                    >
                        ${description}
                    </p>

                    <div
                        style="
                            font-size:0.85rem;
                            color:var(--text-muted);
                            display:flex;
                            flex-direction:column;
                            gap:0.25rem;
                        "
                    >

                        <div>
                            Запрошено:

                            <strong style="color:var(--text-main);">
                                ${reqEth} ETH
                            </strong>

                            (Выплачено: ${relEth} ETH)
                        </div>

                        ${targetFundingHtml}

                        <div style="margin-top:0.5rem;">
                            Голоса DAO:

                            <strong style="color:var(--primary);">
                                За: ${yesVotes}
                            </strong>

                            /

                            <strong style="color:var(--danger);">
                                Против: ${noVotes}
                            </strong>
                        </div>

                        <div>
                            Этапов:

                            <strong>
                                ${completedMilestones}
                                из
                                ${milestoneCount}
                            </strong>
                        </div>

                    </div>

                </div>

                <a
                    href="request.html?id=${i}"
                    class="btn btn-dark"
                    style="
                        width:100%;
                        margin-top:1rem;
                    "
                >
                    Открыть заявку / Паспорт
                </a>
            `;

            grid.appendChild(card);
        }

    } catch (err) {
        console.error(
            "Ошибка загрузки заявок:",
            err
        );

        grid.innerHTML = `
            <div class="box">

                <p style="color:var(--danger);">
                    Не удалось загрузить заявки из блокчейна.
                </p>

                <p
                    style="
                        font-size:0.85rem;
                        color:var(--text-muted);
                        margin-top:0.5rem;
                    "
                >
                    Проверьте адрес RescueDAOView, ABI контракта,
                    подключение к Geth и доступность RPC-узла.
                </p>

                <p
                    style="
                        font-size:0.8rem;
                        color:var(--text-muted);
                        margin-top:0.5rem;
                    "
                >
                    ${escapeHtml(getErrorMessage(err))}
                </p>

            </div>
        `;
    }
}
