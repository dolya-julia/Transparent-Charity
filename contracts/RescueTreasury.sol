
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ITreasury.sol";

// =========================================================
// ИНТЕРФЕЙС ДЛЯ ПОЛУЧЕНИЯ КОЛИЧЕСТВА ЭТАПОВ
// =========================================================

interface IRescueMilestoneCounter {
    function milestoneCount(
        uint256 requestId
    ) external view returns (uint256);
}

// =========================================================
// ОСНОВНОЙ КОНТРАКТ RESCUETREASURY
// =========================================================

contract RescueTreasury is ITreasury {

    // =====================================================
    // 1. ОСНОВНЫЕ ПАРАМЕТРЫ
    // =====================================================

    address public immutable dao;

    address public milestonesContract;

    bool private entered;

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

    // =====================================================
    // 2. ОБЩИЙ ФОНД
    // =====================================================

    /**
     * Все средства общего фонда.
     *
     * Сюда входят:
     * - прямые пожертвования в общий фонд;
     * - адресные средства, переведённые в общий фонд.
     */
    uint256 public totalDonated;

    /**
     * Зарезервированные средства общего фонда.
     */
    uint256 public totalReserved;

    /**
     * Средства общего фонда, уже перечисленные получателям.
     */
    uint256 public totalSpent;


    // =====================================================
    // 3. АДРЕСНОЕ ФИНАНСИРОВАНИЕ
    // =====================================================

    uint256 public totalTargetDonations;

    uint256 public totalTargetReserved;

    uint256 public totalTargetSpent;

    uint256 public totalTargetReassigned;

    /**
     * Все адресные пожертвования конкретной заявки.
     */
    mapping(uint256 => uint256)
        public override requestDonations;

    /**
     * Пожертвования конкретного пользователя на заявку.
     */
    mapping(uint256 => mapping(address => uint256))
        public override userRequestDonations;

    /**
     * Целевые средства заявки, находящиеся в резерве.
     */
    mapping(uint256 => uint256)
        public override requestTargetReserved;

    /**
     * Целевые средства заявки, уже потраченные.
     */
    mapping(uint256 => uint256)
        public override requestTargetSpent;

    /**
     * Целевые средства заявки, переведённые в общий фонд.
     */
    mapping(uint256 => uint256)
        public override requestTargetReassigned;

    /**
     * Средства общего фонда, зарезервированные для заявки.
     */
    mapping(uint256 => uint256)
        public override requestGeneralReserved;


    // =====================================================
    // 4. РЕЗЕРВЫ ОТДЕЛЬНЫХ ЭТАПОВ
    // =====================================================

    mapping(uint256 => mapping(uint256 => uint256))
        public override milestoneTargetReserved;

    mapping(uint256 => mapping(uint256 => uint256))
        public override milestoneGeneralReserved;

    mapping(uint256 => mapping(uint256 => bool))
        public override milestoneReservationCreated;


    // =====================================================
    // 5. СОБЫТИЯ
    // =====================================================

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

    event MilestoneFundsReserved(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        uint256 targetAmount,
        uint256 generalAmount
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


    // =====================================================
    // 6. КОНСТРУКТОР
    // =====================================================

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


    // =====================================================
    // 7. НАСТРОЙКА КОНТРАКТА ЭТАПОВ
    // =====================================================

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

        emit MilestonesContractUpdated(_milestones);
    }


    // =====================================================
    // 8. ДОСТУПНЫЕ БАЛАНСЫ
    // =====================================================

    /**
     * Доступный баланс общего фонда.
     *
     * Переведённые из адресных пожертвований средства
     * также учитываются в общем фонде.
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
     * Фактический ETH-баланс контракта.
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
     * Доступные адресные средства заявки.
     *
     * Из суммы пожертвований вычитаются:
     * - зарезервированные средства;
     * - уже потраченные средства;
     * - средства, переведённые в общий фонд.
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
     * Общая сумма выплат из обоих источников.
     */
    function getTotalSpentAllSources()
        external
        view
        override
        returns (uint256)
    {
        return totalSpent + totalTargetSpent;
    }


    // =====================================================
    // 9. ПОЖЕРТВОВАНИЕ В ОБЩИЙ ФОНД
    // =====================================================

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


    // =====================================================
    // 10. АДРЕСНОЕ ПОЖЕРТВОВАНИЕ
    // =====================================================

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


    // =====================================================
    // 11. РЕЗЕРВИРОВАНИЕ СРЕДСТВ ДЛЯ ЭТАПА
    // =====================================================

    /**
     * Вызывается RescueMilestones.
     *
     * Сначала RescueMilestones определяет, сколько средств
     * необходимо взять из адресных пожертвований и сколько
     * добавить из общего фонда.
     *
     * Treasury проверяет доступность обеих частей
     * и фиксирует резервы.
     */
    function reserveMilestoneFunds(
        uint256 requestId,
        uint256 milestoneId,
        uint256 targetAmount,
        uint256 generalAmount
    )
        external
        override
        onlyMilestones
    {
        require(
            requestId > 0,
            "Invalid request ID"
        );

        require(
            milestoneId > 0,
            "Invalid milestone ID"
        );

        require(
            targetAmount + generalAmount > 0,
            "Empty reservation"
        );

        require(
            !milestoneReservationCreated[requestId][milestoneId],
            "Milestone already funded"
        );

        require(
            getAvailableRequestDonations(requestId) >= targetAmount,
            "Insufficient target donations"
        );

        require(
            getAvailableBalance() >= generalAmount,
            "Insufficient general funds"
        );

        milestoneReservationCreated[requestId][milestoneId] = true;

        milestoneTargetReserved[requestId][milestoneId] =
            targetAmount;

        milestoneGeneralReserved[requestId][milestoneId] =
            generalAmount;

        requestReservationCreated[requestId] = true;

        // Резервы заявки.
        requestTargetReserved[requestId] += targetAmount;
        requestGeneralReserved[requestId] += generalAmount;

        // Глобальные резервы.
        totalTargetReserved += targetAmount;
        totalReserved += generalAmount;

        emit MilestoneFundsReserved(
            requestId,
            milestoneId,
            targetAmount,
            generalAmount
        );

        if (targetAmount > 0) {
            emit TargetFundsReserved(
                requestId,
                targetAmount
            );
        }

        if (generalAmount > 0) {
            emit GeneralFundsReserved(
                requestId,
                generalAmount
            );
        }
    }


    // =====================================================
    // 12. ВЫПЛАТА СРЕДСТВ ПО ЭТАПУ
    // =====================================================

    /**
     * Вызывается RescueMilestones после подтверждения
     * выполнения этапа необходимым количеством валидаторов.
     *
     * Перечисляет средства непосредственно получателю этапа.
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
            milestoneReservationCreated[requestId][milestoneId],
            "Milestone not funded"
        );

        require(
            milestoneTargetReserved[requestId][milestoneId] == targetAmount,
            "Invalid target reserve"
        );

        require(
            milestoneGeneralReserved[requestId][milestoneId] == generalAmount,
            "Invalid general reserve"
        );

        // ---------------------------------------------
        // Списание целевого резерва
        // ---------------------------------------------

        if (targetAmount > 0) {
            milestoneTargetReserved[requestId][milestoneId] = 0;

            requestTargetReserved[requestId] -= targetAmount;
            totalTargetReserved -= targetAmount;

            requestTargetSpent[requestId] += targetAmount;
            totalTargetSpent += targetAmount;
        }

        // ---------------------------------------------
        // Списание резерва общего фонда
        // ---------------------------------------------

        if (generalAmount > 0) {
            milestoneGeneralReserved[requestId][milestoneId] = 0;

            requestGeneralReserved[requestId] -= generalAmount;
            totalReserved -= generalAmount;

            totalSpent += generalAmount;
        }

        // ---------------------------------------------
        // Перечисление ETH получателю
        // ---------------------------------------------

        (bool success, ) = recipient.call{value: amount}("");

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


    // =====================================================
    // 13. ОСВОБОЖДЕНИЕ ВСЕХ РЕЗЕРВОВ ЗАЯВКИ
    // =====================================================

    /**
     * Вызывается DAO при отмене заявки.
     *
     * Освобождает все неиспользованные резервы этапов.
     *
     * Возвращает только generalReleased.
     *
     * Целевой резерв DAO предварительно получает через
     * requestTargetReserved(requestId).
     *
     * Уже выплаченные средства не затрагиваются.
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

        uint256 targetReleased;

        if (milestonesContract != address(0)) {
            uint256 count =
                IRescueMilestoneCounter(milestonesContract)
                    .milestoneCount(requestId);

            for (uint256 i = 1; i <= count; i++) {
                uint256 targetAmount =
                    milestoneTargetReserved[requestId][i];

                uint256 generalAmount =
                    milestoneGeneralReserved[requestId][i];

                if (
                    targetAmount == 0 &&
                    generalAmount == 0
                ) {
                    continue;
                }

                milestoneTargetReserved[requestId][i] = 0;
                milestoneGeneralReserved[requestId][i] = 0;

                targetReleased += targetAmount;
                generalReleased += generalAmount;
            }
        }

        // Освобождаем резервы целевых средств.
        if (targetReleased > 0) {
            requestTargetReserved[requestId] -= targetReleased;
            totalTargetReserved -= targetReleased;
        }

        // Освобождаем резервы общего фонда.
        if (generalReleased > 0) {
            requestGeneralReserved[requestId] -= generalReleased;
            totalReserved -= generalReleased;
        }

        emit ReservationReleased(
            requestId,
            generalReleased,
            targetReleased
        );
    }


    // =====================================================
    // 14. ПЕРЕВОД АДРЕСНЫХ СРЕДСТВ В ОБЩИЙ ФОНД
    // =====================================================

    /**
     * Переводит все доступные адресные пожертвования
     * заявки в общий фонд.
     *
     * Зарезервированные и уже потраченные средства
     * не затрагиваются.
     *
     * ETH физически остаётся в Treasury.
     * Меняется только его финансовая категория.
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

        requestTargetReassigned[requestId] += amount;

        totalTargetReassigned += amount;

        // Перевод в общий фонд.
        totalDonated += amount;

        emit TargetFundsReassigned(
            requestId,
            amount
        );
    }


    // =====================================================
    // 15. ЗАПРЕТ НЕКОНТРОЛИРУЕМОГО ПОЛУЧЕНИЯ ETH
    // =====================================================

    receive() external payable {
        revert("Use DAO donation functions");
    }

    fallback() external payable {
        revert("Invalid function call");
    }
}
