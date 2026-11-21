// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// =========================================================
// ИНТЕРФЕЙС ДЛЯ ЧТЕНИЯ ДАННЫХ RESCUEDAO
// =========================================================

interface IRescueDAORead {

    function requestCount()
        external
        view
        returns (uint256);

    function milestonesContract()
        external
        view
        returns (address);

    function getRequestCore(uint256 requestId)
        external
        view
        returns (
            address requester,
            uint256 requestedAmount,
            uint8 status,
            uint256 votingEndsAt,
            bool exists
        );

    function getRequestTextAndMeta(uint256 requestId)
        external
        view
        returns (
            string memory animalName,
            string memory description,
            string memory evidenceURI,
            bytes32 evidenceHash,
            address requester,
            bool exists
        );

    function getRequestFinancialAndVoting(uint256 requestId)
        external
        view
        returns (
            uint256 requestedAmount,
            uint256 yesVotes,
            uint256 noVotes,
            uint256 votingEndsAt,
            uint256 milestoneTotal,
            uint256 releasedAmount,
            uint256 milestoneCount,
            uint256 completedMilestones,
            uint8 status
        );

    function getMilestoneSummary(uint256 requestId)
        external
        view
        returns (
            uint256 total,
            uint256 count
        );

    function hasVoted(
        uint256 requestId,
        address voter
    )
        external
        view
        returns (bool);
}

// =========================================================
// ИНТЕРФЕЙС ДЛЯ ЧТЕНИЯ ДАННЫХ RESCUETREASURY
// =========================================================

interface IRescueTreasuryRead {

    function getAvailableBalance()
        external
        view
        returns (uint256);

