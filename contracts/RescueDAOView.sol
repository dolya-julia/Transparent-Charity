// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ---------------------------------------------------------
// ИНТЕРФЕЙС ДЛЯ ЧТЕНИЯ ДАННЫХ RESCUEDAO
// ---------------------------------------------------------

interface IRescueDAORead {
    function requestCount() external view returns (uint256);

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
        returns (uint256 total, uint256 count);

    function hasVoted(uint256 requestId, address voter)
        external
        view
        returns (bool);
}

// ---------------------------------------------------------
// ИНТЕРФЕЙС ДЛЯ ЧТЕНИЯ ДАННЫХ TREASURY
// ---------------------------------------------------------

interface IRescueTreasuryRead {
    function getAvailableBalance() external view returns (uint256);

    function getAvailableRequestDonations(uint256 requestId)
        external
        view
        returns (uint256);

    function getContractBalance() external view returns (uint256);

    function totalDonated() external view returns (uint256);

    function totalReserved() external view returns (uint256);

    function totalSpent() external view returns (uint256);

    function totalTargetDonations() external view returns (uint256);

    function totalTargetReserved() external view returns (uint256);

    function totalTargetSpent() external view returns (uint256);

    function totalTargetReassigned() external view returns (uint256);

    function requestDonations(uint256 requestId)
        external
        view
        returns (uint256);

    function requestTargetReserved(uint256 requestId)
        external
        view
        returns (uint256);

    function requestGeneralReserved(uint256 requestId)
        external
        view
        returns (uint256);

    function requestTargetSpent(uint256 requestId)
        external
        view
        returns (uint256);

    function requestTargetReassigned(uint256 requestId)
        external
        view
        returns (uint256);

    function userRequestDonations(uint256 requestId, address user)
        external
        view
        returns (uint256);
}

// ---------------------------------------------------------
// RESCUEDAOVIEW
// ---------------------------------------------------------

contract RescueDAOView {
    address public immutable daoContract;
    address public immutable treasuryContract;

    IRescueDAORead private dao;
    IRescueTreasuryRead private treasury;

    constructor(address daoAddress, address treasuryAddress) {
        require(daoAddress != address(0), "Invalid DAO");
        require(treasuryAddress != address(0), "Invalid Treasury");

        daoContract = daoAddress;
        treasuryContract = treasuryAddress;

        dao = IRescueDAORead(daoAddress);
        treasury = IRescueTreasuryRead(treasuryAddress);
    }

    // -----------------------------------------------------
    // ОБЩАЯ ИНФОРМАЦИЯ О ЗАЯВКАХ
    // -----------------------------------------------------

    function getRequestCount() external view returns (uint256) {
        return dao.requestCount();
    }

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

    function getMilestoneSummary(uint256 requestId)
        external
        view
        returns (uint256 total, uint256 count)
    {
        return dao.getMilestoneSummary(requestId);
    }

    // -----------------------------------------------------
    // ФИНАНСОВАЯ СТАТИСТИКА ЗАЯВКИ
    // -----------------------------------------------------

    function getAidRequestFundingStats(uint256 requestId)
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
            fundingProgress = targetRaised * 100 / fundingGoal;
        }

        targetReserved = treasury.requestTargetReserved(requestId);
        generalReserved = treasury.requestGeneralReserved(requestId);
        targetSpent = treasury.requestTargetSpent(requestId);
        targetReassigned = treasury.requestTargetReassigned(requestId);
    }

    function getUserRequestDonation(
        uint256 requestId,
        address user
    )
        external
        view
        returns (uint256)
    {
        return treasury.userRequestDonations(requestId, user);
    }

    // -----------------------------------------------------
    // ОБЩАЯ ФИНАНСОВАЯ СТАТИСТИКА
    // -----------------------------------------------------

    function getAvailableBalance() external view returns (uint256) {
        return treasury.getAvailableBalance();
    }

    function getAvailableRequestDonations(uint256 requestId)
        external
        view
        returns (uint256)
    {
        return treasury.getAvailableRequestDonations(requestId);
    }

    function getContractBalance() external view returns (uint256) {
        return treasury.getContractBalance();
    }

    function getTotalSpentAllSources() external view returns (uint256) {
        return treasury.totalSpent() + treasury.totalTargetSpent();
    }

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

    // -----------------------------------------------------
    // ДОПОЛНИТЕЛЬНЫЕ ПРОВЕРКИ
    // -----------------------------------------------------

    function requestExists(uint256 requestId)
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

    function hasParticipantVoted(
        uint256 requestId,
        address participant
    )
        external
        view
        returns (bool)
    {
        return dao.hasVoted(requestId, participant);
    }
}