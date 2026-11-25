
// =========================================================
// 1. АДРЕСА КОНТРАКТОВ
// =========================================================

const DAO_ADDRESS =
    "0xA4c2C8C006668BEACe01244Aca8926E5B09F5DAd";


const NFT_ADDRESS =
    "0x5163Afa2DFB317ce1181A3bc284750E58CC9528d";

const MILESTONES_ADDRESS =
    "0x443cEd9D189439B18fBB0352e8610196b5F5EF17";

const DAO_VIEW_ADDRESS =
    "0xE7f6bCf3f6d6457BA935E3fd398aBe1E3eEF92f4";

const TREASURY_ADDRESS =
    "0xDa84175D001ad066e76269017f8F101E0a73E9Aa";

const BADGES_ADDRESS =
    "0x927fDd82dc78D2956ABA5C9bfd1868354375D005";

const HERO_CARDS_ADDRESS =
    "0x10DEb68dEb074EF261c29a4f36aC8F2BC82e1731";


// =========================================================
// 2. АДРЕСА РЕНДЕРЕРОВ NFT
// =========================================================

const PORTRAIT_RENDERER_ADDRESS =
    "0x3016eB09c38437D639097870D204dA338d4D2f64";

const LAYOUT_RENDERER_ADDRESS =
    "0xA038620a7353dE6790CAfDe0e14E4182f2b2AbBE";

const PASSPORT_RENDERER_ADDRESS =
    "0xFC80A0C8c84AcE809659A5428272E379e9c054F1";


// =========================================================
// 3. BACKEND И EXPLORER
// =========================================================

const API_URL = "http://localhost:3001/api";
const EXPLORER_URL = "";


// =========================================================
// 4. СТАТУСЫ ЗАЯВОК
// =========================================================

// Новая последовательность статусов RescueDAO:
//
// 0 — UnderReview
// 1 — ChangesRequested
// 2 — Approved
// 3 — Rejected
// 4 — Completed
// 5 — Cancelled

const STATUS_LABELS = [
    { text: "На проверке", cls: "badge-blue" },
    { text: "Требуются изменения", cls: "badge-orange" },
    { text: "Одобрена (финансирование этапов)", cls: "badge-green" },
    { text: "Отклонена", cls: "badge-red" },
    { text: "Завершена", cls: "badge-gray" },
    { text: "Отменена", cls: "badge-gray" }
];

const REQUEST_STATUS = {
    UNDER_REVIEW: 0,
    CHANGES_REQUESTED: 1,
    APPROVED: 2,
    REJECTED: 3,
    COMPLETED: 4,
    CANCELLED: 5
};


// =========================================================
// 5. ABI RESCUEDAO
// =========================================================

