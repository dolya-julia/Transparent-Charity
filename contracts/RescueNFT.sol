// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@4.9.6/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts@4.9.6/access/Ownable.sol";

// =========================================================
// ИНТЕРФЕЙС DAO
// =========================================================

interface IRescueDAO {
    function getAidRequestInfo(uint256 _requestId)
        external
        view
        returns (
            string memory animalName,
            string memory description,
            string memory evidenceURI,
            bytes32 evidenceHash,
            address requester
        );

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
            uint8 status
        );

    function requestExists(uint256 _requestId)
        external
        view
        returns (bool);
}

// =========================================================
// ИНТЕРФЕЙС ГЕНЕРАТОРА ПАСПОРТОВ
// =========================================================

interface IRescuePassportRenderer {
    struct RenderParams {
        uint256 tokenId;
        uint256 requestId;
        string animalName;
        uint8 status;
        uint256 milestoneCount;
        uint256 completedMilestones;
    }

    function render(
        RenderParams memory params
    ) external pure returns (string memory);
}

/**
 * @title RescueNFT
 * @dev ERC-721 NFT-паспорта животных.
 */
contract RescueNFT is ERC721, Ownable {

    address public rescueDaoContract;
    address public rendererContract;

    uint256 private _tokenIds;

    mapping(uint256 => uint256) public tokenToRequest;
    mapping(uint256 => uint256) public requestToToken;

    event PassportMinted(
        address indexed recipient,
        uint256 indexed tokenId,
        uint256 indexed requestId
    );

    modifier onlyDAOorOwner() {
        require(
            msg.sender == rescueDaoContract ||
            msg.sender == owner(),
            "Only DAO or owner"
        );
        _;
    }

    // =========================================================
    // КОНСТРУКТОР
    // =========================================================

    constructor(
        address _rescueDao,
        address _renderer
    )
        ERC721("RescueDAO Animal Passport", "RAP")
        Ownable()
    {
        require(
            _rescueDao != address(0),
            "Invalid DAO address"
        );

        require(
            _renderer != address(0),
            "Invalid renderer address"
        );

        rescueDaoContract = _rescueDao;
        rendererContract = _renderer;
    }

    // =========================================================
    // УПРАВЛЕНИЕ АДРЕСАМИ
    // =========================================================

    function setRescueDao(
        address _rescueDao
    ) external onlyOwner {
        require(
            _rescueDao != address(0),
            "Invalid DAO address"
        );

        rescueDaoContract = _rescueDao;
    }

    function setRenderer(
        address _renderer
    ) external onlyOwner {
        require(
            _renderer != address(0),
            "Invalid renderer address"
        );

        rendererContract = _renderer;
    }

    // =========================================================
    // ВЫПУСК NFT
    // =========================================================

    function mintPassport(
        address to,
        uint256 requestId
    )
        external
        onlyDAOorOwner
        returns (uint256)
    {
        require(to != address(0), "Invalid recipient");
        require(requestId > 0, "Invalid request ID");

        require(
            requestToToken[requestId] == 0,
            "Passport already exists"
        );

        require(
            IRescueDAO(rescueDaoContract).requestExists(requestId),
            "Request does not exist"
        );

        _tokenIds++;

        uint256 newTokenId = _tokenIds;

        tokenToRequest[newTokenId] = requestId;
        requestToToken[requestId] = newTokenId;

        _safeMint(to, newTokenId);

        emit PassportMinted(
            to,
            newTokenId,
            requestId
        );

        return newTokenId;
    }

    // =========================================================
    // ИНФОРМАЦИЯ О NFT
    // =========================================================

    function totalSupply() external view returns (uint256) {
        return _tokenIds;
    }

    function getRequestId(
        uint256 tokenId
    ) external view returns (uint256) {
        ownerOf(tokenId);

        return tokenToRequest[tokenId];
    }

    function getTokenIdForRequest(
        uint256 requestId
    ) external view returns (uint256) {
        uint256 tokenId = requestToToken[requestId];

        require(
            tokenId != 0,
            "Passport does not exist"
        );

        return tokenId;
    }

    // =========================================================
    // ДИНАМИЧЕСКИЕ МЕТАДАННЫЕ NFT
    // =========================================================

    function tokenURI(
        uint256 tokenId
    )
        public
        view
        override
        returns (string memory)
    {
        ownerOf(tokenId);

        uint256 requestId = tokenToRequest[tokenId];

        (
            string memory animalName,
            ,
            ,
            ,
        ) = IRescueDAO(rescueDaoContract).getAidRequestInfo(requestId);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            uint256 milestoneCount,
            uint256 completedMilestones,
            uint8 status
        ) = IRescueDAO(rescueDaoContract).getAidRequestStats(requestId);

        IRescuePassportRenderer.RenderParams memory params =
            IRescuePassportRenderer.RenderParams({
                tokenId: tokenId,
                requestId: requestId,
                animalName: animalName,
                status: status,
                milestoneCount: milestoneCount,
                completedMilestones: completedMilestones
            });

        return IRescuePassportRenderer(rendererContract).render(params);
    }
}