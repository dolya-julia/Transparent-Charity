
 // =========================================================
 // 1. АДРЕСА КОНТРАКТОВ
 // =========================================================

// Основной контракт DAO: заявки, голосование, участники.
const DAO_ADDRESS =
    "0x9FF8A1115B6Dd042b9c06cf6E0827653e5aA480f";

// Контракт NFT-паспортов.
const NFT_ADDRESS =
    "0xC57c7dc51B993182035aC84D5e5BAAAf76b3f967";

// Контракт этапов лечения.
const MILESTONES_ADDRESS =
    "0xA131043e5A5c16a0f870895d292e8557133CfBfF";

// Контракт чтения данных DAO.
const DAO_VIEW_ADDRESS =
    "0x7897Cc29e97c8ED4C0daeA551381d3335940BAE3";

// Финансовый контракт.
const TREASURY_ADDRESS =
    "0xb75aF740499D62Ef3B41Fe24F564A6eA3E8f6284";

// Контракт NFT-бейджей достижений пользователей.
const BADGES_ADDRESS =
    "0x5268A10FDa02F61408035ECD28Cfd0FDeCC1743a";


// =========================================================
// 2. АДРЕСА РЕНДЕРЕРОВ NFT
// =========================================================

const PORTRAIT_RENDERER_ADDRESS =
    "0x9FF8A1115B6Dd042b9c06cf6E0827653e5aA480f";

const LAYOUT_RENDERER_ADDRESS =
    "0xaD38F54aaD228824EDAc27cD56422F42365668dA";

const PASSPORT_RENDERER_ADDRESS =
    "0x3a0355aab35DeF372Af3645cdfAdc5aA0767aB44";


// =========================================================
// 3. BACKEND И EXPLORER
// =========================================================

const API_URL = "http://localhost:3001/api";

// Локальная Geth-сеть.
const EXPLORER_URL = "";


// =========================================================
// 4. СТАТУСЫ ЗАЯВОК
// =========================================================

const STATUS_LABELS = [
    { text: "Голосование DAO", cls: "badge-blue" },
    { text: "Одобрена (Резерв)", cls: "badge-green" },
    { text: "Отклонена", cls: "badge-red" },
    { text: "Завершена", cls: "badge-gray" },
    { text: "Отменена", cls: "badge-gray" }
];


