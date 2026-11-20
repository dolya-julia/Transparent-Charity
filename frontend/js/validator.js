
// ======================================================
// 1. ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ
// ======================================================

window.addEventListener("DOMContentLoaded", async () => {
    try {
        const ready = await initWeb3();

        if (!ready) return;

        if (!contract || !daoViewContract ||
            !milestonesContract || !treasuryContract) {
            throw new Error(
                "Не все контракты DAO инициализированы. Проверьте wallet.js."
            );
        }

        if (!userRoles) {
            throw new Error(
                "Не удалось получить роли пользователя."
            );
        }

        // Администратор определяется через основной RescueDAO.
        const adminAddress = await contract.admin();

        userRoles.isAdmin =
            Boolean(userAddress) &&
            adminAddress.toLowerCase() === userAddress.toLowerCase();

        console.log("Адрес администратора DAO:", adminAddress);
        console.log("Текущий пользователь:", userAddress);
        console.log("Роль администратора:", userRoles.isAdmin);

        // Панель администратора показываем только администратору.
        const adminPanel = document.getElementById("adminPanel");

        if (adminPanel) {
            adminPanel.style.display =
                userRoles.isAdmin ? "block" : "none";
        }

        await Promise.all([
            loadValidatorQueue(),
            loadAuditHistory()
        ]);

    } catch (err) {
        console.error("Ошибка инициализации страницы:", err);

        alert(
            "Ошибка инициализации: " +
            getErrorMessage(err)
        );
    }
});


// ======================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ======================================================

// Безопасное отображение текста через innerHTML.
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


// Сокращение Ethereum-адреса или хэша.
function shortAddr(value) {
    if (!value) return "—";

    const str = String(value);

    if (str.length <= 14) {
        return str;
    }

    return `${str.slice(0, 8)}...${str.slice(-6)}`;
}


// Форматирование адреса.
function formatAddress(address) {
    if (!address) return "Не указан";

    return shortAddr(address);
}


// Форматирование количества подтверждений.
function formatApprovalCount(count) {
    return `${Number(count)}/2`;
}


// Форматирование ETH.
function formatEth(value) {
    try {
        return ethers.formatEther(value);
    } catch (err) {
        console.warn("Ошибка форматирования ETH:", err);
        return "0";
    }
}


// Форматирование ошибок.
function getErrorMessage(err) {
    return (
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Неизвестная ошибка"
    );
}


// Проверка подключения кошелька.
function ensureWallet() {
    if (!signer) {
        throw new Error(
            "Сначала подключите MetaMask."
        );
    }

    if (!userAddress) {
        throw new Error(
            "Не удалось определить адрес подключённого кошелька."
        );
    }
}


// Проверка доступности административных функций.
function ensureAdmin() {
    ensureWallet();

    if (!userRoles?.isAdmin) {
        throw new Error(
            "Это действие доступно только администратору DAO."
        );
    }
}


// Проверка доступности функций валидатора.
function ensureValidator() {
    ensureWallet();

    if (!userRoles?.isValidator) {
        throw new Error(
            "Это действие доступно только валидаторам DAO."
        );
    }
}


// Получение безопасного URL транзакции обозревателя.
function getExplorerTransactionUrl(txHash) {
    if (!EXPLORER_URL || !txHash) {
        return "";
    }

    try {
        const baseUrl = new URL(EXPLORER_URL);

        if (
            baseUrl.protocol !== "https:" &&
            baseUrl.protocol !== "http:"
        ) {
            return "";
        }

        return new URL(
            `tx/${encodeURIComponent(txHash)}`,
            baseUrl.href.replace(/\/?$/, "/")
        ).href;

    } catch (err) {
        console.warn(
            "Некорректный EXPLORER_URL:",
            err
        );

        return "";
    }
}


// ======================================================
// 3. РЕГИСТРАЦИЯ УЧАСТНИКА DAO
// ======================================================

