
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
// ПРОВЕРКА ПОДКЛЮЧЕНИЯ КОШЕЛЬКА
// ======================================================

function isWalletConnected() {

    return Boolean(
        provider &&
        signer &&
        userAddress
    );
}


// ======================================================
// ПРОВЕРКА ДОСТУПНОСТИ КОНТРАКТА И МЕТОДОВ
// ======================================================

function requireContract(instance, name) {

    if (!instance) {

        throw new Error(
            `${name} не инициализирован.`
        );
    }
}


function requireMethod(
    instance,
    methodName,
    contractName
) {

    requireContract(
        instance,
        contractName
    );

    if (
        typeof instance[methodName] !== "function"
    ) {

        throw new Error(
            `В ABI ${contractName} отсутствует функция ${methodName}().`
        );
    }
}


// ======================================================
// ПРОВЕРКА АДМИНИСТРАТОРА DAO
// ======================================================

async function isCurrentUserAdmin() {

    if (
        !isWalletConnected() ||
        !contract
    ) {
        return false;
    }

    try {

        requireMethod(
            contract,
            "admin",
            "RescueDAO"
        );

        const adminAddress = await contract.admin();

        return (
            String(adminAddress).toLowerCase() ===
            String(userAddress).toLowerCase()
        );

    } catch (err) {

        console.error(
            "Ошибка проверки администратора DAO:",
            err
        );

        return false;
    }
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

    /*
     * Основной контракт DAO.
     *
     * Используется для:
     * - создания заявок;
     * - регистрации участников;
     * - пожертвований;
     * - проверки ролей;
     * - определения администратора;
     * - проверки и изменения статусов заявок;
     * - публикации одобренных заявок;
     * - взаимодействия с системой этапов.
     *
     * При подключённом кошельке использует signer.
     * Без подключённого кошелька работает через provider.
     */

    contract = new ethers.Contract(
        DAO_ADDRESS,
        DAO_ABI,
        connection
    );


    // --------------------------------------------------
    // RescueDAOView
    // --------------------------------------------------

    /*
     * Контракт для чтения данных DAO:
     * - количества заявок;
     * - информации о заявках;
     * - финансовой статистики;
     * - информации об участниках;
     * - информации об этапах.
     *
     * Использует provider, поскольку транзакции
     * через этот контракт не выполняются.
     */

    daoViewContract = new ethers.Contract(
        DAO_VIEW_ADDRESS,
        DAO_VIEW_ABI,
        provider
    );


    // --------------------------------------------------
    // RescueTreasury
    // --------------------------------------------------

    /*
     * Контракт казначейства.
     *
     * Используется для чтения:
     * - общего объёма пожертвований;
     * - зарезервированных средств;
     * - доступного баланса;
     * - целевых пожертвований;
     * - информации о выплатах.
     */

    treasuryContract = new ethers.Contract(
        TREASURY_ADDRESS,
        TREASURY_ABI,
        provider
    );


    // --------------------------------------------------
    // RescueMilestones
    // --------------------------------------------------

    /*
     * Контракт этапов финансирования.
     *
     * Используется для:
     * - создания этапов;
     * - редактирования этапов до публикации;
     * - резервирования средств;
     * - отправки отчётов;
     * - подтверждения этапов валидаторами;
     * - получения информации о выплатах;
     * - проверки состояния финансирования этапов.
     *
     * При подключённом кошельке использует signer,
     * поскольку через него выполняются транзакции.
     */

    milestonesContract = new ethers.Contract(
        MILESTONES_ADDRESS,
        MILESTONES_ABI,
        connection
    );


    // --------------------------------------------------
    // RescueNFT
    // --------------------------------------------------

    /*
     * NFT-контракт.
     *
     * Используется для чтения:
     * - идентификатора NFT по заявке;
     * - владельца NFT;
     * - metadata паспорта.
     */

    nftContract = new ethers.Contract(
        NFT_ADDRESS,
        NFT_ABI,
        provider
    );

    if (
        typeof HERO_CARDS_ADDRESS !== "undefined" &&
        isConfiguredAddress(HERO_CARDS_ADDRESS)
    ) {
        heroCardsReadContract = new ethers.Contract(
            HERO_CARDS_ADDRESS,
            HERO_CARDS_ABI,
            provider
        );
    } else {
        heroCardsReadContract = null;
    }


    console.log(
        "Контракты инициализированы:",
        {
            RescueDAO: DAO_ADDRESS,
            RescueDAOView: DAO_VIEW_ADDRESS,
            RescueTreasury: TREASURY_ADDRESS,
            RescueMilestones: MILESTONES_ADDRESS,
            RescueNFT: NFT_ADDRESS,
            walletConnected: isWalletConnected()
        }
    );
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
            "Вы подключены к неправильной сети MetaMask." +
            "Для работы RescueDAO выберите локальную сеть Geth " +
            "с Chain ID 1337."
        );

        return false;
    }

    return true;
}


