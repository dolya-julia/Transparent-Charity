// ======================================================
// 1. ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ
// ======================================================

window.addEventListener("DOMContentLoaded", async () => {
    try {
        const ready = await initWeb3();

        if (!ready) return;

        if (
            !contract ||
            !daoViewContract ||
            !milestonesContract ||
            !treasuryContract
        ) {
            throw new Error(
                "Не все контракты DAO инициализированы. Проверьте wallet.js."
            );
        }

        if (!userRoles) {
            throw new Error("Не удалось получить роли пользователя.");
        }

        const adminAddress = await contract.admin();

        userRoles.isAdmin =
            Boolean(userAddress) &&
            adminAddress.toLowerCase() === userAddress.toLowerCase();

        console.log("Адрес администратора DAO:", adminAddress);
        console.log("Текущий пользователь:", userAddress);
        console.log("Роль администратора:", userRoles.isAdmin);
        console.log("Роль валидатора:", userRoles.isValidator);

        const adminPanel = document.getElementById("adminPanel");

        if (adminPanel) {
            adminPanel.style.display =
                userRoles.isAdmin ? "block" : "none";
        }

        const loadingTasks = [
            loadValidatorQueue(),
            loadAuditHistory()
        ];

        if (userRoles.isAdmin) {
            loadingTasks.push(loadAdminModerationQueue());
        }

        await Promise.all(loadingTasks);

    } catch (err) {
        console.error("Ошибка инициализации страницы:", err);

        alert(
            "Ошибка инициализации: " + getErrorMessage(err)
        );
    }
});


// ======================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ======================================================

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


function formatAddress(address) {
    if (!address) return "Не указан";

    return shortAddr(address);
}


function formatApprovalCount(count) {
    return `${Number(count)}/2`;
}


function formatEth(value) {
    try {
        return ethers.formatEther(value ?? 0n);
    } catch (err) {
        console.warn("Ошибка форматирования ETH:", err);

        return "0";
    }
}


function ensureWallet() {
    if (!signer) {
        throw new Error("Сначала подключите MetaMask.");
    }

    if (!userAddress) {
        throw new Error(
            "Не удалось определить адрес подключённого кошелька."
        );
    }
}


function ensureAdmin() {
    ensureWallet();

    if (!userRoles?.isAdmin) {
        throw new Error(
            "Это действие доступно только администратору DAO."
        );
    }
}


function ensureValidator() {
    ensureWallet();

    if (!userRoles?.isValidator) {
        throw new Error(
            "Это действие доступно только валидаторам DAO."
        );
    }
}


function requireMethod(instance, methodName, contractName) {
    if (!instance) {
        throw new Error(`${contractName} не инициализирован.`);
    }

    if (typeof instance[methodName] !== "function") {
        throw new Error(
            `В ABI ${contractName} отсутствует функция ${methodName}().`
        );
    }
}


function getExplorerTransactionUrl(txHash) {
    if (!EXPLORER_URL || !txHash) return "";

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
        console.warn("Некорректный EXPLORER_URL:", err);

        return "";
    }
}


// Новая система статусов RescueDAO:
//
// 0 — UnderReview
// 1 — ChangesRequested
// 2 — Approved
// 3 — Rejected
// 4 — Completed
// 5 — Cancelled

const ADMIN_REQUEST_STATUSES = {
    UNDER_REVIEW: 0,
    CHANGES_REQUESTED: 1,
    APPROVED: 2,
    REJECTED: 3,
    COMPLETED: 4,
    CANCELLED: 5
};


function getEventArg(args, name, index, fallback = undefined) {
    if (args && name && args[name] !== undefined) {
        return args[name];
    }

    if (
        args &&
        index !== undefined &&
        args[index] !== undefined
    ) {
        return args[index];
    }

    return fallback;
}


// Получение поля из структуры Solidity.
// Поддерживает именованные поля ethers и индексы Result.

function getStructField(
    value,
    name,
    index,
    fallback = undefined
) {
    if (value && value[name] !== undefined) {
        return value[name];
    }

    if (value && value[index] !== undefined) {
        return value[index];
    }

    return fallback;
}


function getContractEvents(iface) {
    if (!iface) return [];

    return iface.fragments
        .filter(fragment => fragment.type === "event")
        .map(fragment => fragment.format("full"));
}


// ======================================================
// 3. ПОЛУЧЕНИЕ СОСТОЯНИЯ ФИНАНСИРОВАНИЯ ЭТАПА
// ======================================================

async function getMilestoneFunding(requestId, milestoneId) {
    requireMethod(
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
        funded: Boolean(
            getStructField(result, "funded", 0, false)
        ),

        targetReserved: BigInt(
            getStructField(result, "targetReserved", 1, 0n)
        ),

        generalReserved: BigInt(
            getStructField(result, "generalReserved", 2, 0n)
        ),

        released: Boolean(
            getStructField(result, "released", 3, false)
        )
    };
}


// ======================================================
// 4. РЕГИСТРАЦИЯ УЧАСТНИКА DAO
// ======================================================

async function registerMember() {
    const input = document.getElementById("newMemberAddress");

    if (!input) {
        alert("Не найдено поле для Ethereum-адреса.");
        return;
    }

    const addr = input.value.trim();

    if (
        !ethers.isAddress(addr) ||
        addr.toLowerCase() === ethers.ZeroAddress.toLowerCase()
    ) {
        alert("Введите корректный Ethereum-адрес (0x...).");
        return;
    }

    try {
        ensureAdmin();

        requireMethod(contract, "setMember", "RescueDAO");

        const tx = await contract.setMember(addr, true);

        alert("Регистрируем участника DAO...");

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция регистрации не подтверждена."
            );
        }

        alert("Участник успешно зарегистрирован!");

        input.value = "";

    } catch (err) {
        console.error("Ошибка регистрации участника:", err);

        alert(
            "Ошибка регистрации: " + getErrorMessage(err)
        );
    }
}


// ======================================================
// 5. ПОЛУЧЕНИЕ ДАННЫХ ЗАЯВКИ ИЗ RESCUEDAO
// ======================================================

async function getDaoRequest(requestId) {
    requireMethod(
        contract,
        "getRequestCore",
        "RescueDAO"
    );

    requireMethod(
        contract,
        "getRequestTextAndMeta",
        "RescueDAO"
    );

    requireMethod(
        contract,
        "getRequestFinancialStats",
        "RescueDAO"
    );

    const [
        core,
        textMeta,
        financial
    ] = await Promise.all([
        contract.getRequestCore(requestId),
        contract.getRequestTextAndMeta(requestId),
        contract.getRequestFinancialStats(requestId)
    ]);

    // Получение причины возврата на доработку.
    // Функция должна присутствовать в обновлённом ABI RescueDAO.

    let changeRequestReason = "";

    if (
        typeof contract.getRequestChangeReason === "function"
    ) {
        try {
            changeRequestReason =
                await contract.getRequestChangeReason(requestId);

        } catch (err) {
            console.warn(
                `Не удалось получить причину доработки заявки #${requestId}:`,
                err
            );
        }
    }

    return {
        id: Number(requestId),

        // getRequestCore:
        // requester, requestedAmount, status, exists

        requester:
            core.requester ?? core[0],

        requestedAmount:
            core.requestedAmount ?? core[1],

        status: Number(
            core.status ?? core[2]
        ),

        exists: Boolean(
            core.exists ?? core[3]
        ),

        // getRequestTextAndMeta

        animalName:
            textMeta.animalName ?? textMeta[0],

        description:
            textMeta.description ?? textMeta[1],

        evidenceURI:
            textMeta.evidenceURI ?? textMeta[2],

        evidenceHash:
            textMeta.evidenceHash ?? textMeta[3],

        // Причина возврата заявки на доработку

        changeRequestReason:
            String(changeRequestReason ?? ""),

        // getRequestFinancialStats:
        // requestedAmount, milestoneTotal, releasedAmount,
        // milestoneCount, completedMilestones, status

        milestoneTotal:
            financial.milestoneTotal ?? financial[1],

        releasedAmount:
            financial.releasedAmount ?? financial[2],

        milestoneCount:
            financial.milestoneCount ?? financial[3],

        completedMilestones:
            financial.completedMilestones ?? financial[4]
    };
}


