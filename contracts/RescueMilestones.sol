// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRescueContracts.sol";

contract RescueMilestones {
    address public admin;
    address public daoContract;
    address public treasuryContract;

    struct Milestone {
        string description;
        address payable recipient;
        uint256 amount;
        string evidenceURI;
        bytes32 evidenceHash;
        uint256 approvalCount;
        bool evidenceSubmitted;
        bool released;
        bool exists;
    }

    mapping(uint256 => mapping(uint256 => Milestone)) private milestones;

    mapping(uint256 => uint256) public milestoneCount;
    mapping(uint256 => uint256) public milestoneTotal;

    mapping(uint256 => mapping(uint256 => mapping(address => bool)))
        public hasApprovedMilestone;

    event MilestoneCreated(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        string description,
        address recipient,
        uint256 amount
    );

    event MilestoneEvidenceSubmitted(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        string evidenceURI,
        bytes32 evidenceHash
    );

    event MilestoneApproved(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        address indexed validator,
        uint256 approvalCount
    );

    event MilestoneFundsReleased(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        address recipient,
        uint256 amount,
        uint256 targetAmount,
        uint256 generalAmount
    );

    event DAOUpdated(address indexed dao);
    event TreasuryUpdated(address indexed treasury);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyDAO() {
        require(msg.sender == daoContract, "Only DAO");
        _;
    }

    constructor(address _dao, address _treasury) {
        require(_dao != address(0), "Invalid DAO");
        require(_treasury != address(0), "Invalid Treasury");

        admin = msg.sender;
        daoContract = _dao;
        treasuryContract = _treasury;
    }

    function setDAO(address _dao) external onlyAdmin {
        require(_dao != address(0), "Invalid DAO");
        daoContract = _dao;
        emit DAOUpdated(_dao);
    }

    function setTreasury(address _treasury) external onlyAdmin {
        require(_treasury != address(0), "Invalid Treasury");
        treasuryContract = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function addMilestone(
        uint256 requestId,
        string calldata description,
        address payable recipient,
        uint256 amount
    ) external {
        (
            address requester,
            uint256 requestedAmount,
            uint8 status,
            uint256 votingEndsAt,
            bool exists
        ) = IRescueDAOView(daoContract).getRequestCore(requestId);

        require(exists, "Request does not exist");
        require(msg.sender == requester, "Only requester");
        require(status == 0, "Request is not in voting");
        require(block.timestamp < votingEndsAt, "Voting ended");
        require(bytes(description).length > 0, "Empty description");
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");

        require(
            milestoneTotal[requestId] + amount <= requestedAmount,
            "Milestone total exceeds request"
        );

        uint256 id = ++milestoneCount[requestId];

        Milestone storage m = milestones[requestId][id];

        m.description = description;
        m.recipient = recipient;
        m.amount = amount;
        m.exists = true;

        milestoneTotal[requestId] += amount;

        IRescueDAOView(daoContract).onMilestoneAdded(requestId, amount);

        emit MilestoneCreated(
            requestId,
            id,
            description,
            recipient,
            amount
        );
    }

    function submitMilestoneEvidence(
        uint256 requestId,
        uint256 milestoneId,
        string calldata evidenceURI,
        bytes32 evidenceHash
    ) external {
        (
            address requester,
            ,
            uint8 status,
            ,
            bool exists
        ) = IRescueDAOView(daoContract).getRequestCore(requestId);

        require(exists, "Request does not exist");
        require(status == 1, "Request is not approved");
        require(msg.sender == requester, "Only requester");

        Milestone storage m = milestones[requestId][milestoneId];

        require(m.exists, "Milestone does not exist");
        require(!m.released, "Already released");
        require(bytes(evidenceURI).length > 0, "Empty evidence URI");
        require(evidenceHash != bytes32(0), "Invalid evidence hash");

        m.evidenceURI = evidenceURI;
        m.evidenceHash = evidenceHash;
        m.evidenceSubmitted = true;

        emit MilestoneEvidenceSubmitted(
            requestId,
            milestoneId,
            evidenceURI,
            evidenceHash
        );
    }

    function approveMilestone(
        uint256 requestId,
        uint256 milestoneId
    ) external {
        require(
            IRescueDAOView(daoContract).isValidator(msg.sender),
            "Only validator"
        );

        (
            ,
            ,
            uint8 status,
            ,
            bool exists
        ) = IRescueDAOView(daoContract).getRequestCore(requestId);

        require(exists, "Request does not exist");
        require(status == 1, "Request is not approved");

        Milestone storage m = milestones[requestId][milestoneId];

        require(m.exists, "Milestone does not exist");
        require(m.evidenceSubmitted, "Evidence not submitted");
        require(!m.released, "Already released");
        require(
            !hasApprovedMilestone[requestId][milestoneId][msg.sender],
            "Already approved"
        );

        hasApprovedMilestone[requestId][milestoneId][msg.sender] = true;
        m.approvalCount++;

        IRescueDAOView(daoContract).onValidatorApproved(msg.sender);

        emit MilestoneApproved(
            requestId,
            milestoneId,
            msg.sender,
            m.approvalCount
        );

        if (m.approvalCount >= 2) {
            _releaseMilestone(requestId, milestoneId, m);
        }
    }

    function _releaseMilestone(
        uint256 requestId,
        uint256 milestoneId,
        Milestone storage m
    ) internal {
        IRescueTreasury treasury =
            IRescueTreasury(treasuryContract);

        uint256 targetReserved =
            treasury.requestTargetReserved(requestId);

        uint256 targetAmount = m.amount;

        if (targetAmount > targetReserved) {
            targetAmount = targetReserved;
        }

        uint256 generalAmount = m.amount - targetAmount;

        require(
            treasury.requestGeneralReserved(requestId) >= generalAmount,
            "Insufficient general reserve"
        );

        // Выплата выполняется Treasury.
        // Если перевод не удастся, вся транзакция откатится.
        treasury.releaseMilestone(
            requestId,
            milestoneId,
            m.recipient,
            m.amount,
            targetAmount,
            generalAmount
        );

        m.released = true;

        IRescueDAOView(daoContract).onMilestoneReleased(
            requestId,
            m.amount
        );

        emit MilestoneFundsReleased(
            requestId,
            milestoneId,
            m.recipient,
            m.amount,
            targetAmount,
            generalAmount
        );
    }

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
        )
    {
        Milestone storage m = milestones[requestId][milestoneId];

        require(m.exists, "Milestone does not exist");

        return (
            m.description,
            m.recipient,
            m.amount,
            m.evidenceURI,
            m.evidenceHash,
            m.approvalCount,
            m.evidenceSubmitted,
            m.released
        );
    }

    function getMilestoneSummary(uint256 requestId)
        external
        view
        returns (uint256 total, uint256 count)
    {
        return (
            milestoneTotal[requestId],
            milestoneCount[requestId]
        );
    }

    function hasValidatorApproved(
        uint256 requestId,
        uint256 milestoneId,
        address validator
    ) external view returns (bool) {
        return hasApprovedMilestone[requestId][milestoneId][validator];
    }
}