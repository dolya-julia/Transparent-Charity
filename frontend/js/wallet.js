
// ======================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ======================================================

let provider = null;
let signer = null;
let contract = null;
let userAddress = null;

let userRoles = {
    isAdmin: false,
    isMember: false,
    isValidator: false
};


// ======================================================
// НАСТРОЙКИ СЕТИ
// ======================================================

// Локальная сеть Geth
const EXPECTED_CHAIN_ID = 1337n;


// ======================================================
// СБРОС ДАННЫХ КОШЕЛЬКА
// ======================================================

function resetWalletState() {
    signer = null;
    userAddress = null;

    userRoles = {
        isAdmin: false,
        isMember: false,
        isValidator: false
    };
}


// ======================================================
// ПРОВЕРКА СЕТИ
// ======================================================

async function checkNetwork() {
    if (!provider) {
        throw new Error("Web3-провайдер не инициализирован.");
    }

    const network = await provider.getNetwork();

    if (network.chainId !== EXPECTED_CHAIN_ID) {
        alert(
            "Вы подключены к неправильной сети MetaMask.\n\n" +
            "Для работы RescueDAO выберите локальную сеть Geth " +
            "с Chain ID 1337."
        );

        return false;
    }

    return true;
}


// ======================================================
// ИНИЦИАЛИЗАЦИЯ WEB3
// ======================================================

async function initWeb3() {
    try {

        // Проверяем наличие MetaMask
        if (!window.ethereum) {
            alert(
                "Установите расширение MetaMask и откройте сайт " +
                "через локальный сервер (например, Live Server)."
            );

            return false;
        }

        // Проверяем адрес смарт-контракта
        if (!ethers.isAddress(CONTRACT_ADDRESS)) {
            console.error("Некорректный адрес RescueDAO:", CONTRACT_ADDRESS);

            alert("Ошибка конфигурации: некорректный адрес RescueDAO.");

            return false;
        }

        // Создаём провайдер
        provider = new ethers.BrowserProvider(window.ethereum);

        // Проверяем подключённую сеть
        const networkReady = await checkNetwork();

        if (!networkReady) {
            return false;
        }

        // Проверяем, подключён ли кошелёк
        const accounts = await provider.send("eth_accounts", []);

        if (accounts.length > 0) {

            // Если аккаунт уже подключён
            await setupSigner();

        } else {

            // Если кошелёк не подключён,
            // создаём контракт только для чтения
            signer = null;
            userAddress = null;

            contract = new ethers.Contract(
                CONTRACT_ADDRESS,
                CONTRACT_ABI,
                provider
            );

            resetWalletState();

            updateRoleBadge();
        }

        // Обработка смены аккаунта
        window.ethereum.removeListener?.(
            "accountsChanged",
            handleAccountsChanged
        );

        window.ethereum.removeListener?.(
            "chainChanged",
            handleChainChanged
        );

        window.ethereum.on(
            "accountsChanged",
            handleAccountsChanged
        );

        window.ethereum.on(
            "chainChanged",
            handleChainChanged
        );

        return true;

    } catch (err) {

        console.error("Ошибка инициализации Web3:", err);

        alert(
            "Не удалось подключиться к блокчейну.\n\n" +
            (err.shortMessage || err.message)
        );

        return false;
    }
}


// ======================================================
// ОБРАБОТКА СМЕНЫ АККАУНТА
// ======================================================

async function handleAccountsChanged(accounts) {
    try {

        if (!accounts || accounts.length === 0) {

            resetWalletState();

            if (provider) {
                contract = new ethers.Contract(
                    CONTRACT_ADDRESS,
                    CONTRACT_ABI,
                    provider
                );
            }

            updateConnectButton();
            updateRoleBadge();

            // Обновляем страницу, чтобы убрать доступные действия
            window.location.reload();

            return;
        }

        await setupSigner();

        window.location.reload();

    } catch (err) {
        console.error("Ошибка смены аккаунта:", err);
    }
}


// ======================================================
// ОБРАБОТКА СМЕНЫ СЕТИ
// ======================================================

async function handleChainChanged() {
    // При смене сети заново проверяем подключение
    window.location.reload();
}


// ======================================================
// ПОДКЛЮЧЕНИЕ КОШЕЛЬКА
// ======================================================