// =========================================================
// 5. ABI ОСНОВНОГО RESCUEDAO
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

    "function pendingBadgeCompletion(uint256 requestId) view returns (bool)",

    "function requestCount() view returns (uint256)",


    // -----------------------------------------------------
    // Настройка контрактов и участников
    // -----------------------------------------------------

    "function setTreasuryContract(address treasury)",

    "function setRescueNftContract(address nft)",

    "function setMilestonesContract(address milestones)",

    "function setBadgesContract(address badges)",

    "function setMember(address member, bool registered)",


    // -----------------------------------------------------
    // Пожертвования
    // -----------------------------------------------------

    "function donate() payable",

    "function donateToRequest(uint256 requestId) payable",


    // -----------------------------------------------------
    // Создание и управление заявками
    // -----------------------------------------------------

    "function createAidRequest(string animalName, string description, string evidenceURI, bytes32 evidenceHash, uint256 requestedAmount, uint256 votingDuration) returns (uint256)",

    "function vote(uint256 requestId, bool support)",

    "function finalizeRequest(uint256 requestId)",

    "function cancelRequest(uint256 requestId)",

    "function retryBadgeCompletion(uint256 requestId)",


    // -----------------------------------------------------
    // Проверка голосования
    // -----------------------------------------------------

    "function hasVoted(uint256 requestId, address voter) view returns (bool)",


    // -----------------------------------------------------
    // Данные заявки для взаимодействия контрактов
    // -----------------------------------------------------

    "function getRequestCore(uint256 requestId) view returns (address requester, uint256 requestedAmount, uint8 status, uint256 votingEndsAt, bool exists)",

    "function getRequestTextAndMeta(uint256 requestId) view returns (string animalName, string description, string evidenceURI, bytes32 evidenceHash, address requester, bool exists)",

    "function getRequestFinancialAndVoting(uint256 requestId) view returns (uint256 requestedAmount, uint256 yesVotes, uint256 noVotes, uint256 votingEndsAt, uint256 milestoneTotal, uint256 releasedAmount, uint256 milestoneCount, uint256 completedMilestones, uint8 status)",

    "function getMilestoneSummary(uint256 requestId) view returns (uint256 total, uint256 count)",


    // -----------------------------------------------------
    // Обратные вызовы от RescueMilestones
    // -----------------------------------------------------

    "function onMilestoneAdded(uint256 requestId, uint256 amount)",

    "function onValidatorApproved(address validator)",

    "function onMilestoneReleased(uint256 requestId, uint256 amount)",


    // -----------------------------------------------------
    // Репутация валидаторов
    // -----------------------------------------------------

    "function validatorReputation(address validator) view returns (uint256)",

    "function validatorApprovedTotal(address validator) view returns (uint256)",


    // -----------------------------------------------------
    // События
    // -----------------------------------------------------

    "event DonationReceived(address indexed donor, uint256 amount)",

    "event RequestDonationReceived(uint256 indexed requestId, address indexed donor, uint256 amount)",

    "event MemberStatusChanged(address indexed member, bool registered)",

    "event AidRequestCreated(uint256 indexed requestId, address indexed requester, string animalName, uint256 requestedAmount, uint256 votingEndsAt)",

    "event VoteCast(uint256 indexed requestId, address indexed voter, bool support, uint256 yesVotes, uint256 noVotes)",

    "event AidRequestFinalized(uint256 indexed requestId, uint8 status, uint256 reservedAmount)",

    "event AidRequestCancelled(uint256 indexed requestId, uint256 returnedToAvailableBalance)",

    "event PassportMinted(uint256 indexed requestId, uint256 indexed tokenId, address indexed owner)",

    "event TreasuryUpdated(address indexed treasury)",

    "event NftContractUpdated(address indexed nftContract)",

    "event MilestonesUpdated(address indexed milestones)",

    // -----------------------------------------------------
    // События RescueBadges
    // -----------------------------------------------------

    "event BadgesContractUpdated(address indexed badgesContract)",

    "event BadgeDonationRecorded(address indexed donor, uint256 indexed requestId, uint256 amount)",

    "event BadgeCompletionNotified(uint256 indexed requestId)",

    "event BadgeCompletionQueued(uint256 indexed requestId)",

    "event BadgeCompletionRetried(uint256 indexed requestId)"
];


// =========================================================
// 6. ABI RESCUEDAO VIEW
// =========================================================

const DAO_VIEW_ABI = [

    // -----------------------------------------------------
    // Связанные контракты
    // -----------------------------------------------------

    "function daoContract() view returns (address)",

    "function treasuryContract() view returns (address)",


    // -----------------------------------------------------
    // Общая информация о заявках
    // -----------------------------------------------------

    "function getRequestCount() view returns (uint256)",

    "function requestExists(uint256 requestId) view returns (bool)",

    "function getRequestCore(uint256 requestId) view returns (address requester, uint256 requestedAmount, uint8 status, uint256 votingEndsAt, bool exists)",

    "function getAidRequestInfo(uint256 requestId) view returns (string animalName, string description, string evidenceURI, bytes32 evidenceHash, address requester)",

    "function getAidRequestStats(uint256 requestId) view returns (uint256 requestedAmount, uint256 yesVotes, uint256 noVotes, uint256 votingEndsAt, uint256 milestoneTotal, uint256 releasedAmount, uint256 milestoneCount, uint256 completedMilestones, uint8 status)",

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
    // Голосование
    // -----------------------------------------------------

    "function hasParticipantVoted(uint256 requestId, address participant) view returns (bool)"
];


// =========================================================
// 7. ABI RESCUETREASURY
// =========================================================

