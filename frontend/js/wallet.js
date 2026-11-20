
// ======================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ======================================================

// Web3
let provider = null;
let signer = null;
let userAddress = null;

// Основные контракты
let contract = null;
let daoViewContract = null;
let treasuryContract = null;
let milestonesContract = null;
let nftContract = null;

// Роли пользователя
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
// СОЗДАНИЕ ЭКЗЕМПЛЯРОВ КОНТРАКТОВ
// ======================================================

function initializeContracts(connection) {

    if (!connection) {
        throw new Error(
            "Не передан Web3 provider или signer."
        );
    }

    if (!provider) {
        throw new Error(
            "Web3 provider не инициализирован."
        );
    }

    // --------------------------------------------------
    // RescueDAO
    // --------------------------------------------------

    // Основной контракт.
    // Используется для:
    // - создания заявок;
    // - голосования;
    // - регистрации участников;
    // - финализации заявок;
    // - проверки ролей.
    //
    // При подключённом кошельке получает signer.
    // Без кошелька работает только для чтения через provider.

    contract = new ethers.Contract(
        DAO_ADDRESS,
        DAO_ABI,
        connection
    );


    // --------------------------------------------------
    // RescueDAOView
    // --------------------------------------------------

    // Контракт для чтения:
    // - количества заявок;
    // - информации о заявках;
    // - статистики голосования;
    // - информации об участниках.

    daoViewContract = new ethers.Contract(
        DAO_VIEW_ADDRESS,
        DAO_VIEW_ABI,
        provider
    );


    // --------------------------------------------------
    // RescueTreasury
    // --------------------------------------------------

    // Контракт казначейства.
    // Используется для чтения:
    // - общего объёма пожертвований;
    // - зарезервированных средств;
    // - доступного баланса;
    // - целевых пожертвований;
    // - информации о выплатах.

    treasuryContract = new ethers.Contract(
        TREASURY_ADDRESS,
        TREASURY_ABI,
        provider
    );


    // --------------------------------------------------
    // RescueMilestones
    // --------------------------------------------------

    // Контракт этапов финансирования.
    // Используется для:
    // - создания этапов;
    // - отправки отчётов;
    // - подтверждения этапов валидаторами;
    // - получения информации о выплатах.
    //
    // При подключённом кошельке получает signer.

    milestonesContract = new ethers.Contract(
        MILESTONES_ADDRESS,
        MILESTONES_ABI,
        connection
    );


    // --------------------------------------------------
    // RescueNFT
    // --------------------------------------------------

    // NFT-контракт.
    // Используется для чтения:
    // - идентификатора NFT по заявке;
    // - владельца NFT;
    // - metadata паспорта.

    nftContract = new ethers.Contract(
        NFT_ADDRESS,
        NFT_ABI,
        provider
    );


    console.log("Контракты инициализированы:", {
        RescueDAO: DAO_ADDRESS,
        RescueDAOView: DAO_VIEW_ADDRESS,
        RescueTreasury: TREASURY_ADDRESS,
        RescueMilestones: MILESTONES_ADDRESS,
        RescueNFT: NFT_ADDRESS
    });
}


// ======================================================
// ПРОВЕРКА АДРЕСОВ КОНТРАКТОВ
// ======================================================

function validateContractAddresses() {

    const addresses = {
        RescueDAO: DAO_ADDRESS,
        RescueDAOView: DAO_VIEW_ADDRESS,
        RescueTreasury: TREASURY_ADDRESS,
        RescueMilestones: MILESTONES_ADDRESS,
        RescueNFT: NFT_ADDRESS
    };

    for (const [name, address] of Object.entries(addresses)) {

        if (
            typeof address !== "string" ||
            !ethers.isAddress(address)
        ) {
            console.error(
                `Некорректный адрес ${name}:`,
                address
            );

            throw new Error(
                `Некорректный адрес контракта ${name}.`
            );
        }

        if (
            address.toLowerCase() ===
            ethers.ZeroAddress.toLowerCase()
        ) {
            throw new Error(
                `Для ${name} указан нулевой адрес.`
            );
        }
    }

    return true;
}


// ======================================================
// ПРОВЕРКА СЕТИ
// ======================================================

