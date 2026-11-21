
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
        console.error(
            "Ошибка запуска главной страницы:",
            err
        );
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
 * Проверка URL перед использованием в HTML.
 *
 * Разрешаются HTTP, HTTPS и относительные пути.
 */
function safeMediaUrl(value) {
    if (!value) return "";

    const url = String(value).trim();

    if (!url) return "";

    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    if (
        url.startsWith("/") &&
        !url.startsWith("//")
    ) {
        return url;
    }

    return "";
}


/**
 * Получение статуса заявки.
 *
 * 0 — UnderReview
 * 1 — ChangesRequested
 * 2 — Voting
 * 3 — Approved
 * 4 — Rejected
 * 5 — Completed
 * 6 — Cancelled
 */
function getRequestStatus(status) {
    const statusNum = Number(status);

    const statuses = {
        0: {
            text: "На проверке",
            cls: "badge-warning"
        },

        1: {
            text: "Требуются изменения",
            cls: "badge-warning"
        },

        2: {
            text: "Голосование",
            cls: "badge-info"
        },

        3: {
            text: "Одобрена",
            cls: "badge-success"
        },

        4: {
            text: "Отклонена",
            cls: "badge-danger"
        },

        5: {
            text: "Завершена",
            cls: "badge-success"
        },

        6: {
            text: "Отменена",
            cls: "badge-gray"
        }
    };

    return statuses[statusNum] || {
        text: "Неизвестный статус",
        cls: "badge-gray"
    };
}


/**
 * Получение HTML-элемента.
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


/**
 * Проверка успешного выполнения транзакции.
 */
function checkTransactionReceipt(receipt, errorMessage) {
    if (!receipt || Number(receipt.status) !== 1) {
        throw new Error(errorMessage);
    }
}


/**
 * Вычисление хэша файла или текстового значения.
 */
async function calculateRequestHash(file, fallbackText) {
    if (file) {
        const buffer = await file.arrayBuffer();

        return ethers.keccak256(
            new Uint8Array(buffer)
        );
    }

    return ethers.keccak256(
        ethers.toUtf8Bytes(String(fallbackText))
    );
}


/**
 * Проверка корректности положительной суммы.
 */
function isValidPositiveAmount(value) {
    if (!value || !String(value).trim()) {
        return false;
    }

    const number = Number(value);

    return (
        Number.isFinite(number) &&
        number > 0
    );
}


/**
 * Безопасное преобразование значения в BigInt.
 */
function toBigIntSafe(value) {
    try {
        return BigInt(value ?? 0);
    } catch {
        return 0n;
    }
}


/**
 * Расчёт процента финансирования.
 */
function calculateFundingPercent(collected, requested) {
    const collectedNumber = Number(formatEth(collected));
    const requestedNumber = Number(formatEth(requested));

    if (
        !Number.isFinite(collectedNumber) ||
        !Number.isFinite(requestedNumber) ||
        requestedNumber <= 0
    ) {
        return 0;
    }

    return Math.min(
        100,
        Math.max(
            0,
            (collectedNumber / requestedNumber) * 100
        )
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

        requireMethod(
            treasuryContract,
            "totalDonated",
            "RescueTreasury"
        );

        requireMethod(
            treasuryContract,
            "totalReserved",
            "RescueTreasury"
        );

        requireMethod(
            treasuryContract,
            "totalSpent",
            "RescueTreasury"
        );

        requireMethod(
            treasuryContract,
            "getAvailableBalance",
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

        const donatedElement = document.getElementById(
            "statDonated"
        );

        const availableElement = document.getElementById(
            "statAvailable"
        );

        const reservedElement = document.getElementById(
            "statReserved"
        );

        const spentElement = document.getElementById(
            "statSpent"
        );

        if (donatedElement) {
            donatedElement.textContent =
                `${formatEth(donated)} ETH`;
        }

        if (availableElement) {
            availableElement.textContent =
                `${formatEth(available)} ETH`;
        }

        if (reservedElement) {
            reservedElement.textContent =
                `${formatEth(reserved)} ETH`;
        }

        if (spentElement) {
            spentElement.textContent =
                `${formatEth(spent)} ETH`;
        }

    } catch (err) {
        console.error(
            "Ошибка загрузки статистики фонда:",
            err
        );
    }
}


// =========================================================
// 2. СТАТИСТИКА ЦЕЛЕВЫХ ПОЖЕРТВОВАНИЙ
// =========================================================

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

        requireMethod(
            treasuryContract,
            "totalTargetDonations",
            "RescueTreasury"
        );

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
            "Недоступно";
    }
}