async function registerMember() {
    const input =
        document.getElementById("newMemberAddress");

    if (!input) {
        alert("Не найдено поле для Ethereum-адреса.");
        return;
    }

    const addr = input.value.trim();

    if (!ethers.isAddress(addr)) {
        alert(
            "Введите корректный Ethereum-адрес (0x...)."
        );
        return;
    }

    try {
        ensureAdmin();

        if (!contract) {
            throw new Error(
                "Контракт RescueDAO не инициализирован."
            );
        }

        // Регистрация участника выполняется через RescueDAO.
        const tx = await contract.setMember(addr, true);

        alert("Регистрируем участника DAO...");

        const receipt = await tx.wait();

        if (!receipt || receipt.status !== 1) {
            throw new Error(
                "Транзакция регистрации не подтверждена."
            );
        }

        alert("Участник успешно зарегистрирован!");

        input.value = "";

    } catch (err) {
        console.error(
            "Ошибка регистрации участника:",
            err
        );

        alert(
            "Ошибка регистрации: " +
            getErrorMessage(err)
        );
    }
}


// ======================================================
// 4. ОЧЕРЕДЬ ЭТАПОВ ДЛЯ ВАЛИДАТОРОВ
// ======================================================

async function loadValidatorQueue() {
    const container =
        document.getElementById("milestonesQueue");

    if (!container) {
        console.error(
            "Не найден элемент milestonesQueue."
        );
        return;
    }

    try {
        if (!daoViewContract || !milestonesContract) {
            throw new Error(
                "Контракты RescueDAOView или RescueMilestones не инициализированы."
            );
        }

        container.innerHTML = `
            <p style="color:var(--text-muted);">
                Загрузка очереди этапов...
            </p>
        `;

        // Количество заявок читаем через RescueDAOView.
        const count = Number(
            await daoViewContract.getRequestCount()
        );

        let html = "";

        for (let i = 1; i <= count; i++) {

            // Информация о заявке и статистика читаются через RescueDAOView.
            const [info, stats] = await Promise.all([
                daoViewContract.getAidRequestInfo(i),
                daoViewContract.getAidRequestStats(i)
            ]);

            const requestStatus = Number(stats.status);

            // Этапы заявки читаются через RescueMilestones.
            const mCount = Number(stats.milestoneCount);

            for (let m = 1; m <= mCount; m++) {

                const ms =
                    await milestonesContract.getMilestone(i, m);

                // Проверяем, подтверждал ли пользователь этот этап.
                const alreadyApproved =
                    Boolean(userAddress && userRoles?.isValidator)
                        ? await milestonesContract.hasValidatorApproved(
                            i,
                            m,
                            userAddress
                        )
                        : false;

                const approvalCount =
                    Number(ms.approvalCount);

                let btnHtml = "";

                // Этап уже оплачен.
                if (ms.released) {

                    btnHtml = `
                        <span class="badge badge-green">
                            Выплачено (2/2)
                        </span>
                    `;

                // Заявка ещё не одобрена DAO.
                } else if (requestStatus !== 1) {

                    btnHtml = `
                        <span class="badge badge-gray">
                            Ожидает одобрения заявки
                        </span>
                    `;

                // Приют ещё не загрузил отчёт.
                } else if (!ms.evidenceSubmitted) {

                    btnHtml = `
                        <span class="badge badge-yellow">
                            Нет отчёта от приюта
                        </span>
                    `;

                // Пользователь не является валидатором.
                } else if (!userRoles?.isValidator) {

                    btnHtml = `
                        <span class="badge badge-gray">
                            Только для валидаторов
                        </span>
                    `;

                // Пользователь уже подтвердил этап.
                } else if (alreadyApproved) {

                    btnHtml = `
                        <button class="btn btn-outline" disabled>
                            Подтверждено вами
                            (${formatApprovalCount(approvalCount)})
                        </button>
                    `;

                // Этап получил два подтверждения.
                } else if (approvalCount >= 2) {

                    btnHtml = `
                        <span class="badge badge-green">
                            Ожидается выплата
                        </span>
                    `;

                // Этап можно подтвердить.
                } else {

                    btnHtml = `
                        <button
                            class="btn btn-primary"
                            onclick="approveMs(${i}, ${m})"
                        >
                            Подтвердить выплату
                            (${formatApprovalCount(approvalCount)})
                        </button>
                    `;
                }

                html += `
                    <div class="list-item">

                        <div>

                            <span
                                class="badge badge-blue"
                                style="margin-bottom:0.35rem;"
                            >
                                Заявка #${i}
                                (${escapeHtml(info.animalName)})
                                · Этап #${m}
                            </span>

                            <div>
                                <strong>
                                    ${escapeHtml(ms.description)}
                                </strong>
                                —
                                <strong>
                                    ${escapeHtml(formatEth(ms.amount))} ETH
                                </strong>
                            </div>

                            <div class="mono" style="margin-top:0.2rem;">
                                Получатель:
                                ${escapeHtml(formatAddress(ms.recipient))}
                            </div>

                            ${
                                ms.evidenceSubmitted
                                    ? `
                                        <div
                                            class="mono"
                                            style="margin-top:0.25rem;"
                                        >
                                            Отчёт:
                                            ${escapeHtml(ms.evidenceURI)}

                                            <br>

                                            Hash:
                                            ${escapeHtml(shortAddr(ms.evidenceHash))}
                                        </div>
                                    `
                                    : ""
                            }

                            <div style="margin-top:0.35rem;">
                                <span class="badge badge-gray">
                                    Подтверждения:
                                    ${formatApprovalCount(approvalCount)}
                                </span>
                            </div>

                        </div>

                        <div>
                            ${btnHtml}
                        </div>

                    </div>
                `;
            }
        }

        container.innerHTML = html ||
            `
                <p style="color:var(--text-muted);">
                    Этапов финансирования пока нет.
                </p>
            `;

    } catch (err) {
        console.error(
            "Ошибка загрузки очереди валидаторов:",
            err
        );

        container.innerHTML = `
            <p style="color:red;">
                Ошибка загрузки очереди валидаторов:
                ${escapeHtml(getErrorMessage(err))}
            </p>
        `;
    }
}