// ======================================================
// РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ METAMASK
// ======================================================

function registerMetaMaskListeners() {

    if (!window.ethereum) {
        return;
    }

    // Удаляем предыдущие обработчики,
    // чтобы они не регистрировались повторно.

    window.ethereum.removeListener?.(
        "accountsChanged",
        handleAccountsChanged
    );

    window.ethereum.removeListener?.(
        "chainChanged",
        handleChainChanged
    );

    // Регистрируем обработчики.

    window.ethereum.on(
        "accountsChanged",
        handleAccountsChanged
    );

    window.ethereum.on(
        "chainChanged",
        handleChainChanged
    );
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
        // 4. Регистрируем события MetaMask
        // --------------------------------------------------

        registerMetaMaskListeners();


        // --------------------------------------------------
        // 5. Проверяем сеть
        // --------------------------------------------------

        const networkReady = await checkNetwork();

        if (!networkReady) {

            resetWalletState();

            return false;
        }


        // --------------------------------------------------
        // 6. Проверяем подключённый аккаунт
        // --------------------------------------------------

        const accounts = await provider.send(
            "eth_accounts",
            []
        );


        // --------------------------------------------------
        // 7. Инициализируем контракты
        // --------------------------------------------------

        if (accounts.length > 0) {

            // Кошелёк уже подключён.
            const ready = await setupSigner(
                accounts[0]
            );

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


        console.log(
            "Web3 успешно инициализирован."
        );

        return true;

    } catch (err) {

        console.error(
            "Ошибка инициализации Web3:",
            err
        );

        alert(
            "Не удалось подключиться к блокчейну." +
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

        if (
            !accounts ||
            accounts.length === 0
        ) {

            resetWalletState();

            if (provider) {

                // Пересоздаём контракты в режиме чтения.
                initializeContracts(provider);
            }

            updateConnectButton();
            updateRoleBadge();

            // Обновляем интерфейс страницы.
            window.location.reload();

            return;
        }


        // --------------------------------------------------
        // Если выбран другой аккаунт
        // --------------------------------------------------

        const ready = await setupSigner(
            accounts[0]
        );

        if (!ready) {
            return;
        }

        window.location.reload();

    } catch (err) {

        console.error(
            "Ошибка смены аккаунта:",
            err
        );

        alert(
            "Не удалось переключить аккаунт MetaMask." +
            getErrorMessage(err)
        );
    }
}


// ======================================================
// ОБРАБОТКА СМЕНЫ СЕТИ
// ======================================================

async function handleChainChanged() {

    /*
     * При смене сети перезагружаем страницу,
     * чтобы исключить использование старых экземпляров
     * provider и контрактов.
     */

    resetWalletState();

    window.location.reload();
}


// ======================================================
// ПОДКЛЮЧЕНИЕ КОШЕЛЬКА
// ======================================================

async function connectWallet() {

    try {

        if (!window.ethereum) {

            alert(
                "MetaMask не найден!"
            );

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

        const accounts = await provider.send(
            "eth_requestAccounts",
            []
        );

        if (
            !accounts ||
            accounts.length === 0
        ) {

            alert(
                "MetaMask не предоставил доступ к аккаунту."
            );

            return;
        }


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

        const ready = await setupSigner(
            accounts[0]
        );

        if (!ready) {
            return;
        }


        // --------------------------------------------------
        // 6. Регистрируем обработчики событий
        // --------------------------------------------------

        registerMetaMaskListeners();


        // --------------------------------------------------
        // 7. Обновляем страницу
        // --------------------------------------------------

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

async function setupSigner(accountAddress = null) {

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

        initializeContracts(provider);

        updateConnectButton();
        updateRoleBadge();

        return false;
    }


    // --------------------------------------------------
    // 2. Получаем подписанта
    // --------------------------------------------------

    if (accountAddress) {

        signer = await provider.getSigner(
            accountAddress
        );

    } else {

        signer = await provider.getSigner();
    }


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


    // --------------------------------------------------
    // 5. Обновляем кнопку подключения
    // --------------------------------------------------

    updateConnectButton();


    // --------------------------------------------------
    // 6. Сбрасываем предыдущие роли
    // --------------------------------------------------

    userRoles = {
        isAdmin: false,
        isMember: false,
        isValidator: false
    };


    // --------------------------------------------------
    // 7. Определяем роли пользователя
    // --------------------------------------------------

    /*
     * Каждую роль проверяем отдельно.
     *
     * Если один метод отсутствует в ABI или вызывает
     * ошибку, это не должно сбрасывать результаты
     * остальных проверок.
     */


    // --------------------------------------------------
    // Проверка администратора
    // --------------------------------------------------

    try {

        requireMethod(
            contract,
            "admin",
            "RescueDAO"
        );

        const adminAddr = await contract.admin();

        userRoles.isAdmin =
            adminAddr.toLowerCase() ===
            userAddress.toLowerCase();

    } catch (err) {

        console.warn(
            "Не удалось определить роль администратора:",
            err
        );

        userRoles.isAdmin = false;
    }


    // --------------------------------------------------
    // Проверка участника DAO
    // --------------------------------------------------

    try {

        requireMethod(
            contract,
            "isMember",
            "RescueDAO"
        );

        const memberFlag = await contract.isMember(
            userAddress
        );

        userRoles.isMember = Boolean(
            memberFlag
        );

    } catch (err) {

        console.warn(
            "Не удалось определить роль участника DAO:",
            err
        );

        userRoles.isMember = false;
    }


    // --------------------------------------------------
    // Проверка валидатора
    // --------------------------------------------------

    try {

        requireMethod(
            contract,
            "isValidator",
            "RescueDAO"
        );

        const validatorFlag = await contract.isValidator(
            userAddress
        );

        userRoles.isValidator = Boolean(
            validatorFlag
        );

    } catch (err) {

        console.warn(
            "Не удалось определить роль валидатора:",
            err
        );

        userRoles.isValidator = false;
    }


    // --------------------------------------------------
    // 8. Обновляем индикатор ролей
    // --------------------------------------------------

    updateRoleBadge();


    // --------------------------------------------------
    // 9. Выводим информацию в консоль
    // --------------------------------------------------

    console.log(
        "Кошелёк подключён:",
        userAddress
    );

    console.log(
        "Роли пользователя:",
        userRoles
    );


    return true;
}


// ======================================================
// ОБНОВЛЕНИЕ КНОПКИ ПОДКЛЮЧЕНИЯ
// ======================================================

function updateConnectButton() {

    const btn = document.getElementById(
        "connectBtn"
    );

    if (!btn) {
        return;
    }


    if (userAddress) {

        btn.textContent =
            `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

        btn.className =
            "btn btn-outline";

    } else {

        btn.textContent =
            "Подключить кошелёк";

        btn.className =
            "btn btn-primary";
    }
}


// ======================================================
// ОБНОВЛЕНИЕ ИНДИКАТОРА РОЛЕЙ
// ======================================================

function updateRoleBadge() {

    const badge = document.getElementById(
        "roleBadge"
    );

    if (!badge) {
        return;
    }


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

        // --------------------------------------------------
        // Если пользователь загрузил файл
        // --------------------------------------------------

        if (
            fileInput &&
            fileInput.files &&
            fileInput.files.length > 0
        ) {

            const file = fileInput.files[0];

            // Читаем содержимое файла.
            const buffer = await file.arrayBuffer();

            // Вычисляем Keccak-256.
            const hash = ethers.keccak256(
                new Uint8Array(buffer)
            );

            return hash;
        }


        // --------------------------------------------------
        // Если файл не выбран
        // --------------------------------------------------

        /*
         * Используем резервный текст.
         *
         * Это позволяет сформировать хэш даже тогда,
         * когда пользователь не прикрепил отдельный файл.
         */

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
