// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ITreasury.sol";

/**
 * @title RescueTreasury
 * @dev Финансовое хранилище системы RescueDAO.
 *
 * Контракт отвечает за:
 * - хранение ETH;
 * - приём пожертвований в общий фонд;
 * - приём целевых пожертвований на заявки;
 * - учёт вкладов пользователей;
 * - резервирование средств из двух источников;
 * - выплаты по этапам лечения;
 * - освобождение неиспользованных резервов;
 * - перевод неиспользованных целевых средств в общий фонд.
 *
 * Управление резервами выполняет RescueDAO.
 * Выплаты по этапам лечения выполняет RescueMilestones.
 */
contract RescueTreasury is ITreasury {

    // =========================================================
    // 1. ОСНОВНЫЕ ПАРАМЕТРЫ
    // =========================================================

    address public immutable dao;

    // Контракт, которому разрешено выполнять выплаты.
    address public milestonesContract;

    bool private entered;

    // Защита от повторного резервирования одной заявки.
    mapping(uint256 => bool) public requestReservationCreated;

    modifier onlyDAO() {
        require(
            msg.sender == dao,
            "Only DAO contract"
        );
        _;
    }

    modifier onlyMilestones() {
        require(
            msg.sender == milestonesContract &&
            milestonesContract != address(0),
            "Only Milestones contract"
        );
        _;
    }

    modifier nonReentrant() {
        require(
            !entered,
            "Reentrant call"
        );

        entered = true;
        _;
        entered = false;
    }

    // =========================================================
    // 2. ОБЩИЙ ФОНД
    // =========================================================

    /**
     * Общий объём пожертвований в общий фонд.
     *
     * Включает:
     * - прямые пожертвования;
     * - целевые средства, переведённые в общий фонд.
     */
    uint256 public totalDonated;

    /**
     * Средства общего фонда, зарезервированные
     * для одобренных заявок.
     */
    uint256 public totalReserved;

    /**
     * Средства, выплаченные из общего фонда.
     */
    uint256 public totalSpent;

    // =========================================================
    // 3. ЦЕЛЕВОЕ ФИНАНСИРОВАНИЕ
    // =========================================================

    uint256 public totalTargetDonations;

    uint256 public totalTargetReserved;

    uint256 public totalTargetSpent;

    uint256 public totalTargetReassigned;

    // Общая сумма целевых пожертвований конкретной заявки.
    mapping(uint256 => uint256) public requestDonations;

    // Вклад пользователя в конкретную заявку.
    mapping(uint256 => mapping(address => uint256))
        public userRequestDonations;

    // Целевые средства, зарезервированные для заявки.
    mapping(uint256 => uint256) public requestTargetReserved;

    // Целевые средства, выплаченные по заявке.
    mapping(uint256 => uint256) public requestTargetSpent;

    // Целевые средства, переведённые в общий фонд.
    mapping(uint256 => uint256) public requestTargetReassigned;

    // Средства общего фонда, зарезервированные для заявки.
    mapping(uint256 => uint256) public requestGeneralReserved;

    // =========================================================
    // 4. СОБЫТИЯ
    // =========================================================

    event DonationReceived(
        address indexed donor,
        uint256 amount,
        uint256 totalDonated
    );

    event RequestDonationReceived(
        uint256 indexed requestId,
        address indexed donor,
        uint256 amount,
        uint256 totalRequestDonations
    );

    event TargetFundsReserved(
        uint256 indexed requestId,
        uint256 amount
    );

    event GeneralFundsReserved(
        uint256 indexed requestId,
        uint256 amount
    );

    event TargetFundsReassigned(
        uint256 indexed requestId,
        uint256 amount
    );

    event FundsReleased(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        address recipient,
        uint256 amount
    );

    event FundsReleasedBySource(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        uint256 targetAmount,
        uint256 generalAmount
    );

    event ReservationReleased(
        uint256 indexed requestId,
        uint256 generalAmount,
        uint256 targetAmount
    );

    event MilestonesContractUpdated(
        address indexed milestones
    );

    // =========================================================
    // 5. КОНСТРУКТОР
    // =========================================================

    /**
     * @param _dao Адрес основного контракта RescueDAO.
     */
    constructor(address _dao) {
        require(
            _dao != address(0),
            "Invalid DAO address"
        );

        dao = _dao;
    }

    // =========================================================
    // 6. НАСТРОЙКА КОНТРАКТА ЭТАПОВ
    // =========================================================

    /**
     * @dev Устанавливает адрес RescueMilestones.
     *
     * Вызывать может только RescueDAO.
     * Повторная установка допускается, чтобы можно было
     * заменить контракт этапов при необходимости.
     */
    function setMilestonesContract(
        address _milestones
    )
        external
        onlyDAO
    {
        require(
            _milestones != address(0),
            "Invalid Milestones address"
        );

        milestonesContract = _milestones;

        emit MilestonesContractUpdated(_milestones);
    }

    // =========================================================
    // 7. ДОСТУПНЫЕ БАЛАНСЫ
    // =========================================================

    /**
     * @dev Доступный остаток общего фонда.
     *
     * Не включает зарезервированные и выплаченные средства.
     * Незарезервированные целевые пожертвования сюда не входят.
     */
    function getAvailableBalance()
        public
        view
        override
        returns (uint256)
    {
        return totalDonated - totalReserved - totalSpent;
    }

    /**
     * @dev Фактический баланс ETH на контракте.
     */
    function getContractBalance()
        external
        view
        override
        returns (uint256)
    {
        return address(this).balance;
    }

    /**
     * @dev Доступные целевые пожертвования конкретной заявки.
     *
     * Формула:
     * пожертвования - резерв - выплаты - перевод в общий фонд.
     */
    function getAvailableRequestDonations(
        uint256 requestId
    )
        public
        view
        override
        returns (uint256)
    {
        return
            requestDonations[requestId]
            - requestTargetReserved[requestId]
            - requestTargetSpent[requestId]
            - requestTargetReassigned[requestId];
    }

    /**
     * @dev Общая сумма расходов из двух источников.
     */
    function getTotalSpentAllSources()
        external
        view
        override
        returns (uint256)
    {
        return totalSpent + totalTargetSpent;
    }

    // =========================================================
    // 8. ПОЖЕРТВОВАНИЕ В ОБЩИЙ ФОНД
    // =========================================================

    /**
     * @dev Принимает ETH в общий фонд.
     *
     * Вызывается RescueDAO:
     * treasury.donate{value: msg.value}(msg.sender);
     */
    function donate(
        address donor
    )
        external
        payable
        override
        onlyDAO
    {
        require(
            donor != address(0),
            "Invalid donor address"
        );

        require(
            msg.value > 0,
            "Donation must be greater than zero"
        );

        totalDonated += msg.value;

        emit DonationReceived(
            donor,
            msg.value,
            totalDonated
        );
    }

    // =========================================================
    // 9. ЦЕЛЕВОЕ ПОЖЕРТВОВАНИЕ
    // =========================================================

    /**
     * @dev Принимает ETH для конкретной заявки.
     *
     * Проверки существования заявки, её статуса,
     * окончания голосования и лимита сбора выполняет DAO.
     */
    function donateToRequest(
        uint256 requestId,
        address donor
    )
        external
        payable
        override
        onlyDAO
    {
        require(
            requestId > 0,
            "Invalid request ID"
        );

        require(
            donor != address(0),
            "Invalid donor address"
        );

        require(
            msg.value > 0,
            "Donation must be greater than zero"
        );

        requestDonations[requestId] += msg.value;

        userRequestDonations[requestId][donor] += msg.value;

        totalTargetDonations += msg.value;

        emit RequestDonationReceived(
            requestId,
            donor,
            msg.value,
            requestDonations[requestId]
        );
    }

    // =========================================================
    // 10. РЕЗЕРВИРОВАНИЕ СРЕДСТВ
    // =========================================================

    /**
     * @dev Резервирует средства для одобренной заявки.
     *
     * targetAmount — средства из целевых пожертвований.
     * generalAmount — средства из общего фонда.
     *
     * Распределение определяет RescueDAO.
     */
    function reserveFunds(
        uint256 requestId,
        uint256 targetAmount,
        uint256 generalAmount
    )
        external
        override
        onlyDAO
    {
        require(
            requestId > 0,
            "Invalid request ID"
        );

        require(
            targetAmount + generalAmount > 0,
            "Reservation must be greater than zero"
        );

        require(
            !requestReservationCreated[requestId],
            "Funds already reserved"
        );

        require(
            getAvailableRequestDonations(requestId) >= targetAmount,
            "Insufficient target donations"
        );

        require(
            getAvailableBalance() >= generalAmount,
            "Insufficient general funds"
        );

        requestReservationCreated[requestId] = true;

        // Резервирование целевых средств.
        if (targetAmount > 0) {
            requestTargetReserved[requestId] = targetAmount;

            totalTargetReserved += targetAmount;

            emit TargetFundsReserved(
                requestId,
                targetAmount
            );
        }

        // Резервирование средств общего фонда.
        if (generalAmount > 0) {
            requestGeneralReserved[requestId] = generalAmount;

            totalReserved += generalAmount;

            emit GeneralFundsReserved(
                requestId,
                generalAmount
            );
        }
    }

    // =========================================================
    // 11. ВЫПЛАТА СРЕДСТВ ПО ЭТАПУ ЛЕЧЕНИЯ
    // =========================================================

    /**
     * @dev Выплачивает средства после подтверждения этапа
     * необходимым количеством валидаторов.
     *
     * Вызывается только RescueMilestones.
     *
     * @param requestId ID заявки.
     * @param milestoneId ID этапа лечения.
     * @param recipient Получатель средств.
     * @param amount Полная сумма выплаты.
     * @param targetAmount Часть из целевых пожертвований.
     * @param generalAmount Часть из общего фонда.
     */
    function releaseMilestone(
        uint256 requestId,
        uint256 milestoneId,
        address payable recipient,
        uint256 amount,
        uint256 targetAmount,
        uint256 generalAmount
    )
        external
        override
        onlyMilestones
        nonReentrant
    {
        require(
            requestId > 0,
            "Invalid request ID"
        );

        require(
            recipient != address(0),
            "Invalid recipient"
        );

        require(
            amount > 0,
            "Amount must be greater than zero"
        );

        require(
            targetAmount + generalAmount == amount,
            "Invalid funding distribution"
        );

        require(
            requestTargetReserved[requestId] >= targetAmount,
            "Insufficient reserved target funds"
        );

        require(
            requestGeneralReserved[requestId] >= generalAmount,
            "Insufficient reserved general funds"
        );

        // Обновляем резерв целевых средств.
        if (targetAmount > 0) {
            requestTargetReserved[requestId] -= targetAmount;

            totalTargetReserved -= targetAmount;

            requestTargetSpent[requestId] += targetAmount;

            totalTargetSpent += targetAmount;
        }

        // Обновляем резерв общего фонда.
        if (generalAmount > 0) {
            requestGeneralReserved[requestId] -= generalAmount;

            totalReserved -= generalAmount;

            totalSpent += generalAmount;
        }

        // Отправляем ETH получателю.
        (bool success, ) = recipient.call{
            value: amount
        }("");

        require(
            success,
            "ETH transfer failed"
        );

        emit FundsReleased(
            requestId,
            milestoneId,
            recipient,
            amount
        );

        emit FundsReleasedBySource(
            requestId,
            milestoneId,
            targetAmount,
            generalAmount
        );
    }

    // =========================================================
    // 12. ОСВОБОЖДЕНИЕ РЕЗЕРВОВ
    // =========================================================

    /**
     * @dev Освобождает неиспользованные резервы заявки.
     *
     * Вызывается RescueDAO при отмене одобренной заявки.
     *
     * Целевые средства после освобождения резерва
     * ещё не переводятся в общий фонд.
     *
     * Для этого DAO отдельно вызывает
     * reassignAvailableTargetFunds(requestId).
     *
     * @return generalReleased Освобождённая сумма общего фонда.
     */
    function releaseReservation(
        uint256 requestId
    )
        external
        override
        onlyDAO
        returns (uint256 generalReleased)
    {
        require(
            requestId > 0,
            "Invalid request ID"
        );

        // Освобождаем неиспользованный резерв общего фонда.
        generalReleased = requestGeneralReserved[requestId];

        if (generalReleased > 0) {
            totalReserved -= generalReleased;

            requestGeneralReserved[requestId] = 0;
        }

        // Освобождаем неиспользованный резерв целевых средств.
        uint256 targetReleased =
            requestTargetReserved[requestId];

        if (targetReleased > 0) {
            totalTargetReserved -= targetReleased;

            requestTargetReserved[requestId] = 0;
        }

        emit ReservationReleased(
            requestId,
            generalReleased,
            targetReleased
        );
    }

    // =========================================================
    // 13. ПЕРЕВОД ЦЕЛЕВЫХ СРЕДСТВ В ОБЩИЙ ФОНД
    // =========================================================

    /**
     * @dev Переводит все доступные целевые пожертвования
     * конкретной заявки в общий фонд.
     *
     * Используется:
     * - при отклонении заявки;
     * - при отмене заявки;
     * - после освобождения резервов при отмене.
     *
     * Уже выплаченные целевые средства не затрагиваются.
     */
    function reassignAvailableTargetFunds(
        uint256 requestId
    )
        external
        override
        onlyDAO
        returns (uint256 amount)
    {
        require(
            requestId > 0,
            "Invalid request ID"
        );

        amount = getAvailableRequestDonations(requestId);

        if (amount == 0) {
            return 0;
        }

        // Учитываем перевод целевых средств.
        requestTargetReassigned[requestId] += amount;

        totalTargetReassigned += amount;

        // Теперь эти средства относятся к общему фонду.
        totalDonated += amount;

        emit TargetFundsReassigned(
            requestId,
            amount
        );
    }

    // =========================================================
    // 14. ЗАПРЕТ НЕКОНТРОЛИРУЕМОГО ПОЛУЧЕНИЯ ETH
    // =========================================================

    /**
     * @dev Прямые переводы ETH запрещены.
     *
     * Пожертвования должны проходить через функции DAO.
     */
    receive() external payable {
        revert("Use DAO donation functions");
    }

    fallback() external payable {
        revert("Invalid function call");
    }
}