// ======================================================
// 6. ОЧЕРЕДЬ МОДЕРАЦИИ ЗАЯВОК
// ======================================================

async function loadAdminModerationQueue() {
    const container =
        document.getElementById("adminModerationQueue") ||
        document.getElementById("moderationQueue") ||
        document.getElementById("adminRequestsQueue");

    if (!container) {
        console.error(
            "Не найден контейнер очереди модерации."
        );

        return;
    }

    try {
        ensureAdmin();

        requireMethod(
            contract,
            "requestCount",
            "RescueDAO"
        );

        container.innerHTML = `
            <p style="color:var(--text-muted);">
                Загрузка заявок на модерацию...
            </p>
        `;

        const requestCount =
            Number(await contract.requestCount());

        console.log("Всего заявок:", requestCount);

        if (requestCount === 0) {
            container.innerHTML = `
                <p style="color:var(--text-muted);">
                    Заявок пока нет.
                </p>
            `;

            return;
        }

        const requests = [];

        for (let i = 1; i <= requestCount; i++) {
            try {
                const request = await getDaoRequest(i);

                if (!request.exists) continue;

                if (
                    request.status !==
                        ADMIN_REQUEST_STATUSES.UNDER_REVIEW &&
                    request.status !==
                        ADMIN_REQUEST_STATUSES.CHANGES_REQUESTED
                ) {
                    continue;
                }

                requests.push(request);

            } catch (err) {
                console.error(
                    `Ошибка загрузки заявки #${i}:`,
                    err
                );
            }
        }

        if (requests.length === 0) {
            container.innerHTML = `
                <p style="color:var(--text-muted);">
                    Заявок, ожидающих модерации, нет.
                </p>
            `;

            return;
        }

        container.innerHTML = requests.map(request => {
            const isUnderReview =
                request.status ===
                ADMIN_REQUEST_STATUSES.UNDER_REVIEW;

            const statusText = isUnderReview
                ? "Ожидает проверки"
                : "Возвращена на доработку";

            const statusClass = isUnderReview
                ? "badge-yellow"
                : "badge-blue";

            const hasEvidence =
                request.evidenceURI &&
                request.evidenceURI.trim() !== "";

            const hasHash =
                request.evidenceHash &&
                request.evidenceHash !==
                    "0x" + "0".repeat(64);

            const milestonesMatch =
                BigInt(request.milestoneTotal) ===
                BigInt(request.requestedAmount);

            const hasMilestones =
                Number(request.milestoneCount) > 0;

            // Причина возврата заявки.
            const reasonHtml =
                request.changeRequestReason.trim() !== ""
                    ? `
                        <div style="
                            margin-top:0.75rem;
                            padding:0.85rem;
                            border-left:3px solid #d97706;
                            background:rgba(217,119,6,0.08);
                            border-radius:0.35rem;
                        ">
                            <strong>
                                Причина возврата на доработку:
                            </strong>

                            <div style="
                                margin-top:0.35rem;
                                white-space:pre-wrap;
                            ">
                                ${escapeHtml(
                                    request.changeRequestReason
                                )}
                            </div>
                        </div>
                    `
                    : (
                        !isUnderReview
                            ? `
                                <p style="
                                    color:var(--text-muted);
                                    font-size:0.85rem;
                                    margin-top:0.5rem;
                                ">
                                    Причина возврата не указана
                                    или отсутствует в сохранённых данных.
                                </p>
                            `
                            : ""
                    );

            return `
                <div class="list-item admin-request-item">
                    <div style="width:100%;">

                        <div style="
                            display:flex;
                            gap:0.5rem;
                            flex-wrap:wrap;
                            margin-bottom:0.75rem;
                        ">
                            <span class="badge badge-blue">
                                Заявка #${request.id}
                            </span>

                            <span class="badge ${statusClass}">
                                ${statusText}
                            </span>
                        </div>

                        <h3 style="margin:0 0 0.5rem;">
                            ${escapeHtml(
                                request.animalName || "Без названия"
                            )}
                        </h3>

                        <div style="margin-bottom:0.4rem;">
                            <strong>Запрашиваемая сумма:</strong>
                            ${escapeHtml(
                                formatEth(request.requestedAmount)
                            )} ETH
                        </div>

                        <div style="margin-bottom:0.4rem;">
                            <strong>Заявитель:</strong>

                            <span class="mono">
                                ${escapeHtml(
                                    formatAddress(request.requester)
                                )}
                            </span>
                        </div>

                        <div style="margin-bottom:0.4rem;">
                            <strong>Описание:</strong>

                            <div style="margin-top:0.25rem;">
                                ${escapeHtml(
                                    request.description ||
                                    "Описание отсутствует"
                                )}
                            </div>
                        </div>

                        ${reasonHtml}

                        <div style="margin-bottom:0.4rem;">
                            <strong>Количество этапов:</strong>
                            ${Number(request.milestoneCount)}
                        </div>

                        <div style="margin-bottom:0.4rem;">
                            <strong>Сумма этапов:</strong>

                            ${escapeHtml(
                                formatEth(request.milestoneTotal)
                            )} ETH

                            ${
                                !hasMilestones
                                    ? `
                                        <span class="badge badge-yellow">
                                            Этапы не добавлены
                                        </span>
                                    `
                                    : milestonesMatch
                                        ? `
                                            <span class="badge badge-green">
                                                Сумма совпадает
                                            </span>
                                        `
                                        : `
                                            <span class="badge badge-red">
                                                Сумма не совпадает
                                            </span>
                                        `
                            }
                        </div>

                        <div style="margin-bottom:0.4rem;">
                            <strong>Подтверждающие материалы:</strong>

                            ${
                                hasEvidence
                                    ? `
                                        <a
                                            href="${escapeHtml(
                                                request.evidenceURI
                                            )}"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Открыть материалы
                                        </a>
                                    `
                                    : `<span>Не приложены</span>`
                            }
                        </div>

                        ${
                            hasHash
                                ? `
                                    <div
                                        class="mono"
                                        style="word-break:break-all;"
                                    >
                                        <strong>Хеш материалов:</strong>
                                        ${escapeHtml(
                                            request.evidenceHash
                                        )}
                                    </div>
                                `
                                : ""
                        }

                        ${
                            isUnderReview
                                ? `
                                    <div style="
                                        display:flex;
                                        gap:0.75rem;
                                        flex-wrap:wrap;
                                        margin-top:1rem;
                                        padding-top:1rem;
                                        border-top:1px solid var(--border);
                                    ">

                                        <button
                                            type="button"
                                            class="btn btn-primary"
                                            onclick="publishAdminRequest(${request.id})"
                                            ${
                                                !hasMilestones ||
                                                !milestonesMatch
                                                    ? "disabled"
                                                    : ""
                                            }
                                        >
                                            Одобрить и опубликовать
                                        </button>

                                        <button
                                            type="button"
                                            class="btn btn-outline"
                                            onclick="requestAdminChanges(${request.id})"
                                        >
                                            Направить на доработку
                                        </button>

                                        <button
                                            type="button"
                                            class="btn btn-outline"
                                            style="color:#dc2626;"
                                            onclick="rejectAdminRequest(${request.id})"
                                        >
                                            Отклонить заявку
                                        </button>

                                    </div>

                                    ${
                                        !hasMilestones ||
                                        !milestonesMatch
                                            ? `
                                                <p style="
                                                    color:var(--text-muted);
                                                    font-size:0.85rem;
                                                    margin-top:0.75rem;
                                                ">
                                                    Для публикации необходимо
                                                    добавить этапы и привести
                                                    их общую сумму в соответствие
                                                    с суммой заявки.
                                                </p>
                                            `
                                            : ""
                                    }
                                `
                                : `
                                    <div style="margin-top:1rem;">

                                        <span class="badge badge-yellow">
                                            Ожидается повторная отправка заявителем
                                        </span>

                                        <p style="
                                            color:var(--text-muted);
                                            font-size:0.85rem;
                                            margin-top:0.5rem;
                                        ">
                                            Заявитель должен внести изменения
                                            и повторно отправить заявку.
                                        </p>

                                        <button
                                            type="button"
                                            class="btn btn-outline"
                                            style="color:#dc2626;"
                                            onclick="rejectAdminRequest(${request.id})"
                                        >
                                            Отклонить заявку
                                        </button>

                                    </div>
                                `
                        }

                    </div>
                </div>
            `;
        }).join("");

    } catch (err) {
        console.error(
            "Ошибка загрузки очереди модерации:",
            err
        );

        container.innerHTML = `
            <p style="color:red;">
                Не удалось загрузить заявки:
                ${escapeHtml(getErrorMessage(err))}
            </p>
        `;
    }
}


