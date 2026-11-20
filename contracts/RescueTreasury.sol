
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
 *
 * Жизненный цикл заявки:
 * UnderReview -> ChangesRequested -> UnderReview
 * -> Voting -> Approved / Rejected
 * -> Completed / Cancelled
 *
 * Treasury не управляет статусами заявок.
 * Все проверки статусов выполняет RescueDAO.
 */
contract RescueTreasury is ITreasury {

    // =========================================================
    // 1. ОСНОВНЫЕ ПАРАМЕТРЫ
    // =========================================================

    address public immutable dao;

    address public milestonesContract;

    bool private entered;

    // Защита от повторного резервирования одной заявки.
    // Геттер реализует функцию интерфейса ITreasury.
    mapping(uint256 => bool)
        public override requestReservationCreated;

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

    uint256 public totalDonated;

    uint256 public totalReserved;

    uint256 public totalSpent;

    // =========================================================
    // 3. ЦЕЛЕВОЕ ФИНАНСИРОВАНИЕ
    // =========================================================

    uint256 public totalTargetDonations;

    uint256 public totalTargetReserved;

    uint256 public totalTargetSpent;

    uint256 public totalTargetReassigned;

    mapping(uint256 => uint256)
        public requestDonations;

    mapping(uint256 => mapping(address => uint256))
        public userRequestDonations;

    mapping(uint256 => uint256)
        public requestTargetReserved;

    mapping(uint256 => uint256)
        public requestTargetSpent;

    mapping(uint256 => uint256)
        public requestTargetReassigned;

    mapping(uint256 => uint256)
        public requestGeneralReserved;

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

    constructor(address _dao) {
        require(
            _dao != address(0),
            "Invalid DAO address"
        );

        require(
            _dao.code.length > 0,
            "DAO is not a contract"
        );

        dao = _dao;
    }

    // =========================================================
    // 6. НАСТРОЙКА КОНТРАКТА ЭТАПОВ
    // =========================================================

    function setMilestonesContract(
        address _milestones
    )
        external
        override
        onlyDAO
    {
        require(
            _milestones != address(0),
            "Invalid Milestones address"
        );

        require(
            _milestones.code.length > 0,
            "Milestones is not a contract"
        );

        milestonesContract = _milestones;

        emit MilestonesContractUpdated(
            _milestones
        );
    }

    // =========================================================
    // 7. ДОСТУПНЫЕ БАЛАНСЫ
    // =========================================================

    /**
     * Доступный остаток общего фонда.
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
        return
            totalDonated -
            totalReserved -
            totalSpent;
    }

    /**
     * Фактический баланс ETH на контракте.
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
     * Доступные целевые пожертвования конкретной заявки.
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
     * Общая сумма расходов из двух источников.
     */
    function getTotalSpentAllSources()
        external
        view
        override
        returns (uint256)
    {
        return
            totalSpent +
            totalTargetSpent;
    }

    // =========================================================
    // 8. ПОЖЕРТВОВАНИЕ В ОБЩИЙ ФОНД
    // =========================================================

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
     * Проверки существования заявки, её статуса,
     * окончания голосования и лимита сбора выполняет DAO.
     *
     * DAO должно разрешать целевые пожертвования
     * только для заявок в статусе Voting.
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
     * Резервирует средства для одобренной заявки.
     *
     * targetAmount — средства из целевых пожертвований.
     * generalAmount — средства из общего фонда.
     *
     * Резервирование возможно только один раз
     * для каждой заявки.
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
     * Выплачивает средства после подтверждения этапа
     * необходимым количеством валидаторов.
     *
     * Вызывается только RescueMilestones.
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
            requestReservationCreated[requestId],
            "No reservation for request"
        );

        require(
            requestTargetReserved[requestId] >= targetAmount,
            "Insufficient reserved target funds"
        );

        require(
            requestGeneralReserved[requestId] >= generalAmount,
            "Insufficient reserved general funds"
        );

        // Учёт выплаты из целевых средств.
        if (targetAmount > 0) {
            requestTargetReserved[requestId] -= targetAmount;

            totalTargetReserved -= targetAmount;

            requestTargetSpent[requestId] += targetAmount;

            totalTargetSpent += targetAmount;
        }

        // Учёт выплаты из общего фонда.
        if (generalAmount > 0) {
            requestGeneralReserved[requestId] -= generalAmount;

            totalReserved -= generalAmount;

            totalSpent += generalAmount;
        }

        // Перевод ETH получателю.
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
     * Освобождает неиспользованные резервы заявки.
     *
     * Вызывается RescueDAO при отмене одобренной заявки.
     *
     * Целевые средства после освобождения резерва
     * ещё не переводятся в общий фонд.
     *
     * Для этого DAO отдельно вызывает
     * reassignAvailableTargetFunds(requestId).
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

        // Освобождение резерва общего фонда.
        generalReleased =
            requestGeneralReserved[requestId];

        if (generalReleased > 0) {
            totalReserved -= generalReleased;

            requestGeneralReserved[requestId] = 0;
        }

        // Освобождение резерва целевых средств.
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
     * Переводит все доступные целевые пожертвования
     * конкретной заявки в общий фонд.
     *
     * Используется при отклонении или отмене заявки.
     *
     * Уже выплаченные целевые средства не затрагиваются.
     *
     * При отмене одобренной заявки DAO сначала должно
     * вызвать releaseReservation(requestId),
     * а затем reassignAvailableTargetFunds(requestId).
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

        // Переводим средства в общий фонд.
        totalDonated += amount;

        emit TargetFundsReassigned(
            requestId,
            amount
        );
    }

    // =========================================================
    // 14. ЗАПРЕТ НЕКОНТРОЛИРУЕМОГО ПОЛУЧЕНИЯ ETH
    // =========================================================

    receive() external payable {
        revert(
            "Use DAO donation functions"
        );
    }

    fallback() external payable {
        revert(
            "Invalid function call"
        );
    }
}
