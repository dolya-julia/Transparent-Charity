// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Интерфейс для взаимодействия с контрактом NFT-паспортов
interface IRescueNFT {
    function mintPassport(address to, uint256 requestId) external returns (uint256);
}

/**
 * @title RescueDAO
 * @dev Децентрализованная система коллективного финансирования помощи животным
 * с автоматическим выпуском динамических NFT-паспортов.
 */
contract RescueDAO {

    // =========================================================
    // 1. ОСНОВНЫЕ ПАРАМЕТРЫ И РОЛИ
    // =========================================================

    address public admin;
    address[3] public validators;

    // Адрес развернутого контракта RescueNFT
    address public rescueNftContract;

    mapping(address => bool) public isValidator;
    mapping(address => bool) public isMember;

    // Репутация валидаторов и статистика проверок
    mapping(address => uint256) public validatorReputation;
    mapping(address => uint256) public validatorApprovedTotal;

    uint256 public constant MIN_VOTING_PERIOD = 1 minutes;
    uint256 public constant MAX_VOTING_PERIOD = 30 days;

    bool private entered;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyMember() {
        require(isMember[msg.sender], "Only registered members");
        _;
    }

    modifier onlyValidator() {
        require(isValidator[msg.sender], "Only validators");
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
    uint256 public requestCount;

    function getAvailableBalance() public view returns (uint256) {
        return totalDonated - totalReserved - totalSpent;
    }

    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function donate() external payable {
        require(msg.value > 0, "Donation must be greater than zero");

        totalDonated += msg.value;

        emit DonationReceived(
            msg.sender,
            msg.value,
            totalDonated
        );
    }

    // =========================================================
    // 3. СТРУКТУРЫ ДАННЫХ
    // =========================================================

    enum RequestStatus {
        Voting,
        Approved,
        Rejected,
        Completed,
        Cancelled
    }

    struct AidRequest {
        string animalName;
        string description;
        string evidenceURI;
        bytes32 evidenceHash;
        address requester;
        uint256 requestedAmount;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 votingEndsAt;
        uint256 milestoneTotal;
        uint256 releasedAmount;
        uint256 milestoneCount;
        uint256 completedMilestones;
        RequestStatus status;
        bool exists;
    }

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

    mapping(uint256 => AidRequest) private aidRequests;

    mapping(uint256 => mapping(uint256 => Milestone))
        private milestones;

    mapping(uint256 => mapping(address => bool))
        public hasVoted;

    mapping(uint256 => mapping(uint256 => mapping(address => bool)))
        public hasApprovedMilestone;

    // =========================================================
    // 4. СОБЫТИЯ
    // =========================================================

    event DonationReceived(
        address indexed donor,
        uint256 amount,
        uint256 totalDonated
    );

    event MemberStatusChanged(
        address indexed member,
        bool registered
    );

    event AidRequestCreated(
        uint256 indexed requestId,
        address indexed requester,
        string animalName,
        uint256 requestedAmount,
        uint256 votingEndsAt
    );

    event VoteCast(
        uint256 indexed requestId,
        address indexed voter,
        bool support,
        uint256 yesVotes,
        uint256 noVotes
    );

    event AidRequestFinalized(
        uint256 indexed requestId,
        RequestStatus status,
        uint256 reservedAmount
    );

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
        uint256 approvalCount,
        uint256 newReputation
    );

    event FundsReleased(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        address recipient,
        uint256 amount
    );

    event AidRequestCancelled(
        uint256 indexed requestId,
        uint256 returnedToAvailableBalance
    );

    event PassportMinted(
        uint256 indexed requestId,
        uint256 indexed tokenId,
        address indexed owner
    );

    // =========================================================
    // 5. КОНСТРУКТОР И УПРАВЛЕНИЕ УЧАСТНИКАМИ
    // =========================================================

    constructor(address[3] memory _validators) {
        admin = msg.sender;
        isMember[msg.sender] = true;

        for (uint256 i = 0; i < 3; i++) {
            require(
                _validators[i] != address(0),
                "Invalid validator address"
            );

            for (uint256 j = i + 1; j < 3; j++) {
                require(
                    _validators[i] != _validators[j],
                    "Validators must be different"
                );
            }

            validators[i] = _validators[i];
            isValidator[_validators[i]] = true;
            validatorReputation[_validators[i]] = 50;
        }
    }

    // Администратор устанавливает адрес NFT-контракта
    function setRescueNftContract(
        address _nftContract
    ) external onlyAdmin {
        require(
            _nftContract != address(0),
            "Invalid NFT contract address"
        );

        rescueNftContract = _nftContract;
    }

    function setMember(
        address _member,
        bool _registered
    ) external onlyAdmin {
        require(
            _member != address(0),
            "Invalid member address"
        );

        if (_member == admin) {
            require(
                _registered,
                "Admin must remain registered"
            );
        }

        isMember[_member] = _registered;

        emit MemberStatusChanged(_member, _registered);
    }

    // =========================================================
    // 6. СОЗДАНИЕ ЗАЯВОК
    // =========================================================

    /**
     * @dev Создание заявки на помощь животному.
     * Изображение для NFT генерируется автоматически
     * в контракте RescueNFT.
     */
    function createAidRequest(
        string memory _animalName,
        string memory _description,
        string memory _evidenceURI,
        bytes32 _evidenceHash,
        uint256 _requestedAmount,
        uint256 _votingDuration
    )
        external
        onlyMember
        returns (uint256)
    {
        require(
            bytes(_animalName).length > 0,
            "Animal name cannot be empty"
        );

        require(
            bytes(_description).length > 0,
            "Description cannot be empty"
        );

        require(
            bytes(_evidenceURI).length > 0,
            "Evidence URI cannot be empty"
        );

        require(
            _evidenceHash != bytes32(0),
            "Invalid evidence hash"
        );

        require(
            _requestedAmount > 0,
            "Amount must be greater than zero"
        );

        require(
            _votingDuration >= MIN_VOTING_PERIOD &&
            _votingDuration <= MAX_VOTING_PERIOD,
            "Invalid voting duration"
        );

        uint256 newRequestId = ++requestCount;

        AidRequest storage request = aidRequests[newRequestId];

        request.animalName = _animalName;
        request.description = _description;
        request.evidenceURI = _evidenceURI;
        request.evidenceHash = _evidenceHash;
        request.requester = msg.sender;
        request.requestedAmount = _requestedAmount;
        request.votingEndsAt = block.timestamp + _votingDuration;
        request.status = RequestStatus.Voting;
        request.exists = true;

        // Автоматический выпуск NFT-паспорта
        if (rescueNftContract != address(0)) {
            try IRescueNFT(rescueNftContract).mintPassport(
                msg.sender,
                newRequestId
            ) returns (uint256 tokenId) {

                emit PassportMinted(
                    newRequestId,
                    tokenId,
                    msg.sender
                );

            } catch {
                // Заявка сохраняется даже при ошибке выпуска NFT.
            }
        }

        emit AidRequestCreated(
            newRequestId,
            msg.sender,
            _animalName,
            _requestedAmount,
            request.votingEndsAt
        );

        return newRequestId;
    }

    // =========================================================
    // 7. ДОБАВЛЕНИЕ ЭТАПОВ ЛЕЧЕНИЯ
    // =========================================================

    function addMilestone(
        uint256 _requestId,
        string memory _description,
        address payable _recipient,
        uint256 _amount
    ) external {
        AidRequest storage request = aidRequests[_requestId];

        require(request.exists, "Request does not exist");
        require(
            msg.sender == request.requester,
            "Only requester can add milestones"
        );

        require(
            request.status == RequestStatus.Voting,
            "Request is not in voting status"
        );

        require(
            block.timestamp < request.votingEndsAt,
            "Voting period has ended"
        );

        require(
            bytes(_description).length > 0,
            "Milestone description cannot be empty"
        );

        require(
            _recipient != address(0),
            "Invalid milestone recipient"
        );

        require(
            _amount > 0,
            "Milestone amount must be greater than zero"
        );

        require(
            request.milestoneTotal + _amount <= request.requestedAmount,
            "Milestone total exceeds requested amount"
        );

        uint256 milestoneId = ++request.milestoneCount;

        Milestone storage milestone =
            milestones[_requestId][milestoneId];

        milestone.description = _description;
        milestone.recipient = _recipient;
        milestone.amount = _amount;
        milestone.exists = true;

        request.milestoneTotal += _amount;

        emit MilestoneCreated(
            _requestId,
            milestoneId,
            _description,
            _recipient,
            _amount
        );
    }

    // =========================================================
    // 8. ГОЛОСОВАНИЕ
    // =========================================================

    function vote(
        uint256 _requestId,
        bool _support
    ) external onlyMember {
        AidRequest storage request = aidRequests[_requestId];

        require(request.exists, "Request does not exist");

        require(
            request.status == RequestStatus.Voting,
            "Request is not open for voting"
        );

        require(
            block.timestamp < request.votingEndsAt,
            "Voting period has ended"
        );

        require(
            !hasVoted[_requestId][msg.sender],
            "Already voted"
        );

        hasVoted[_requestId][msg.sender] = true;

        if (_support) {
            request.yesVotes++;
        } else {
            request.noVotes++;
        }

        emit VoteCast(
            _requestId,
            msg.sender,
            _support,
            request.yesVotes,
            request.noVotes
        );
    }

    function finalizeRequest(uint256 _requestId) external {
        AidRequest storage request = aidRequests[_requestId];

        require(request.exists, "Request does not exist");

        require(
            request.status == RequestStatus.Voting,
            "Request already finalized"
        );

        require(
            block.timestamp >= request.votingEndsAt,
            "Voting period has not ended"
        );

        bool milestonesValid =
            request.milestoneCount > 0 &&
            request.milestoneTotal == request.requestedAmount;

        bool votingApproved =
            request.yesVotes > request.noVotes &&
            request.yesVotes > 0;

        bool fundsAvailable =
            getAvailableBalance() >= request.requestedAmount;

        if (
            milestonesValid &&
            votingApproved &&
            fundsAvailable
        ) {
            totalReserved += request.requestedAmount;
            request.status = RequestStatus.Approved;

            emit AidRequestFinalized(
                _requestId,
                RequestStatus.Approved,
                request.requestedAmount
            );

        } else {
            request.status = RequestStatus.Rejected;

            emit AidRequestFinalized(
                _requestId,
                RequestStatus.Rejected,
                0
            );
        }
    }

    // =========================================================
    // 9. ОТЧЕТЫ ПО ЭТАПАМ И ПОДТВЕРЖДЕНИЕ ВАЛИДАТОРАМИ
    // =========================================================

    function submitMilestoneEvidence(
        uint256 _requestId,
        uint256 _milestoneId,
        string memory _evidenceURI,
        bytes32 _evidenceHash
    ) external {
        AidRequest storage request = aidRequests[_requestId];

        require(request.exists, "Request does not exist");

        require(
            request.status == RequestStatus.Approved,
            "Request is not approved"
        );

        require(
            msg.sender == request.requester,
            "Only requester can submit evidence"
        );

        Milestone storage milestone =
            milestones[_requestId][_milestoneId];

        require(
            milestone.exists,
            "Milestone does not exist"
        );

        require(
            !milestone.released,
            "Milestone already released"
        );

        require(
            bytes(_evidenceURI).length > 0,
            "Evidence URI cannot be empty"
        );

        require(
            _evidenceHash != bytes32(0),
            "Invalid evidence hash"
        );

        milestone.evidenceURI = _evidenceURI;
        milestone.evidenceHash = _evidenceHash;
        milestone.evidenceSubmitted = true;

        emit MilestoneEvidenceSubmitted(
            _requestId,
            _milestoneId,
            _evidenceURI,
            _evidenceHash
        );
    }

    function approveMilestone(
        uint256 _requestId,
        uint256 _milestoneId
    )
        external
        onlyValidator
        nonReentrant
    {
        AidRequest storage request = aidRequests[_requestId];

        require(request.exists, "Request does not exist");

        require(
            request.status == RequestStatus.Approved,
            "Request is not approved"
        );

        Milestone storage milestone =
            milestones[_requestId][_milestoneId];

        require(
            milestone.exists,
            "Milestone does not exist"
        );

        require(
            milestone.evidenceSubmitted,
            "Evidence has not been submitted"
        );

        require(
            !milestone.released,
            "Milestone already released"
        );

        require(
            !hasApprovedMilestone[_requestId][_milestoneId][msg.sender],
            "Validator already approved"
        );

        hasApprovedMilestone[_requestId][_milestoneId][msg.sender] = true;
        milestone.approvalCount++;

        validatorReputation[msg.sender] += 5;
        validatorApprovedTotal[msg.sender]++;

        emit MilestoneApproved(
            _requestId,
            _milestoneId,
            msg.sender,
            milestone.approvalCount,
            validatorReputation[msg.sender]
        );

        if (milestone.approvalCount >= 2) {
            milestone.released = true;

            request.completedMilestones++;
            request.releasedAmount += milestone.amount;

            totalReserved -= milestone.amount;
            totalSpent += milestone.amount;

            if (
                request.completedMilestones ==
                request.milestoneCount
            ) {
                request.status = RequestStatus.Completed;
            }

            (bool success, ) = milestone.recipient.call{
                value: milestone.amount
            }("");

            require(success, "ETH transfer failed");

            emit FundsReleased(
                _requestId,
                _milestoneId,
                milestone.recipient,
                milestone.amount
            );
        }
    }

    // =========================================================
    // 10. ОТМЕНА ЗАЯВКИ
    // =========================================================

    function cancelRequest(uint256 _requestId) external {
        AidRequest storage request = aidRequests[_requestId];

        require(request.exists, "Request does not exist");

        require(
            msg.sender == request.requester || msg.sender == admin,
            "Not authorized to cancel"
        );

        require(
            request.status == RequestStatus.Voting ||
            request.status == RequestStatus.Approved,
            "Request cannot be cancelled"
        );

        uint256 returnedAmount = 0;

        if (request.status == RequestStatus.Approved) {
            returnedAmount =
                request.requestedAmount - request.releasedAmount;

            totalReserved -= returnedAmount;
        }

        request.status = RequestStatus.Cancelled;

        emit AidRequestCancelled(
            _requestId,
            returnedAmount
        );
    }

    // =========================================================
    // 11. ГЕТТЕРЫ ДЛЯ ФРОНТЕНДА И NFT
    // =========================================================

    function getAidRequestInfo(uint256 _requestId)
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
        AidRequest storage request = aidRequests[_requestId];

        require(request.exists, "Request does not exist");

        return (
            request.animalName,
            request.description,
            request.evidenceURI,
            request.evidenceHash,
            request.requester
        );
    }

    function getAidRequestStats(uint256 _requestId)
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
            RequestStatus status
        )
    {
        AidRequest storage request = aidRequests[_requestId];

        require(request.exists, "Request does not exist");

        return (
            request.requestedAmount,
            request.yesVotes,
            request.noVotes,
            request.votingEndsAt,
            request.milestoneTotal,
            request.releasedAmount,
            request.milestoneCount,
            request.completedMilestones,
            request.status
        );
    }

    function getMilestone(
        uint256 _requestId,
        uint256 _milestoneId
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
        Milestone storage milestone =
            milestones[_requestId][_milestoneId];

        require(
            milestone.exists,
            "Milestone does not exist"
        );

        return (
            milestone.description,
            milestone.recipient,
            milestone.amount,
            milestone.evidenceURI,
            milestone.evidenceHash,
            milestone.approvalCount,
            milestone.evidenceSubmitted,
            milestone.released
        );
    }

    function requestExists(
        uint256 _requestId
    ) external view returns (bool) {
        return aidRequests[_requestId].exists;
    }

    function hasParticipantVoted(
        uint256 _requestId,
        address _participant
    ) external view returns (bool) {
        return hasVoted[_requestId][_participant];
    }

    function hasValidatorApproved(
        uint256 _requestId,
        uint256 _milestoneId,
        address _validator
    ) external view returns (bool) {
        return hasApprovedMilestone[
            _requestId
        ][_milestoneId][_validator];
    }

    // =========================================================
    // 12. ЗАПРЕТ ПРЯМОГО ПОЛУЧЕНИЯ ETH
    // =========================================================

    receive() external payable {
        revert("Use donate function");
    }

    fallback() external payable {
        revert("Invalid function call");
    }
}