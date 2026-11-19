
window.addEventListener("DOMContentLoaded", async () => {
    try {
        const ready = await initWeb3();
        if (!ready) return;

        // Показываем панель администратора только администратору DAO
        if (userRoles.isAdmin) {
            const adminPanel = document.getElementById("adminPanel");
            if (adminPanel) {
                adminPanel.style.display = "block";
            }
        }

        await Promise.all([
            loadValidatorQueue(),
            loadAuditHistory()
        ]);

    } catch (err) {
        console.error("Ошибка инициализации страницы:", err);
    }
});


// ======================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ======================================================

// Безопасное отображение текста, полученного из блокчейна
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


// Форматирование адреса
function formatAddress(address) {
    if (!address) return "Не указан";

    return shortAddr(address);
}


// Форматирование количества подтверждений
function formatApprovalCount(count) {
    return `${Number(count)}/2`;
}


// ======================================================
// РЕГИСТРАЦИЯ УЧАСТНИКА DAO
// ======================================================

async function registerMember() {
    const input = document.getElementById("newMemberAddress");

    if (!input) {
        alert("Не найдено поле для Ethereum-адреса.");
        return;
    }

    const addr = input.value.trim();

    if (!ethers.isAddress(addr)) {
        alert("Введите корректный Ethereum-адрес (0x...)");
        return;
    }

    if (!userRoles.isAdmin) {
        alert("Только администратор DAO может регистрировать участников.");
        return;
    }

    try {
        const tx = await contract.setMember(addr, true);

        alert("Регистрируем участника DAO...");

        await tx.wait();

        alert("Участник успешно зарегистрирован!");

        input.value = "";

    } catch (err) {
        console.error("Ошибка регистрации участника:", err);

        alert(
            "Ошибка регистрации: " +
            (err.reason || err.shortMessage || err.message)
        );
    }
}


// ======================================================
// ОЧЕРЕДЬ ЭТАПОВ ДЛЯ ВАЛИДАТОРОВ
// ======================================================