const TREASURY_ABI = [

    // -----------------------------------------------------
    // Основные параметры
    // -----------------------------------------------------

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

    // -----------------------------------------------------
    // Основные параметры
    // -----------------------------------------------------

    "function admin() view returns (address)",

    "function daoContract() view returns (address)",

    "function treasuryContract() view returns (address)",


    // -----------------------------------------------------
    // Настройка
    // -----------------------------------------------------

    "function setDAO(address dao)",

    "function setTreasury(address treasury)",


    // -----------------------------------------------------
    // Счётчики этапов
    // -----------------------------------------------------

    "function milestoneCount(uint256 requestId) view returns (uint256)",

    "function milestoneTotal(uint256 requestId) view returns (uint256)",


    // -----------------------------------------------------
    // Создание этапа
    // -----------------------------------------------------

    "function addMilestone(uint256 requestId, string description, address recipient, uint256 amount)",


    // -----------------------------------------------------
    // Доказательства выполнения
    // -----------------------------------------------------

    "function submitMilestoneEvidence(uint256 requestId, uint256 milestoneId, string evidenceURI, bytes32 evidenceHash)",


    // -----------------------------------------------------
    // Подтверждение этапа
    // -----------------------------------------------------

    "function approveMilestone(uint256 requestId, uint256 milestoneId)",


    // -----------------------------------------------------
    // Получение данных этапа
    // -----------------------------------------------------

    "function getMilestone(uint256 requestId, uint256 milestoneId) view returns (string description, address recipient, uint256 amount, string evidenceURI, bytes32 evidenceHash, uint256 approvalCount, bool evidenceSubmitted, bool released)",

    "function getMilestoneSummary(uint256 requestId) view returns (uint256 total, uint256 count)",


    // -----------------------------------------------------
    // Проверка подтверждений
    // -----------------------------------------------------

    "function hasApprovedMilestone(uint256 requestId, uint256 milestoneId, address validator) view returns (bool)",

    "function hasValidatorApproved(uint256 requestId, uint256 milestoneId, address validator) view returns (bool)",


    // -----------------------------------------------------
    // События
    // -----------------------------------------------------

    "event MilestoneCreated(uint256 indexed requestId, uint256 indexed milestoneId, string description, address recipient, uint256 amount)",

    "event MilestoneEvidenceSubmitted(uint256 indexed requestId, uint256 indexed milestoneId, string evidenceURI, bytes32 evidenceHash)",

    "event MilestoneApproved(uint256 indexed requestId, uint256 indexed milestoneId, address indexed validator, uint256 approvalCount)",

    "event MilestoneFundsReleased(uint256 indexed requestId, uint256 indexed milestoneId, address recipient, uint256 amount, uint256 targetAmount, uint256 generalAmount)"
];


// =========================================================
// 9. ABI RESCUENFT
// =========================================================

const NFT_ABI = [

    "function ownerOf(uint256 tokenId) view returns (address)",

    "function tokenURI(uint256 tokenId) view returns (string)",

    "function getTokenIdForRequest(uint256 requestId) view returns (uint256)",

    "function getRequestId(uint256 tokenId) view returns (uint256)"
];


// =========================================================
// 10. ABI RESCUEBADGES
// =========================================================

const BADGES_ABI = [

    // -----------------------------------------------------
    // Основные параметры
    // -----------------------------------------------------

    "function daoContract() view returns (address)",

    "function totalBadgesIssued() view returns (uint256)",


    // -----------------------------------------------------
    // Статистика пользователя
    // -----------------------------------------------------

    "function donationCount(address donor) view returns (uint256)",

    "function uniqueRequestsSupported(address donor) view returns (uint256)",

    "function getDonorStats(address donor) view returns (uint256 donations, uint256 uniqueRequests, uint256 badgesReceived)",


    // -----------------------------------------------------
    // Информация о пожертвованиях
    // -----------------------------------------------------

    "function donatedToRequest(address donor, uint256 requestId) view returns (bool)",

    "function contributionToRequest(address donor, uint256 requestId) view returns (uint256)",


    // -----------------------------------------------------
    // Завершение заявок
    // -----------------------------------------------------

    "function completedRequests(uint256 requestId) view returns (bool)",


    // -----------------------------------------------------
    // Проверка достижений
    // -----------------------------------------------------

    "function hasBadge(address donor, uint8 badgeType) view returns (bool)",

    "function badgeTokenId(address donor, uint8 badgeType) view returns (uint256)",

    "function tokenBadgeType(uint256 tokenId) view returns (uint8)",

    "function checkBadge(address donor, uint8 badgeType) view returns (bool)",

    "function getBadgeTokenId(address donor, uint8 badgeType) view returns (uint256)",


    // -----------------------------------------------------
    // Получение четвертого достижения
    // -----------------------------------------------------

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
