
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
// ИНТЕРФЕЙС ГЛАВНОГО ГЕНЕРАТОРА ПАСПОРТОВ
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

    // ВАЖНО: view, а не pure.
    // Главный Renderer обращается к двум вспомогательным контрактам.
    function render(
        RenderParams memory params
    ) external view returns (string memory);
}

/**
 * @title RescueNFT
 * @dev ERC-721 NFT-паспорта животных для RescueDAO.
 *
 * Контракт отвечает за:
 * 1. Выпуск NFT-паспортов.
 * 2. Связь NFT с заявками DAO.
 * 3. Получение актуальной информации о животном.
 * 4. Получение динамических metadata через RescuePassportRenderer.
 *
 * Генерация SVG и JSON выполняется отдельными контрактами Renderer.
 */
contract RescueNFT is ERC721, Ownable {

    // =========================================================
    // АДРЕСА ВНЕШНИХ КОНТРАКТОВ
    // =========================================================

    address public rescueDaoContract;
    address public rendererContract;

    // Счётчик выпущенных NFT
    uint256 private _tokenIds;

    // Связь NFT с заявками DAO
    mapping(uint256 => uint256) public tokenToRequest;

    // Обратная связь: заявка -> NFT
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

        rescueDaoContract = _rescueDao;
        rendererContract = _renderer;
    }

    // =========================================================
    // УПРАВЛЕНИЕ АДРЕСАМИ КОНТРАКТОВ
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

        address oldAddress = rescueDaoContract;

        rescueDaoContract = _rescueDao;

        emit RescueDAOUpdated(
            oldAddress,
            _rescueDao
        );
    }

    /**
     * @dev Обновление адреса главного Renderer.
     *
     * Вспомогательные Renderer-контракты здесь не указываются:
     * их адреса уже хранятся внутри RescuePassportRenderer.
     */
    function setRenderer(
        address _renderer
    ) external onlyOwner {

        require(
            _renderer != address(0),
            "Invalid renderer address"
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
     * @dev Создание NFT-паспорта для существующей заявки DAO.
     *
     * Вызывать функцию может DAO или владелец контракта.
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

        require(
            IRescueDAO(rescueDaoContract).requestExists(requestId),
            "Request does not exist"
        );

        _tokenIds++;

        uint256 newTokenId = _tokenIds;

        // Сохраняем связь между NFT и заявкой
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
     * @dev Формирование актуального tokenURI.
     *
     * При каждом вызове:
     * 1. Получаем ID заявки, связанной с NFT.
     * 2. Запрашиваем имя животного в DAO.
     * 3. Получаем текущий статус заявки.
     * 4. Получаем количество выполненных этапов лечения.
     * 5. Передаём данные главному Renderer.
     * 6. Возвращаем сформированные JSON metadata.
     *
     * Таким образом, изображение и метаданные NFT
     * обновляются в соответствии с состоянием заявки DAO.
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

        // Получаем связанную заявку
        uint256 requestId = tokenToRequest[tokenId];

        // Получаем информацию о животном
        (
            string memory animalName,
            ,
            ,
            ,
        ) = IRescueDAO(rescueDaoContract).getAidRequestInfo(
            requestId
        );

        // Получаем актуальную статистику заявки
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
        ) = IRescueDAO(rescueDaoContract).getAidRequestStats(
            requestId
        );

        // Формируем параметры для главного Renderer
        IRescuePassportRenderer.RenderParams memory params =
            IRescuePassportRenderer.RenderParams({
                tokenId: tokenId,
                requestId: requestId,
                animalName: animalName,
                status: status,
                milestoneCount: milestoneCount,
                completedMilestones: completedMilestones
            });

        // Получаем полностью сформированные metadata
        return IRescuePassportRenderer(rendererContract).render(
            params
        );
    }
}
