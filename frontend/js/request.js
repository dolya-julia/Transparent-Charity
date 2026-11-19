const urlParams = new URLSearchParams(window.location.search);
const requestId = Number(urlParams.get("id"));

const validRequestId =
    Number.isSafeInteger(requestId) && requestId > 0;

let currentEvidenceHash = "";


window.addEventListener("DOMContentLoaded", async () => {
    if (!validRequestId) {
        document.getElementById("requestDetailsContainer").innerHTML = "<p>Не указан или некорректен ID заявки.</p>";
        return;
    }
    const ready = await initWeb3();
    if (!ready) return;
    await loadRequestDetails();
});

async function loadRequestDetails() {
    // Используем контейнер с id="campaignContent", чтобы не менять HTML-разметку страницы details.html
    const container = document.getElementById("requestDetailsContainer");

    try {
        const [info, stats] = await Promise.all([
            contract.getAidRequestInfo(requestId),
            contract.getAidRequestStats(requestId)
        ]);

        // Загружаем фото и ссылку на документ с Node.js бэкенда
        let meta = { photoUrl: "", docUrl: "", fullStory: "" };
        try {
            const res = await fetch(`${API_URL}/requests/${requestId}`);
            if (res.ok) meta = await res.json();
        } catch {}

        currentEvidenceHash = info.evidenceHash;
        const statusNum = Number(stats.status);
        const statusObj = STATUS_LABELS[statusNum] || STATUS_LABELS[0];
        const endsDate = new Date(Number(stats.votingEndsAt) * 1000).toLocaleString("ru-RU");
        const nowSec = Math.floor(Date.now() / 1000);
        const votingEnded = nowSec >= Number(stats.votingEndsAt);

        const isRequester = userAddress && info.requester.toLowerCase() === userAddress.toLowerCase();
        const voted = userAddress ? await contract.hasParticipantVoted(requestId, userAddress) : false;

        // Фото животного (если есть на сервере)
        const photoBlock = meta.photoUrl
            ? `<img src="${meta.photoUrl}" alt="${info.animalName}" class="details-hero-img" style="width:100%; max-height:340px; object-fit:cover; border-radius:0.75rem; margin: 1rem 0;">`
            : `<div class="card-img" style="border-radius: 0.75rem; margin: 1rem 0; text-align:center; padding:2rem; background:#f1f5f9;">🐾</div>`;

        // Кнопка скачивания документа с сервера для последующей сверки хэша
        const downloadDocLink = meta.docUrl
            ? `<div style="margin-top:0.4rem;"><a href="${meta.docUrl}" target="_blank" class="tx-link">📄 Скачать документ с сервера для проверки хэша &nearr;</a></div>`
            : "";

        // Блок голосования DAO
        let votingControls = "";
        if (statusNum === 0) {
            if (!votingEnded && userRoles.isMember && !voted) {
                votingControls = `
                    <div style="display: flex; gap: 0.75rem; margin-top: 1rem;">
                        <button class="btn btn-primary" style="flex:1;" onclick="castVote(true)">👍 Голосовать ЗА</button>
                        <button class="btn btn-danger" style="flex:1;" onclick="castVote(false)">👎 Голосовать ПРОТИВ</button>
                    </div>
                `;
            } else if (voted) {
                votingControls = `<p style="margin-top:0.75rem;" class="badge badge-blue">Вы уже проголосовали по этой заявке</p>`;
            }

            if (votingEnded) {
                votingControls += `
                    <button class="btn btn-dark" style="width:100%; margin-top:1rem;" onclick="finalizeReq()">
                        Подвести итоги голосования (Finalize)
                    </button>
                `;
            }
        }

        // Форма добавления этапа (доступна инициатору во время голосования)
        const addMilestoneBlock = (statusNum === 0 && !votingEnded && isRequester) ? `
            <div class="box" style="margin-top: 1rem;">
                <h3>Добавить этап финансирования</h3>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.75rem;">
                    Распределено по этапам: <strong>${ethers.formatEther(stats.milestoneTotal)} / ${ethers.formatEther(stats.requestedAmount)} ETH</strong>.
                    Для одобрения заявки сумма этапов должна совпасть с запрошенной суммой!
                </p>
                <div class="form-group" style="margin-bottom:0.75rem;">
                    <label>Название этапа</label>
                    <input type="text" id="msDesc" class="input-field" placeholder="Например: Операция в ветклинике" style="width:100%; padding:0.5rem; margin-top:0.25rem;">
                </div>
                <div class="form-group" style="margin-bottom:0.75rem;">
                    <label>Адрес получателя (клиника / аптека)</label>
                    <input type="text" id="msRecipient" class="input-field" placeholder="0x..." style="width:100%; padding:0.5rem; margin-top:0.25rem;">
                </div>
                <div class="form-group" style="margin-bottom:0.75rem;">
                    <label>Сумма этапа (ETH)</label>
                    <input type="number" id="msAmount" class="input-field" step="0.001" placeholder="0.003" style="width:100%; padding:0.5rem; margin-top:0.25rem;">
                </div>
                <button class="btn btn-primary" style="width:100%;" onclick="createNewMilestone()">Добавить этап</button>
            </div>
        ` : "";

        container.innerHTML = `
            <div class="details-layout">
                <div>
                    <!-- Карточка заявки -->
                    <div class="box">
                        <div class="card-title-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                            <h1>Заявка #${requestId}: ${info.animalName}</h1>
                            <span class="badge ${statusObj.cls}" style="padding:0.3rem 0.6rem; border-radius:4px;">${statusObj.text}</span>
                        </div>
                        <p class="mono">Инициатор: ${info.requester}</p>
                        ${photoBlock}
                        <h3 style="margin-top:1rem;">Описание ситуации</h3>
                        <p style="margin: 0.5rem 0; color: #334155;">${meta.fullStory || info.description}</p>
                        
                        <!-- Блок NFT-паспорта -->
                        <div id="nftPassportSection" style="margin-top: 1.25rem;"></div>

                        <div style="font-size: 0.88rem; background: #f1f5f9; padding: 0.85rem; border-radius: 0.6rem; margin-top: 1rem;">
                            <div><strong>Документы (URI):</strong> ${info.evidenceURI}</div>
                            <div class="mono" style="margin-top:0.25rem;"><strong>Хэш в блокчейне:</strong> ${info.evidenceHash}</div>
                            ${downloadDocLink}
                            <div style="margin-top: 0.75rem; padding-top: 0.6rem; border-top: 1px solid #cbd5e1;">
                                <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:0.25rem;">
                                    Проверить подлинность файла по хэшу в блокчейне:
                                </label>
                                <input type="file" id="verifyFileInput" onchange="verifyDocumentHash()">
                                <span id="verifyResult" style="font-weight:600; font-size:0.85rem; margin-left:0.5rem;"></span>
                            </div>
                        </div>
                    </div>

                    ${addMilestoneBlock}

                    <!-- Список этапов финансирования -->
                    <div class="box" style="margin-top: 1rem;">
                        <h3 style="margin-bottom: 1rem;">Этапы финансирования (Milestones)</h3>
                        <div id="milestonesContainer">Загрузка этапов...</div>
                    </div>
                </div>

                <!-- Правая колонка: Бюджет и DAO-голосование -->
                <div class="box" style="position: sticky; top: 90px;">
                    <h3>Статус и Голосование DAO</h3>
                    <div style="display:flex; flex-direction:column; gap:0.5rem; font-size:0.92rem; margin: 1rem 0;">
                        <div style="display:flex; justify-content:space-between;"><span>Запрошено:</span><strong>${ethers.formatEther(stats.requestedAmount)} ETH</strong></div>
                        <div style="display:flex; justify-content:space-between;"><span>Запланировано этапов:</span><strong>${ethers.formatEther(stats.milestoneTotal)} ETH</strong></div>
                        <div style="display:flex; justify-content:space-between;"><span>Выплачено:</span><strong style="color:var(--primary);">${ethers.formatEther(stats.releasedAmount)} ETH</strong></div>
                        <div style="display:flex; justify-content:space-between;"><span>Окончание голосования:</span><strong>${endsDate}</strong></div>
                        <div style="display:flex; justify-content:space-between;"><span>Голоса ЗА:</span><strong style="color:var(--primary);">${stats.yesVotes}</strong></div>
                        <div style="display:flex; justify-content:space-between;"><span>Голоса ПРОТИВ:</span><strong style="color:var(--danger);">${stats.noVotes}</strong></div>
                    </div>
                    ${votingControls}
                </div>
            </div>
        `;

        await loadMilestonesList(Number(stats.milestoneCount), statusNum, isRequester);
        await loadNftPassport(requestId);
    } catch (err) {
        console.error(err);
        container.innerHTML = "<p style='color:red;'>Ошибка загрузки заявки.</p>";
    }
}