const DAO_ABI = [

    // -----------------------------------------------------
    // Основные параметры
    // -----------------------------------------------------

    "function admin() view returns (address)",

    "function validators(uint256) view returns (address)",

    "function isValidator(address account) view returns (bool)",

    "function isMember(address account) view returns (bool)",

    "function rescueNftContract() view returns (address)",

    "function treasuryContract() view returns (address)",

    "function milestonesContract() view returns (address)",

    "function badgesContract() view returns (address)",

    "function heroCardsContract() view returns (address)",

    "function pendingBadgeCompletion(uint256 requestId) view returns (bool)",

    "function requestCount() view returns (uint256)",
    
    "function getRequestChangeReason(uint256 requestId) view returns (string)",

    // -----------------------------------------------------
    // Настройка контрактов и участников
    // -----------------------------------------------------

    "function setTreasuryContract(address treasury)",

    "function setRescueNftContract(address nft)",

    "function setMilestonesContract(address milestones)",

    "function setBadgesContract(address badges)",

    "function setHeroCardsContract(address heroCards)",

    "function setMember(address member, bool registered)",


    // -----------------------------------------------------
    // Пожертвования
    // -----------------------------------------------------

    "function donate() payable",

    "function donateToRequest(uint256 requestId) payable",


    // -----------------------------------------------------
    // Создание заявки
    // -----------------------------------------------------

    "function createAidRequest(string animalName, string description, string evidenceURI, bytes32 evidenceHash, uint256 requestedAmount) returns (uint256)",


    // -----------------------------------------------------
    // Редактирование заявки
    // -----------------------------------------------------

    "function updateRequestDetails(uint256 requestId, string animalName, string description, string evidenceURI, bytes32 evidenceHash, uint256 requestedAmount)",

    "function requestChanges(uint256 requestId, string reason)",

    "function resubmitForReview(uint256 requestId)",

    "function rejectRequest(uint256 requestId, string reason)",


    // -----------------------------------------------------
    // Публикация заявки
    // Голосования больше нет.
    // -----------------------------------------------------

    "function publishRequest(uint256 requestId)",

    "function cancelRequest(uint256 requestId)",

    "function retryBadgeCompletion(uint256 requestId)",


    // -----------------------------------------------------
    // Данные заявки
    // -----------------------------------------------------

    // В новой версии getRequestCore возвращает 4 значения.
    "function getRequestCore(uint256 requestId) view returns (address requester, uint256 requestedAmount, uint8 status, bool exists)",

    "function getRequestTextAndMeta(uint256 requestId) view returns (string animalName, string description, string evidenceURI, bytes32 evidenceHash, address requester, bool exists)",

    // Основная финансовая информация без голосования.
    "function getRequestFinancialData(uint256 requestId) view returns (uint256 requestedAmount, uint256 milestoneTotal, uint256 releasedAmount, uint256 milestoneCount, uint256 completedMilestones, uint8 status)",

    "function getRequestFinancialStats(uint256 requestId) view returns (uint256 requestedAmount, uint256 milestoneTotal, uint256 releasedAmount, uint256 milestoneCount, uint256 completedMilestones, uint8 status)",

    // Совместимость со старым интерфейсом DAO.
    // Поля yesVotes, noVotes и votingEndsAt в новой версии равны нулю.
    "function getRequestFinancialAndVoting(uint256 requestId) view returns (uint256 requestedAmount, uint256 yesVotes, uint256 noVotes, uint256 votingEndsAt, uint256 milestoneTotal, uint256 releasedAmount, uint256 milestoneCount, uint256 completedMilestones, uint8 status)",

    "function getMilestoneSummary(uint256 requestId) view returns (uint256 total, uint256 count)",


    // -----------------------------------------------------
    // Обратные вызовы от RescueMilestones
    // -----------------------------------------------------

    "function onMilestoneAdded(uint256 requestId, uint256 amount)",

    "function onMilestoneUpdated(uint256 requestId, uint256 oldAmount, uint256 newAmount)",

    "function onValidatorApproved(address validator)",

    "function onMilestoneReleased(uint256 requestId, uint256 amount)",


    // -----------------------------------------------------
    // Репутация валидаторов
    // -----------------------------------------------------

    "function validatorReputation(address validator) view returns (uint256)",

    "function validatorApprovedTotal(address validator) view returns (uint256)",


    // -----------------------------------------------------
    // События пожертвований
    // -----------------------------------------------------

    "event DonationReceived(address indexed donor, uint256 amount)",

    "event RequestDonationReceived(uint256 indexed requestId, address indexed donor, uint256 amount)",


    // -----------------------------------------------------
    // События заявок
    // -----------------------------------------------------

    "event AidRequestCreated(uint256 indexed requestId, address indexed requester, string animalName, uint256 requestedAmount, uint256 submittedAt)",

    "event AidRequestUpdated(uint256 indexed requestId, uint256 requestedAmount)",

    "event AidRequestChangesRequested(uint256 indexed requestId, string reason)",

    "event AidRequestResubmitted(uint256 indexed requestId)",

    // Сохранено в контракте для совместимости.
    // Голосование больше не проводится.
    "event AidRequestPublished(uint256 indexed requestId, uint256 votingEndsAt, uint256 votingDuration)",

    "event VoteCast(uint256 indexed requestId, address indexed voter, bool support, uint256 yesVotes, uint256 noVotes)",

    "event AidRequestFinalized(uint256 indexed requestId, uint8 status, uint256 reservedAmount)",

    "event AidRequestCancelled(uint256 indexed requestId, uint256 returnedToAvailableBalance)",


    // -----------------------------------------------------
    // NFT и настройки связанных контрактов
    // -----------------------------------------------------

    "event PassportMinted(uint256 indexed requestId, uint256 indexed tokenId, address indexed owner)",

    "event TreasuryUpdated(address indexed treasury)",

    "event NftContractUpdated(address indexed nftContract)",

    "event MilestonesUpdated(address indexed milestones)",


    // -----------------------------------------------------
    // RescueBadges
    // -----------------------------------------------------

    "event BadgesContractUpdated(address indexed badgesContract)",
    "event HeroCardsContractUpdated(address indexed heroCardsContract)",

    "event BadgeDonationRecorded(address indexed donor, uint256 indexed requestId, uint256 amount)",

    "event BadgeCompletionNotified(uint256 indexed requestId)",

    "event BadgeCompletionQueued(uint256 indexed requestId)",

    "event BadgeCompletionRetried(uint256 indexed requestId)"
];


