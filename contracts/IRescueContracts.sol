
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRescueNFT {
    function mintPassport(address to, uint256 requestId)
        external
        returns (uint256);
}

interface IRescueTreasury {
    // Настройка
    function setMilestonesContract(address _milestones) external;

    // Пожертвования
    function donate(address donor) external payable;

    function donateToRequest(
        uint256 requestId,
        address donor
    ) external payable;

    // Доступные средства
    function getAvailableBalance() external view returns (uint256);

    function getAvailableRequestDonations(
        uint256 requestId
    ) external view returns (uint256);

    function getContractBalance() external view returns (uint256);

    // Резервирование и освобождение средств
    function reserveFunds(
        uint256 requestId,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;

    function releaseReservation(
        uint256 requestId
    ) external returns (uint256 generalReleased);

    function reassignAvailableTargetFunds(
        uint256 requestId
    ) external returns (uint256 amount);

    // Выплата по этапу
    function releaseMilestone(
        uint256 requestId,
        uint256 milestoneId,
        address payable recipient,
        uint256 amount,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;

    // Данные о пожертвованиях по заявкам
    function requestDonations(
        uint256 requestId
    ) external view returns (uint256);

    function userRequestDonations(
        uint256 requestId,
        address user
    ) external view returns (uint256);

    // Резервы и расходы по заявкам
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

    // Общая финансовая статистика
    function totalDonated() external view returns (uint256);

    function totalReserved() external view returns (uint256);

    function totalSpent() external view returns (uint256);

    function totalTargetDonations() external view returns (uint256);

    function totalTargetReserved() external view returns (uint256);

    function totalTargetSpent() external view returns (uint256);

    function totalTargetReassigned() external view returns (uint256);

    function getTotalSpentAllSources() external view returns (uint256);
}

interface IRescueDAOView {
    function isValidator(address account) external view returns (bool);

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

    function getMilestoneSummary(uint256 requestId)
        external
        view
        returns (uint256 total, uint256 count);

    function onMilestoneAdded(
        uint256 requestId,
        uint256 amount
    ) external;

    function onMilestoneReleased(
        uint256 requestId,
        uint256 amount
    ) external;

    function onValidatorApproved(address validator) external;
}