// =========================================================
// 3. ПОЖЕРТВОВАНИЕ В ОБЩИЙ ФОНД
// =========================================================

async function donateToPool() {

    if (!isWalletConnected()) {
        alert("Сначала подключите MetaMask!");
        return;
    }

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

    const amountInput = document.getElementById(
        "donateAmount"
    );

    if (!amountInput) {
        alert("Не найдено поле суммы пожертвования.");
        return;
    }

    const val = amountInput.value.trim();

    if (!isValidPositiveAmount(val)) {
        alert("Введите корректную сумму больше 0 ETH.");
        return;
    }

    try {
        const amountWei = ethers.parseEther(val);

        /*
         * Пожертвование отправляется в RescueDAO.
         * Контракт перенаправляет средства в RescueTreasury.
         */

        const tx = await contract.donate({
            value: amountWei
        });

        alert(
            "Пожертвование отправлено! " +
            "Ожидаем подтверждения транзакции..."
        );

        const receipt = await tx.wait();

        checkTransactionReceipt(
            receipt,
            "Транзакция пожертвования не подтверждена."
        );

        alert(
            "Спасибо! Средства зачислены в общий фонд RescueDAO."
        );

        amountInput.value = "";

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
// 4. СОЗДАНИЕ ЗАЯВКИ
// =========================================================

async function submitAidRequest() {

    if (!isWalletConnected()) {
        alert("Подключите MetaMask!");
        return;
    }

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

    /*
     * Создавать заявки могут только зарегистрированные
     * участники DAO.
     */

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

    const name = getElement("reqAnimalName").value.trim();

    const desc = getElement("reqDescription").value.trim();

    const amountEth = getElement("reqAmount").value.trim();

    const uri = getElement("reqEvidenceUri").value.trim();

    const fileInput = document.getElementById(
        "reqEvidenceFile"
    );

    const photoInput = document.getElementById(
        "reqPhotoFile"
    );

    const evidenceFile = fileInput?.files?.[0];

    const photoFile = photoInput?.files?.[0];

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

    if (!isValidPositiveAmount(amountEth)) {
        alert("Введите корректную сумму заявки.");
        return;
    }

    try {

        // -------------------------------------------------
        // ШАГ 1. Вычисление хэша документа
        // -------------------------------------------------

        const docHash = await calculateRequestHash(
            evidenceFile,
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
        // ШАГ 2. Подготовка суммы заявки
        // -------------------------------------------------

        const requestedAmount =
            ethers.parseEther(amountEth);

        // -------------------------------------------------
        // ШАГ 3. Создание заявки в RescueDAO
        // -------------------------------------------------

        /*
         * Новая заявка получает статус UnderReview.
         *
         * Голосование не начинается в момент создания.
         * Продолжительность голосования устанавливается
         * администратором при публикации заявки.
         */

        const tx = await contract.createAidRequest(
            name,
            desc,
            uri,
            docHash,
            requestedAmount
        );

        alert(
            "Заявка отправлена в блокчейн. " +
            "Ожидаем подтверждения транзакции..."
        );

        const receipt = await tx.wait();

        checkTransactionReceipt(
            receipt,
            "Транзакция создания заявки не подтверждена."
        );

        // -------------------------------------------------
        // ШАГ 4. Получение ID созданной заявки
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
        // ШАГ 5. Сохранение дополнительных данных на backend
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

        let backendSaved = false;

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

            backendSaved = true;

            console.log(
                "Медиафайлы заявки сохранены:",
                result.data
            );

        } catch (apiErr) {
            console.error(
                "Заявка создана в блокчейне, " +
                "но дополнительные данные не сохранены:",
                apiErr
            );
        }

        // -------------------------------------------------
        // ШАГ 6. Завершение
        // -------------------------------------------------

        if (backendSaved) {
            alert(
                `Заявка #${newId} успешно создана и отправлена на проверку!\n\n` +
                "После проверки администратор сможет опубликовать её " +
                "и запустить голосование DAO."
            );
        } else {
            alert(
                `Заявка #${newId} создана в блокчейне и отправлена на проверку.\n\n` +
                "Однако дополнительные материалы не удалось сохранить на сервере. " +
                "Проверьте работу backend."
            );
        }

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
// 5. ЗАГРУЗКА ВСЕХ ЗАЯВОК
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
            // Получение данных из RescueDAOView
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

            const safePhotoUrl = safeMediaUrl(
                meta.photoUrl
            );

            if (safePhotoUrl) {
                imgTag = `
                    <img
                        src="${escapeHtml(safePhotoUrl)}"
                        alt="${escapeHtml(info.animalName)}"
                        loading="lazy"
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

            const statusNum = Number(stats.status);

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
            // Получение целевых пожертвований
            // ---------------------------------------------

            /*
             * В новой модели важно различать:
             *
             * requestDonations:
             * общая сумма целевых пожертвований, поступивших
             * на заявку за всё время.
             *
             * getAvailableRequestDonations:
             * целевые средства, которые ещё доступны
             * для резервирования по этапам.
             *
             * После резервирования сумма доступных средств
             * уменьшается, но общая сумма пожертвований
             * остаётся прежней.
             */

            let targetDonatedWei = 0n;

            let availableTargetWei = 0n;

            let targetFundingAvailable = false;

            let availableTargetFundingAvailable = false;

            try {
                requireContract(
                    treasuryContract,
                    "RescueTreasury"
                );

                if (
                    typeof treasuryContract.requestDonations === "function"
                ) {
                    targetDonatedWei =
                        toBigIntSafe(
                            await treasuryContract.requestDonations(i)
                        );

                    targetFundingAvailable = true;
                }

            } catch (targetErr) {
                console.warn(
                    `Не удалось получить общую сумму целевых пожертвований заявки #${i}:`,
                    targetErr
                );
            }

            try {
                if (
                    treasuryContract &&
                    typeof treasuryContract.getAvailableRequestDonations === "function"
                ) {
                    availableTargetWei =
                        toBigIntSafe(
                            await treasuryContract.getAvailableRequestDonations(i)
                        );

                    availableTargetFundingAvailable = true;
                }

            } catch (availableErr) {
                console.warn(
                    `Не удалось получить доступные целевые средства заявки #${i}:`,
                    availableErr
                );
            }

            /*
             * Если метод общей суммы отсутствует в ABI,
             * но доступен метод остатка, отображаем хотя бы
             * доступную сумму.
             *
             * При этом не выдаём остаток за полную сумму
             * собранных пожертвований.
             */

            // ---------------------------------------------
            // Расчёт прогресса целевого финансирования
            // ---------------------------------------------

            const targetFundingPercent =
                targetFundingAvailable
                    ? calculateFundingPercent(
                        targetDonatedWei,
                        stats.requestedAmount
                    )
                    : 0;

            // ---------------------------------------------
            // Формирование блока целевого финансирования
            // ---------------------------------------------

            let targetFundingHtml = "";

            if (
                targetFundingAvailable ||
                availableTargetFundingAvailable
            ) {

                let collectedHtml = "";

                if (targetFundingAvailable) {
                    collectedHtml = `
                        <div
                            class="row-between"
                            style="
                                gap:0.5rem;
                                margin-bottom:0.35rem;
                            "
                        >
                            <span>
                                Всего собрано адресно:
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
                            Собрано:
                            ${targetFundingPercent.toFixed(1)}%
                            от запрошенной суммы
                        </div>
                    `;
                }

                let availableHtml = "";

                if (availableTargetFundingAvailable) {
                    availableHtml = `
                        <div
                            class="row-between"
                            style="
                                gap:0.5rem;
                                margin-top:0.55rem;
                            "
                        >
                            <span>
                                Доступно для резервирования:
                            </span>

                            <strong style="color:var(--text-main);">
                                ${formatEth(availableTargetWei)} ETH
                            </strong>
                        </div>
                    `;
                }

                targetFundingHtml = `
                    <div style="margin-top:0.85rem;">

                        ${collectedHtml}

                        ${availableHtml}

                    </div>
                `;

            } else {
                targetFundingHtml = `
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
            }

            // ---------------------------------------------
            // Дополнительное пояснение статуса
            // ---------------------------------------------

            let statusDescription = "";

            switch (statusNum) {

                case 0:
                    statusDescription = `
                        <div
                            style="
                                margin-top:0.75rem;
                                padding:0.65rem;
                                border-radius:0.5rem;
                                background:#fef3c7;
                                color:#92400e;
                                font-size:0.85rem;
                            "
                        >
                            Заявка находится на проверке администрацией.
                            Голосование ещё не началось.
                        </div>
                    `;
                    break;

                case 1:
                    statusDescription = `
                        <div
                            style="
                                margin-top:0.75rem;
                                padding:0.65rem;
                                border-radius:0.5rem;
                                background:#fef3c7;
                                color:#92400e;
                                font-size:0.85rem;
                            "
                        >
                            Для заявки требуются изменения.
                            После исправления данных она может быть
                            повторно отправлена на проверку.
                        </div>
                    `;
                    break;

                case 2:
                    statusDescription = `
                        <div
                            style="
                                margin-top:0.75rem;
                                padding:0.65rem;
                                border-radius:0.5rem;
                                background:#dbeafe;
                                color:#1e40af;
                                font-size:0.85rem;
                            "
                        >
                            Заявка опубликована.
                            Сейчас проходит голосование участников DAO.
                        </div>
                    `;
                    break;

                case 3:
                    statusDescription = `
                        <div
                            style="
                                margin-top:0.75rem;
                                padding:0.65rem;
                                border-radius:0.5rem;
                                background:#dcfce7;
                                color:#166534;
                                font-size:0.85rem;
                            "
                        >
                            Заявка одобрена.
                            Это означает, что DAO разрешило её финансирование,
                            но не означает, что вся запрошенная сумма уже собрана.

                            Целевые пожертвования могут продолжать поступать.
                            Администратор DAO резервирует средства отдельно
                            для каждого этапа по мере их доступности.
                        </div>
                    `;
                    break;

                case 4:
                    statusDescription = `
                        <div
                            style="
                                margin-top:0.75rem;
                                padding:0.65rem;
                                border-radius:0.5rem;
                                background:#fee2e2;
                                color:#991b1b;
                                font-size:0.85rem;
                            "
                        >
                            Заявка отклонена по результатам проверки
                            или голосования.
                        </div>
                    `;
                    break;

                case 5:
                    statusDescription = `
                        <div
                            style="
                                margin-top:0.75rem;
                                padding:0.65rem;
                                border-radius:0.5rem;
                                background:#dcfce7;
                                color:#166534;
                                font-size:0.85rem;
                            "
                        >
                            Все этапы заявки завершены.
                            Выплаты по предусмотренным этапам произведены.
                        </div>
                    `;
                    break;

                case 6:
                    statusDescription = `
                        <div
                            style="
                                margin-top:0.75rem;
                                padding:0.65rem;
                                border-radius:0.5rem;
                                background:#f1f5f9;
                                color:#475569;
                                font-size:0.85rem;
                            "
                        >
                            Заявка отменена.
                        </div>
                    `;
                    break;
            }

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

                    ${statusDescription}

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