// ======================================================
// 7. ОДОБРЕНИЕ И ПУБЛИКАЦИЯ ЗАЯВКИ
// ======================================================

async function publishAdminRequest(requestId) {
    try {
        ensureAdmin();

        requireMethod(
            contract,
            "publishRequest",
            "RescueDAO"
        );

        requireMethod(
            contract,
            "getMilestoneSummary",
            "RescueDAO"
        );

        const request = await getDaoRequest(requestId);

        if (!request.exists) {
            throw new Error("Заявка не существует.");
        }

        if (
            request.status !==
            ADMIN_REQUEST_STATUSES.UNDER_REVIEW
        ) {
            throw new Error(
                "Опубликовать можно только заявку, ожидающую проверки."
            );
        }

        const summary =
            await contract.getMilestoneSummary(requestId);

        const milestoneTotal =
            summary.total ?? summary[0];

        const milestoneCount =
            summary.count ?? summary[1];

        if (Number(milestoneCount) === 0) {
            throw new Error(
                "Нельзя опубликовать заявку без этапов финансирования."
            );
        }

        if (
            BigInt(milestoneTotal) !==
            BigInt(request.requestedAmount)
        ) {
            throw new Error(
                "Сумма этапов не совпадает с суммой заявки.\n" +
                `Сумма заявки: ${formatEth(request.requestedAmount)} ETH.\n` +
                `Сумма этапов: ${formatEth(milestoneTotal)} ETH.`
            );
        }

        const confirmed = confirm(
            `Одобрить и опубликовать заявку #${requestId}?\n\n` +
            `Животное: ${request.animalName}\n` +
            `Сумма: ${formatEth(request.requestedAmount)} ETH\n` +
            `Количество этапов: ${milestoneCount}\n\n` +
            `После публикации заявка получит статус Approved.\n` +
            `Станут доступны целевые пожертвования и резервирование средств этапов.\n\n` +
            `Голосование DAO не проводится.`
        );

        if (!confirmed) return;

        const tx =
            await contract.publishRequest(requestId);

        alert(
            "Транзакция публикации отправлена. Ожидаем подтверждения..."
        );

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция публикации не была успешно выполнена."
            );
        }

        alert(
            `Заявка #${requestId} успешно одобрена и опубликована.`
        );

        await Promise.all([
            loadAdminModerationQueue(),
            loadValidatorQueue(),
            loadAuditHistory()
        ]);

    } catch (err) {
        console.error(
            "Ошибка публикации заявки:",
            err
        );

        alert(
            "Не удалось одобрить заявку:\n" +
            getErrorMessage(err)
        );
    }
}


// ======================================================
// 8. ВОЗВРАТ ЗАЯВКИ НА ДОРАБОТКУ
// ======================================================

async function requestAdminChanges(requestId) {
    try {
        ensureAdmin();

        requireMethod(
            contract,
            "requestChanges",
            "RescueDAO"
        );

        const request =
            await getDaoRequest(requestId);

        if (!request.exists) {
            throw new Error("Заявка не существует.");
        }

        if (
            request.status !==
            ADMIN_REQUEST_STATUSES.UNDER_REVIEW
        ) {
            throw new Error(
                "Вернуть на доработку можно только заявку, ожидающую проверки."
            );
        }

        // Администратор указывает конкретную причину возврата.

        const reason = prompt(
            `Укажите, что именно необходимо изменить в заявке #${requestId}:\n\n` +
            `Например: дополнить описание, исправить сумму этапов, ` +
            `указать корректный адрес получателя или приложить подтверждающие материалы.`
        );

        if (reason === null) return;

        const cleanReason = reason.trim();

        if (!cleanReason) {
            throw new Error(
                "Необходимо указать причину возврата заявки."
            );
        }

        const confirmed = confirm(
            `Вернуть заявку #${requestId} на доработку?\n\n` +
            `Причина:\n${cleanReason}`
        );

        if (!confirmed) return;

        const tx = await contract.requestChanges(
            requestId,
            cleanReason
        );

        alert(
            "Запрос на доработку отправлен. Ожидаем подтверждения..."
        );

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция возврата заявки не выполнена."
            );
        }

        alert(
            `Заявка #${requestId} возвращена заявителю на доработку.\n\n` +
            `Указанная причина сохранена в блокчейне.`
        );

        await Promise.all([
            loadAdminModerationQueue(),
            loadAuditHistory()
        ]);

    } catch (err) {
        console.error(
            "Ошибка возврата заявки:",
            err
        );

        alert(
            "Не удалось вернуть заявку:\n" +
            getErrorMessage(err)
        );
    }
}


// ======================================================
// 9. ОКОНЧАТЕЛЬНОЕ ОТКЛОНЕНИЕ ЗАЯВКИ
// ======================================================

async function rejectAdminRequest(requestId) {
    try {
        ensureAdmin();

        requireMethod(
            contract,
            "rejectRequest",
            "RescueDAO"
        );

        const request =
            await getDaoRequest(requestId);

        if (!request.exists) {
            throw new Error("Заявка не существует.");
        }

        if (
            request.status !==
                ADMIN_REQUEST_STATUSES.UNDER_REVIEW &&
            request.status !==
                ADMIN_REQUEST_STATUSES.CHANGES_REQUESTED
        ) {
            throw new Error(
                "Отклонить можно только заявку на проверке " +
                "или возвращённую на доработку."
            );
        }

        const reason = prompt(
            `Укажите причину окончательного отклонения заявки #${requestId}:`
        );

        if (reason === null) return;

        const cleanReason = reason.trim();

        if (!cleanReason) {
            throw new Error(
                "Необходимо указать причину отклонения."
            );
        }

        const confirmed = confirm(
            `Окончательно отклонить заявку #${requestId}?\n\n` +
            `Причина: ${cleanReason}\n\n` +
            `Это действие нельзя отменить через обычную модерацию.`
        );

        if (!confirmed) return;

        const tx = await contract.rejectRequest(
            requestId,
            cleanReason
        );

        alert("Транзакция отклонения отправлена...");

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция отклонения не была выполнена."
            );
        }

        alert(
            `Заявка #${requestId} окончательно отклонена.`
        );

        await Promise.all([
            loadAdminModerationQueue(),
            loadAuditHistory()
        ]);

    } catch (err) {
        console.error(
            "Ошибка отклонения заявки:",
            err
        );

        alert(
            "Не удалось отклонить заявку:\n" +
            getErrorMessage(err)
        );
    }
}


// ======================================================
// 10. РЕЗЕРВИРОВАНИЕ СРЕДСТВ ДЛЯ ЭТАПА
// ======================================================

