
const CONTRACT_ADDRESS = "0x440321A6caAcAFf7798bA19B78B6f358d70dd6CA";

const API_URL = "http://localhost:3001/api";

// Локальная Geth-сеть — обозревателя транзакций пока нет.
const EXPLORER_URL = "";

const STATUS_LABELS = [
    { text: "Голосование DAO", cls: "badge-blue" },
    { text: "Одобрена (Резерв)", cls: "badge-green" },
    { text: "Отклонена", cls: "badge-red" },
    { text: "Завершена", cls: "badge-gray" },
    { text: "Отменена", cls: "badge-gray" }
];

const CONTRACT_ABI = [
    "function admin() view returns (address)",
    "function isValidator(address) view returns (bool)",
    "function isMember(address) view returns (bool)",

    "function totalDonated() view returns (uint256)",
    "function totalReserved() view returns (uint256)",
    "function totalSpent() view returns (uint256)",
    "function requestCount() view returns (uint256)",
    "function getAvailableBalance() view returns (uint256)",

    "function donate() payable",
    "function setMember(address _member, bool _registered)",

    "function createAidRequest(string _animalName, string _description, string _evidenceURI, bytes32 _evidenceHash, uint256 _requestedAmount, uint256 _votingDuration) returns (uint256)",

    "function addMilestone(uint256 _requestId, string _description, address _recipient, uint256 _amount)",
    "function vote(uint256 _requestId, bool _support)",
    "function finalizeRequest(uint256 _requestId)",

    "function submitMilestoneEvidence(uint256 _requestId, uint256 _milestoneId, string _evidenceURI, bytes32 _evidenceHash)",
    "function approveMilestone(uint256 _requestId, uint256 _milestoneId)",
    "function cancelRequest(uint256 _requestId)",

    "function getAidRequestInfo(uint256 _requestId) view returns (string animalName, string description, string evidenceURI, bytes32 evidenceHash, address requester)",

    "function getAidRequestStats(uint256 _requestId) view returns (uint256 requestedAmount, uint256 yesVotes, uint256 noVotes, uint256 votingEndsAt, uint256 milestoneTotal, uint256 releasedAmount, uint256 milestoneCount, uint256 completedMilestones, uint8 status)",

    "function getMilestone(uint256 _requestId, uint256 _milestoneId) view returns (string description, address recipient, uint256 amount, string evidenceURI, bytes32 evidenceHash, uint256 approvalCount, bool evidenceSubmitted, bool released)",

    "function hasParticipantVoted(uint256 _requestId, address _participant) view returns (bool)",
    "function hasValidatorApproved(uint256 _requestId, uint256 _milestoneId, address _validator) view returns (bool)",

    "function rescueNftContract() view returns (address)",

    "event DonationReceived(address indexed donor, uint256 amount, uint256 totalDonated)",
    "event AidRequestCreated(uint256 indexed requestId, address indexed requester, string animalName, uint256 requestedAmount, uint256 votingEndsAt)",
    "event VoteCast(uint256 indexed requestId, address indexed voter, bool support, uint256 yesVotes, uint256 noVotes)",
    "event AidRequestFinalized(uint256 indexed requestId, uint8 status, uint256 reservedAmount)",
    "event MilestoneCreated(uint256 indexed requestId, uint256 indexed milestoneId, string description, address recipient, uint256 amount)",
    "event MilestoneEvidenceSubmitted(uint256 indexed requestId, uint256 indexed milestoneId, string evidenceURI, bytes32 evidenceHash)",
    "event MilestoneApproved(uint256 indexed requestId, uint256 indexed milestoneId, address indexed validator, uint256 approvalCount)",
    "event FundsReleased(uint256 indexed requestId, uint256 indexed milestoneId, address recipient, uint256 amount)"
];

const NFT_ABI = [
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function getTokenIdForRequest(uint256 requestId) view returns (uint256)",
    "function getRequestId(uint256 tokenId) view returns (uint256)"
];