    function getAvailableRequestDonations(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function getContractBalance()
        external
        view
        returns (uint256);

    function totalDonated()
        external
        view
        returns (uint256);

    function totalReserved()
        external
        view
        returns (uint256);

    function totalSpent()
        external
        view
        returns (uint256);

    function totalTargetDonations()
        external
        view
        returns (uint256);

    function totalTargetReserved()
        external
        view
        returns (uint256);

    function totalTargetSpent()
        external
        view
        returns (uint256);

    function totalTargetReassigned()
        external
        view
        returns (uint256);

    function requestDonations(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function requestTargetReserved(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function requestGeneralReserved(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function requestTargetSpent(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function requestTargetReassigned(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function userRequestDonations(
        uint256 requestId,
        address user
    )
        external
        view
        returns (uint256);
}

// =========================================================
// ИНТЕРФЕЙС ДЛЯ ЧТЕНИЯ ДАННЫХ RESCUEMILESTONES
// =========================================================

interface IRescueMilestonesRead {

    function milestoneCount(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function getMilestone(
        uint256 requestId,
        uint256 milestoneId
    )
        external
        view
        returns (
            string memory description,
            address recipient,
            uint256 amount,
            string memory evidenceURI,
            bytes32 evidenceHash,
            uint256 approvalCount,
            bool evidenceSubmitted,
            bool released
        );

    function getMilestoneFundingStatus(
        uint256 requestId,
        uint256 milestoneId
    )
        external
        view
        returns (
            bool funded,
            uint256 targetReserved,
            uint256 generalReserved,
            bool released
        );

    function getMilestoneSummary(
        uint256 requestId
    )
        external
        view
        returns (
            uint256 total,
            uint256 count
        );

    function hasValidatorApproved(
        uint256 requestId,
        uint256 milestoneId,
        address validator
    )
        external
        view
        returns (bool);
}

// =========================================================
// RESCUEDAOVIEW
// =========================================================

contract RescueDAOView {

    // -----------------------------------------------------
    // АДРЕСА КОНТРАКТОВ
    // -----------------------------------------------------

    address public immutable daoContract;
    address public immutable treasuryContract;

    IRescueDAORead private dao;
    IRescueTreasuryRead private treasury;

    // -----------------------------------------------------
    // СТАТУСЫ ЗАЯВОК
    // -----------------------------------------------------

    uint8 public constant STATUS_UNDER_REVIEW = 0;
    uint8 public constant STATUS_CHANGES_REQUESTED = 1;
    uint8 public constant STATUS_VOTING = 2;
    uint8 public constant STATUS_APPROVED = 3;
    uint8 public constant STATUS_REJECTED = 4;
    uint8 public constant STATUS_COMPLETED = 5;
    uint8 public constant STATUS_CANCELLED = 6;

    // -----------------------------------------------------
    // КОНСТРУКТОР
    // -----------------------------------------------------

    constructor(
        address daoAddress,
        address treasuryAddress
    ) {
        require(
            daoAddress != address(0),
            "Invalid DAO"
        );

        require(
            treasuryAddress != address(0),
            "Invalid Treasury"
        );

        require(
            daoAddress.code.length > 0,
            "DAO is not a contract"
        );

        require(
            treasuryAddress.code.length > 0,
            "Treasury is not a contract"
        );

        daoContract = daoAddress;
        treasuryContract = treasuryAddress;

        dao = IRescueDAORead(daoAddress);
        treasury = IRescueTreasuryRead(treasuryAddress);
    }

    // =====================================================
    // ВНУТРЕННЯЯ ФУНКЦИЯ ПОЛУЧЕНИЯ RESCUEMILESTONES
    // =====================================================

    /**
     * @notice Получает актуальный адрес RescueMilestones
     * из основного контракта DAO.
     */
    function _getMilestones()
        internal
        view
        returns (IRescueMilestonesRead)
    {
        address milestonesAddress = dao.milestonesContract();

        require(
            milestonesAddress != address(0),
            "Milestones not configured"
        );

        require(
            milestonesAddress.code.length > 0,
            "Invalid Milestones contract"
        );

        return IRescueMilestonesRead(milestonesAddress);
    }

    // =====================================================
    // ОБЩАЯ ИНФОРМАЦИЯ О ЗАЯВКАХ
    // =====================================================

    /**
     * @notice Возвращает количество созданных заявок.
     */
    function getRequestCount()
        external
        view
        returns (uint256)
    {
        return dao.requestCount();
    }

    /**
     * @notice Возвращает основные данные заявки.
     */
    function getRequestCore(uint256 requestId)
        external
        view
        returns (
            address requester,
            uint256 requestedAmount,
            uint8 status,
            uint256 votingEndsAt,
            bool exists
        )
    {
        return dao.getRequestCore(requestId);
    }

    /**
     * @notice Возвращает текстовые данные заявки.
     */
    function getAidRequestInfo(uint256 requestId)
        external
        view
        returns (
            string memory animalName,
            string memory description,
            string memory evidenceURI,
            bytes32 evidenceHash,
            address requester
        )
    {
        (
            animalName,
            description,
            evidenceURI,
            evidenceHash,
            requester,

        ) = dao.getRequestTextAndMeta(requestId);
    }

    /**
     * @notice Возвращает финансовые данные,
     * информацию о голосовании и этапах.
     */
    function getAidRequestStats(uint256 requestId)
        external
        view
        returns (
            uint256 requestedAmount,
            uint256 yesVotes,
            uint256 noVotes,
            uint256 votingEndsAt,
            uint256 milestoneTotal,
            uint256 releasedAmount,
            uint256 milestoneCount,
            uint256 completedMilestones,
            uint8 status
        )
    {
        return dao.getRequestFinancialAndVoting(requestId);
    }

    /**
     * @notice Возвращает сумму и количество этапов.
     */
    function getMilestoneSummary(uint256 requestId)
        external
        view
        returns (
            uint256 total,
            uint256 count
        )
    {
        return dao.getMilestoneSummary(requestId);
    }

    // =====================================================
    // ИНФОРМАЦИЯ ОБ ОТДЕЛЬНЫХ ЭТАПАХ
    // =====================================================

    /**
     * @notice Возвращает количество этапов заявки.
     */
    function getMilestoneCount(
        uint256 requestId
    )
        external
        view
        returns (uint256)
    {
        return _getMilestones().milestoneCount(requestId);
    }

    /**
     * @notice Возвращает подробную информацию об этапе.
     *
     * milestoneId начинается с 1.
     */
    function getMilestoneDetails(
        uint256 requestId,
        uint256 milestoneId
    )
        external
        view
        returns (
            string memory description,
            address recipient,
            uint256 amount,
            string memory evidenceURI,
            bytes32 evidenceHash,
            uint256 approvalCount,
            bool evidenceSubmitted,
            bool released
        )
    {
        return _getMilestones().getMilestone(
            requestId,
            milestoneId
        );
    }

    /**
     * @notice Возвращает финансовое состояние отдельного этапа.
     *
     * funded          — средства зарезервированы;
     * targetReserved  — сумма из целевых пожертвований;
     * generalReserved — сумма из общего фонда;
     * released        — средства выплачены получателю.
     */
    function getMilestoneFundingStatus(
        uint256 requestId,
        uint256 milestoneId
    )
        external
        view
        returns (
            bool funded,
            uint256 targetReserved,
            uint256 generalReserved,
            bool released
        )
    {
        return _getMilestones().getMilestoneFundingStatus(
            requestId,
            milestoneId
        );
    }

    /**
     * @notice Проверяет, одобрил ли конкретный валидатор
     * доказательства по этапу.
     */
    function hasValidatorApprovedMilestone(
        uint256 requestId,
        uint256 milestoneId,
        address validator
    )
        external
        view
        returns (bool)
    {
        return _getMilestones().hasValidatorApproved(
            requestId,
            milestoneId,
            validator
        );
    }

    /**
     * @notice Возвращает сводную информацию по финансированию
     * и выплатам всех этапов заявки.
     *
     * fundedCount — число профинансированных этапов;
     * releasedCount — число выплаченных этапов;
     * targetReserved — общая сумма целевых резервов;
     * generalReserved — общая сумма резервов из общего фонда.
     */
    function getMilestonesFundingSummary(
        uint256 requestId
    )
        external
        view
        returns (
            uint256 fundedCount,
            uint256 releasedCount,
            uint256 targetReserved,
            uint256 generalReserved
        )
    {
        IRescueMilestonesRead milestones = _getMilestones();

        uint256 count = milestones.milestoneCount(requestId);

        for (uint256 i = 1; i <= count; i++) {
            (
                bool funded,
                uint256 targetAmount,
                uint256 generalAmount,
                bool released
            ) = milestones.getMilestoneFundingStatus(
                requestId,
                i
            );

            if (funded) {
                fundedCount++;
            }

            if (released) {
                releasedCount++;
            }

            targetReserved += targetAmount;
            generalReserved += generalAmount;
        }
    }

    // =====================================================
    // ФИНАНСОВАЯ СТАТИСТИКА ЗАЯВКИ
    // =====================================================

    /**
     * @notice Возвращает статистику финансирования заявки.
     *
     * fundingGoal       — требуемая сумма;
     * targetRaised      — целевые пожертвования;
     * fundingProgress   — процент сбора;
     * targetReserved    — зарезервированные целевые средства;
     * generalReserved   — зарезервированные общие средства;
     * targetSpent       — потраченные целевые средства;
     * targetReassigned  — перенаправленные целевые средства.
     */
    function getAidRequestFundingStats(
        uint256 requestId
    )
        external
        view
        returns (
            uint256 fundingGoal,
            uint256 targetRaised,
            uint256 fundingProgress,
            uint256 targetReserved,
            uint256 generalReserved,
            uint256 targetSpent,
            uint256 targetReassigned
        )
    {
        (
            fundingGoal,
            ,
            ,
            ,
            ,
            ,
            ,
            ,

        ) = dao.getRequestFinancialAndVoting(requestId);

        targetRaised = treasury.requestDonations(requestId);

        if (fundingGoal > 0) {
            fundingProgress =
                targetRaised * 100 / fundingGoal;
        }

        targetReserved =
            treasury.requestTargetReserved(requestId);

        generalReserved =
            treasury.requestGeneralReserved(requestId);

        targetSpent =
            treasury.requestTargetSpent(requestId);

        targetReassigned =
            treasury.requestTargetReassigned(requestId);
    }

    /**
     * @notice Возвращает пожертвование конкретного пользователя
     * на конкретную заявку.
     */
    function getUserRequestDonation(
        uint256 requestId,
        address user
    )
        external
        view
        returns (uint256)
    {
        return treasury.userRequestDonations(
            requestId,
            user
        );
    }

    // =====================================================
    // ОБЩАЯ ФИНАНСОВАЯ СТАТИСТИКА
    // =====================================================

    /**
     * @notice Доступный общий баланс фонда.
     */
    function getAvailableBalance()
        external
        view
        returns (uint256)
    {
        return treasury.getAvailableBalance();
    }

    /**
     * @notice Доступные целевые пожертвования заявки.
     */
    function getAvailableRequestDonations(
        uint256 requestId
    )
        external
        view
        returns (uint256)
    {
        return treasury.getAvailableRequestDonations(
            requestId
        );
    }

    /**
     * @notice Полный баланс Treasury.
     */
    function getContractBalance()
        external
        view
        returns (uint256)
    {
        return treasury.getContractBalance();
    }

    /**
     * @notice Общая сумма расходов из всех источников.
     */
    function getTotalSpentAllSources()
        external
        view
        returns (uint256)
    {
        return
            treasury.totalSpent() +
            treasury.totalTargetSpent();
    }

    /**
     * @notice Возвращает общую финансовую статистику фонда.
     */
    function getTreasuryTotals()
        external
        view
        returns (
            uint256 generalDonated,
            uint256 generalReserved,
            uint256 generalSpent,
            uint256 targetDonations,
            uint256 targetReserved,
            uint256 targetSpent,
            uint256 targetReassigned
        )
    {
        return (
            treasury.totalDonated(),
            treasury.totalReserved(),
            treasury.totalSpent(),
            treasury.totalTargetDonations(),
            treasury.totalTargetReserved(),
            treasury.totalTargetSpent(),
            treasury.totalTargetReassigned()
        );
    }

    // =====================================================
    // ДОПОЛНИТЕЛЬНЫЕ ПРОВЕРКИ
    // =====================================================

    /**
     * @notice Проверяет существование заявки.
     */
    function requestExists(
        uint256 requestId
    )
        external
        view
        returns (bool)
    {
        (
            ,
            ,
            ,
            ,
            bool exists
        ) = dao.getRequestCore(requestId);

        return exists;
    }

    /**
     * @notice Проверяет, голосовал ли участник.
     */
    function hasParticipantVoted(
        uint256 requestId,
        address participant
    )
        external
        view
        returns (bool)
    {
        return dao.hasVoted(
            requestId,
            participant
        );
    }

    // =====================================================
    // ПРОВЕРКА СТАТУСА ЗАЯВКИ
    // =====================================================

    /**
     * @notice Возвращает числовой статус заявки.
     *
     * 0 — UnderReview
     * 1 — ChangesRequested
     * 2 — Voting
     * 3 — Approved
     * 4 — Rejected
     * 5 — Completed
     * 6 — Cancelled
     */
    function getRequestStatus(
        uint256 requestId
    )
        external
        view
        returns (uint8)
    {
        (
            ,
            ,
            uint8 status,
            ,
            bool exists
        ) = dao.getRequestCore(requestId);

        require(
            exists,
            "Request does not exist"
        );

        return status;
    }

    /**
     * @notice Проверяет, находится ли заявка на модерации.
     */
    function isRequestUnderReview(
        uint256 requestId
    )
        external
        view
        returns (bool)
    {
        return getStatusInternal(requestId) == STATUS_UNDER_REVIEW;
    }

    /**
     * @notice Проверяет, возвращена ли заявка на доработку.
     */
    function isRequestChangesRequested(
        uint256 requestId
    )
        external
        view
        returns (bool)
    {
        return getStatusInternal(requestId) == STATUS_CHANGES_REQUESTED;
    }

    /**
     * @notice Проверяет, идёт ли голосование.
     */
    function isRequestVoting(
        uint256 requestId
    )
        external
        view
        returns (bool)
    {
        return getStatusInternal(requestId) == STATUS_VOTING;
    }

    /**
     * @notice Проверяет, одобрена ли заявка.
     */
    function isRequestApproved(
        uint256 requestId
    )
        external
        view
        returns (bool)
    {
        return getStatusInternal(requestId) == STATUS_APPROVED;
    }

    /**
     * @notice Проверяет, завершена ли заявка.
     */
    function isRequestCompleted(
        uint256 requestId
    )
        external
        view
        returns (bool)
    {
        return getStatusInternal(requestId) == STATUS_COMPLETED;
    }

    /**
     * @notice Проверяет, отменена ли заявка.
     */
    function isRequestCancelled(
        uint256 requestId
    )
        external
        view
        returns (bool)
    {
        return getStatusInternal(requestId) == STATUS_CANCELLED;
    }

    /**
     * @notice Внутренняя функция получения статуса.
     */
    function getStatusInternal(
        uint256 requestId
    )
        internal
        view
        returns (uint8)
    {
        (
            ,
            ,
            uint8 status,
            ,
            bool exists
        ) = dao.getRequestCore(requestId);

        require(
            exists,
            "Request does not exist"
        );

        return status;
    }
}
