// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@4.9.6/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts@4.9.6/access/Ownable.sol";

// =========================================================
// ИНТЕРФЕЙС RescueDAO
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

    function treasuryContract() external view returns (address);
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
// ИНТЕРФЕЙС RescueTreasury
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
 * 1. Выпуск NFT-паспортов для заявок DAO.
 * 2. Связь NFT с заявками.
 * 3. Получение актуальной информации о животном.
 * 4. Получение прогресса лечения.
 * 5. Получение суммы целевых пожертвований.
 * 6. Формирование динамических metadata через Renderer.
 */
contract RescueNFT is ERC721, Ownable {

    // =========================================================
    // АДРЕСА ВНЕШНИХ КОНТРАКТОВ
    // =========================================================

    address public rescueDaoContract;
    address public rendererContract;

    // Счётчик выпущенных NFT
    uint256 private _tokenIds;

    // NFT -> заявка DAO
    mapping(uint256 => uint256) public tokenToRequest;

    // Заявка DAO -> NFT
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
    // МОДИФИКАТОРЫ
    // =========================================================

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

    /**
     * @dev Обновление адреса DAO.
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
     * @dev Обновление главного Renderer.
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
            "Renderer contract does not exist"
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
     * @dev Выпускает NFT-паспорт для существующей заявки DAO.
     *
     * Вызвать функцию может:
     * - DAO при создании заявки;
     * - владелец NFT-контракта вручную.
     */
    function mintPassport(
        address to,
        uint256 requestId
    )
        external
        onlyDAOorOwner
        returns (uint256)
    {
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

        // Проверяем существование заявки
        (
            ,
            ,
            ,
            ,
            bool exists
        ) = IRescueDAO(rescueDaoContract).getRequestCore(
            requestId
        );

        require(
            exists,
            "Request does not exist"
        );

        // Увеличиваем счётчик
        _tokenIds++;

        uint256 newTokenId = _tokenIds;

        // Сохраняем связь NFT и заявки
        tokenToRequest[newTokenId] = requestId;
        requestToToken[requestId] = newTokenId;

        // Выпускаем NFT
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

    /**
     * @dev Общее количество выпущенных NFT.
     */
    function totalSupply()
        external
        view
        returns (uint256)
    {
        return _tokenIds;
    }

    /**
     * @dev Получение ID заявки, связанной с NFT.
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
     * @dev Получение ID NFT по ID заявки.
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
    // ДИНАМИЧЕСКИЕ МЕТАДАННЫЕ NFT
    // =========================================================

    /**
     * @dev Формирует актуальные metadata NFT.
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
     * Все данные передаются главному Renderer.
     */
    function tokenURI(
        uint256 tokenId
    )
        public
        view
        override
        returns (string memory)
    {
        // Проверяем существование NFT
        ownerOf(tokenId);

        // Получаем ID заявки
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
        ) = IRescueDAO(rescueDaoContract).getRequestTextAndMeta(
            requestId
        );

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
        ) = IRescueDAO(rescueDaoContract).getRequestFinancialAndVoting(
            requestId
        );

        // -----------------------------------------------------
        // Получаем сумму целевых пожертвований
        // -----------------------------------------------------

        uint256 targetDonations;

        address treasuryAddress =
            IRescueDAO(rescueDaoContract).treasuryContract();

        if (treasuryAddress != address(0)) {
            targetDonations =
                IRescueTreasuryView(treasuryAddress).requestDonations(
                    requestId
                );
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