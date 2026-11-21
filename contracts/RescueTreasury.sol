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

    // =========================================================
    // 1. ОСНОВНЫЕ ПАРАМЕТРЫ
    // =========================================================

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
        require(!entered, "Reentrant call");

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

    // Общие резервы заявки
    mapping(uint256 => uint256)
        public requestTargetReserved;

    mapping(uint256 => uint256)
        public requestTargetSpent;

    mapping(uint256 => uint256)
        public requestTargetReassigned;

    mapping(uint256 => uint256)
        public requestGeneralReserved;

    // =========================================================
    // 4. РЕЗЕРВЫ ОТДЕЛЬНЫХ ЭТАПОВ
    // =========================================================

    mapping(uint256 => mapping(uint256 => uint256))
        public override milestoneTargetReserved;

    mapping(uint256 => mapping(uint256 => uint256))
        public override milestoneGeneralReserved;

    mapping(uint256 => mapping(uint256 => bool))
        public override milestoneReservationCreated;

    // =========================================================
    // 5. СОБЫТИЯ
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

    // =========================================================
    // 6. КОНСТРУКТОР
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
    // 7. НАСТРОЙКА КОНТРАКТА ЭТАПОВ
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

        emit MilestonesContractUpdated(_milestones);
    }

    // =========================================================
    // 8. ДОСТУПНЫЕ БАЛАНСЫ
    // =========================================================

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

    function getContractBalance()
        external
        view
        override
        returns (uint256)
    {
        return address(this).balance;
    }

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

    function getTotalSpentAllSources()
        external
        view
        override
        returns (uint256)
    {
        return totalSpent + totalTargetSpent;
    }

    // =========================================================
    // 9. ПОЖЕРТВОВАНИЕ В ОБЩИЙ ФОНД
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
    // 10. ЦЕЛЕВОЕ ПОЖЕРТВОВАНИЕ
    // =========================================================

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
    // 11. РЕЗЕРВИРОВАНИЕ СРЕДСТВ ДЛЯ ЭТАПА
    // =========================================================

    /**
     * Вызывается RescueMilestones.
     *
     * Резервирование производится независимо
     * для каждого этапа.
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

        // Обновляем общие резервы заявки.
        requestTargetReserved[requestId] += targetAmount;
        requestGeneralReserved[requestId] += generalAmount;

        // Обновляем глобальные резервы.
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

    // =========================================================
    // 12. ВЫПЛАТА СРЕДСТВ ПО ЭТАПУ
    // =========================================================

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

        // Списание целевого резерва этапа.
        if (targetAmount > 0) {
            milestoneTargetReserved[requestId][milestoneId] = 0;

            requestTargetReserved[requestId] -= targetAmount;
            totalTargetReserved -= targetAmount;

            requestTargetSpent[requestId] += targetAmount;
            totalTargetSpent += targetAmount;
        }

        // Списание резерва общего фонда этапа.
        if (generalAmount > 0) {
            milestoneGeneralReserved[requestId][milestoneId] = 0;

            requestGeneralReserved[requestId] -= generalAmount;
            totalReserved -= generalAmount;

            totalSpent += generalAmount;
        }

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

    // =========================================================
    // 13. ОСВОБОЖДЕНИЕ ВСЕХ РЕЗЕРВОВ ЗАЯВКИ
    // =========================================================

    /**
     * При отмене заявки освобождаются резервы
     * всех её этапов.
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

        if (targetReleased > 0) {
            requestTargetReserved[requestId] -= targetReleased;
            totalTargetReserved -= targetReleased;
        }

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

    // =========================================================
    // 14. ПЕРЕВОД ЦЕЛЕВЫХ СРЕДСТВ В ОБЩИЙ ФОНД
    // =========================================================

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

        // Целевые средства переходят в общий фонд.
        totalDonated += amount;

        emit TargetFundsReassigned(
            requestId,
            amount
        );
    }

    // =========================================================
    // 15. ЗАПРЕТ НЕКОНТРОЛИРУЕМОГО ПОЛУЧЕНИЯ ETH
    // =========================================================

    receive() external payable {
        revert("Use DAO donation functions");
    }

    fallback() external payable {
        revert("Invalid function call");
    }
}