async function loadNftPassport(requestId) {
    const nftContainer = document.getElementById("nftPassportSection");
    if (!nftContainer) return;

    try {
        const nftAddress = await contract.rescueNftContract();

        if (!nftAddress || nftAddress === ethers.ZeroAddress) {
            nftContainer.innerHTML = `
                <p style="color:var(--text-muted);">
                    NFT-контракт пока не привязан к DAO.
                </p>
            `;
            return;
        }

        const nftContract = new ethers.Contract(
            nftAddress,
            NFT_ABI,
            provider
        );

        // Получаем ID токена по ID заявки
        const tokenId = await nftContract.getTokenIdForRequest(requestId);

        if (tokenId === 0n) {
            nftContainer.innerHTML = `
                <p style="color:var(--text-muted);">
                    NFT-паспорт для заявки #${requestId} ещё не выпущен.
                </p>
            `;
            return;
        }

        const [owner, uri] = await Promise.all([
            nftContract.ownerOf(tokenId),
            nftContract.tokenURI(tokenId)
        ]);

        if (!uri.startsWith("data:application/json;base64,")) {
            nftContainer.innerHTML = `
                <p class="mono">NFT #${tokenId} выпущен. URI: ${uri}</p>
            `;
            return;
        }

        // Декодируем JSON
        const base64Json = uri.split(",")[1];
        const binaryString = atob(base64Json);

        const bytes = Uint8Array.from(
            binaryString,
            char => char.charCodeAt(0)
        );

        const metadata = JSON.parse(
            new TextDecoder().decode(bytes)
        );

        const attributesHtml = (metadata.attributes || [])
            .map(attr => `
                <span class="badge badge-blue"
                      style="margin-right:0.4rem; margin-bottom:0.3rem; display:inline-block;">
                    ${attr.trait_type}: ${attr.value}
                </span>
            `)
            .join("");

        nftContainer.innerHTML = `
            <div style="border:1px solid #cbd5e1; border-radius:0.75rem; padding:1rem; background:#ffffff;">
                <div class="row-between" style="margin-bottom:0.75rem;">
                    <h4 style="margin:0;">
                        🐾 Цифровой NFT-паспорт #${tokenId}
                    </h4>
                    <span class="badge badge-green">On-Chain SVG</span>
                </div>

                <div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:center;">
                    <img
                        src="${metadata.image}"
                        alt="${metadata.name || "NFT-паспорт"}"
                        style="width:200px; height:auto; border-radius:0.5rem; border:1px solid #e2e8f0;"
                    >

                    <div style="flex:1; min-width:200px;">
                        <div style="font-weight:600; font-size:1.05rem; margin-bottom:0.35rem;">
                            ${metadata.name || "NFT-паспорт животного"}
                        </div>

                        <p style="font-size:0.88rem; color:#475569; margin-bottom:0.6rem;">
                            ${metadata.description || ""}
                        </p>

                        <div class="mono" style="font-size:0.78rem; margin-bottom:0.6rem; word-break:break-all;">
                            Владелец: ${owner}
                        </div>

                        <div>${attributesHtml}</div>
                    </div>
                </div>
            </div>
        `;

    } catch (err) {
        console.error("Ошибка загрузки NFT:", err);

        nftContainer.innerHTML = `
            <p style="color:var(--text-muted);">
                Не удалось загрузить NFT-паспорт. Проверьте наличие токена и привязку NFT-контракта.
            </p>
        `;
    }
}