async function checkNetwork() {

    if (!provider) {
        throw new Error(
            "Web3-провайдер не инициализирован."
        );
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

        // --------------------------------------------------
        // 1. Проверяем наличие MetaMask
        // --------------------------------------------------

        if (!window.ethereum) {

            alert(
                "Установите расширение MetaMask и откройте сайт " +
                "через локальный сервер (например, Live Server)."
            );

            return false;
        }


        // --------------------------------------------------
        // 2. Проверяем адреса контрактов
        // --------------------------------------------------

        validateContractAddresses();


        // --------------------------------------------------
        // 3. Создаём provider
        // --------------------------------------------------

        provider = new ethers.BrowserProvider(
            window.ethereum
        );


        // --------------------------------------------------
        // 4. Проверяем сеть
        // --------------------------------------------------

        const networkReady = await checkNetwork();

        if (!networkReady) {
            resetWalletState();
            return false;
        }


        // --------------------------------------------------
        // 5. Проверяем подключённый аккаунт
        // --------------------------------------------------

        const accounts = await provider.send(
            "eth_accounts",
            []
        );


        // --------------------------------------------------
        // 6. Инициализируем контракты
        // --------------------------------------------------

        if (accounts.length > 0) {

            // Кошелёк уже подключён.
            const ready = await setupSigner();

            if (!ready) {
                return false;
            }

        } else {

            // Кошелёк не подключён.
            // Разрешаем чтение данных блокчейна.

            resetWalletState();

            initializeContracts(provider);

            updateConnectButton();
            updateRoleBadge();
        }


        // --------------------------------------------------
        // 7. Подписываемся на события MetaMask
        // --------------------------------------------------

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


        console.log("Web3 успешно инициализирован.");

        return true;

    } catch (err) {

        console.error(
            "Ошибка инициализации Web3:",
            err
        );

        alert(
            "Не удалось подключиться к блокчейну.\n\n" +
            getErrorMessage(err)
        );

        return false;
    }
}


// ======================================================
// ОБРАБОТКА СМЕНЫ АККАУНТА
// ======================================================

async function handleAccountsChanged(accounts) {

    try {

        // --------------------------------------------------
        // Если пользователь отключил кошелёк
        // --------------------------------------------------

        if (!accounts || accounts.length === 0) {

            resetWalletState();

            if (provider) {

                // Пересоздаём контракты в режиме чтения.
                initializeContracts(provider);
            }

            updateConnectButton();
            updateRoleBadge();

            // Обновляем страницу, чтобы убрать
            // доступные транзакционные действия.
            window.location.reload();

            return;
        }


        // --------------------------------------------------
        // Если выбран другой аккаунт
        // --------------------------------------------------

        const ready = await setupSigner();

        if (!ready) {
            return;
        }

        window.location.reload();

    } catch (err) {

        console.error(
            "Ошибка смены аккаунта:",
            err
        );
    }
}


// ======================================================
// ОБРАБОТКА СМЕНЫ СЕТИ
// ======================================================

async function handleChainChanged() {

    // При смене сети заново проверяем подключение.
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


        // --------------------------------------------------
        // 1. Создаём provider, если он ещё не создан
        // --------------------------------------------------

        if (!provider) {

            provider = new ethers.BrowserProvider(
                window.ethereum
            );
        }


        // --------------------------------------------------
        // 2. Проверяем адреса контрактов
        // --------------------------------------------------

        validateContractAddresses();


        // --------------------------------------------------
        // 3. Запрашиваем доступ к аккаунтам
        // --------------------------------------------------

        await provider.send(
            "eth_requestAccounts",
            []
        );


        // --------------------------------------------------
        // 4. Проверяем правильность сети
        // --------------------------------------------------

        const networkReady = await checkNetwork();

        if (!networkReady) {
            return;
        }


        // --------------------------------------------------
        // 5. Подключаем signer и загружаем роли
        // --------------------------------------------------

        const ready = await setupSigner();

        if (!ready) {
            return;
        }


        window.location.reload();

    } catch (err) {

        console.error(
            "Ошибка подключения кошелька:",
            err
        );

        if (err.code === 4001) {

            alert(
                "Вы отклонили запрос на подключение MetaMask."
            );

        } else {

            alert(
                "Не удалось подключить кошелёк: " +
                getErrorMessage(err)
            );
        }
    }
}


// ======================================================
// НАСТРОЙКА SIGNER И ОПРЕДЕЛЕНИЕ РОЛЕЙ
// ======================================================