async function connectWallet() {

    try {

        if (!window.ethereum) {
            alert("MetaMask не найден!");
            return;
        }

        if (!provider) {
            provider = new ethers.BrowserProvider(window.ethereum);
        }

        // Запрашиваем доступ к аккаунтам
        await provider.send("eth_requestAccounts", []);

        // Проверяем правильность сети
        const networkReady = await checkNetwork();

        if (!networkReady) {
            return;
        }

        // Подключаем signer и загружаем роли
        await setupSigner();

        window.location.reload();

    } catch (err) {

        console.error("Ошибка подключения кошелька:", err);

        if (err.code === 4001) {
            alert("Вы отклонили запрос на подключение MetaMask.");
        } else {
            alert(
                "Не удалось подключить кошелёк: " +
                (err.shortMessage || err.message)
            );
        }
    }
}


// ======================================================
// НАСТРОЙКА SIGNER И ОПРЕДЕЛЕНИЕ РОЛЕЙ
// ======================================================

async function setupSigner() {

    if (!provider) {
        throw new Error("Провайдер Web3 не инициализирован.");
    }

    // Проверяем сеть
    const networkReady = await checkNetwork();

    if (!networkReady) {
        resetWalletState();
        return false;
    }

    // Получаем подписанта
    signer = await provider.getSigner();

    // Получаем адрес текущего пользователя
    userAddress = await signer.getAddress();

    // Создаём экземпляр контракта с возможностью отправки транзакций
    contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
    );

    updateConnectButton();

    try {

        // Получаем информацию о ролях пользователя
        const [
            adminAddr,
            memberFlag,
            valFlag
        ] = await Promise.all([

            contract.admin(),

            contract.isMember(userAddress),

            contract.isValidator(userAddress)

        ]);

        // Проверяем права администратора
        userRoles.isAdmin =
            adminAddr.toLowerCase() === userAddress.toLowerCase();

        // Проверяем регистрацию в DAO
        userRoles.isMember = memberFlag;

        // Проверяем роль валидатора
        userRoles.isValidator = valFlag;

        updateRoleBadge();

        console.log("Кошелёк подключён:", userAddress);

        console.log("Роли пользователя:", userRoles);

        return true;

    } catch (err) {

        console.warn(
            "Не удалось определить роли кошелька:",
            err
        );

        // Не предоставляем дополнительные права при ошибке
        userRoles = {
            isAdmin: false,
            isMember: false,
            isValidator: false
        };

        updateRoleBadge();

        return false;
    }
}


// ======================================================
// ОБНОВЛЕНИЕ КНОПКИ ПОДКЛЮЧЕНИЯ
// ======================================================

function updateConnectButton() {

    const btn = document.getElementById("connectBtn");

    if (!btn) return;

    if (userAddress) {

        btn.textContent =
            `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

        btn.className = "btn btn-outline";

    } else {

        btn.textContent = "Подключить кошелёк";

        btn.className = "btn btn-primary";
    }
}


// ======================================================
// ОБНОВЛЕНИЕ ИНДИКАТОРА РОЛЕЙ
// ======================================================

function updateRoleBadge() {

    const badge = document.getElementById("roleBadge");

    if (!badge) return;

    const labels = [];

    if (userRoles.isAdmin) {
        labels.push("Admin");
    }

    if (userRoles.isValidator) {
        labels.push("Validator");
    }

    if (userRoles.isMember) {
        labels.push("DAO Member");
    }

    if (labels.length > 0) {

        badge.textContent = labels.join(" · ");

        badge.className = "badge badge-blue";

    } else if (userAddress) {

        badge.textContent = "Донор";

        badge.className = "badge badge-gray";

    } else {

        badge.textContent = "Кошелёк не подключён";

        badge.className = "badge badge-gray";
    }
}


// ======================================================
// ВЫЧИСЛЕНИЕ KECCAK-256 ХЭША ФАЙЛА
// ======================================================

async function hashFileOrDefault(fileInput, fallbackText) {

    try {

        // Если пользователь загрузил файл
        if (
            fileInput &&
            fileInput.files &&
            fileInput.files.length > 0
        ) {

            const file = fileInput.files[0];

            // Читаем содержимое файла
            const buffer = await file.arrayBuffer();

            // Вычисляем Keccak-256
            const hash = ethers.keccak256(
                new Uint8Array(buffer)
            );

            return hash;
        }

        // Если файл не выбран, используем резервный текст
        return ethers.keccak256(
            ethers.toUtf8Bytes(
                fallbackText || "demo-evidence"
            )
        );

    } catch (err) {

        console.error("Ошибка вычисления хэша файла:", err);

        throw new Error(
            "Не удалось прочитать файл или вычислить его хэш."
        );
    }
}


// ======================================================
// СОКРАЩЕНИЕ АДРЕСОВ И ХЭШЕЙ
// ======================================================

function shortAddr(addr) {

    if (!addr || typeof addr !== "string") {
        return "Не указан";
    }

    if (addr.length <= 13) {
        return addr;
    }

    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