async function verifyDocumentHash() {
    const input = document.getElementById("verifyFileInput");
    const resSpan = document.getElementById("verifyResult");
    if (!input.files.length) return;

    const buffer = await input.files[0].arrayBuffer();
    const calculatedHash = ethers.keccak256(new Uint8Array(buffer));

    if (calculatedHash.toLowerCase() === currentEvidenceHash.toLowerCase()) {
        resSpan.textContent = "✅ Документ подлинный (хэш совпал)";
        resSpan.style.color = "var(--primary)";
    } else {
        resSpan.textContent = "❌ Внимание: хэш не совпадает!";
        resSpan.style.color = "var(--danger)";
    }
}

async function castVote(support) {
    try {
        const tx = await contract.vote(requestId, support);
        alert("Голос отправлен! Ожидаем подтверждения...");
        await tx.wait();
        window.location.reload();
    } catch (err) {
        alert("Ошибка голосования: " + (err.reason || err.message));
    }
}

async function finalizeReq() {
    try {
        const tx = await contract.finalizeRequest(requestId);
        alert("Подводим итоги голосования...");
        await tx.wait();
        window.location.reload();
    } catch (err) {
        alert("Ошибка финализации: " + (err.reason || err.message));
    }
}

async function createNewMilestone() {
    const desc = document.getElementById("msDesc").value.trim();
    const recipient = document.getElementById("msRecipient").value.trim();
    const amount = document.getElementById("msAmount").value;

    if (!desc || !ethers.isAddress(recipient) || !amount || Number(amount) <= 0) {
        return alert("Проверьте описание, корректность 0x-адреса получателя и сумму.");
    }

    try {
        const tx = await contract.addMilestone(requestId, desc, recipient, ethers.parseEther(amount));
        alert("Этап добавляется в блокчейн...");
        await tx.wait();
        window.location.reload();
    } catch (err) {
        alert("Ошибка добавления этапа: " + (err.reason || err.message));
    }
}