async function fundMilestone(reqId, msId) {
    try {
        ensureAdmin();

        requireMethod(
            milestonesContract,
            "fundMilestone",
            "RescueMilestones"
        );

        requireMethod(
            milestonesContract,
            "getMilestoneFundingStatus",
            "RescueMilestones"
        );

        const actualAdmin =
            await contract.admin();

        if (
            actualAdmin.toLowerCase() !==
            userAddress.toLowerCase()
        ) {
            throw new Error(
                "Подключённый адрес не является администратором DAO."
            );
        }

        const request =
            await getDaoRequest(reqId);

        if (!request.exists) {
            throw new Error("Заявка не существует.");
        }

        if (
            request.status !==
            ADMIN_REQUEST_STATUSES.APPROVED
        ) {
            throw new Error(
                "Резервировать средства можно только для одобренной заявки."
            );
        }

        const ms =
            await milestonesContract.getMilestone(
                reqId,
                msId
            );

        const amount = BigInt(
            getStructField(ms, "amount", 2, 0n)
        );

        const released = Boolean(
            getStructField(ms, "released", 5, false)
        );

        if (released) {
            throw new Error("Этот этап уже оплачен.");
        }

        const funding =
            await getMilestoneFunding(reqId, msId);

        if (funding.funded) {
            throw new Error(
                "Для этого этапа средства уже зарезервированы."
            );
        }

        if (funding.released) {
            throw new Error(
                "Этот этап уже отмечен как оплаченный."
            );
        }

        const confirmed = confirm(
            `Зарезервировать средства для этапа #${msId} заявки #${reqId}?\n\n` +
            `Сумма этапа: ${formatEth(amount)} ETH\n\n` +
            `Средства будут распределены следующим образом:\n` +
            `1. Сначала используются целевые пожертвования на заявку.\n` +
            `2. Недостающая сумма покрывается из общего фонда.\n\n` +
            `Если доступных средств недостаточно, транзакция будет отменена.`
        );

        if (!confirmed) return;

        const tx =
            await milestonesContract.fundMilestone(
                reqId,
                msId
            );

        alert(
            "Транзакция резервирования отправлена. Ожидаем подтверждения..."
        );

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция резервирования не была выполнена."
            );
        }

        alert(
            `Средства для этапа #${msId} заявки #${reqId} успешно зарезервированы.`
        );

        await Promise.all([
            loadValidatorQueue(),
            loadAuditHistory()
        ]);

    } catch (err) {
        console.error(
            "Ошибка резервирования средств этапа:",
            err
        );

        alert(
            "Не удалось зарезервировать средства:\n" +
            getErrorMessage(err)
        );
    }
}


// ======================================================
// 11. ОЧЕРЕДЬ ЭТАПОВ ДЛЯ АДМИНИСТРАТОРА И ВАЛИДАТОРОВ
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
        requireMethod(
            contract,
            "requestCount",
            "RescueDAO"
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

        container.innerHTML = `
            <p style="color:var(--text-muted);">
                Загрузка очереди этапов...
            </p>
        `;

        const count =
            Number(await contract.requestCount());

        let html = "";

        let fundingCount = 0;
        let evidenceCount = 0;

        for (let i = 1; i <= count; i++) {
            try {
                const request =
                    await getDaoRequest(i);

                if (!request.exists) continue;

                if (
                    request.status !==
                    ADMIN_REQUEST_STATUSES.APPROVED
                ) {
                    continue;
                }

                const milestoneCount =
                    Number(request.milestoneCount);

                for (
                    let m = 1;
                    m <= milestoneCount;
                    m++
                ) {
                    try {
                        const ms =
                            await milestonesContract.getMilestone(
                                i,
                                m
                            );

                        const funding =
                            await getMilestoneFunding(i, m);

                        const approvalCount = Number(
                            getStructField(
                                ms,
                                "approvalCount",
                                6,
                                0
                            )
                        );

                        const isReleased =
                            Boolean(
                                getStructField(
                                    ms,
                                    "released",
                                    5,
                                    false
                                )
                            ) ||
                            funding.released;

                        const evidenceSubmitted =
                            Boolean(
                                getStructField(
                                    ms,
                                    "evidenceSubmitted",
                                    7,
                                    false
                                )
                            );

                        const description =
                            getStructField(
                                ms,
                                "description",
                                0,
                                ""
                            );

                        const recipient =
                            getStructField(
                                ms,
                                "recipient",
                                1,
                                ""
                            );

                        const amount =
                            getStructField(
                                ms,
                                "amount",
                                2,
                                0n
                            );

                        const evidenceURI =
                            getStructField(
                                ms,
                                "evidenceURI",
                                3,
                                ""
                            );

                        const evidenceHash =
                            getStructField(
                                ms,
                                "evidenceHash",
                                4,
                                ""
                            );


                        // -----------------------------------------
                        // 11.1. ЭТАП УЖЕ ОПЛАЧЕН
                        // -----------------------------------------

                        if (isReleased) {
                            html += `
                                <div class="list-item">
                                    <div>
                                        <span class="badge badge-blue">
                                            Заявка #${i}
                                            (${escapeHtml(request.animalName)})
                                            · Этап #${m}
                                        </span>

                                        <div>
                                            <strong>
                                                ${escapeHtml(description)}
                                            </strong>
                                            —
                                            ${escapeHtml(formatEth(amount))} ETH
                                        </div>

                                        <div style="margin-top:0.4rem;">
                                            <span class="badge badge-green">
                                                Выплачено
                                                (${formatApprovalCount(approvalCount)})
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `;

                            continue;
                        }


                        // -----------------------------------------
                        // 11.2. ЭТАП ЕЩЁ НЕ ПРОФИНАНСИРОВАН
                        // -----------------------------------------

                        if (!funding.funded) {
                            fundingCount++;

                            const adminAction =
                                userRoles?.isAdmin
                                    ? `
                                        <button
                                            type="button"
                                            class="btn btn-primary"
                                            onclick="fundMilestone(${i}, ${m})"
                                        >
                                            Зарезервировать средства
                                        </button>
                                    `
                                    : `
                                        <span class="badge badge-gray">
                                            Ожидает резервирования администратором
                                        </span>
                                    `;

                            html += `
                                <div class="list-item">
                                    <div style="width:100%;">

                                        <span
                                            class="badge badge-blue"
                                            style="margin-bottom:0.35rem;"
                                        >
                                            Заявка #${i}
                                            (${escapeHtml(request.animalName)})
                                            · Этап #${m}
                                        </span>

                                        <div>
                                            <strong>
                                                ${escapeHtml(description)}
                                            </strong>
                                            —
                                            <strong>
                                                ${escapeHtml(formatEth(amount))} ETH
                                            </strong>
                                        </div>

                                        <div class="mono" style="margin-top:0.2rem;">
                                            Получатель:
                                            ${escapeHtml(formatAddress(recipient))}
                                        </div>

                                        <div style="margin-top:0.5rem;">
                                            <span class="badge badge-yellow">
                                                Ожидает финансирования
                                            </span>
                                        </div>

                                        <p style="
                                            color:var(--text-muted);
                                            font-size:0.85rem;
                                            margin-top:0.5rem;
                                        ">
                                            Средства для этого этапа ещё не
                                            зарезервированы. После резервирования
                                            заявитель сможет отправить отчёт
                                            о выполнении этапа.
                                        </p>

                                        <div style="margin-top:0.75rem;">
                                            ${adminAction}
                                        </div>

                                    </div>
                                </div>
                            `;

                            continue;
                        }


                        // -----------------------------------------
                        // 11.3. ЭТАП ПРОФИНАНСИРОВАН, НО ОТЧЁТА НЕТ
                        // -----------------------------------------

                        if (!evidenceSubmitted) {
                            html += `
                                <div class="list-item">
                                    <div>

                                        <span class="badge badge-blue">
                                            Заявка #${i}
                                            (${escapeHtml(request.animalName)})
                                            · Этап #${m}
                                        </span>

                                        <div>
                                            <strong>
                                                ${escapeHtml(description)}
                                            </strong>
                                            —
                                            <strong>
                                                ${escapeHtml(formatEth(amount))} ETH
                                            </strong>
                                        </div>

                                        <div class="mono" style="margin-top:0.2rem;">
                                            Получатель:
                                            ${escapeHtml(formatAddress(recipient))}
                                        </div>

                                        <div style="margin-top:0.5rem;">
                                            <span class="badge badge-green">
                                                Средства зарезервированы
                                            </span>

                                            <span class="badge badge-yellow">
                                                Ожидается отчёт инициатора
                                            </span>
                                        </div>

                                        <div style="
                                            margin-top:0.5rem;
                                            font-size:0.85rem;
                                            color:var(--text-muted);
                                        ">
                                            Целевые пожертвования:
                                            ${escapeHtml(formatEth(funding.targetReserved))}
                                            ETH

                                            <br>

                                            Общий фонд:
                                            ${escapeHtml(formatEth(funding.generalReserved))}
                                            ETH
                                        </div>

                                    </div>
                                </div>
                            `;

                            continue;
                        }


                        // -----------------------------------------
                        // 11.4. ОТЧЁТ ЗАГРУЖЕН, ЭТАП ОЖИДАЕТ ВАЛИДАЦИИ
                        // -----------------------------------------

                        evidenceCount++;

                        let alreadyApproved = false;

                        if (
                            userAddress &&
                            userRoles?.isValidator
                        ) {
                            requireMethod(
                                milestonesContract,
                                "hasValidatorApproved",
                                "RescueMilestones"
                            );

                            alreadyApproved =
                                await milestonesContract.hasValidatorApproved(
                                    i,
                                    m,
                                    userAddress
                                );
                        }

                        let btnHtml = "";

                        if (!userAddress) {
                            btnHtml = `
                                <span class="badge badge-gray">
                                    Подключите MetaMask
                                </span>
                            `;

                        } else if (!userRoles?.isValidator) {
                            btnHtml = `
                                <span class="badge badge-gray">
                                    Только для валидаторов
                                </span>
                            `;

                        } else if (alreadyApproved) {
                            btnHtml = `
                                <button
                                    class="btn btn-outline"
                                    disabled
                                >
                                    Подтверждено вами
                                    (${formatApprovalCount(approvalCount)})
                                </button>
                            `;

                        } else if (approvalCount >= 2) {
                            btnHtml = `
                                <span class="badge badge-green">
                                    Ожидается завершение выплаты
                                </span>
                            `;

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
                                <div style="width:100%;">

                                    <span
                                        class="badge badge-blue"
                                        style="margin-bottom:0.35rem;"
                                    >
                                        Заявка #${i}
                                        (${escapeHtml(request.animalName)})
                                        · Этап #${m}
                                    </span>

                                    <div>
                                        <strong>
                                            ${escapeHtml(description)}
                                        </strong>
                                        —
                                        <strong>
                                            ${escapeHtml(formatEth(amount))} ETH
                                        </strong>
                                    </div>

                                    <div class="mono" style="margin-top:0.2rem;">
                                        Получатель:
                                        ${escapeHtml(formatAddress(recipient))}
                                    </div>

                                    <div style="
                                        margin-top:0.5rem;
                                        display:flex;
                                        gap:0.4rem;
                                        flex-wrap:wrap;
                                    ">
                                        <span class="badge badge-green">
                                            Средства зарезервированы
                                        </span>

                                        <span class="badge badge-blue">
                                            Отчёт загружен
                                        </span>

                                        <span class="badge badge-gray">
                                            Подтверждения:
                                            ${formatApprovalCount(approvalCount)}
                                        </span>
                                    </div>

                                    <div style="
                                        margin-top:0.5rem;
                                        font-size:0.85rem;
                                        color:var(--text-muted);
                                    ">
                                        Целевые пожертвования:
                                        ${escapeHtml(formatEth(funding.targetReserved))}
                                        ETH

                                        <br>

                                        Общий фонд:
                                        ${escapeHtml(formatEth(funding.generalReserved))}
                                        ETH
                                    </div>

                                    ${
                                        evidenceURI
                                            ? `
                                                <div style="margin-top:0.5rem;">
                                                    <a
                                                        href="${escapeHtml(evidenceURI)}"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        Открыть отчёт
                                                    </a>
                                                </div>
                                            `
                                            : ""
                                    }

                                    ${
                                        evidenceHash
                                            ? `
                                                <div
                                                    class="mono"
                                                    style="
                                                        margin-top:0.25rem;
                                                        word-break:break-all;
                                                    "
                                                >
                                                    Hash:
                                                    ${escapeHtml(evidenceHash)}
                                                </div>
                                            `
                                            : ""
                                    }

                                    <div style="margin-top:0.75rem;">
                                        ${btnHtml}
                                    </div>

                                </div>
                            </div>
                        `;

                    } catch (milestoneError) {
                        console.error(
                            `Ошибка загрузки этапа #${m} заявки #${i}:`,
                            milestoneError
                        );
                    }
                }

            } catch (requestError) {
                console.error(
                    `Ошибка загрузки этапов заявки #${i}:`,
                    requestError
                );
            }
        }

        if (!html) {
            container.innerHTML = `
                <p style="color:var(--text-muted);">
                    Одобренных заявок с этапами пока нет.
                </p>
            `;

            return;
        }

        container.innerHTML = html;

        console.log("Очередь этапов загружена.");
        console.log("Ожидают финансирования:", fundingCount);
        console.log(
            "Ожидают проверки валидаторами:",
            evidenceCount
        );

    } catch (err) {
        console.error(
            "Ошибка загрузки очереди этапов:",
            err
        );

        container.innerHTML = `
            <p style="color:red;">
                Ошибка загрузки очереди:
                ${escapeHtml(getErrorMessage(err))}
            </p>
        `;
    }
}


