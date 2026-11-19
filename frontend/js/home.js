window.addEventListener("DOMContentLoaded", async () => {
    const ready = await initWeb3();
    if (!ready) return;
    await loadPoolStats();
    await loadAllRequests();
});

async function loadPoolStats() {
    try {
        const [donated, reserved, spent, available] = await Promise.all([
            contract.totalDonated(),
            contract.totalReserved(),
            contract.totalSpent(),
            contract.getAvailableBalance()
        ]);

        document.getElementById("statDonated").textContent = `${ethers.formatEther(donated)} ETH`; 
        document.getElementById("statAvailable").textContent = `${ethers.formatEther(available)} ETH`;
        document.getElementById("statReserved").textContent = `${ethers.formatEther(reserved)} ETH`; 
        document.getElementById("statSpent").textContent = `${ethers.formatEther(spent)} ETH`;
    } catch (err) {
        console.error("Ошибка загрузки статистики фонда:", err);
    }
}

async function donateToPool() {
    if (!signer) return alert("Сначала подключите MetaMask!");
    const val = document.getElementById("donateAmount").value;
    if (!val || Number(val) <= 0) return alert("Введите сумму больше 0 ETH");

    try {
        const tx = await contract.donate({ value: ethers.parseEther(val) });
        alert("Пожертвование отправлено! Ожидаем подтверждения транзакции...");
        await tx.wait();
        alert("Спасибо! Средства зачислены в общий фонд RescueDAO.");
        window.location.reload();
    } catch (err) {
        console.error(err);
        alert("Ошибка: " + (err.reason || err.message));
    }
}

async function submitAidRequest() {
    if (!signer) {
        return alert("Подключите MetaMask!");
    }

    if (!userRoles.isMember) {
        return alert("Создавать заявки могут только зарегистрированные участники DAO.");
    }

    const name = document.getElementById("reqAnimalName").value.trim();
    const desc = document.getElementById("reqDescription").value.trim();
    const amountEth = document.getElementById("reqAmount").value;
    const durationMin = Number(document.getElementById("reqDuration").value);
    const uri = document.getElementById("reqEvidenceUri").value.trim();

    const fileInput = document.getElementById("reqEvidenceFile");
    const photoInput = document.getElementById("reqPhotoFile");

    const evidenceFile = fileInput?.files?.[0];
    const photoFile = photoInput?.files?.[0];

    if (
        !name ||
        !desc ||
        !amountEth ||
        Number(amountEth) <= 0 ||
        !Number.isFinite(durationMin) ||
        durationMin < 1
    ) {
        return alert("Заполните все обязательные поля корректно.");
    }

    try {
        // 1. Вычисляем хэш документа

        const docHash = await hashFileOrDefault(
            fileInput,
            `${name}-${Date.now()}`
        );

        // 2. Создаём заявку в блокчейне
        // Текущий Solidity принимает 6 аргументов
        const tx = await contract.createAidRequest(
            name,
            desc,
            uri,
            docHash,
            ethers.parseEther(amountEth),
            BigInt(durationMin * 60)
        );

        alert("Заявка отправлена в блокчейн. Ожидаем подтверждения...");

        const receipt = await tx.wait();

        if (!receipt || receipt.status !== 1) {
            throw new Error("Транзакция создания заявки не подтверждена.");
        }

        // 3. Получаем ID созданной заявки
        const newId = Number(await contract.requestCount());

        // 4. Сохраняем фотографию, документ и расширенную историю
        const formData = new FormData();

        formData.append("fullStory", desc);

        if (photoFile) {
            formData.append("photo", photoFile);
        }

        if (evidenceFile) {
            formData.append("document", evidenceFile);
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
                throw new Error(`Ошибка backend: ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error("Backend не подтвердил сохранение данных.");
            }

            console.log("Медиафайлы заявки сохранены:", result.data);

        } catch (apiErr) {
            console.error(
                "Заявка создана в блокчейне, но медиафайлы не сохранены:",
                apiErr
            );

            alert(
                "Заявка создана в блокчейне, но не удалось сохранить фотографии или документы на сервере. Проверьте, запущен ли backend."
            );
        }

        alert(
            `Заявка #${newId} успешно опубликована! Теперь можно добавить этапы финансирования.`
        );

        window.location.reload();

    } catch (err) {
        console.error("Ошибка создания заявки:", err);

        alert(
            "Ошибка создания заявки: " +
            (err.reason || err.shortMessage || err.message)
        );
    }
}

async function loadAllRequests() {
    const grid = document.getElementById("requestsGrid");
    try {
        const count = Number(await contract.requestCount());
        if (count === 0) {
            grid.innerHTML = "<p>Заявок пока нет. Создайте первую заявку выше!</p>";
            return;
        }

        grid.innerHTML = "";
        for (let i = count; i >= 1; i--) {
            const [info, stats] = await Promise.all([
                contract.getAidRequestInfo(i),
                contract.getAidRequestStats(i)
            ]);

            // Подтягиваем метаданные (фото) с Node.js сервера
            let meta = { photoUrl: "" };
            try {
                const res = await fetch(`${API_URL}/requests/${i}`);
                if (res.ok) meta = await res.json();
            } catch {}

            const imgTag = meta.photoUrl
                ? `<img src="${meta.photoUrl}" alt="${info.animalName}" style="width:100%; height:180px; object-fit:cover; border-radius:0.65rem; margin-bottom:0.75rem;">`
                : "";

            const statusObj = STATUS_LABELS[Number(stats.status)] || STATUS_LABELS[0];
            const reqEth = ethers.formatEther(stats.requestedAmount);
            const relEth = ethers.formatEther(stats.releasedAmount);

            grid.innerHTML += `
                <div class="card">
                    <div>
                        ${imgTag}
                        <div class="row-between" style="margin-bottom: 0.75rem;">
                            <strong style="font-size: 1.2rem;">#${i} · ${info.animalName}</strong>
                            <span class="badge ${statusObj.cls}">${statusObj.text}</span>
                        </div>
                        <p style="font-size: 0.92rem; color: #334155; margin-bottom: 0.9rem;">${info.description}</p>
                        <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 0.25rem;">
                            <div>Запрошено: <strong style="color: var(--text-main);">${reqEth} ETH</strong> (Выплачено: ${relEth} ETH)</div>
                            <div>Голоса DAO: <strong style="color: var(--primary);">За: ${stats.yesVotes}</strong> / <strong style="color: var(--danger);">Против: ${stats.noVotes}</strong></div>
                            <div>Этапов: <strong>${stats.completedMilestones} из ${stats.milestoneCount}</strong></div>
                        </div>
                    </div>
                    <a href="request.html?id=${i}" class="btn btn-dark" style="width: 100%; margin-top: 1rem;">Открыть заявку / Паспорт</a>
                </div>
            `;
        }
    } catch (err) {
        console.error(err);
        grid.innerHTML = `
            <p style="color:red;">
                Ошибка загрузки заявок. Проверьте адрес RescueDAO,
                подключение MetaMask к локальной сети Geth
                и доступность RPC-узла.
            </p>
        `;
    }
}
