
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRescueContracts.sol";

// =========================================================
// ИНТЕРФЕЙС RESCUEMILESTONES
// =========================================================

interface IRescueMilestoneSummary {
    function getMilestoneSummary(
        uint256 requestId
    ) external view returns (uint256 total, uint256 count);
}

// =========================================================
// ИНТЕРФЕЙС RESCUEBADGES
// =========================================================

interface IRescueBadges {
    function recordDonation(
        address donor,
        uint256 requestId,
        uint256 amount
    ) external;

    function onRequestCompleted(
        uint256 requestId
    ) external;
}

// =========================================================
// ОСНОВНОЙ КОНТРАКТ RESCUEDAO
// =========================================================

contract RescueDAO {

    address public admin;
    address[3] public validators;

    address public rescueNftContract;
    address public treasuryContract;
    address public milestonesContract;
    address public badgesContract;

    mapping(address => bool) public isValidator;
    mapping(address => bool) public isMember;

    mapping(address => uint256) public validatorReputation;
    mapping(address => uint256) public validatorApprovedTotal;

    uint256 public constant MIN_VOTING_PERIOD = 1 minutes;
    uint256 public constant MAX_VOTING_PERIOD = 30 days;

    bool private entered;

    // Уведомления о завершении заявок, которые
    // не удалось передать в RescueBadges.
    mapping(uint256 => bool) public pendingBadgeCompletion;

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

    mapping(uint256 => AidRequest) private aidRequests;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    uint256 public requestCount;

    // =====================================================
    // СОБЫТИЯ
    // =====================================================

    event DonationReceived(
        address indexed donor,
        uint256 amount
    );

    event RequestDonationReceived(
        uint256 indexed requestId,
        address indexed donor,
        uint256 amount
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

    event AidRequestCancelled(
        uint256 indexed requestId,
        uint256 returnedToAvailableBalance
    );

    event PassportMinted(
        uint256 indexed requestId,
        uint256 indexed tokenId,
        address indexed owner
    );

    event TreasuryUpdated(address indexed treasury);
    event NftContractUpdated(address indexed nftContract);
    event MilestonesUpdated(address indexed milestones);
    event BadgesContractUpdated(address indexed badges);

    event BadgeDonationRecorded(
        address indexed donor,
        uint256 indexed requestId,
        uint256 amount
    );

    event BadgeCompletionNotified(
        uint256 indexed requestId
    );

    event BadgeCompletionQueued(
        uint256 indexed requestId
    );

    event BadgeCompletionRetried(
        uint256 indexed requestId
    );

    // =====================================================
    // МОДИФИКАТОРЫ
    // =====================================================

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyMember() {
        require(isMember[msg.sender], "Only registered members");
        _;
    }

    modifier onlyTreasuryConfigured() {
        require(
            treasuryContract != address(0),
            "Treasury not configured"
        );
        _;
    }

    modifier onlyMilestones() {
        require(
            msg.sender == milestonesContract,
            "Only Milestones"
        );
        _;
    }

    modifier nonReentrant() {
        require(!entered, "Reentrant call");

        entered = true;
        _;
        entered = false;
    }

    // =====================================================
    // КОНСТРУКТОР
    // =====================================================

    constructor(address[3] memory _validators) {
        admin = msg.sender;
        isMember[msg.sender] = true;

        for (uint256 i = 0; i < 3; i++) {
            require(
                _validators[i] != address(0),
                "Invalid validator"
            );

            for (uint256 j = i + 1; j < 3; j++) {
                require(
                    _validators[i] != _validators[j],
                    "Validators must differ"
                );
            }

            validators[i] = _validators[i];
            isValidator[_validators[i]] = true;

            validatorReputation[_validators[i]] = 50;
        }
    }

    // =====================================================
    // НАСТРОЙКА ВНЕШНИХ КОНТРАКТОВ
    // =====================================================

    function setTreasuryContract(address treasury)
        external
        onlyAdmin
    {
        require(
            treasury != address(0),
            "Invalid Treasury"
        );

        require(
            treasury.code.length > 0,
            "Treasury is not a contract"
        );

        treasuryContract = treasury;

        if (milestonesContract != address(0)) {
            IRescueTreasury(treasury).setMilestonesContract(
                milestonesContract
            );
        }

        emit TreasuryUpdated(treasury);
    }

    function setRescueNftContract(address nft)
        external
        onlyAdmin
    {
        require(
            nft != address(0),
            "Invalid NFT"
        );

        require(
            nft.code.length > 0,
            "NFT is not a contract"
        );

        rescueNftContract = nft;

        emit NftContractUpdated(nft);
    }

    function setMilestonesContract(address milestones)
        external
        onlyAdmin
    {
        require(
            milestones != address(0),
            "Invalid Milestones"
        );

        require(
            milestones.code.length > 0,
            "Invalid contract"
        );

        require(
            treasuryContract != address(0),
            "Treasury not configured"
        );

        milestonesContract = milestones;

        IRescueTreasury(treasuryContract).setMilestonesContract(
            milestones
        );

        emit MilestonesUpdated(milestones);
    }

    /**
     * @dev Подключение контракта достижений.
     *
     * RescueBadges должен быть развернут с адресом
     * данного RescueDAO в конструкторе.
     */
    function setBadgesContract(address badges)
        external
        onlyAdmin
    {
        require(
            badges != address(0),
            "Invalid Badges"
        );

        require(
            badges.code.length > 0,
            "Badges is not a contract"
        );

        badgesContract = badges;

        emit BadgesContractUpdated(badges);
    }

    function setMember(address member, bool registered)
        external
        onlyAdmin
    {
        require(
            member != address(0),
            "Invalid member"
        );

        if (member == admin) {
            require(
                registered,
                "Admin must remain registered"
            );
        }

        isMember[member] = registered;

        emit MemberStatusChanged(member, registered);
    }

    // =====================================================
    // УЧЁТ ДОСТИЖЕНИЙ
    // =====================================================

    /**
     * @dev Передача информации о пожертвовании
     * в RescueBadges.
     *
     * requestId = 0 означает пожертвование
     * в общий фонд.
     *
     * requestId > 0 означает целевое пожертвование.
     *
     * Если контракт бейджей не подключён,
     * обычная работа DAO продолжается.
     */
    function _recordBadgeDonation(
        address donor,
        uint256 requestId,
        uint256 amount
    ) internal {
        if (badgesContract == address(0)) {
            return;
        }

        IRescueBadges(badgesContract).recordDonation(
            donor,
            requestId,
            amount
        );

        emit BadgeDonationRecorded(
            donor,
            requestId,
            amount
        );
    }

    /**
     * @dev Уведомление RescueBadges о завершении заявки.
     *
     * Если вызов не удался, заявка всё равно считается
     * завершённой. Уведомление можно повторить отдельно.
     */
    function _notifyBadgeCompletion(
        uint256 requestId
    ) internal {
        if (badgesContract == address(0)) {
            pendingBadgeCompletion[requestId] = true;

            emit BadgeCompletionQueued(requestId);
            return;
        }

        try IRescueBadges(badgesContract).onRequestCompleted(
            requestId
        ) {
            pendingBadgeCompletion[requestId] = false;

            emit BadgeCompletionNotified(requestId);
        } catch {
            pendingBadgeCompletion[requestId] = true;

            emit BadgeCompletionQueued(requestId);
        }
    }

    /**
     * @dev Повторная отправка уведомления о завершении заявки.
     *
     * Может вызвать любой пользователь.
     */
    function retryBadgeCompletion(
        uint256 requestId
    ) external {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            r.status == RequestStatus.Completed,
            "Request not completed"
        );

        require(
            pendingBadgeCompletion[requestId],
            "No pending notification"
        );

        require(
            badgesContract != address(0),
            "Badges not configured"
        );

        // Если вызов завершится ошибкой, транзакция откатится,
        // а pendingBadgeCompletion останется true.
        IRescueBadges(badgesContract).onRequestCompleted(
            requestId
        );

        pendingBadgeCompletion[requestId] = false;

        emit BadgeCompletionRetried(requestId);
    }

    // =====================================================
    // ПОЖЕРТВОВАНИЯ
    // =====================================================

    /**
     * @dev Обычное пожертвование в общий фонд.
     *
     * Учитывается для достижений:
     * - Первое доброе дело;
     * - Постоянная поддержка.
     *
     * Не учитывается как поддержка отдельной заявки.
     */
    function donate()
        external
        payable
        onlyTreasuryConfigured
        nonReentrant
    {
        require(
            msg.value > 0,
            "Zero donation"
        );

        IRescueTreasury(treasuryContract).donate{
            value: msg.value
        }(msg.sender);

        _recordBadgeDonation(
            msg.sender,
            0,
            msg.value
        );

        emit DonationReceived(
            msg.sender,
            msg.value
        );
    }

    /**
     * @dev Целевое пожертвование на конкретную заявку.
     *
     * Учитывается для всех достижений, условия которых
     * связаны с пожертвованиями и поддержанными заявками.
     */
    function donateToRequest(uint256 requestId)
        external
        payable
        onlyTreasuryConfigured
        nonReentrant
    {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            r.status == RequestStatus.Voting,
            "Not voting"
        );

        require(
            block.timestamp < r.votingEndsAt,
            "Voting ended"
        );

        require(
            msg.value > 0,
            "Zero donation"
        );

        uint256 current =
            IRescueTreasury(treasuryContract)
                .requestDonations(requestId);

        require(
            current + msg.value <= r.requestedAmount,
            "Donation exceeds goal"
        );

        IRescueTreasury(treasuryContract).donateToRequest{
            value: msg.value
        }(requestId, msg.sender);

        _recordBadgeDonation(
            msg.sender,
            requestId,
            msg.value
        );

        emit RequestDonationReceived(
            requestId,
            msg.sender,
            msg.value
        );
    }

    // =====================================================
    // СОЗДАНИЕ ЗАЯВКИ
    // =====================================================

    function createAidRequest(
        string calldata animalName,
        string calldata description,
        string calldata evidenceURI,
        bytes32 evidenceHash,
        uint256 requestedAmount,
        uint256 votingDuration
    )
        external
        onlyMember
        returns (uint256)
    {
        require(
            bytes(animalName).length > 0,
            "Empty animal name"
        );

        require(
            bytes(description).length > 0,
            "Empty description"
        );

        require(
            bytes(evidenceURI).length > 0,
            "Empty evidence URI"
        );

        require(
            evidenceHash != bytes32(0),
            "Invalid evidence hash"
        );

        require(
            requestedAmount > 0,
            "Invalid amount"
        );

        require(
            votingDuration >= MIN_VOTING_PERIOD &&
            votingDuration <= MAX_VOTING_PERIOD,
            "Invalid voting duration"
        );

        uint256 id = ++requestCount;

        AidRequest storage r = aidRequests[id];

        r.animalName = animalName;
        r.description = description;
        r.evidenceURI = evidenceURI;
        r.evidenceHash = evidenceHash;

        r.requester = msg.sender;
        r.requestedAmount = requestedAmount;
        r.votingEndsAt = block.timestamp + votingDuration;

        r.status = RequestStatus.Voting;
        r.exists = true;

        // Выпуск NFT-паспорта животного.
        if (rescueNftContract != address(0)) {
            try IRescueNFT(rescueNftContract).mintPassport(
                msg.sender,
                id
            ) returns (uint256 tokenId) {
                emit PassportMinted(
                    id,
                    tokenId,
                    msg.sender
                );
            } catch {
                // Ошибка выпуска NFT не отменяет создание заявки.
            }
        }

        emit AidRequestCreated(
            id,
            msg.sender,
            animalName,
            requestedAmount,
            r.votingEndsAt
        );

        return id;
    }

    // =====================================================
    // ГОЛОСОВАНИЕ
    // =====================================================

    function vote(
        uint256 requestId,
        bool support
    )
        external
        onlyMember
    {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            r.status == RequestStatus.Voting,
            "Not voting"
        );

        require(
            block.timestamp < r.votingEndsAt,
            "Voting ended"
        );

        require(
            !hasVoted[requestId][msg.sender],
            "Already voted"
        );

        hasVoted[requestId][msg.sender] = true;

        if (support) {
            r.yesVotes++;
        } else {
            r.noVotes++;
        }

        emit VoteCast(
            requestId,
            msg.sender,
            support,
            r.yesVotes,
            r.noVotes
        );
    }

    // =====================================================
    // ЗАВЕРШЕНИЕ ГОЛОСОВАНИЯ
    // =====================================================

    function finalizeRequest(uint256 requestId)
        external
        onlyTreasuryConfigured
    {
        require(
            milestonesContract != address(0),
            "Milestones not configured"
        );

        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            r.status == RequestStatus.Voting,
            "Already finalized"
        );

        require(
            block.timestamp >= r.votingEndsAt,
            "Voting not ended"
        );

        (
            uint256 milestoneTotal,
            uint256 milestoneCount
        ) = IRescueMilestoneSummary(milestonesContract)
            .getMilestoneSummary(requestId);

        bool milestonesValid =
            milestoneCount > 0 &&
            milestoneTotal == r.requestedAmount;

        bool votingApproved =
            r.yesVotes > r.noVotes &&
            r.yesVotes > 0;

        IRescueTreasury t =
            IRescueTreasury(treasuryContract);

        uint256 targetAvailable =
            t.getAvailableRequestDonations(requestId);

        uint256 targetToReserve = targetAvailable;

        if (targetToReserve > r.requestedAmount) {
            targetToReserve = r.requestedAmount;
        }

        uint256 generalRequired =
            r.requestedAmount - targetToReserve;

        bool fundsAvailable =
            t.getAvailableBalance() >= generalRequired;

        if (
            milestonesValid &&
            votingApproved &&
            fundsAvailable
        ) {
            t.reserveFunds(
                requestId,
                targetToReserve,
                generalRequired
            );

            r.status = RequestStatus.Approved;

            if (targetToReserve > 0) {
                emit TargetFundsReserved(
                    requestId,
                    targetToReserve
                );
            }

            if (generalRequired > 0) {
                emit GeneralFundsReserved(
                    requestId,
                    generalRequired
                );
            }

            emit AidRequestFinalized(
                requestId,
                RequestStatus.Approved,
                r.requestedAmount
            );

        } else {
            r.status = RequestStatus.Rejected;

            uint256 reassigned =
                t.reassignAvailableTargetFunds(requestId);

            if (reassigned > 0) {
                emit TargetFundsReassigned(
                    requestId,
                    reassigned
                );
            }

            emit AidRequestFinalized(
                requestId,
                RequestStatus.Rejected,
                0
            );
        }
    }

    // =====================================================
    // ВЫЗОВЫ ИЗ RESCUEMILESTONES
    // =====================================================

    function onMilestoneAdded(
        uint256 requestId,
        uint256 amount
    )
        external
        onlyMilestones
    {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            r.status == RequestStatus.Voting,
            "Not voting"
        );

        require(
            r.milestoneTotal + amount <= r.requestedAmount,
            "Over limit"
        );

        r.milestoneTotal += amount;
        r.milestoneCount++;
    }

    function onValidatorApproved(address validator)
        external
        onlyMilestones
    {
        require(
            isValidator[validator],
            "Invalid validator"
        );

        validatorReputation[validator] += 5;
        validatorApprovedTotal[validator]++;
    }

    /**
     * @dev Вызывается RescueMilestones после выпуска средств
     * по очередному этапу восстановления.
     *
     * При завершении всех этапов заявка получает статус
     * Completed, после чего DAO уведомляет RescueBadges.
     */
    function onMilestoneReleased(
        uint256 requestId,
        uint256 amount
    )
        external
        onlyMilestones
    {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            r.status == RequestStatus.Approved,
            "Not approved"
        );

        require(
            amount > 0,
            "Zero amount"
        );

        r.completedMilestones++;
        r.releasedAmount += amount;

        require(
            r.completedMilestones <= r.milestoneCount,
            "Too many completed milestones"
        );

        require(
            r.releasedAmount <= r.requestedAmount,
            "Released amount exceeds goal"
        );

        if (
            r.completedMilestones == r.milestoneCount
        ) {
            r.status = RequestStatus.Completed;

            _notifyBadgeCompletion(requestId);
        }
    }

    // =====================================================
    // ОТМЕНА ЗАЯВКИ
    // =====================================================

    function cancelRequest(uint256 requestId)
        external
        onlyTreasuryConfigured
    {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            msg.sender == r.requester ||
            msg.sender == admin,
            "Not authorized"
        );

        require(
            r.status == RequestStatus.Voting ||
            r.status == RequestStatus.Approved,
            "Cannot cancel"
        );

        r.status = RequestStatus.Cancelled;

        IRescueTreasury t =
            IRescueTreasury(treasuryContract);

        uint256 returnedAmount =
            t.releaseReservation(requestId);

        uint256 reassignedAmount =
            t.reassignAvailableTargetFunds(requestId);

        returnedAmount += reassignedAmount;

        emit AidRequestCancelled(
            requestId,
            returnedAmount
        );
    }

    // =====================================================
    // ГЕТТЕРЫ ДЛЯ ВЗАИМОДЕЙСТВИЯ КОНТРАКТОВ
    // =====================================================

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
        AidRequest storage r = aidRequests[requestId];

        return (
            r.requester,
            r.requestedAmount,
            uint8(r.status),
            r.votingEndsAt,
            r.exists
        );
    }

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
        )
    {
        AidRequest storage r = aidRequests[requestId];

        return (
            r.animalName,
            r.description,
            r.evidenceURI,
            r.evidenceHash,
            r.requester,
            r.exists
        );
    }

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
        )
    {
        AidRequest storage r = aidRequests[requestId];

        return (
            r.requestedAmount,
            r.yesVotes,
            r.noVotes,
            r.votingEndsAt,
            r.milestoneTotal,
            r.releasedAmount,
            r.milestoneCount,
            r.completedMilestones,
            uint8(r.status)
        );
    }

    function getMilestoneSummary(uint256 requestId)
        external
        view
        returns (
            uint256 total,
            uint256 count
        )
    {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        return (
            r.milestoneTotal,
            r.milestoneCount
        );
    }

    // =====================================================
    // ЗАЩИТА ОТ ПРЯМОГО ПОЛУЧЕНИЯ ETH
    // =====================================================

    receive() external payable {
        revert("Use donation functions");
    }

    fallback() external payable {
        revert("Invalid function call");
    }
}
