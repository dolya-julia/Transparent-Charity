
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRescueDAORecovery {
    function getRequestCore(uint256 requestId)
        external view
        returns (
            address requester,
            uint256 requestedAmount,
            uint8 status,
            bool exists
        );

    function getRequestTextAndMeta(uint256 requestId)
        external view
        returns (
            string memory animalName,
            string memory description,
            string memory evidenceURI,
            bytes32 evidenceHash,
            address requester,
            bool exists
        );

    function getRequestFinancialData(uint256 requestId)
        external view
        returns (
            uint256 requestedAmount,
            uint256 milestoneTotal,
            uint256 releasedAmount,
            uint256 milestoneCount,
            uint256 completedMilestones,
            uint8 status
        );

    function treasuryContract()
        external view
        returns (address);
}

interface IRescueNFTRecovery {
    function mintPassport(address to, uint256 requestId)
        external
        returns (uint256);
}

contract RescuePassportRecovery {
    address public immutable controller;
    IRescueDAORecovery public immutable dao;
    IRescueNFTRecovery public immutable nft;

    constructor(address daoAddress, address nftAddress) {
        require(daoAddress.code.length > 0, "Invalid DAO");
        require(nftAddress.code.length > 0, "Invalid NFT");

        controller = msg.sender;
        dao = IRescueDAORecovery(daoAddress);
        nft = IRescueNFTRecovery(nftAddress);
    }

    modifier onlyController() {
        require(msg.sender == controller, "Not controller");
        _;
    }

    // Передаём RescueNFT данные настоящего DAO.
    function getRequestCore(uint256 id)
        external view
        returns (address, uint256, uint8, bool)
    {
        return dao.getRequestCore(id);
    }

    function getRequestTextAndMeta(uint256 id)
        external view
        returns (string memory, string memory, string memory,
                bytes32, address, bool)
    {
        return dao.getRequestTextAndMeta(id);
    }

    function getRequestFinancialData(uint256 id)
        external view
        returns (uint256, uint256, uint256, uint256, uint256, uint8)
    {
        return dao.getRequestFinancialData(id);
    }

    function treasuryContract() external view returns (address) {
        return dao.treasuryContract();
    }

    // Повторный выпуск паспорта.
    function mintForRequest(uint256 requestId)
        external
        onlyController
        returns (uint256)
    {
        (
            address requester,
            ,
            uint8 status,
            bool exists
        ) = dao.getRequestCore(requestId);

        require(exists, "Request does not exist");
        require(status == 2, "Request is not approved");
        require(requester != address(0), "Invalid requester");

        return nft.mintPassport(requester, requestId);
    }
}