// ======================================================
// 5. ПОДТВЕРЖДЕНИЕ ВЫПЛАТЫ ПО ЭТАПУ
// ======================================================

async function approveMs(reqId, msId) {
    try {
        ensureValidator();

        if (!milestonesContract) {
            throw new Error(
                "Контракт RescueMilestones не инициализирован."
            );
        }

        /*
         * approveMilestone находится в RescueMilestones.
         * RescueDAO для этого вызова не используется.
         */
        const tx = await milestonesContract.approveMilestone(
            reqId,
            msId
        );

        alert(
            "Подтверждение отправлено в блокчейн. " +
            "После получения двух подтверждений выплата будет выполнена."
        );

        const receipt = await tx.wait();

        if (!receipt || receipt.status !== 1) {
            throw new Error(
                "Транзакция подтверждения не была выполнена."
            );
        }

        alert("Подтверждение успешно записано!");

        // Обновляем очередь и историю событий.
        await Promise.all([
            loadValidatorQueue(),
            loadAuditHistory()
        ]);

    } catch (err) {
        console.error(
            "Ошибка подтверждения этапа:",
            err
        );

        alert(
            "Ошибка подтверждения: " +
            getErrorMessage(err)
        );
    }
}


// ======================================================
// 6. ЖУРНАЛ СОБЫТИЙ DAO
// ======================================================

