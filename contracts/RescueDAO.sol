
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRescueContracts.sol";

// =========================================================
// ИНТЕРФЕЙС RESCUEMILESTONES
// =========================================================

interface IRescueMilestoneSummary {
    function getMilestoneSummary(
        uint256 requestId
    ) external view returns (
        uint256 total,
        uint256 count
    );
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
// ИНТЕРФЕЙС НАСТРОЙКИ RESCUEMILESTONES
// =========================================================

interface IRescueMilestonesConfig {
    function setTreasury(address treasury) external;
}

interface IRescueHeroCards {
    function recordDonation(
        address donor,
        uint256 requestId,
        uint256 amount
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
    address public heroCardsContract;

    mapping(address => bool) public isValidator;
    mapping(address => bool) public isMember;

    mapping(address => uint256) public validatorReputation;
    mapping(address => uint256) public validatorApprovedTotal;

    bool private entered;

    mapping(uint256 => bool) public pendingBadgeCompletion;

    // =====================================================
    // СТАТУСЫ ЗАЯВКИ
    // =====================================================

    enum RequestStatus {
        UnderReview,       // 0 — На проверке
        ChangesRequested,  // 1 — Требуются изменения
        Approved,          // 2 — Одобрена и опубликована
        Rejected,          // 3 — Отклонена
        Completed,         // 4 — Завершена
        Cancelled          // 5 — Отменена
    }

    // =====================================================
    // СТРУКТУРА ЗАЯВКИ
    // =====================================================

    struct AidRequest {
        string animalName;
        string description;
        string evidenceURI;
        bytes32 evidenceHash;

        address requester;

        uint256 requestedAmount;

        // Устаревшие поля оставлены для совместимости.
        // Голосование в новой архитектуре не используется.
        uint256 yesVotes;
        uint256 noVotes;
        uint256 votingEndsAt;

        uint256 milestoneTotal;
        uint256 releasedAmount;
        uint256 milestoneCount;
        uint256 completedMilestones;

        // Последнее замечание администратора.
        string changeRequestReason;

        RequestStatus status;
        bool exists;
    }

    mapping(uint256 => AidRequest) private aidRequests;

    // Устаревшее отображение оставлено для совместимости.
    // Функции голосования отсутствуют.
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
        uint256 submittedAt
    );

    event AidRequestUpdated(
        uint256 indexed requestId,
        uint256 requestedAmount
    );

    // Событие содержит текст замечания администратора.
    event AidRequestChangesRequested(
        uint256 indexed requestId,
        string reason
    );

    event AidRequestResubmitted(
        uint256 indexed requestId
    );

    // Событие оставлено для совместимости со старым UI.
    // Оба параметра всегда равны нулю.
    event AidRequestPublished(
        uint256 indexed requestId,
        uint256 votingEndsAt,
        uint256 votingDuration
    );

    // Устаревшее событие. Новая логика его не генерирует.
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
    event HeroCardsContractUpdated(address indexed heroCardsContract);

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
        require(
            msg.sender == admin,
            "Only admin"
        );
        _;
    }

    modifier onlyMember() {
        require(
            isMember[msg.sender],
            "Only registered members"
        );
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
        require(
            !entered,
            "Reentrant call"
        );

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
            treasuryContract == address(0),
            "Treasury already configured"
        );

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