// =========================================================
// 6. ABI RESCUEDAO VIEW
// =========================================================

const DAO_VIEW_ABI = [

    "function daoContract() view returns (address)",

    "function treasuryContract() view returns (address)",


    // -----------------------------------------------------
    // Основная информация о заявках
    // -----------------------------------------------------

    "function getRequestCount() view returns (uint256)",

    "function requestExists(uint256 requestId) view returns (bool)",

    // Новая структура: 4 возвращаемых значения.
    "function getRequestCore(uint256 requestId) view returns (address requester, uint256 requestedAmount, uint8 status, bool exists)",

    "function getAidRequestInfo(uint256 requestId) view returns (string animalName, string description, string evidenceURI, bytes32 evidenceHash, address requester)",

    // Финансовые показатели без голосования.
    "function getAidRequestStats(uint256 requestId) view returns (uint256 requestedAmount, uint256 milestoneTotal, uint256 releasedAmount, uint256 milestoneCount, uint256 completedMilestones, uint8 status)",

    "function getMilestoneSummary(uint256 requestId) view returns (uint256 total, uint256 count)",


    // -----------------------------------------------------
    // Финансовая информация заявки
    // -----------------------------------------------------

    "function getAidRequestFundingStats(uint256 requestId) view returns (uint256 fundingGoal, uint256 targetRaised, uint256 fundingProgress, uint256 targetReserved, uint256 generalReserved, uint256 targetSpent, uint256 targetReassigned)",

    "function getUserRequestDonation(uint256 requestId, address user) view returns (uint256)",

    "function getAvailableRequestDonations(uint256 requestId) view returns (uint256)",


    // -----------------------------------------------------
    // Общая финансовая информация
    // -----------------------------------------------------

    "function getAvailableBalance() view returns (uint256)",

    "function getContractBalance() view returns (uint256)",

    "function getTotalSpentAllSources() view returns (uint256)",

    "function getTreasuryTotals() view returns (uint256 generalDonated, uint256 generalReserved, uint256 generalSpent, uint256 targetDonations, uint256 targetReserved, uint256 targetSpent, uint256 targetReassigned)",


    // -----------------------------------------------------
    // Роли
    // -----------------------------------------------------

    "function isValidator(address account) view returns (bool)",


    // -----------------------------------------------------
    // Информация об этапах
    // -----------------------------------------------------

    "function getMilestoneCount(uint256 requestId) view returns (uint256)",

    "function getMilestoneDetails(uint256 requestId, uint256 milestoneId) view returns (string description, address recipient, uint256 amount, string evidenceURI, bytes32 evidenceHash, uint256 approvalCount, bool evidenceSubmitted, bool released)",


    // -----------------------------------------------------
    // Финансирование отдельного этапа
    // -----------------------------------------------------

    "function getMilestoneFundingStatus(uint256 requestId, uint256 milestoneId) view returns (bool funded, uint256 targetReserved, uint256 generalReserved, bool released)",


    // -----------------------------------------------------
    // Подтверждение валидатора
    // -----------------------------------------------------

    "function hasValidatorApprovedMilestone(uint256 requestId, uint256 milestoneId, address validator) view returns (bool)",


    // -----------------------------------------------------
    // Сводная информация по финансированию этапов
    // -----------------------------------------------------

    "function getMilestonesFundingSummary(uint256 requestId) view returns (uint256 totalMilestones, uint256 fundedCount, uint256 releasedCount, uint256 targetReserved, uint256 generalReserved)",


    // -----------------------------------------------------
    // Дополнительные статусы заявки
    // -----------------------------------------------------

    "function isRequestCompleted(uint256 requestId) view returns (bool)",

    "function isRequestCancelled(uint256 requestId) view returns (bool)"
];