async function loadAuditHistory() {
    const timeline =
        document.getElementById("auditTimeline");

    if (!timeline) {
        console.error(
            "Не найден элемент auditTimeline."
        );
        return;
    }

    try {
        if (!provider) {
            throw new Error(
                "Provider не инициализирован."
            );
        }

        if (
            !contract ||
            !treasuryContract ||
            !milestonesContract
        ) {
            throw new Error(
                "Не все контракты для загрузки истории инициализированы."
            );
        }

        timeline.innerHTML = `
            <p style="color:var(--text-muted);">
                Загрузка истории операций...
            </p>
        `;

        const currentBlock =
            await provider.getBlockNumber();

        // Адреса и ABI фактически используемых контрактов.
        const sources = [
            {
                name: "DAO",
                address: await contract.getAddress(),
                iface: contract.interface
            },
            {
                name: "Treasury",
                address: await treasuryContract.getAddress(),
                iface: treasuryContract.interface
            },
            {
                name: "Milestones",
                address: await milestonesContract.getAddress(),
                iface: milestonesContract.interface
            }
        ];

        const allLogs = [];

        /*
         * Получаем логи небольшими диапазонами блоков.
         * Это надёжнее, чем один большой запрос getLogs().
         */
        const CHUNK_SIZE = 2000;

        for (
            let startBlock = 0;
            startBlock <= currentBlock;
            startBlock += CHUNK_SIZE
        ) {
            const endBlock = Math.min(
                startBlock + CHUNK_SIZE - 1,
                currentBlock
            );

            const chunkResults = await Promise.all(
                sources.map(async source => {
                    const logs = await provider.getLogs({
                        address: source.address,
                        fromBlock: startBlock,
                        toBlock: endBlock
                    });

                    return logs.map(log => ({
                        ...log,
                        source: source.name,
                        iface: source.iface
                    }));
                })
            );

            for (const logs of chunkResults) {
                allLogs.push(...logs);
            }
        }


        // =================================================
        // ДЕКОДИРОВАНИЕ СОБЫТИЙ
        // =================================================

        const records = [];

        function addRecord(log, tag, cls, desc, type) {
            records.push({
                block: log.blockNumber,
                txHash: log.transactionHash,
                tag,
                cls,
                desc,
                type
            });
        }


        for (const log of allLogs) {
            let event;

            try {
                event = log.iface.parseLog({
                    topics: log.topics,
                    data: log.data
                });

            } catch (err) {
                console.warn(
                    "Не удалось декодировать событие:",
                    log.source,
                    log.transactionHash,
                    err.message
                );

                continue;
            }

            if (!event) continue;

            const a = event.args;


            // ---------------------------------------------
            // RESCUE DAO
            // ---------------------------------------------

            if (log.source === "DAO") {

                switch (event.name) {

                    case "DonationReceived":
                        addRecord(
                            log,
                            "Пополнение общего фонда",
                            "badge-green",
                            `Донор ${formatAddress(a.donor)} внёс ${formatEth(a.amount)} ETH в общий фонд`,
                            "general-donation"
                        );
                        break;


                    case "RequestDonationReceived":
                        addRecord(
                            log,
                            "Целевое пожертвование",
                            "badge-green",
                            `Донор ${formatAddress(a.donor)} внёс ${formatEth(a.amount)} ETH на заявку #${a.requestId}`,
                            "request-donation"
                        );
                        break;


                    case "AidRequestCreated":
                        addRecord(
                            log,
                            "Новая заявка",
                            "badge-blue",
                            `Заявка #${a.requestId} (${a.animalName}) создана на сумму ${formatEth(a.requestedAmount)} ETH. Заявитель: ${formatAddress(a.requester)}`,
                            "request-created"
                        );
                        break;


                    case "VoteCast":
                        addRecord(
                            log,
                            "Голос DAO",
                            "badge-gray",
                            `Участник ${formatAddress(a.voter)} проголосовал ${a.support ? "ЗА" : "ПРОТИВ"} по заявке #${a.requestId}. Голоса: ${a.yesVotes} за, ${a.noVotes} против`,
                            "vote"
                        );
                        break;


                    case "AidRequestFinalized": {
                        const status = Number(a.status);
                        const approved = status === 1;

                        addRecord(
                            log,
                            "Итог голосования DAO",
                            approved ? "badge-green" : "badge-red",
                            approved
                                ? `Заявка #${a.requestId} одобрена DAO. Зарезервировано ${formatEth(a.reservedAmount)} ETH`
                                : `Заявка #${a.requestId} не одобрена DAO`,
                            "request-finalized"
                        );

                        break;
                    }


                    case "AidRequestCancelled":
                        addRecord(
                            log,
                            "Отмена заявки",
                            "badge-gray",
                            `Заявка #${a.requestId} отменена. Возвращено в доступный баланс ${formatEth(a.returnedToAvailableBalance)} ETH`,
                            "request-cancelled"
                        );
                        break;


                    case "PassportMinted":
                        addRecord(
                            log,
                            "Выпуск NFT-паспорта",
                            "badge-blue",
                            `Для заявки #${a.requestId} выпущен NFT-паспорт №${a.tokenId}. Владелец: ${formatAddress(a.owner)}`,
                            "passport-minted"
                        );
                        break;
                }
            }


            // ---------------------------------------------
            // RESCUE TREASURY
            // ---------------------------------------------

            if (log.source === "Treasury") {

                switch (event.name) {

                    case "DonationReceived":
                        /*
                         * Аналогичное событие уже может быть
                         * отражено в RescueDAO.
                         * Дубликат будет удалён ниже.
                         */
                        addRecord(
                            log,
                            "Пополнение общего фонда",
                            "badge-green",
                            `В общий фонд поступило ${formatEth(a.amount)} ETH. Всего внесено: ${formatEth(a.totalDonated)} ETH`,
                            "treasury-general-donation"
                        );
                        break;


                    case "RequestDonationReceived":
                        addRecord(
                            log,
                            "Целевое пожертвование",
                            "badge-green",
                            `На заявку #${a.requestId} поступило ${formatEth(a.amount)} ETH. Всего целевых пожертвований: ${formatEth(a.totalRequestDonations)} ETH`,
                            "treasury-request-donation"
                        );
                        break;


                    case "TargetFundsReserved":
                        addRecord(
                            log,
                            "Резерв целевых средств",
                            "badge-blue",
                            `Для заявки #${a.requestId} зарезервировано ${formatEth(a.amount)} ETH из целевых пожертвований`,
                            "target-reserved"
                        );
                        break;


                    case "GeneralFundsReserved":
                        addRecord(
                            log,
                            "Резерв общего фонда",
                            "badge-blue",
                            `Для заявки #${a.requestId} зарезервировано ${formatEth(a.amount)} ETH из общего фонда`,
                            "general-reserved"
                        );
                        break;


                    case "TargetFundsReassigned":
                        addRecord(
                            log,
                            "Перераспределение средств",
                            "badge-gray",
                            `Для заявки #${a.requestId} перераспределено ${formatEth(a.amount)} ETH целевых средств`,
                            "target-reassigned"
                        );
                        break;


                    case "FundsReleased":
                        addRecord(
                            log,
                            "Выплата по этапу",
                            "badge-green",
                            `Заявка #${a.requestId}, этап #${a.milestoneId}: переведено ${formatEth(a.amount)} ETH получателю ${formatAddress(a.recipient)}`,
                            "funds-released"
                        );
                        break;


                    case "FundsReleasedBySource":
                        addRecord(
                            log,
                            "Источники выплаты",
                            "badge-green",
                            `Заявка #${a.requestId}, этап #${a.milestoneId}: из целевых средств выплачено ${formatEth(a.targetAmount)} ETH, из общего фонда — ${formatEth(a.generalAmount)} ETH`,
                            "funds-released-source"
                        );
                        break;


                    case "ReservationReleased":
                        addRecord(
                            log,
                            "Освобождение резерва",
                            "badge-gray",
                            `Заявка #${a.requestId}: освобождено ${formatEth(a.generalAmount)} ETH из общего фонда и ${formatEth(a.targetAmount)} ETH целевых средств`,
                            "reservation-released"
                        );
                        break;
                }
            }


            // ---------------------------------------------
            // RESCUE MILESTONES
            // ---------------------------------------------

            if (log.source === "Milestones") {

                switch (event.name) {

                    case "MilestoneCreated":
                        addRecord(
                            log,
                            "Создание этапа",
                            "badge-blue",
                            `Заявка #${a.requestId}, этап #${a.milestoneId}: ${a.description}. Сумма: ${formatEth(a.amount)} ETH. Получатель: ${formatAddress(a.recipient)}`,
                            "milestone-created"
                        );
                        break;


                    case "MilestoneEvidenceSubmitted":
                        addRecord(
                            log,
                            "Отчёт по этапу",
                            "badge-blue",
                            `Заявка #${a.requestId}, этап #${a.milestoneId}: отправлено подтверждение выполнения`,
                            "evidence-submitted"
                        );
                        break;


                    case "MilestoneApproved":
                        addRecord(
                            log,
                            "Подтверждение валидатора",
                            "badge-green",
                            `Заявка #${a.requestId}, этап #${a.milestoneId}: валидатор ${formatAddress(a.validator)} подтвердил этап. Подтверждений: ${a.approvalCount}`,
                            "milestone-approved"
                        );
                        break;


                    case "MilestoneFundsReleased":
                        addRecord(
                            log,
                            "Выплата по этапу",
                            "badge-green",
                            `Заявка #${a.requestId}, этап #${a.milestoneId}: выплачено ${formatEth(a.amount)} ETH получателю ${formatAddress(a.recipient)}`,
                            "milestone-funds-released"
                        );
                        break;
                }
            }
        }


        // =================================================
        // УДАЛЕНИЕ ДУБЛЕЙ
        // =================================================

        /*
         * Одно пожертвование может создавать события
         * одновременно в DAO и Treasury.
         *
         * Оставляем событие DAO, а событие Treasury
         * используем как резервный вариант.
         */

        const daoGeneralDonations = new Set(
            records
                .filter(r => r.type === "general-donation")
                .map(r => r.txHash)
        );

        const daoRequestDonations = new Set(
            records
                .filter(r => r.type === "request-donation")
                .map(r => r.txHash)
        );

        const filteredRecords = records.filter(record => {

            if (
                record.type === "treasury-general-donation" &&
                daoGeneralDonations.has(record.txHash)
            ) {
                return false;
            }

            if (
                record.type === "treasury-request-donation" &&
                daoRequestDonations.has(record.txHash)
            ) {
                return false;
            }

            return true;
        });


        // =================================================
        // ОБЪЕДИНЕНИЕ СОБЫТИЙ ОДНОЙ ТРАНЗАКЦИИ
        // =================================================

        /*
         * Например, финализация заявки может одновременно
         * породить события DAO и Treasury.
         * Объединяем их в одну карточку истории.
         */

        const grouped = new Map();

        for (const record of filteredRecords) {
            const key = record.txHash;

            if (!grouped.has(key)) {
                grouped.set(key, {
                    block: record.block,
                    txHash: record.txHash,
                    records: []
                });
            }

            grouped.get(key).records.push(record);
        }


        const allEvents = Array.from(grouped.values()).map(group => {
            const items = group.records;

            // Приоритет типов событий для заголовка карточки.
            const priority = [
                "general-donation",
                "request-donation",
                "request-created",
                "request-finalized",
                "request-cancelled",
                "vote",
                "passport-minted",
                "milestone-created",
                "evidence-submitted",
                "milestone-approved",
                "funds-released",
                "milestone-funds-released",
                "target-reserved",
                "general-reserved",
                "target-reassigned",
                "reservation-released"
            ];

            const main = items.slice().sort((a, b) => {
                const indexA = priority.indexOf(a.type);
                const indexB = priority.indexOf(b.type);

                return (
                    (indexA === -1 ? 999 : indexA) -
                    (indexB === -1 ? 999 : indexB)
                );
            })[0];

            // Убираем одинаковые описания внутри транзакции.
            const descriptions = [
                ...new Set(items.map(item => item.desc))
            ];

            const tags = [
                ...new Set(items.map(item => item.tag))
            ];

            return {
                block: group.block,
                txHash: group.txHash,
                tag: tags.join(" · "),
                cls: main.cls,
                desc: descriptions.join(". ")
            };
        });


        // Сначала самые новые операции.
        allEvents.sort((a, b) => {
            return b.block - a.block;
        });


        // =================================================
        // ОТОБРАЖЕНИЕ ИСТОРИИ
        // =================================================

        if (allEvents.length === 0) {
            timeline.innerHTML = `
                <p style="color:var(--text-muted);">
                    Событий в блокчейне пока нет.
                </p>
            `;

            return;
        }

        timeline.innerHTML = allEvents.map(ev => {

            const explorerUrl =
                getExplorerTransactionUrl(ev.txHash);

            const txElement = explorerUrl
                ? `
                    <a
                        href="${escapeHtml(explorerUrl)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="tx-link"
                    >
                        Транзакция ↗
                    </a>
                `
                : `
                    <span
                        class="tx-link"
                        title="${escapeHtml(ev.txHash)}"
                    >
                        ${escapeHtml(shortAddr(ev.txHash))}
                    </span>
                `;

            return `
                <div class="list-item">

                    <div>

                        <span
                            class="badge ${escapeHtml(ev.cls)}"
                            style="margin-right:0.5rem;"
                        >
                            ${escapeHtml(ev.tag)}
                        </span>

                        <span>
                            ${escapeHtml(ev.desc)}
                        </span>

                        <div
                            class="mono"
                            style="margin-top:0.25rem;"
                        >
                            Блок: ${Number(ev.block)}
                        </div>

                    </div>

                    ${txElement}

                </div>
            `;
        }).join("");

        console.log(
            `История загружена: ${allLogs.length} логов, ` +
            `${allEvents.length} транзакций с событиями`
        );

    } catch (err) {
        console.error(
            "Ошибка загрузки истории DAO:",
            err
        );

        timeline.innerHTML = `
            <p style="color:red;">
                Не удалось загрузить события блокчейна:
                ${escapeHtml(getErrorMessage(err))}
            </p>
        `;
    }
}