            IRescueMilestonesConfig(milestonesContract)
                .setTreasury(treasury);
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
            milestonesContract == address(0),
            "Milestones already configured"
        );

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

        IRescueMilestonesConfig(milestones).setTreasury(
            treasuryContract
        );

        emit MilestonesUpdated(milestones);
    }

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

    function setHeroCardsContract(address heroCards)
        external
        onlyAdmin
    {
        require(heroCards != address(0), "Invalid Hero Cards");
        require(heroCards.code.length > 0, "Hero Cards is not a contract");
        heroCardsContract = heroCards;
        emit HeroCardsContractUpdated(heroCards);
    }

    function setMember(
        address member,
        bool registered
    ) external onlyAdmin {
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

        emit MemberStatusChanged(
            member,
            registered
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
        uint256 requestedAmount
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

        uint256 id = ++requestCount;

        AidRequest storage r = aidRequests[id];

        r.animalName = animalName;
        r.description = description;
        r.evidenceURI = evidenceURI;
        r.evidenceHash = evidenceHash;

        r.requester = msg.sender;
        r.requestedAmount = requestedAmount;

        // Голосование не используется.
        r.yesVotes = 0;
        r.noVotes = 0;
        r.votingEndsAt = 0;

        r.changeRequestReason = "";

        r.status = RequestStatus.UnderReview;
        r.exists = true;

        emit AidRequestCreated(
            id,
            msg.sender,
            animalName,
            requestedAmount,
            block.timestamp
        );

        return id;
    }

    // =====================================================
    // ИЗМЕНЕНИЕ ДАННЫХ ЗАЯВКИ
    // =====================================================

    function updateRequestDetails(
        uint256 requestId,
        string calldata animalName,
        string calldata description,
        string calldata evidenceURI,
        bytes32 evidenceHash,
        uint256 requestedAmount
    ) external {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            msg.sender == r.requester,
            "Only requester"
        );

        require(
            r.status == RequestStatus.UnderReview ||
            r.status == RequestStatus.ChangesRequested,
            "Request cannot be edited"
        );

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
            requestedAmount >= r.milestoneTotal,
            "Amount below milestone total"
        );

        r.animalName = animalName;
        r.description = description;
        r.evidenceURI = evidenceURI;
        r.evidenceHash = evidenceHash;
        r.requestedAmount = requestedAmount;

        emit AidRequestUpdated(
            requestId,
            requestedAmount
        );
    }

    // =====================================================
    // ВОЗВРАТ ЗАЯВКИ НА ДОРАБОТКУ
    // =====================================================

    function requestChanges(
        uint256 requestId,
        string calldata reason
    ) external onlyAdmin {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            r.status == RequestStatus.UnderReview,
            "Request is not under review"
        );

        require(
            bytes(reason).length > 0,
            "Empty reason"
        );

        // Сохраняем замечание непосредственно в заявке.
        r.changeRequestReason = reason;

        // Меняем статус заявки.
        r.status = RequestStatus.ChangesRequested;

        // Событие также содержит полный текст замечания.
        emit AidRequestChangesRequested(
            requestId,
            reason
        );
    }

    // =====================================================
    // ПОЛУЧЕНИЕ ЗАМЕЧАНИЯ АДМИНИСТРАТОРА
    // =====================================================

    /**
     * Возвращает последнее замечание администратора.
     *
     * Этот метод должен вызываться на странице заявителя,
     * чтобы показать причину возврата заявки на доработку.
     *
     * Если замечаний нет, возвращается пустая строка.
     */

    function getRequestChangeReason(
        uint256 requestId
    )
        external
        view
        returns (string memory)
    {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        return r.changeRequestReason;
    }

    // =====================================================
    // ПОВТОРНАЯ ОТПРАВКА НА ПРОВЕРКУ
    // =====================================================

    function resubmitForReview(
        uint256 requestId
    ) external {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            msg.sender == r.requester,
            "Only requester"
        );

        require(
            r.status == RequestStatus.ChangesRequested,
            "Changes not requested"
        );

        // Убираем старое замечание:
        // после повторной отправки оно больше не актуально.
        r.changeRequestReason = "";

        r.status = RequestStatus.UnderReview;

        emit AidRequestResubmitted(requestId);
    }

    // =====================================================
    // ОКОНЧАТЕЛЬНОЕ ОТКЛОНЕНИЕ ЗАЯВКИ
    // =====================================================

    function rejectRequest(
        uint256 requestId,
        string calldata reason
    ) external onlyAdmin {
        AidRequest storage r = aidRequests[requestId];

        require(
            r.exists,
            "Request does not exist"
        );

        require(
            r.status == RequestStatus.UnderReview ||
            r.status == RequestStatus.ChangesRequested,
            "Cannot reject at this stage"
        );

        require(
            bytes(reason).length > 0,
            "Empty reason"
        );

        r.status = RequestStatus.Rejected;

        emit AidRequestFinalized(
            requestId,
            RequestStatus.Rejected,
            0
        );
    }

    // =====================================================
    // ПУБЛИКАЦИЯ И ОДОБРЕНИЕ ЗАЯВКИ
    // =====================================================

    /**
     * Голосование сообщества не проводится.
     *
     * Администратор проверяет заявку и ее этапы.
     * После публикации заявка получает статус Approved.
     *
     * Approved означает разрешение на сбор средств,
     * а не автоматическую выплату ETH.
     */

    function publishRequest(
        uint256 requestId
    ) external onlyAdmin {
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
            r.status == RequestStatus.UnderReview,
            "Request is not under review"
        );

        (
            uint256 milestoneTotal,
            uint256 milestoneCount
        ) = IRescueMilestoneSummary(milestonesContract)
            .getMilestoneSummary(requestId);

        require(
            milestoneCount > 0,
            "No milestones"
        );

        require(
            milestoneTotal == r.requestedAmount,
            "Milestones must equal request amount"
        );

        r.milestoneTotal = milestoneTotal;
        r.milestoneCount = milestoneCount;

        // Голосование не используется.
        r.yesVotes = 0;
        r.noVotes = 0;
        r.votingEndsAt = 0;

        // Approved = 2.
        r.status = RequestStatus.Approved;

        // Выпуск паспорта не должен блокировать публикацию.
        if (rescueNftContract != address(0)) {
            try IRescueNFT(rescueNftContract).mintPassport(
                r.requester,
                requestId
            ) returns (uint256 tokenId) {
                emit PassportMinted(
                    requestId,
                    tokenId,
                    r.requester
                );
            } catch {
                // Ошибка выпуска NFT не отменяет публикацию.
            }
        }

        emit AidRequestPublished(
            requestId,
            0,
            0
        );

        emit AidRequestFinalized(
            requestId,
            RequestStatus.Approved,
            0
        );
    }

    // =====================================================
    // ПОЖЕРТВОВАНИЯ В ОБЩИЙ ФОНД
    // =====================================================

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

    // =====================================================
    // АДРЕСНЫЕ ПОЖЕРТВОВАНИЯ
    // =====================================================

    /**
     * Адресные пожертвования доступны только
     * для заявок со статусом Approved.
     *
     * Голосование сообщества не требуется.
     */

    function donateToRequest(
        uint256 requestId
    )
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
            r.status == RequestStatus.Approved,
            "Request does not accept donations"
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
            r.status == RequestStatus.UnderReview ||
            r.status == RequestStatus.ChangesRequested,
            "Milestones can only be edited before publication"
        );

        require(
            amount > 0,
            "Invalid milestone amount"
        );

        require(
            r.milestoneTotal + amount <= r.requestedAmount,
            "Over limit"
        );

        r.milestoneTotal += amount;
        r.milestoneCount++;
    }

    function onMilestoneUpdated(
        uint256 requestId,
        uint256 oldAmount,
        uint256 newAmount
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
            r.status == RequestStatus.UnderReview ||
            r.status == RequestStatus.ChangesRequested,
            "Milestones can only be edited before publication"
        );

        require(
            oldAmount > 0 && newAmount > 0,
            "Invalid amount"
        );

        require(
            r.milestoneTotal >= oldAmount,
            "Invalid old amount"
        );

        uint256 updatedTotal =
            r.milestoneTotal - oldAmount + newAmount;

        require(
            updatedTotal <= r.requestedAmount,
            "Milestone total exceeds request"
        );

        r.milestoneTotal = updatedTotal;
    }

    // =====================================================
    // УЧЁТ ПОДТВЕРЖДЕНИЙ ВАЛИДАТОРОВ
    // =====================================================

    function onValidatorApproved(
        address validator
    )
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

    // =====================================================
    // ЗАВЕРШЕНИЕ ЭТАПА
    // =====================================================

    /**
     * Вызывается RescueMilestones после выплаты
     * зарезервированных средств получателю.
     *
     * Заявка завершается после выплаты всех этапов.
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
            "Request is not approved"
        );

        require(
            amount > 0,
            "Zero amount"
        );

        require(
            r.completedMilestones < r.milestoneCount,
            "All milestones already completed"
        );

        require(
            r.releasedAmount + amount <= r.requestedAmount,
            "Released amount exceeds goal"
        );

        r.completedMilestones++;
        r.releasedAmount += amount;

        if (
            r.completedMilestones == r.milestoneCount
        ) {
            require(
                r.releasedAmount == r.requestedAmount,
                "Released amount does not match request"
            );

            r.status = RequestStatus.Completed;

            _notifyBadgeCompletion(requestId);
        }
    }

    // =====================================================
    // ОТМЕНА ЗАЯВКИ
    // =====================================================

    /**
     * При отмене:
     * 1. Заявка переводится в Cancelled.
     * 2. Освобождаются неиспользованные резервы.
     * 3. Доступные адресные пожертвования переводятся
     *    в общий фонд.
     *
     * Уже выплаченные средства не затрагиваются.
     */

    function cancelRequest(
        uint256 requestId
    )
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
            r.status == RequestStatus.UnderReview ||
            r.status == RequestStatus.ChangesRequested ||
            r.status == RequestStatus.Approved,
            "Cannot cancel"
        );

        r.status = RequestStatus.Cancelled;

        IRescueTreasury treasury =
            IRescueTreasury(treasuryContract);

        // Освобождаем резервы общего фонда.
        uint256 generalReleased =
            treasury.releaseReservation(requestId);

        // Переводим оставшиеся доступные целевые
        // пожертвования в общий фонд.
        uint256 reassignedAmount =
            treasury.reassignAvailableTargetFunds(requestId);

        uint256 returnedAmount =
            generalReleased + reassignedAmount;

        if (reassignedAmount > 0) {
            emit TargetFundsReassigned(
                requestId,
                reassignedAmount
            );
        }

        emit AidRequestCancelled(
            requestId,
            returnedAmount
        );
    }

    // =====================================================
    // УЧЁТ ДОСТИЖЕНИЙ
    // =====================================================

    function _recordBadgeDonation(
        address donor,
        uint256 requestId,
        uint256 amount
    ) internal {
        if (badgesContract != address(0)) {
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

        // Карточка героя выпускается только для целевого пожертвования,
        // когда у заявки уже существует NFT-паспорт животного.
        if (heroCardsContract != address(0) && requestId > 0) {
            try IRescueHeroCards(heroCardsContract).recordDonation(
                donor,
                requestId,
                amount
            ) {
                // Выпуск карточки не должен блокировать само пожертвование.
            } catch {
                // При отсутствии паспорта или иной ошибке карточку можно
                // будет выдать повторно отдельной административной процедурой.
            }
        }
    }

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

        IRescueBadges(badgesContract).onRequestCompleted(
            requestId
        );

        pendingBadgeCompletion[requestId] = false;

        emit BadgeCompletionRetried(requestId);
    }

    // =====================================================
    // ГЕТТЕР: ОСНОВНАЯ ИНФОРМАЦИЯ О ЗАЯВКЕ
    // =====================================================

    /**
     * Возвращает ровно четыре значения.
     */

    function getRequestCore(
        uint256 requestId
    )
        external
        view
        returns (
            address requester,
            uint256 requestedAmount,
            uint8 status,
            bool exists
        )
    {
        AidRequest storage r = aidRequests[requestId];

        return (
            r.requester,
            r.requestedAmount,
            uint8(r.status),
            r.exists
        );
    }

    // =====================================================
    // ГЕТТЕР: ТЕКСТ И МЕТАДАННЫЕ ЗАЯВКИ
    // =====================================================

    function getRequestTextAndMeta(
        uint256 requestId
    )
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

    // =====================================================
    // ГЕТТЕР: ФИНАНСОВЫЕ ДАННЫЕ
    // =====================================================

    function getRequestFinancialData(
        uint256 requestId
    )
        external
        view
        returns (
            uint256 requestedAmount,
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
            r.milestoneTotal,
            r.releasedAmount,
            r.milestoneCount,
            r.completedMilestones,
            uint8(r.status)
        );
    }

    // =====================================================
    // ГЕТТЕР: ФИНАНСОВАЯ СТАТИСТИКА
    // =====================================================

    function getRequestFinancialStats(
        uint256 requestId
    )
        external
        view
        returns (
            uint256 requestedAmount,
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
            r.milestoneTotal,
            r.releasedAmount,
            r.milestoneCount,
            r.completedMilestones,
            uint8(r.status)
        );
    }

    // =====================================================
    // СТАРЫЙ ГЕТТЕР: СОВМЕСТИМОСТЬ С ПРЕЖНИМ UI
    // =====================================================

    function getRequestFinancialAndVoting(
        uint256 requestId
    )
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
            0,
            0,
            0,
            r.milestoneTotal,
            r.releasedAmount,
            r.milestoneCount,
            r.completedMilestones,
            uint8(r.status)
        );
    }

    // =====================================================
    // ГЕТТЕР: СВОДКА ПО ЭТАПАМ
    // =====================================================

    function getMilestoneSummary(
        uint256 requestId
    )
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