// ======================================================
// 12. ПОДТВЕРЖДЕНИЕ ВЫПЛАТЫ ПО ЭТАПУ
// ======================================================

async function approveMs(reqId, msId) {
    try {
        ensureValidator();

        requireMethod(
            milestonesContract,
            "approveMilestone",
            "RescueMilestones"
        );

        requireMethod(
            milestonesContract,
            "getMilestoneFundingStatus",
            "RescueMilestones"
        );

        const request =
            await getDaoRequest(reqId);

        if (
            request.status !==
            ADMIN_REQUEST_STATUSES.APPROVED
        ) {
            throw new Error(
                "Подтверждать этапы можно только после одобрения заявки DAO."
            );
        }

        const ms =
            await milestonesContract.getMilestone(
                reqId,
                msId
            );

        const funding =
            await getMilestoneFunding(reqId, msId);

        if (
            Boolean(
                getStructField(ms, "released", 5, false)
            ) ||
            funding.released
        ) {
            throw new Error("Этот этап уже оплачен.");
        }

        if (!funding.funded) {
            throw new Error(
                "Нельзя подтверждать этап, для которого ещё не зарезервированы средства."
            );
        }

        const evidenceSubmitted =
            Boolean(
                getStructField(
                    ms,
                    "evidenceSubmitted",
                    7,
                    false
                )
            );

        if (!evidenceSubmitted) {
            throw new Error(
                "Инициатор ещё не загрузил отчёт по этому этапу."
            );
        }

        const alreadyApproved =
            await milestonesContract.hasValidatorApproved(
                reqId,
                msId,
                userAddress
            );

        if (alreadyApproved) {
            throw new Error(
                "Вы уже подтверждали этот этап."
            );
        }

        const approvalCount = Number(
            getStructField(ms, "approvalCount", 6, 0)
        );

        if (approvalCount >= 2) {
            throw new Error(
                "Этап уже получил необходимое количество подтверждений."
            );
        }

        const amount =
            getStructField(ms, "amount", 2, 0n);

        const confirmed = confirm(
            `Подтвердить выполнение этапа #${msId} заявки #${reqId} ` +
            `на сумму ${formatEth(amount)} ETH?\n\n` +
            `Средства для этапа уже зарезервированы. ` +
            `После необходимого количества подтверждений ` +
            `контракт выполнит выплату получателю.`
        );

        if (!confirmed) return;

        const tx =
            await milestonesContract.approveMilestone(
                reqId,
                msId
            );

        alert(
            "Подтверждение отправлено в блокчейн. " +
            "Ожидаем подтверждения транзакции..."
        );

        const receipt = await tx.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error(
                "Транзакция подтверждения не была выполнена."
            );
        }

        alert("Подтверждение успешно записано!");

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
// 13. ЖУРНАЛ СОБЫТИЙ DAO
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

        console.log(
            "========== ДИАГНОСТИКА ЖУРНАЛА =========="
        );

        console.log("Текущий блок:", currentBlock);

        console.table(
            sources.map(source => ({
                contract: source.name,
                address: source.address
            }))
        );


        // -------------------------------------------------
        // 13.1. ПРОВЕРКА BYTECODE
        // -------------------------------------------------

        const codeResults = await Promise.all(
            sources.map(async source => {
                try {
                    const code =
                        await provider.getCode(source.address);

                    return {
                        contract: source.name,
                        address: source.address,
                        hasCode: code !== "0x",
                        codeLength: code.length,
                        error: null
                    };

                } catch (err) {
                    return {
                        contract: source.name,
                        address: source.address,
                        hasCode: false,
                        codeLength: 0,
                        error: getErrorMessage(err)
                    };
                }
            })
        );

        console.log("Проверка bytecode контрактов:");
        console.table(codeResults);

        const contractsWithoutCode =
            codeResults.filter(result => !result.hasCode);

        if (contractsWithoutCode.length > 0) {
            console.error(
                "ВНИМАНИЕ! По следующим адресам не найден bytecode:",
                contractsWithoutCode
            );
        }


        // -------------------------------------------------
        // 13.2. ПРОВЕРКА ABI
        // -------------------------------------------------

        for (const source of sources) {
            const events =
                getContractEvents(source.iface);

            console.group(`ABI событий: ${source.name}`);

            console.log("Адрес:", source.address);
            console.log("Количество событий:", events.length);

            console.table(events);

            console.groupEnd();
        }


        // -------------------------------------------------
        // 13.3. ПОЛУЧЕНИЕ ЛОГОВ
        // -------------------------------------------------

        const allLogs = [];

        const logsByContract = {
            DAO: 0,
            Treasury: 0,
            Milestones: 0
        };

        const logErrors = [];

        // Создаём таблицу соответствия адресов контрактам.
        // Адреса нормализуются в нижний регистр.

        const sourceByAddress = new Map();

        for (const source of sources) {
            sourceByAddress.set(
                source.address.toLowerCase(),
                source
            );
        }

        // Не используем address в eth_getLogs:
        // в текущем RPC фильтрация по address вместе
        // с fromBlock/toBlock возвращает пустой массив.

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

            console.log(
                `Получение логов: блоки ${startBlock}–${endBlock}`
            );

            try {
                // Получаем все события диапазона без фильтра адреса.

                const logs = await provider.getLogs({
                    fromBlock: startBlock,
                    toBlock: endBlock
                });

                console.log(
                    `Получено логов за блоки ${startBlock}–${endBlock}:`,
                    logs.length
                );

                // Отбираем события только нужных контрактов
                // непосредственно в JavaScript.

                for (const log of logs) {
                    const logAddress =
                        log.address.toLowerCase();

                    const source =
                        sourceByAddress.get(logAddress);

                    // Пропускаем события посторонних контрактов.
                    if (!source) {
                        continue;
                    }

                    logsByContract[source.name]++;

                    allLogs.push({
                        blockNumber: log.blockNumber,
                        transactionHash: log.transactionHash,
                        transactionIndex: log.transactionIndex,
                        logIndex: log.index,
                        topics: log.topics,
                        data: log.data,
                        address: log.address,
                        source: source.name,
                        iface: source.iface
                    });
                }

            } catch (err) {
                const errorInfo = {
                    fromBlock: startBlock,
                    toBlock: endBlock,
                    error: getErrorMessage(err)
                };

                logErrors.push(errorInfo);

                console.error(
                    `Ошибка получения логов за блоки ` +
                    `${startBlock}–${endBlock}:`,
                    err
                );
            }
        }

        console.log(
            "========== РЕЗУЛЬТАТ ЗАГРУЗКИ ЛОГОВ =========="
        );

        console.log(
            "Всего найдено логов нужных контрактов:",
            allLogs.length
        );

        console.table([
            {
                contract: "DAO",
                logs: logsByContract.DAO
            },
            {
                contract: "Treasury",
                logs: logsByContract.Treasury
            },
            {
                contract: "Milestones",
                logs: logsByContract.Milestones
            }
        ]);

        console.log(
            "Ошибок получения логов:",
            logErrors.length
        );

        if (logErrors.length > 0) {
            console.table(logErrors);
        }


        // -------------------------------------------------
        // 13.4. ДЕКОДИРОВАНИЕ СОБЫТИЙ
        // -------------------------------------------------

        const records = [];
        const undecodedLogs = [];
        const ignoredEvents = [];

        function addRecord(
            log,
            tag,
            cls,
            desc,
            type
        ) {
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
            let event = null;

            try {
                event = log.iface.parseLog({
                    topics: log.topics,
                    data: log.data
                });

            } catch (err) {
                undecodedLogs.push({
                    source: log.source,
                    block: log.blockNumber,
                    txHash: log.transactionHash,
                    topic0: log.topics[0],
                    error: err.message
                });

                continue;
            }

            if (!event) {
                undecodedLogs.push({
                    source: log.source,
                    block: log.blockNumber,
                    txHash: log.transactionHash,
                    topic0: log.topics[0],
                    error:
                        "Событие отсутствует в ABI или сигнатура не совпадает"
                });

                continue;
            }

            const a = event.args;

            let eventWasHandled = false;


            // ---------------------------------------------
            // RESCUEDAO
            // ---------------------------------------------

            if (log.source === "DAO") {
                switch (event.name) {

                    case "DonationReceived": {
                        const donor =
                            getEventArg(a, "donor", 0);

                        const amount =
                            getEventArg(a, "amount", 1);

                        addRecord(
                            log,
                            "Пополнение общего фонда",
                            "badge-green",
                            `Донор ${formatAddress(donor)} внёс ` +
                            `${formatEth(amount)} ETH в общий фонд.`,
                            "general-donation"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "RequestDonationReceived": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const donor =
                            getEventArg(a, "donor", 1);

                        const amount =
                            getEventArg(a, "amount", 2);

                        addRecord(
                            log,
                            "Целевое пожертвование",
                            "badge-green",
                            `Донор ${formatAddress(donor)} внёс ` +
                            `${formatEth(amount)} ETH на заявку #${requestId}.`,
                            "request-donation"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "AidRequestCreated": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const requester =
                            getEventArg(a, "requester", 1);

                        const animalName =
                            getEventArg(a, "animalName", 2);

                        const requestedAmount =
                            getEventArg(a, "requestedAmount", 3);

                        const submittedAt =
                            getEventArg(a, "submittedAt", 4, 0n);

                        const submittedDate = submittedAt
                            ? new Date(
                                Number(submittedAt) * 1000
                            ).toLocaleString("ru-RU")
                            : "";

                        addRecord(
                            log,
                            "Создание заявки",
                            "badge-blue",
                            `Заявка #${requestId} (${animalName}) ` +
                            `создана на сумму ${formatEth(requestedAmount)} ETH. ` +
                            `Заявитель: ${formatAddress(requester)}. ` +
                            `Заявка направлена на проверку.` +
                            (
                                submittedDate
                                    ? ` Время отправки: ${submittedDate}.`
                                    : ""
                            ),
                            "request-created"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "AidRequestUpdated": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const requestedAmount =
                            getEventArg(a, "requestedAmount", 1);

                        addRecord(
                            log,
                            "Изменение заявки",
                            "badge-blue",
                            `Заявка #${requestId} обновлена. ` +
                            `Запрашиваемая сумма: ${formatEth(requestedAmount)} ETH.`,
                            "request-updated"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "AidRequestChangesRequested": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const reason =
                            getEventArg(a, "reason", 1, "");

                        addRecord(
                            log,
                            "Заявка возвращена на доработку",
                            "badge-yellow",
                            `Администратор запросил изменения по заявке #${requestId}.` +
                            (
                                reason
                                    ? ` Причина: ${reason}.`
                                    : ""
                            ),
                            "request-changes"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "AidRequestResubmitted": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        addRecord(
                            log,
                            "Повторная отправка заявки",
                            "badge-blue",
                            `Заявка #${requestId} повторно отправлена на проверку.`,
                            "request-resubmitted"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    // Событие публикации означает одобрение
                    // заявки администратором, а не начало голосования.

                    case "AidRequestPublished":
                    case "RequestPublished": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        addRecord(
                            log,
                            "Заявка одобрена и опубликована",
                            "badge-green",
                            `Заявка #${requestId} одобрена администратором. ` +
                            `Теперь доступны целевые пожертвования ` +
                            `и резервирование средств по этапам.`,
                            "request-published"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "AidRequestRejected":
                    case "RequestRejected": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const reason =
                            getEventArg(a, "reason", 1, "");

                        addRecord(
                            log,
                            "Заявка отклонена",
                            "badge-red",
                            `Заявка #${requestId} отклонена администратором.` +
                            (
                                reason
                                    ? ` Причина: ${reason}.`
                                    : ""
                            ),
                            "request-rejected"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "AidRequestCancelled": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const returnedAmount =
                            getEventArg(
                                a,
                                "returnedToAvailableBalance",
                                1,
                                0n
                            );

                        addRecord(
                            log,
                            "Отмена заявки",
                            "badge-gray",
                            `Заявка #${requestId} отменена. ` +
                            `Возвращено в доступный баланс ` +
                            `${formatEth(returnedAmount)} ETH.`,
                            "request-cancelled"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "AidRequestCompleted":
                    case "RequestCompleted": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        addRecord(
                            log,
                            "Заявка завершена",
                            "badge-green",
                            `Все этапы заявки #${requestId} выполнены, ` +
                            `заявка завершена.`,
                            "request-completed"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "PassportMinted": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const tokenId =
                            getEventArg(a, "tokenId", 1);

                        const owner =
                            getEventArg(a, "owner", 2);

                        addRecord(
                            log,
                            "Выпуск NFT-паспорта",
                            "badge-blue",
                            `Для заявки #${requestId} выпущен NFT-паспорт ` +
                            `№${tokenId}. Владелец: ${formatAddress(owner)}.`,
                            "passport-minted"
                        );

                        eventWasHandled = true;
                        break;
                    }
                }
            }


            // ---------------------------------------------
            // RESCUETREASURY
            // ---------------------------------------------

            if (log.source === "Treasury") {
                switch (event.name) {

                    case "DonationReceived": {
                        const donor =
                            getEventArg(a, "donor", 0);

                        const amount =
                            getEventArg(a, "amount", 1);

                        const totalDonated =
                            getEventArg(a, "totalDonated", 2, 0n);

                        addRecord(
                            log,
                            "Пополнение общего фонда",
                            "badge-green",
                            `Донор ${formatAddress(donor)} внёс ` +
                            `${formatEth(amount)} ETH в общий фонд. ` +
                            `Всего внесено: ${formatEth(totalDonated)} ETH.`,
                            "treasury-general-donation"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "RequestDonationReceived": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const donor =
                            getEventArg(a, "donor", 1);

                        const amount =
                            getEventArg(a, "amount", 2);

                        const totalRequestDonations =
                            getEventArg(
                                a,
                                "totalRequestDonations",
                                3,
                                0n
                            );

                        addRecord(
                            log,
                            "Целевое пожертвование",
                            "badge-green",
                            `Донор ${formatAddress(donor)} внёс ` +
                            `${formatEth(amount)} ETH на заявку #${requestId}. ` +
                            `Всего целевых пожертвований: ` +
                            `${formatEth(totalRequestDonations)} ETH.`,
                            "treasury-request-donation"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "TargetFundsReserved": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const amount =
                            getEventArg(a, "amount", 1);

                        addRecord(
                            log,
                            "Резерв целевых средств",
                            "badge-blue",
                            `Для заявки #${requestId} зарезервировано ` +
                            `${formatEth(amount)} ETH из целевых пожертвований.`,
                            "target-reserved"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "GeneralFundsReserved": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const amount =
                            getEventArg(a, "amount", 1);

                        addRecord(
                            log,
                            "Резерв общего фонда",
                            "badge-blue",
                            `Для заявки #${requestId} зарезервировано ` +
                            `${formatEth(amount)} ETH из общего фонда.`,
                            "general-reserved"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "TargetFundsReassigned": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const amount =
                            getEventArg(a, "amount", 1);

                        addRecord(
                            log,
                            "Перераспределение средств",
                            "badge-gray",
                            `Для заявки #${requestId} перераспределено ` +
                            `${formatEth(amount)} ETH целевых средств.`,
                            "target-reassigned"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "FundsReleased": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const milestoneId =
                            getEventArg(a, "milestoneId", 1);

                        const recipient =
                            getEventArg(a, "recipient", 2);

                        const amount =
                            getEventArg(a, "amount", 3);

                        addRecord(
                            log,
                            "Выплата по этапу",
                            "badge-green",
                            `Заявка #${requestId}, этап #${milestoneId}: ` +
                            `переведено ${formatEth(amount)} ETH ` +
                            `получателю ${formatAddress(recipient)}.`,
                            "funds-released"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "FundsReleasedBySource": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const milestoneId =
                            getEventArg(a, "milestoneId", 1);

                        const targetAmount =
                            getEventArg(a, "targetAmount", 2, 0n);

                        const generalAmount =
                            getEventArg(a, "generalAmount", 3, 0n);

                        addRecord(
                            log,
                            "Источники выплаты",
                            "badge-green",
                            `Заявка #${requestId}, этап #${milestoneId}: ` +
                            `из целевых средств выплачено ` +
                            `${formatEth(targetAmount)} ETH, ` +
                            `из общего фонда — ${formatEth(generalAmount)} ETH.`,
                            "funds-released-source"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "ReservationReleased": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const generalAmount =
                            getEventArg(a, "generalAmount", 1, 0n);

                        const targetAmount =
                            getEventArg(a, "targetAmount", 2, 0n);

                        addRecord(
                            log,
                            "Освобождение резерва",
                            "badge-gray",
                            `Заявка #${requestId}: освобождено ` +
                            `${formatEth(generalAmount)} ETH из общего фонда ` +
                            `и ${formatEth(targetAmount)} ETH целевых средств.`,
                            "reservation-released"
                        );

                        eventWasHandled = true;
                        break;
                    }
                }
            }


            // ---------------------------------------------
            // RESCUEMILESTONES
            // ---------------------------------------------

            if (log.source === "Milestones") {
                switch (event.name) {

                    case "MilestoneCreated": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const milestoneId =
                            getEventArg(a, "milestoneId", 1);

                        const description =
                            getEventArg(a, "description", 2);

                        const recipient =
                            getEventArg(a, "recipient", 3);

                        const amount =
                            getEventArg(a, "amount", 4);

                        addRecord(
                            log,
                            "Создание этапа",
                            "badge-blue",
                            `Заявка #${requestId}, этап #${milestoneId}: ` +
                            `${description}. Сумма: ${formatEth(amount)} ETH. ` +
                            `Получатель: ${formatAddress(recipient)}.`,
                            "milestone-created"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "MilestoneUpdated": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const milestoneId =
                            getEventArg(a, "milestoneId", 1);

                        const description =
                            getEventArg(a, "description", 2);

                        const recipient =
                            getEventArg(a, "recipient", 3);

                        const oldAmount =
                            getEventArg(a, "oldAmount", 4);

                        const newAmount =
                            getEventArg(a, "newAmount", 5);

                        addRecord(
                            log,
                            "Изменение этапа",
                            "badge-blue",
                            `Заявка #${requestId}, этап #${milestoneId}: ` +
                            `${description}. Получатель: ${formatAddress(recipient)}. ` +
                            `Сумма изменена с ${formatEth(oldAmount)} ETH ` +
                            `на ${formatEth(newAmount)} ETH.`,
                            "milestone-updated"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "MilestoneEvidenceSubmitted": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const milestoneId =
                            getEventArg(a, "milestoneId", 1);

                        addRecord(
                            log,
                            "Отчёт по этапу",
                            "badge-blue",
                            `Заявка #${requestId}, этап #${milestoneId}: ` +
                            `отправлено подтверждение выполнения.`,
                            "evidence-submitted"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "MilestoneApproved": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const milestoneId =
                            getEventArg(a, "milestoneId", 1);

                        const validator =
                            getEventArg(a, "validator", 2);

                        const approvalCount =
                            getEventArg(a, "approvalCount", 3, 0);

                        addRecord(
                            log,
                            "Подтверждение валидатора",
                            "badge-green",
                            `Заявка #${requestId}, этап #${milestoneId}: ` +
                            `валидатор ${formatAddress(validator)} подтвердил этап. ` +
                            `Подтверждений: ${approvalCount}.`,
                            "milestone-approved"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "MilestoneFundsReserved":
                    case "MilestoneFunded": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const milestoneId =
                            getEventArg(a, "milestoneId", 1);

                        const targetAmount =
                            getEventArg(a, "targetAmount", 2, 0n);

                        const generalAmount =
                            getEventArg(a, "generalAmount", 3, 0n);

                        addRecord(
                            log,
                            "Резервирование средств этапа",
                            "badge-green",
                            `Заявка #${requestId}, этап #${milestoneId}: ` +
                            `зарезервировано ${formatEth(targetAmount)} ETH ` +
                            `из целевых пожертвований и ` +
                            `${formatEth(generalAmount)} ETH из общего фонда.`,
                            "milestone-funded"
                        );

                        eventWasHandled = true;
                        break;
                    }

                    case "MilestoneFundsReleased": {
                        const requestId =
                            getEventArg(a, "requestId", 0);

                        const milestoneId =
                            getEventArg(a, "milestoneId", 1);

                        const recipient =
                            getEventArg(a, "recipient", 2);

                        const amount =
                            getEventArg(a, "amount", 3);

                        const targetAmount =
                            getEventArg(a, "targetAmount", 4, 0n);

                        const generalAmount =
                            getEventArg(a, "generalAmount", 5, 0n);

                        addRecord(
                            log,
                            "Выплата по этапу",
                            "badge-green",
                            `Заявка #${requestId}, этап #${milestoneId}: ` +
                            `выплачено ${formatEth(amount)} ETH получателю ` +
                            `${formatAddress(recipient)}. ` +
                            `Из целевых средств: ${formatEth(targetAmount)} ETH, ` +
                            `из общего фонда: ${formatEth(generalAmount)} ETH.`,
                            "milestone-funds-released"
                        );

                        eventWasHandled = true;
                        break;
                    }
                }
            }

            if (!eventWasHandled) {
                ignoredEvents.push({
                    source: log.source,
                    eventName: event.name,
                    block: log.blockNumber,
                    txHash: log.transactionHash
                });
            }
        }


        // -------------------------------------------------
        // 13.5. ДИАГНОСТИКА ДЕКОДИРОВАНИЯ
        // -------------------------------------------------

        console.log(
            "========== РЕЗУЛЬТАТ ДЕКОДИРОВАНИЯ =========="
        );

        console.log("Всего логов:", allLogs.length);
        console.log("Обработано событий:", records.length);
        console.log(
            "Не удалось декодировать:",
            undecodedLogs.length
        );

        console.log(
            "Неизвестных обработчиков:",
            ignoredEvents.length
        );

        if (undecodedLogs.length > 0) {
            console.warn(
                "Не декодированные логи:",
                undecodedLogs
            );

            console.table(undecodedLogs);
        }

        if (ignoredEvents.length > 0) {
            console.warn(
                "Необработанные события:",
                ignoredEvents
            );

            console.table(ignoredEvents);
        }


        // -------------------------------------------------
        // 13.6. УДАЛЕНИЕ ДУБЛЕЙ ПОЖЕРТВОВАНИЙ
        // -------------------------------------------------

        const daoGeneralDonations = new Set(
            records
                .filter(
                    record =>
                        record.type === "general-donation"
                )
                .map(record => record.txHash)
        );

        const daoRequestDonations = new Set(
            records
                .filter(
                    record =>
                        record.type === "request-donation"
                )
                .map(record => record.txHash)
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


        // -------------------------------------------------
        // 13.7. ГРУППИРОВКА СОБЫТИЙ ПО ТРАНЗАКЦИЯМ
        // -------------------------------------------------

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

        const priority = [
            "request-created",
            "request-updated",
            "request-changes",
            "request-resubmitted",
            "request-published",
            "request-rejected",
            "request-completed",
            "request-cancelled",
            "general-donation",
            "request-donation",
            "passport-minted",
            "milestone-created",
            "milestone-updated",
            "milestone-funded",
            "evidence-submitted",
            "milestone-approved",
            "funds-released",
            "milestone-funds-released",
            "target-reserved",
            "general-reserved",
            "target-reassigned",
            "reservation-released"
        ];

        const allEvents =
            Array.from(grouped.values()).map(group => {
                const items = group.records;

                const sortedItems = items
                    .slice()
                    .sort((a, b) => {
                        const indexA =
                            priority.indexOf(a.type);

                        const indexB =
                            priority.indexOf(b.type);

                        return (
                            (indexA === -1 ? 999 : indexA) -
                            (indexB === -1 ? 999 : indexB)
                        );
                    });

                const main = sortedItems[0];

                const descriptions = [
                    ...new Set(
                        items.map(item => item.desc)
                    )
                ];

                const tags = [
                    ...new Set(
                        items.map(item => item.tag)
                    )
                ];

                return {
                    block: group.block,
                    txHash: group.txHash,
                    tag: tags.join(" · "),
                    cls: main.cls,
                    desc: descriptions.join(" ")
                };
            });

        allEvents.sort(
            (a, b) => b.block - a.block
        );


        // -------------------------------------------------
        // 13.8. ОТОБРАЖЕНИЕ ИСТОРИИ
        // -------------------------------------------------

        if (allEvents.length === 0) {
            let emptyMessage =
                "Событий в блокчейне пока нет.";

            if (allLogs.length > 0) {
                emptyMessage =
                    "Логи найдены, но ни одно событие не удалось " +
                    "добавить в журнал. Проверьте ABI и обработчики событий.";

            } else if (logErrors.length > 0) {
                emptyMessage =
                    "Не удалось получить логи блокчейна. " +
                    "Подробности ошибок доступны в консоли.";
            }

            timeline.innerHTML = `
                <p style="color:var(--text-muted);">
                    ${escapeHtml(emptyMessage)}
                </p>
            `;

            console.warn("Журнал пуст.");

            console.log("DAO:", logsByContract.DAO);
            console.log("Treasury:", logsByContract.Treasury);
            console.log("Milestones:", logsByContract.Milestones);

            console.log("Всего логов:", allLogs.length);
            console.log(
                "Обработано событий:",
                records.length
            );

            console.log(
                "Ошибок получения логов:",
                logErrors.length
            );

            console.log("======================================");

            return;
        }

        timeline.innerHTML = allEvents.map(event => {
            const explorerUrl =
                getExplorerTransactionUrl(event.txHash);

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
                        title="${escapeHtml(event.txHash)}"
                    >
                        ${escapeHtml(shortAddr(event.txHash))}
                    </span>
                `;

            return `
                <div class="list-item">
                    <div>

                        <span
                            class="badge ${escapeHtml(event.cls)}"
                            style="margin-right:0.5rem;"
                        >
                            ${escapeHtml(event.tag)}
                        </span>

                        <span>
                            ${escapeHtml(event.desc)}
                        </span>

                        <div class="mono" style="margin-top:0.25rem;">
                            Блок: ${Number(event.block)}
                        </div>

                    </div>

                    ${txElement}
                </div>
            `;
        }).join("");

        console.log(
            `История загружена: ${allLogs.length} логов, ` +
            `${records.length} обработанных событий, ` +
            `${allEvents.length} транзакций в журнале.`
        );

        console.log("======================================");

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


// ======================================================
// 14. ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML onclick
// ======================================================

window.registerMember = registerMember;

window.loadAdminModerationQueue =
    loadAdminModerationQueue;

window.publishAdminRequest =
    publishAdminRequest;

window.requestAdminChanges =
    requestAdminChanges;

window.rejectAdminRequest =
    rejectAdminRequest;

window.fundMilestone =
    fundMilestone;

window.loadValidatorQueue =
    loadValidatorQueue;

window.approveMs =
    approveMs;

window.loadAuditHistory =
    loadAuditHistory;