async function setupSigner() {

    if (!provider) {

        throw new Error(
            "Провайдер Web3 не инициализирован."
        );
    }


    // --------------------------------------------------
    // 1. Проверяем сеть
    // --------------------------------------------------

    const networkReady = await checkNetwork();

    if (!networkReady) {

        resetWalletState();

        if (provider) {
            initializeContracts(provider);
        }

        updateConnectButton();
        updateRoleBadge();

        return false;
    }


    // --------------------------------------------------
    // 2. Получаем подписанта
    // --------------------------------------------------

    signer = await provider.getSigner();


    // --------------------------------------------------
    // 3. Получаем адрес пользователя
    // --------------------------------------------------

    userAddress = await signer.getAddress();


    // --------------------------------------------------
    // 4. Создаём экземпляры контрактов
    // --------------------------------------------------

    /*
     * RescueDAO и RescueMilestones получают signer,
     * поскольку через них выполняются транзакции.
     *
     * RescueDAOView, RescueTreasury и RescueNFT
     * используются для чтения через provider.
     */

    initializeContracts(signer);


    // Обновляем кнопку подключения.
    updateConnectButton();


    // --------------------------------------------------
    // 5. Получаем роли пользователя из RescueDAO
    // --------------------------------------------------

    try {

        const [
            adminAddr,
            memberFlag,
            valFlag
        ] = await Promise.all([

            contract.admin(),

            contract.isMember(userAddress),

            contract.isValidator(userAddress)

        ]);


        // --------------------------------------------------
        // 6. Проверяем права администратора
        // --------------------------------------------------

        userRoles.isAdmin =
            adminAddr.toLowerCase() ===
            userAddress.toLowerCase();


        // --------------------------------------------------
        // 7. Проверяем регистрацию в DAO
        // --------------------------------------------------

        userRoles.isMember =
            Boolean(memberFlag);


        // --------------------------------------------------
        // 8. Проверяем роль валидатора
        // --------------------------------------------------

        userRoles.isValidator =
            Boolean(valFlag);


        // Обновляем индикатор ролей.
        updateRoleBadge();


        console.log(
            "Кошелёк подключён:",
            userAddress
        );

        console.log(
            "Роли пользователя:",
            userRoles
        );


    } catch (err) {

        console.warn(
            "Не удалось определить роли кошелька:",
            err
        );


        // Не предоставляем дополнительные права
        // при ошибке определения ролей.

        userRoles = {
            isAdmin: false,
            isMember: false,
            isValidator: false
        };

        updateRoleBadge();

        /*
         * Важно:
         * ошибка определения ролей не должна блокировать
         * чтение данных из DAOView, Treasury и NFT.
         *
         * Кошелёк остаётся подключённым, но действия,
         * требующие роли, будут недоступны.
         */
    }


    return true;
}


// ======================================================
// ОБНОВЛЕНИЕ КНОПКИ ПОДКЛЮЧЕНИЯ
// ======================================================

function updateConnectButton() {

    const btn =
        document.getElementById("connectBtn");

    if (!btn) return;


    if (userAddress) {

        btn.textContent =
            `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

        btn.className = "btn btn-outline";

    } else {

        btn.textContent =
            "Подключить кошелёк";

        btn.className = "btn btn-primary";
    }
}


// ======================================================
// ОБНОВЛЕНИЕ ИНДИКАТОРА РОЛЕЙ
// ======================================================

function updateRoleBadge() {

    const badge =
        document.getElementById("roleBadge");

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

        badge.textContent =
            labels.join(" · ");

        badge.className =
            "badge badge-blue";

    } else if (userAddress) {

        badge.textContent =
            "Донор";

        badge.className =
            "badge badge-gray";

    } else {

        badge.textContent =
            "Кошелёк не подключён";

        badge.className =
            "badge badge-gray";
    }
}


// ======================================================
// ВЫЧИСЛЕНИЕ KECCAK-256 ХЭША ФАЙЛА
// ======================================================

async function hashFileOrDefault(
    fileInput,
    fallbackText
) {

    try {

        // Если пользователь загрузил файл.
        if (
            fileInput &&
            fileInput.files &&
            fileInput.files.length > 0
        ) {

            const file =
                fileInput.files[0];


            // Читаем содержимое файла.
            const buffer =
                await file.arrayBuffer();


            // Вычисляем Keccak-256.
            const hash = ethers.keccak256(
                new Uint8Array(buffer)
            );


            return hash;
        }


        // Если файл не выбран,
        // используем резервный текст.
        return ethers.keccak256(
            ethers.toUtf8Bytes(
                fallbackText || "demo-evidence"
            )
        );

    } catch (err) {

        console.error(
            "Ошибка вычисления хэша файла:",
            err
        );

        throw new Error(
            "Не удалось прочитать файл или вычислить его хэш."
        );
    }
}


// ======================================================
// СОКРАЩЕНИЕ АДРЕСОВ И ХЭШЕЙ
// ======================================================

function shortAddr(addr) {

    if (!addr) {
        return "Не указан";
    }

    const value = String(addr);

    if (value.length <= 13) {
        return value;
    }

    return `${value.slice(0, 6)}...${value.slice(-4)}`;
}


// ======================================================
// ФОРМАТИРОВАНИЕ ОШИБОК
// ======================================================

function getErrorMessage(err) {

    return (
        err?.reason ||
        err?.shortMessage ||
        err?.info?.error?.message ||
        err?.message ||
        "Неизвестная ошибка"
    );
}
