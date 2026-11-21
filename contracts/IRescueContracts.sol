// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// =========================================================
// ИНТЕРФЕЙС RESCUENFT
// =========================================================

interface IRescueNFT {
    function mintPassport(
        address to,
        uint256 requestId
    ) external returns (uint256);
}

// =========================================================
// ИНТЕРФЕЙС RESCUETREASURY
// =========================================================

interface IRescueTreasury {

    function setMilestonesContract(
        address _milestones
    ) external;

    // Пожертвования
    function donate(address donor) external payable;

    function donateToRequest(
        uint256 requestId,
        address donor
    ) external payable;

    // Доступные средства
    function getAvailableBalance()
        external view returns (uint256);

    function getAvailableRequestDonations(
        uint256 requestId
    ) external view returns (uint256);

    function getContractBalance()
        external view returns (uint256);

    function getTotalSpentAllSources()
        external view returns (uint256);

    // Проверка резервирования
    function requestReservationCreated(
        uint256 requestId
    ) external view returns (bool);

    // Резервирование отдельного этапа
    function reserveMilestoneFunds(
        uint256 requestId,
        uint256 milestoneId,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;

    // Выплата по этапу
    function releaseMilestone(
        uint256 requestId,
        uint256 milestoneId,
        address payable recipient,
        uint256 amount,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;

    // Освобождение всех резервов заявки
    function releaseReservation(
        uint256 requestId
    ) external returns (uint256 generalReleased);

    // Перераспределение доступных целевых средств
    function reassignAvailableTargetFunds(
        uint256 requestId
    ) external returns (uint256 amount);

    // Пожертвования
    function requestDonations(
        uint256 requestId
    ) external view returns (uint256);

    function userRequestDonations(
        uint256 requestId,
        address user
    ) external view returns (uint256);

    // Общие резервы заявки
    function requestTargetReserved(
        uint256 requestId
    ) external view returns (uint256);

    function requestGeneralReserved(
        uint256 requestId
    ) external view returns (uint256);

    function requestTargetSpent(
        uint256 requestId
    ) external view returns (uint256);

    function requestTargetReassigned(
        uint256 requestId
    ) external view returns (uint256);

    // Резервы отдельного этапа
    function milestoneTargetReserved(
        uint256 requestId,
        uint256 milestoneId
    ) external view returns (uint256);

    function milestoneGeneralReserved(
        uint256 requestId,
        uint256 milestoneId
    ) external view returns (uint256);

    function milestoneReservationCreated(
        uint256 requestId,
        uint256 milestoneId
    ) external view returns (bool);

    // Общая статистика
    function totalDonated() external view returns (uint256);

    function totalReserved() external view returns (uint256);

    function totalSpent() external view returns (uint256);

    function totalTargetDonations()
        external view returns (uint256);

    function totalTargetReserved()
        external view returns (uint256);

    function totalTargetSpent()
        external view returns (uint256);

    function totalTargetReassigned()
        external view returns (uint256);
}

// =========================================================
// ИНТЕРФЕЙС RESCUEDAOVIEW
// =========================================================

interface IRescueDAOView {

    function isValidator(
        address account
    ) external view returns (bool);

    function getRequestCore(
        uint256 requestId
    )
        external
        view
        returns (
            address requester,
            uint256 requestedAmount,
            uint8 status,
            uint256 votingEndsAt,
            bool exists
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

    function onMilestoneAdded(
        uint256 requestId,
        uint256 amount
    ) external;

    function onMilestoneUpdated(
        uint256 requestId,
        uint256 oldAmount,
        uint256 newAmount
    ) external;

    function onMilestoneReleased(
        uint256 requestId,
        uint256 amount
    ) external;

    function onValidatorApproved(
        address validator
    ) external;
}
