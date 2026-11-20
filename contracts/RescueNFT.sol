
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
            uint256 votingEndsAt,
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
 * Контракт обеспечивает:
 *
 * 1. Выпуск NFT-паспортов после публикации заявок.
 * 2. Связь NFT с заявками DAO.
 * 3. Получение актуальной информации о животном.
 * 4. Получение прогресса лечения.
 * 5. Получение суммы целевых пожертвований.
 * 6. Формирование динамических metadata через Renderer.
 *
 * NFT выпускается только после перехода заявки
 * в статус Voting.
 */
contract RescueNFT is ERC721, Ownable {

    // =========================================================
    // 1. КОНСТАНТЫ СТАТУСОВ DAO
    // =========================================================

    // Статусы RescueDAO:
    // 0 — UnderReview
    // 1 — ChangesRequested
    // 2 — Voting
    // 3 — Approved
    // 4 — Rejected
    // 5 — Completed
    // 6 — Cancelled

    uint8 private constant STATUS_VOTING = 2;

    // =========================================================
    // 2. АДРЕСА ВНЕШНИХ КОНТРАКТОВ
    // =========================================================

    address public rescueDaoContract;

    address public rendererContract;

    // =========================================================
    // 3. СЧЁТЧИК И СВЯЗИ NFT
    // =========================================================

    uint256 private _tokenIds;

    // NFT -> заявка DAO
    mapping(uint256 => uint256)
        public tokenToRequest;

    // Заявка DAO -> NFT
    mapping(uint256 => uint256)
        public requestToToken;

    // =========================================================
    // 4. СОБЫТИЯ
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
    // 5. КОНСТРУКТОР
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
    // 6. УПРАВЛЕНИЕ АДРЕСАМИ
    // =========================================================

    /**
     * @notice Обновление адреса DAO.
     *
     * Доступно только владельцу NFT-контракта.
     */
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

    /**
     * @notice Обновление главного Renderer.
     *
     * Доступно только владельцу NFT-контракта.
     */
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
    // 7. ВЫПУСК NFT
    // =========================================================

    /**
     * @notice Выпускает NFT-паспорт для опубликованной заявки.
     *
     * Функцию может вызвать только RescueDAO.
     *
     * Условия выпуска:
     * - заявка существует;
     * - заявка находится в статусе Voting;
     * - получатель является инициатором заявки;
     * - для заявки ещё не выпускался NFT.
     *
     * Вызов выполняется из publishRequest() основного DAO.
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

        // -----------------------------------------------------
        // Проверяем существование и статус заявки
        // -----------------------------------------------------

        (
            address requester,
            ,
            uint8 status,
            ,
            bool exists
        ) = IRescueDAO(rescueDaoContract).getRequestCore(
            requestId
        );

        require(
            exists,
            "Request does not exist"
        );

        require(
            status == STATUS_VOTING,
            "Request is not published"
        );

        require(
            to == requester,
            "Recipient must be requester"
        );

        // -----------------------------------------------------
        // Создаём новый NFT
        // -----------------------------------------------------

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
    // 8. ИНФОРМАЦИЯ О NFT
    // =========================================================

    /**
     * @notice Общее количество выпущенных NFT.
     */
    function totalSupply()
        external
        view
        returns (uint256)
    {
        return _tokenIds;
    }

    /**
     * @notice Получение ID заявки, связанной с NFT.
     */
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

    /**
     * @notice Получение ID NFT по ID заявки.
     */
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
    // 9. ДИНАМИЧЕСКИЕ МЕТАДАННЫЕ NFT
    // =========================================================

    /**
     * @notice Формирует актуальные metadata NFT.
     *
     * Получает из DAO:
     * - имя животного;
     * - запрошенную сумму;
     * - статус заявки;
     * - количество этапов лечения;
     * - количество завершённых этапов.
     *
     * Получает из Treasury:
     * - общую сумму целевых пожертвований на заявку.
     *
     * Передаёт данные главному Renderer.
     */
    function tokenURI(
        uint256 tokenId
    )
        public
        view
        override
        returns (string memory)
    {
        // -----------------------------------------------------
        // Проверяем существование NFT
        // -----------------------------------------------------

        ownerOf(tokenId);

        // -----------------------------------------------------
        // Получаем ID заявки
        // -----------------------------------------------------

        uint256 requestId = tokenToRequest[tokenId];

        require(
            requestId != 0,
            "Request is not linked to NFT"
        );

        // -----------------------------------------------------
        // Получаем имя животного
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // Получаем финансовую и голосовательную статистику
        // -----------------------------------------------------

        (
            uint256 requestedAmount,
            ,
            ,
            ,
            ,
            ,
            uint256 milestoneCount,
            uint256 completedMilestones,
            uint8 status
        ) = IRescueDAO(rescueDaoContract)
            .getRequestFinancialAndVoting(requestId);

        // -----------------------------------------------------
        // Получаем сумму целевых пожертвований
        // -----------------------------------------------------

        uint256 targetDonations;

        address treasuryAddress =
            IRescueDAO(rescueDaoContract)
                .treasuryContract();

        if (treasuryAddress != address(0)) {
            targetDonations =
                IRescueTreasuryView(treasuryAddress)
                    .requestDonations(requestId);
        }

        // -----------------------------------------------------
        // Формируем параметры Renderer
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // Формируем metadata
        // -----------------------------------------------------

        return IRescuePassportRenderer(rendererContract).render(
            params
        );
    }
}