// =========================================================
// 7. ABI RESCUETREASURY
// =========================================================

const TREASURY_ABI = [

    "function dao() view returns (address)",

    "function milestonesContract() view returns (address)",

    "function requestReservationCreated(uint256 requestId) view returns (bool)",


    // -----------------------------------------------------
    // Общие средства
    // -----------------------------------------------------

    "function totalDonated() view returns (uint256)",

    "function totalReserved() view returns (uint256)",

    "function totalSpent() view returns (uint256)",

    "function getAvailableBalance() view returns (uint256)",

    "function getContractBalance() view returns (uint256)",

    "function getTotalSpentAllSources() view returns (uint256)",


    // -----------------------------------------------------
    // Целевые пожертвования
    // -----------------------------------------------------

    "function totalTargetDonations() view returns (uint256)",

    "function totalTargetReserved() view returns (uint256)",

    "function totalTargetSpent() view returns (uint256)",

    "function totalTargetReassigned() view returns (uint256)",


    // -----------------------------------------------------
    // Финансы отдельных заявок
    // -----------------------------------------------------

    "function requestDonations(uint256 requestId) view returns (uint256)",

    "function userRequestDonations(uint256 requestId, address user) view returns (uint256)",

    "function requestTargetReserved(uint256 requestId) view returns (uint256)",

    "function requestGeneralReserved(uint256 requestId) view returns (uint256)",

    "function requestTargetSpent(uint256 requestId) view returns (uint256)",

    "function requestTargetReassigned(uint256 requestId) view returns (uint256)",

    "function getAvailableRequestDonations(uint256 requestId) view returns (uint256)",


    // -----------------------------------------------------
    // Резервирование средств по отдельным этапам
    // -----------------------------------------------------

    "function milestoneTargetReserved(uint256 requestId, uint256 milestoneId) view returns (uint256)",

    "function milestoneGeneralReserved(uint256 requestId, uint256 milestoneId) view returns (uint256)",

    "function milestoneReservationCreated(uint256 requestId, uint256 milestoneId) view returns (bool)",


    // -----------------------------------------------------
    // Операции резервирования и выплаты
    // -----------------------------------------------------

    "function reserveMilestoneFunds(uint256 requestId, uint256 milestoneId, uint256 targetAmount, uint256 generalAmount)",

    "function releaseMilestone(uint256 requestId, uint256 milestoneId, address payable recipient, uint256 amount, uint256 targetAmount, uint256 generalAmount)",

    "function releaseReservation(uint256 requestId) returns (uint256 generalReleased)",

    "function reassignAvailableTargetFunds(uint256 requestId) returns (uint256 amount)",


    // -----------------------------------------------------
    // События
    // -----------------------------------------------------

    "event DonationReceived(address indexed donor, uint256 amount, uint256 totalDonated)",

    "event RequestDonationReceived(uint256 indexed requestId, address indexed donor, uint256 amount, uint256 totalRequestDonations)",

    "event TargetFundsReserved(uint256 indexed requestId, uint256 amount)",

    "event GeneralFundsReserved(uint256 indexed requestId, uint256 amount)",

    "event TargetFundsReassigned(uint256 indexed requestId, uint256 amount)",

    "event FundsReleased(uint256 indexed requestId, uint256 indexed milestoneId, address recipient, uint256 amount)",

    "event FundsReleasedBySource(uint256 indexed requestId, uint256 indexed milestoneId, uint256 targetAmount, uint256 generalAmount)",

    "event ReservationReleased(uint256 indexed requestId, uint256 generalAmount, uint256 targetAmount)",

    "event MilestonesContractUpdated(address indexed milestones)"
];


// =========================================================
// 8. ABI RESCUEMILESTONES
// =========================================================