async function loadMilestonesList(mCount, reqStatus, isRequester) {
    const box = document.getElementById("milestonesContainer");
    if (mCount === 0) {
        box.innerHTML = "<p style='color:var(--text-muted); font-size:0.9rem;'>Этапы ещё не добавлены.</p>";
        return;
    }

    box.innerHTML = "";
    for (let m = 1; m <= mCount; m++) {
        const ms = await contract.getMilestone(requestId, m);
        let statusBadge = `<span class="badge badge-gray">Ожидает одобрения заявки</span>`;
        if (ms.released) {
            statusBadge = `<span class="badge badge-green">Оплачено (${ms.approvalCount}/2)</span>`;
        } else if (ms.evidenceSubmitted) {
            statusBadge = `<span class="badge badge-blue">Отчёт загружен (${ms.approvalCount}/2 подтверждений)</span>`;
        } else if (reqStatus === 1) {
            statusBadge = `<span class="badge badge-yellow">Ожидает отчёт инициатора</span>`;
        }

        const evidenceForm = (reqStatus === 1 && isRequester && !ms.released) ? `
            <div style="width:100%; margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed var(--border); display:flex; gap:0.5rem; flex-wrap:wrap;">
                <input type="text" id="evUri_${m}" placeholder="Ссылка на чек/акт (ipfs://...)" style="flex:1; min-width:200px;">
                <input type="file" id="evFile_${m}">
                <button class="btn btn-primary" onclick="submitEvidence(${m})">Отправить отчёт</button>
            </div>
        ` : "";

        box.innerHTML += `
            <div class="list-item">
                <div style="flex:1;">
                    <div class="row-between">
                        <strong>Этап #${m}: ${ms.description}</strong>
                        ${statusBadge}
                    </div>
                    <div style="font-size:0.88rem; margin-top:0.35rem;">
                        Сумма: <strong>${ethers.formatEther(ms.amount)} ETH</strong> · Получатель: <span class="mono">${ms.recipient}</span>
                    </div>
                    ${ms.evidenceSubmitted ? `<div class="mono" style="margin-top:0.25rem;">Отчёт: ${ms.evidenceURI} | Hash: ${shortAddr(ms.evidenceHash)}</div>` : ""}
                </div>
                ${evidenceForm}
            </div>
        `;
    }
}

async function submitEvidence(milestoneId) {
    const uriInput = document.getElementById(`evUri_${milestoneId}`).value.trim();
    const fileInput = document.getElementById(`evFile_${milestoneId}`);
    const file = fileInput?.files?.[0];

    try {
        if (!file) {
            alert("Сначала выберите файл отчёта.");
            return;
        }

        const buffer = await file.arrayBuffer();
        const hash = ethers.keccak256(new Uint8Array(buffer));

        const formData = new FormData();
        formData.append("document", file);

        const response = await fetch(`${API_URL}/requests/${requestId}`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ошибка сервера (${response.status}): ${errorText}`);
        }

        const saved = await response.json();
        const serverDocUrl = saved.data?.docUrl || saved.docUrl || saved.data?.documentUrl || saved.documentUrl;
        const finalUri = uriInput || serverDocUrl;

        if (!finalUri) {
            throw new Error("Сервер не вернул ссылку на документ. Укажите URI вручную.");
        }

        if (!contract) throw new Error("Смарт-контракт не инициализирован.");
        if (!userAddress) throw new Error("Не определён адрес подключённого кошелька.");

        const tx = await contract.submitMilestoneEvidence(requestId, milestoneId, finalUri, hash);
        alert("Транзакция отправлена. Ожидаем подтверждения в блокчейне...");
        
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) {
            throw new Error("Транзакция не была успешно подтверждена.");
        }

        alert("Отчёт успешно отправлен и записан в блокчейн!");
        window.location.reload();

    } catch (err) {
        console.error("Ошибка отправки отчёта:", err);
        alert("Не удалось отправить отчёт:\n" + (err.reason || err.shortMessage || err.message));
    }
}