async function loadValidatorQueue() {
    const container = document.getElementById("milestonesQueue");

    if (!container) {
        console.error("Не найден элемент milestonesQueue");
        return;
    }

    try {
        const count = Number(await contract.requestCount());

        let html = "";

        for (let i = 1; i <= count; i++) {

            const [info, stats] = await Promise.all([
                contract.getAidRequestInfo(i),
                contract.getAidRequestStats(i)
            ]);

            const mCount = Number(stats.milestoneCount);

            for (let m = 1; m <= mCount; m++) {

                const ms = await contract.getMilestone(i, m);

                const alreadyApproved = userAddress && userRoles.isValidator
                    ? await contract.hasValidatorApproved(i, m, userAddress)
                    : false;

                const approvalCount = Number(ms.approvalCount);

                let btnHtml = "";

                // Этап уже оплачен
                if (ms.released) {

                    btnHtml = `
                        <span class="badge badge-green">
                            Выплачено (2/2)
                        </span>
                    `;

                // Приют ещё не загрузил отчёт
                } else if (!ms.evidenceSubmitted) {

                    btnHtml = `
                        <span class="badge badge-yellow">
                            Нет отчёта от приюта
                        </span>
                    `;

                // Пользователь не является валидатором
                } else if (!userRoles.isValidator) {

                    btnHtml = `
                        <span class="badge badge-gray">
                            Только для валидаторов
                        </span>
                    `;

                // Текущий валидатор уже подтвердил этап
                } else if (alreadyApproved) {

                    btnHtml = `
                        <button class="btn btn-outline" disabled>
                            Подтверждено вами (${formatApprovalCount(approvalCount)})
                        </button>
                    `;

                // Этап уже получил все необходимые подтверждения
                } else if (approvalCount >= 2) {

                    btnHtml = `
                        <span class="badge badge-green">
                            Ожидается выплата
                        </span>
                    `;

                // Можно подтвердить этап
                } else {

                    btnHtml = `
                        <button
                            class="btn btn-primary"
                            onclick="approveMs(${i}, ${m})"
                        >
                            Подтвердить выплату (${formatApprovalCount(approvalCount)})
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
                                    ${escapeHtml(ethers.formatEther(ms.amount))} ETH
                                </strong>
                            </div>

                            <div class="mono" style="margin-top:0.2rem;">
                                Получатель:
                                ${escapeHtml(formatAddress(ms.recipient))}
                            </div>

                            ${
                                ms.evidenceSubmitted
                                    ? `
                                        <div class="mono">
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
            "<p style='color:var(--text-muted);'>Этапов финансирования пока нет.</p>";

    } catch (err) {
        console.error("Ошибка загрузки очереди валидаторов:", err);

        container.innerHTML = `
            <p style="color:red;">
                Ошибка загрузки очереди валидаторов.
            </p>
        `;
    }
}


// ======================================================
// ПОДТВЕРЖДЕНИЕ ВЫПЛАТЫ ПО ЭТАПУ
// ======================================================

async function approveMs(reqId, msId) {

    if (!userRoles.isValidator) {
        alert("Подтверждать этапы могут только валидаторы DAO.");
        return;
    }

    try {
        const tx = await contract.approveMilestone(reqId, msId);

        alert(
            "Подтверждение отправлено в блокчейн. " +
            "После получения двух подтверждений выплата будет выполнена."
        );

        await tx.wait();

        alert("Подтверждение успешно записано!");

        // Обновляем очередь и историю событий
        await Promise.all([
            loadValidatorQueue(),
            loadAuditHistory()
        ]);

    } catch (err) {
        console.error("Ошибка подтверждения этапа:", err);

        alert(
            "Ошибка подтверждения: " +
            (err.reason || err.shortMessage || err.message)
        );
    }
}


// ======================================================
// ЖУРНАЛ СОБЫТИЙ DAO
// ======================================================

async function loadAuditHistory() {

    const timeline = document.getElementById("auditTimeline");

    if (!timeline) {
        console.error("Не найден элемент auditTimeline");
        return;
    }

    try {

        // Получаем текущий номер блока
        const currentBlock = await provider.getBlockNumber();

        // Ограничиваем диапазон поиска последними 5000 блоками
        const fromBlock = Math.max(0, currentBlock - 5000);

        // Получаем события из блокчейна
        const [
            donations,
            created,
            votes,
            finalized,
            released
        ] = await Promise.all([

            contract.queryFilter(
                contract.filters.DonationReceived(),
                fromBlock,
                currentBlock
            ),

            contract.queryFilter(
                contract.filters.AidRequestCreated(),
                fromBlock,
                currentBlock
            ),

            contract.queryFilter(
                contract.filters.VoteCast(),
                fromBlock,
                currentBlock
            ),

            contract.queryFilter(
                contract.filters.AidRequestFinalized(),
                fromBlock,
                currentBlock
            ),

            contract.queryFilter(
                contract.filters.FundsReleased(),
                fromBlock,
                currentBlock
            )

        ]);


        // ----------------------------------------------
        // Формируем единый список событий
        // ----------------------------------------------

        const allEvents = [

            // Пополнения общего фонда
            ...donations.map(e => ({
                block: e.blockNumber,
                tag: "Пополнение пула",
                cls: "badge-green",

                desc:
                    `Донор ${shortAddr(e.args.donor)} ` +
                    `внёс ${ethers.formatEther(e.args.amount)} ETH ` +
                    `в общий фонд`,

                hash: e.transactionHash
            })),


            // Создание заявок
            ...created.map(e => ({
                block: e.blockNumber,
                tag: "Новая заявка",
                cls: "badge-blue",

                desc:
                    `Заявка #${e.args.requestId} ` +
                    `(${escapeHtml(e.args.animalName)}) ` +
                    `на сумму ${ethers.formatEther(e.args.requestedAmount)} ETH`,

                hash: e.transactionHash
            })),


            // Голосования участников DAO
            ...votes.map(e => ({
                block: e.blockNumber,
                tag: "Голос DAO",
                cls: "badge-gray",

                desc:
                    `Участник ${shortAddr(e.args.voter)} ` +
                    `проголосовал ${e.args.support ? "ЗА" : "ПРОТИВ"} ` +
                    `по заявке #${e.args.requestId}`,

                hash: e.transactionHash
            })),


            // Завершение голосования
            ...finalized.map(e => {

                const status = Number(e.args.status);

                const approved = status === 1;

                return {
                    block: e.blockNumber,

                    tag: "Итог DAO",

                    cls: approved ? "badge-green" : "badge-red",

                    desc: approved
                        ? (
                            `Заявка #${e.args.requestId}: ` +
                            `одобрена DAO, зарезервировано ` +
                            `${ethers.formatEther(e.args.reservedAmount)} ETH`
                        )
                        : (
                            `Заявка #${e.args.requestId}: ` +
                            `не одобрена DAO`
                        ),

                    hash: e.transactionHash
                };
            }),


            // Выплаты по этапам
            ...released.map(e => ({
                block: e.blockNumber,
                tag: "Выплата по этапу",
                cls: "badge-green",

                desc:
                    `Заявка #${e.args.requestId}, ` +
                    `этап #${e.args.milestoneId}: ` +
                    `переведено ${ethers.formatEther(e.args.amount)} ETH ` +
                    `получателю ${shortAddr(e.args.recipient)}`,

                hash: e.transactionHash
            }))

        ];


        // Сортировка: сначала самые новые события
        allEvents.sort((a, b) => b.block - a.block);


        // ----------------------------------------------
        // Если событий нет
        // ----------------------------------------------

        if (allEvents.length === 0) {

            timeline.innerHTML = `
                <p style="color:var(--text-muted);">
                    Событий в блокчейне пока нет.
                </p>
            `;

            return;
        }


        // ----------------------------------------------
        // Формируем HTML журнала
        // ----------------------------------------------

        timeline.innerHTML = allEvents.map(ev => {

            // Для локальной Geth EXPLORER_URL остаётся пустым.
            // В этом случае показываем хеш транзакции без ссылки.
            const txElement = EXPLORER_URL
                ? `
                    <a
                        href="${EXPLORER_URL}${ev.hash}"
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
                        title="${escapeHtml(ev.hash)}"
                    >
                        ${escapeHtml(shortAddr(ev.hash))}
                    </span>
                `;

            return `
                <div class="list-item">

                    <div>

                        <span
                            class="badge ${ev.cls}"
                            style="margin-right:0.5rem;"
                        >
                            ${escapeHtml(ev.tag)}
                        </span>

                        <span>
                            ${ev.desc}
                        </span>

                        <div
                            class="mono"
                            style="margin-top:0.25rem;"
                        >
                            Блок: ${ev.block}
                        </div>

                    </div>

                    ${txElement}

                </div>
            `;

        }).join("");


    } catch (err) {

        console.error("Ошибка загрузки истории DAO:", err);

        timeline.innerHTML = `
            <p style="color:var(--text-muted);">
                Не удалось загрузить события блокчейна.
            </p>
        `;
    }
}