const MILESTONES_ABI = [

    "function admin() view returns (address)",

    "function daoContract() view returns (address)",

    "function treasuryContract() view returns (address)",


    // -----------------------------------------------------
    // Настройка
    // -----------------------------------------------------

    "function setDAO(address dao)",

    "function setTreasury(address treasury)",


    // -----------------------------------------------------
    // Счётчики
    // -----------------------------------------------------

    "function milestoneCount(uint256 requestId) view returns (uint256)",

    "function milestoneTotal(uint256 requestId) view returns (uint256)",


    // -----------------------------------------------------
    // Создание и редактирование этапов
    // -----------------------------------------------------

    "function addMilestone(uint256 requestId, string description, address recipient, uint256 amount)",

    "function updateMilestone(uint256 requestId, uint256 milestoneId, string description, address recipient, uint256 newAmount)",


    // -----------------------------------------------------
    // Финансирование отдельного этапа
    // -----------------------------------------------------

    "function fundMilestone(uint256 requestId, uint256 milestoneId)",


    // -----------------------------------------------------
    // Доказательства выполнения
    // -----------------------------------------------------

    "function submitMilestoneEvidence(uint256 requestId, uint256 milestoneId, string evidenceURI, bytes32 evidenceHash)",


    // -----------------------------------------------------
    // Подтверждение выполнения
    // -----------------------------------------------------

    "function approveMilestone(uint256 requestId, uint256 milestoneId)",


    // -----------------------------------------------------
    // Данные этапа
    // -----------------------------------------------------

    "function getMilestone(uint256 requestId, uint256 milestoneId) view returns (string description, address recipient, uint256 amount, string evidenceURI, bytes32 evidenceHash, uint256 approvalCount, bool evidenceSubmitted, bool released)",

    "function getMilestoneSummary(uint256 requestId) view returns (uint256 total, uint256 count)",


    // -----------------------------------------------------
    // Статус финансирования этапа
    // -----------------------------------------------------

    "function getMilestoneFundingStatus(uint256 requestId, uint256 milestoneId) view returns (bool funded, uint256 targetReserved, uint256 generalReserved, bool released)",


    // -----------------------------------------------------
    // Проверка подтверждений валидаторов
    // -----------------------------------------------------

    "function hasApprovedMilestone(uint256 requestId, uint256 milestoneId, address validator) view returns (bool)",

    "function hasValidatorApproved(uint256 requestId, uint256 milestoneId, address validator) view returns (bool)",


    // -----------------------------------------------------
    // События настройки контрактов
    // -----------------------------------------------------

    "event DAOUpdated(address indexed newAddress)",

    "event TreasuryUpdated(address indexed newAddress)",


    // -----------------------------------------------------
    // События этапов
    // -----------------------------------------------------

    "event MilestoneCreated(uint256 indexed requestId, uint256 indexed milestoneId, string description, address recipient, uint256 amount)",

    "event MilestoneUpdated(uint256 indexed requestId, uint256 indexed milestoneId, string description, address recipient, uint256 oldAmount, uint256 newAmount)",

    "event MilestoneEvidenceSubmitted(uint256 indexed requestId, uint256 indexed milestoneId, string evidenceURI, bytes32 evidenceHash)",

    "event MilestoneApproved(uint256 indexed requestId, uint256 indexed milestoneId, address indexed validator, uint256 approvalCount)",

    "event MilestoneFundsReleased(uint256 indexed requestId, uint256 indexed milestoneId, address recipient, uint256 amount, uint256 targetAmount, uint256 generalAmount)"
];


// =========================================================
// 9. ABI RESCUENFT
// =========================================================

const NFT_ABI = [

    // -----------------------------------------------------
    // ERC721
    // -----------------------------------------------------

    "function ownerOf(uint256 tokenId) view returns (address)",

    "function tokenURI(uint256 tokenId) view returns (string)",

    "function balanceOf(address owner) view returns (uint256)",

    // -----------------------------------------------------
    // Связь NFT с заявкой
    // -----------------------------------------------------

    "function requestToToken(uint256 requestId) view returns (uint256)",

    "function getTokenIdForRequest(uint256 requestId) view returns (uint256)",

    "function getRequestId(uint256 tokenId) view returns (uint256)"
];


// =========================================================
// 10. ABI RESCUEBADGES
// =========================================================

