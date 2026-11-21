
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@4.9.6/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts@4.9.6/access/Ownable.sol";

// =========================================================
// ИНТЕРФЕЙС RESCUEDAO
// =========================================================

interface IRescueDAO {

    function getRequestCore(uint256 requestId)
        external
        view
        returns (
            address requester,
            uint256 requestedAmount,
            uint8 status,
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

    function getRequestFinancialData(uint256 requestId)
        external
        view
        returns (
            uint256 requestedAmount,
            uint256 milestoneTotal,
            uint256 releasedAmount,
            uint256 milestoneCount,
            uint256 completedMilestones,
            uint8 status
        );

    function treasuryContract()
        external
        view
        returns (address);
}

// =========================================================
// ИНТЕРФЕЙС ГЛАВНОГО PASSPORT RENDERER
// =========================================================

interface IRescuePassportRenderer {

    struct RenderParams {
        uint256 tokenId;
        uint256 requestId;
        string animalName;
        uint8 status;
        uint256 milestoneCount;
        uint256 completedMilestones;
        uint256 requestedAmount;
        uint256 targetDonations;
    }

    function render(
        RenderParams memory params
    ) external view returns (string memory);
}

// =========================================================
// ИНТЕРФЕЙС RESCUETREASURY
// =========================================================

interface IRescueTreasuryView {

    function requestDonations(uint256 requestId)
        external
        view
        returns (uint256);
}

/**
 * @title RescueNFT
 * @dev ERC-721 NFT-паспорта животных для RescueDAO.
 *
 * NFT выпускается после одобрения заявки администратором DAO.
 * Голосование сообщества для выпуска NFT не используется.
 */
contract RescueNFT is ERC721, Ownable {

    // =========================================================
    // СТАТУСЫ RESCUEDAO
    // =========================================================

    // 0 — UnderReview
    // 1 — ChangesRequested
    // 2 — Approved
    // 3 — Rejected
    // 4 — Completed
    // 5 — Cancelled

    uint8 private constant STATUS_APPROVED = 2;

    // =========================================================
    // АДРЕСА ВНЕШНИХ КОНТРАКТОВ
    // =========================================================

    address public rescueDaoContract;
    address public rendererContract;

    // =========================================================
    // СЧЁТЧИК И СВЯЗИ NFT
    // =========================================================

    uint256 private _tokenIds;

    mapping(uint256 => uint256) public tokenToRequest;
    mapping(uint256 => uint256) public requestToToken;

    // =========================================================
    // СОБЫТИЯ
    // =========================================================

    event PassportMinted(
        address indexed recipient,
        uint256 indexed tokenId,
        uint256 indexed requestId
    );

    event RescueDAOUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );

    event RendererUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );

    // =========================================================
    // КОНСТРУКТОР
    // =========================================================

    constructor(
        address _rescueDao,
        address _renderer
    )
        ERC721(
            "RescueDAO Animal Passport",
            "RAP"
        )
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

        require(
            _rescueDao.code.length > 0,
            "DAO contract does not exist"
        );

        require(
            _renderer.code.length > 0,
            "Renderer contract does not exist"
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

        require(
            _rescueDao.code.length > 0,
            "DAO contract does not exist"
        );

        address oldAddress = rescueDaoContract;

        rescueDaoContract = _rescueDao;

        emit RescueDAOUpdated(
            oldAddress,
            _rescueDao
        );
    }

    function setRenderer(
        address _renderer
    ) external onlyOwner {

        require(
            _renderer != address(0),
            "Invalid renderer address"
        );

        require(
            _renderer.code.length > 0,
            "Renderer does not exist"
        );

        address oldAddress = rendererContract;

        rendererContract = _renderer;

        emit RendererUpdated(
            oldAddress,
            _renderer
        );
    }

    // =========================================================
    // ВЫПУСК NFT
    // =========================================================

    /**
     * @notice Выпускает NFT-паспорт для одобренной заявки.
     *
     * Вызывать функцию может только RescueDAO.
     *
     * Условия:
     * - заявка существует;
     * - статус заявки Approved (2);
     * - получатель является инициатором заявки;
     * - NFT для заявки ещё не выпускался.
     *
     * Функция вызывается из approveRequest()
     * основного контракта RescueDAO.
     */
    function mintPassport(
        address to,
        uint256 requestId
    )
        external
        returns (uint256)
    {
        require(
            msg.sender == rescueDaoContract,
            "Only DAO contract"
        );

        require(
            to != address(0),
            "Invalid recipient"
        );

        require(
            requestId > 0,
            "Invalid request ID"
        );

        require(
            requestToToken[requestId] == 0,
            "Passport already exists"
        );

        (
            address requester,
            ,
            uint8 status,
            bool exists
        ) = IRescueDAO(rescueDaoContract)
            .getRequestCore(requestId);

        require(
            exists,
            "Request does not exist"
        );

        require(
            status == STATUS_APPROVED,
            "Request is not approved"
        );

        require(
            to == requester,
            "Recipient must be requester"
        );

        // Создаём новый NFT.
        _tokenIds++;

        uint256 newTokenId = _tokenIds;

        // Сохраняем связь NFT и заявки.
        tokenToRequest[newTokenId] = requestId;
        requestToToken[requestId] = newTokenId;

        // Выпускаем NFT.
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

    function totalSupply()
        external
        view
        returns (uint256)
    {
        return _tokenIds;
    }

    function getRequestId(
        uint256 tokenId
    )
        external
        view
        returns (uint256)
    {
        ownerOf(tokenId);

        return tokenToRequest[tokenId];
    }

    function getTokenIdForRequest(
        uint256 requestId
    )
        external
        view
        returns (uint256)
    {
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

    /**
     * @notice Формирует актуальные metadata NFT.
     *
     * Данные берутся непосредственно из DAO и Treasury.
     * Поэтому metadata обновляются при изменении состояния заявки.
     */
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

        require(
            requestId != 0,
            "Request is not linked to NFT"
        );

        // Получаем имя животного.
        (
            string memory animalName,
            ,
            ,
            ,
            ,
            bool requestExists
        ) = IRescueDAO(rescueDaoContract)
            .getRequestTextAndMeta(requestId);

        require(
            requestExists,
            "DAO request does not exist"
        );

        // Получаем финансовые данные и прогресс этапов.
        (
            uint256 requestedAmount,
            ,
            ,
            uint256 milestoneCount,
            uint256 completedMilestones,
            uint8 status
        ) = IRescueDAO(rescueDaoContract)
            .getRequestFinancialData(requestId);

        // Получаем сумму целевых пожертвований.
        uint256 targetDonations;

        address treasuryAddress =
            IRescueDAO(rescueDaoContract)
                .treasuryContract();

        if (treasuryAddress != address(0)) {
            require(
                treasuryAddress.code.length > 0,
                "Invalid Treasury contract"
            );

            targetDonations =
                IRescueTreasuryView(treasuryAddress)
                    .requestDonations(requestId);
        }

        // Формируем параметры Renderer.
        IRescuePassportRenderer.RenderParams memory params =
            IRescuePassportRenderer.RenderParams({
                tokenId: tokenId,
                requestId: requestId,
                animalName: animalName,
                status: status,
                milestoneCount: milestoneCount,
                completedMilestones: completedMilestones,
                requestedAmount: requestedAmount,
                targetDonations: targetDonations
            });

        return IRescuePassportRenderer(rendererContract).render(
            params
        );
    }
}