const BADGES_ABI = [

    "function daoContract() view returns (address)",

    "function totalBadgesIssued() view returns (uint256)",


    // -----------------------------------------------------
    // Статистика
    // -----------------------------------------------------

    "function donationCount(address donor) view returns (uint256)",

    "function uniqueRequestsSupported(address donor) view returns (uint256)",

    "function getDonorStats(address donor) view returns (uint256 donations, uint256 uniqueRequests, uint256 badgesReceived)",


    // -----------------------------------------------------
    // Пожертвования
    // -----------------------------------------------------

    "function donatedToRequest(address donor, uint256 requestId) view returns (bool)",

    "function contributionToRequest(address donor, uint256 requestId) view returns (uint256)",


    // -----------------------------------------------------
    // Завершение заявок
    // -----------------------------------------------------

    "function completedRequests(uint256 requestId) view returns (bool)",


    // -----------------------------------------------------
    // Достижения
    // -----------------------------------------------------

    "function hasBadge(address donor, uint8 badgeType) view returns (bool)",

    "function badgeTokenId(address donor, uint8 badgeType) view returns (uint256)",

    "function tokenBadgeType(uint256 tokenId) view returns (uint8)",

    "function checkBadge(address donor, uint8 badgeType) view returns (bool)",

    "function getBadgeTokenId(address donor, uint8 badgeType) view returns (uint256)",

    "function claimRescueHeroBadge(uint256 requestId)",


    // -----------------------------------------------------
    // ERC721
    // -----------------------------------------------------

    "function balanceOf(address owner) view returns (uint256)",

    "function ownerOf(uint256 tokenId) view returns (address)",

    "function tokenURI(uint256 tokenId) view returns (string)",

    "function name() view returns (string)",

    "function symbol() view returns (string)",


    // -----------------------------------------------------
    // События
    // -----------------------------------------------------

    "event DonationRecorded(address indexed donor, uint256 indexed requestId, uint256 amount, uint256 donationCount)",

    "event BadgeAwarded(address indexed recipient, uint8 indexed badgeType, uint256 indexed tokenId)",

    "event RequestMarkedCompleted(uint256 indexed requestId)"
];


// =========================================================
// 11. ПРОВЕРКА АДРЕСОВ КОНТРАКТОВ
// =========================================================

function isConfiguredAddress(address) {
    return (
        typeof address === "string" &&
        /^0x[a-fA-F0-9]{40}$/.test(address) &&
        address !== "0x0000000000000000000000000000000000000000"
    );
}


// =========================================================
// ABI RESCUEHEROCARDS
// =========================================================


// =========================================================
// ABI RESCUEHEROCARDS
// =========================================================

const HERO_CARDS_ABI = [

    // -----------------------------------------------------
    // Общая статистика
    // -----------------------------------------------------

    "function totalSupply() view returns (uint256)",
    "function totalCardsIssued() view returns (uint256)",

    // -----------------------------------------------------
    // ERC721
    // -----------------------------------------------------

    "function balanceOf(address owner) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",

    // -----------------------------------------------------
    // Информация о карточке
    // -----------------------------------------------------

    "function getCard(uint256 tokenId) view returns ((uint256 serialNumber,uint256 requestId,uint256 passportTokenId,uint256 totalContribution,uint256 issuedAt))",

    // -----------------------------------------------------
    // История пожертвований
    // -----------------------------------------------------

    "function getHistory(uint256 tokenId) view returns ((uint256 timestamp,uint256 amount,uint256 totalAfter)[])",
    "function getParticipation(uint256 tokenId, uint256 index) view returns (uint256 timestamp, uint256 amount, uint256 totalAfter)",
    "function getParticipationCount(uint256 tokenId) view returns (uint256)",

    // -----------------------------------------------------
    // Связь донор — заявка — карточка
    // -----------------------------------------------------

    "function donorRequestCard(address donor, uint256 requestId) view returns (uint256)",

    // -----------------------------------------------------
    // Связанные контракты
    // -----------------------------------------------------

    "function daoContract() view returns (address)",
    "function passportContract() view returns (address)",

    // -----------------------------------------------------
    // События
    // -----------------------------------------------------

    "event HeroCardIssued(address indexed donor,uint256 indexed tokenId,uint256 indexed requestId,uint256 passportTokenId,uint256 serialNumber)",

    "event ParticipationRecorded(uint256 indexed tokenId,address indexed donor,uint256 indexed requestId,uint256 amount,uint256 totalContribution,uint256 timestamp)"
];

