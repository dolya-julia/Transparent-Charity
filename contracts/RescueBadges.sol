// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@4.9.6/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts@4.9.6/utils/Strings.sol";
import "@openzeppelin/contracts@4.9.6/utils/Base64.sol";

/**
 * @title RescueBadges
 * @dev Soulbound ERC-1155 бейджи достижений пользователей RescueDAO.
 *
 * Достижения:
 * 1. FirstGoodDeed  — первое успешное пожертвование.
 * 2. RegularSupport — пять успешных пожертвований.
 * 3. AnimalFriend   — поддержка трех разных заявок.
 * 4. RescueHero     — пожертвование в заявку со статусом Completed.
 *
 * Каждый тип достижения имеет постоянный ID:
 * 1 — FirstGoodDeed
 * 2 — RegularSupport
 * 3 — AnimalFriend
 * 4 — RescueHero
 *
 * Один тип бейджа может быть выпущен многим пользователям.
 * Один пользователь может получить каждый тип только один раз.
 *
 * Изображения и JSON-метаданные генерируются непосредственно
 * в Solidity. Внешние API и IPFS не используются.
 *
 * Контракт получает информацию о пожертвованиях и завершении
 * заявок от RescueDAO.
 */
contract RescueBadges is ERC1155 {

    using Strings for uint256;

    // =========================================================
    // ПЕРЕЧИСЛЕНИЕ ДОСТИЖЕНИЙ
    // =========================================================

    enum BadgeType {
        FirstGoodDeed,
        RegularSupport,
        AnimalFriend,
        RescueHero
    }

    // =========================================================
    // ОСНОВНЫЕ ПЕРЕМЕННЫЕ
    // =========================================================

    address public immutable daoContract;

    // Количество успешных пожертвований пользователя.
    mapping(address => uint256) public donationCount;

    // Количество уникальных заявок, поддержанных пользователем.
    mapping(address => uint256) public uniqueRequestsSupported;

    // Проверка: поддерживал ли пользователь конкретную заявку.
    mapping(address => mapping(uint256 => bool))
        public donatedToRequest;

    // Суммарный объем пожертвований пользователя на заявку.
    mapping(address => mapping(uint256 => uint256))
        public contributionToRequest;

    // Проверка завершения заявки.
    mapping(uint256 => bool) public completedRequests;

    // Проверка наличия определенного бейджа у пользователя.
    mapping(address => mapping(BadgeType => bool))
        public hasBadge;

    // ID ERC-1155 для каждого пользователя и типа достижения.
    // Значение 0 означает, что бейдж еще не получен.
    // Реальные ID бейджей: от 1 до 4.
    mapping(address => mapping(BadgeType => uint256))
        public badgeTokenId;

    // Тип достижения для каждого ID ERC-1155.
    mapping(uint256 => BadgeType) public tokenBadgeType;

    // Общее количество выпущенных экземпляров бейджей.
    uint256 public totalBadgesIssued;

    // =========================================================
    // СОБЫТИЯ
    // =========================================================

    event DonationRecorded(
        address indexed donor,
        uint256 indexed requestId,
        uint256 amount,
        uint256 donationCount
    );

    event BadgeAwarded(
        address indexed recipient,
        BadgeType indexed badgeType,
        uint256 indexed tokenId
    );

    event RequestMarkedCompleted(
        uint256 indexed requestId
    );

    // =========================================================
    // МОДИФИКАТОРЫ
    // =========================================================

    modifier onlyDAO() {
        require(
            msg.sender == daoContract,
            "Only RescueDAO"
        );
        _;
    }

    // =========================================================
    // КОНСТРУКТОР
    // =========================================================

    constructor(address dao)
        ERC1155("")
    {
        require(
            dao != address(0),
            "Invalid DAO address"
        );

        require(
            dao.code.length > 0,
            "DAO is not a contract"
        );

        daoContract = dao;

        // Закрепляем соответствие между ID и типами бейджей.
        // ID 1 — FirstGoodDeed.
        // ID 2 — RegularSupport.
        // ID 3 — AnimalFriend.
        // ID 4 — RescueHero.

        tokenBadgeType[1] = BadgeType.FirstGoodDeed;
        tokenBadgeType[2] = BadgeType.RegularSupport;
        tokenBadgeType[3] = BadgeType.AnimalFriend;
        tokenBadgeType[4] = BadgeType.RescueHero;
    }

    // =========================================================
    // РЕГИСТРАЦИЯ ПОЖЕРТВОВАНИЙ
    // =========================================================

    /**
     * @dev Вызывается RescueDAO после успешного пожертвования.
     *
     * requestId == 0 означает пожертвование в общий фонд.
     * requestId > 0 означает пожертвование на конкретную заявку.
     *
     * Каждая успешная транзакция пожертвования учитывается
     * отдельно для достижения RegularSupport.
     */
    function recordDonation(
        address donor,
        uint256 requestId,
        uint256 amount
    )
        external
        onlyDAO
    {
        require(
            donor != address(0),
            "Invalid donor"
        );

        require(
            amount > 0,
            "Zero donation"
        );

        // Учитываем успешное пожертвование.
        donationCount[donor]++;

        // Учитываем поддержку конкретной заявки.
        if (requestId > 0) {

            contributionToRequest[donor][requestId] += amount;

            // Учитываем только уникальные заявки.
            if (!donatedToRequest[donor][requestId]) {

                donatedToRequest[donor][requestId] = true;

                uniqueRequestsSupported[donor]++;
            }
        }

        emit DonationRecorded(
            donor,
            requestId,
            amount,
            donationCount[donor]
        );

        // Проверяем первые два достижения.
        _checkDonationAchievements(donor);

        // Проверяем достижение за поддержку разных заявок.
        _checkUniqueRequestsAchievement(donor);
    }

    // =========================================================
    // ПРОВЕРКА ДОСТИЖЕНИЙ ЗА ПОЖЕРТВОВАНИЯ
    // =========================================================

    /**
     * @dev Проверяет условия:
     *
     * FirstGoodDeed:
     * первое успешное пожертвование.
     *
     * RegularSupport:
     * пять или более успешных пожертвований.
     */
    function _checkDonationAchievements(
        address donor
    )
        internal
    {
        uint256 donations = donationCount[donor];

        // Достижение 1.
        if (
            donations >= 1 &&
            !hasBadge[donor][BadgeType.FirstGoodDeed]
        ) {
            _awardBadge(
                donor,
                BadgeType.FirstGoodDeed
            );
        }

        // Достижение 2.
        if (
            donations >= 5 &&
            !hasBadge[donor][BadgeType.RegularSupport]
        ) {
            _awardBadge(
                donor,
                BadgeType.RegularSupport
            );
        }
    }

    // =========================================================
    // ПРОВЕРКА ДОСТИЖЕНИЯ ЗА РАЗНЫЕ ЗАЯВКИ
    // =========================================================

    /**
     * @dev Проверяет, поддержал ли пользователь
     * не менее трех разных заявок.
     */
    function _checkUniqueRequestsAchievement(
        address donor
    )
        internal
    {
        if (
            uniqueRequestsSupported[donor] >= 3 &&
            !hasBadge[donor][BadgeType.AnimalFriend]
        ) {
            _awardBadge(
                donor,
                BadgeType.AnimalFriend
            );
        }
    }

    // =========================================================
    // ОТМЕТКА ЗАВЕРШЕННОЙ ЗАЯВКИ
    // =========================================================

    /**
     * @dev Вызывается RescueDAO, когда заявка переходит
     * в статус Completed.
     *
     * Здесь не выполняется перебор всех доноров.
     * Каждый пользователь сможет самостоятельно получить
     * четвертый бейдж через claimRescueHeroBadge().
     */
    function onRequestCompleted(
        uint256 requestId
    )
        external
        onlyDAO
    {
        require(
            requestId > 0,
            "Invalid request ID"
        );

        completedRequests[requestId] = true;

        emit RequestMarkedCompleted(requestId);
    }

    // =========================================================
    // ПОЛУЧЕНИЕ ЧЕТВЕРТОГО БЕЙДЖА
    // =========================================================

    /**
     * @dev Пользователь самостоятельно получает достижение
     * RescueHero, если ранее пожертвовал на завершенную заявку.
     *
     * Проверка выполняется непосредственно в контракте.
     */
    function claimRescueHeroBadge(
        uint256 requestId
    )
        external
    {
        require(
            completedRequests[requestId],
            "Request is not completed"
        );

        require(
            donatedToRequest[msg.sender][requestId],
            "You did not support this request"
        );

        require(
            !hasBadge[msg.sender][BadgeType.RescueHero],
            "Badge already received"
        );

        _awardBadge(
            msg.sender,
            BadgeType.RescueHero
        );
    }

    // =========================================================
    // ВЫПУСК БЕЙДЖА
    // =========================================================

    /**
     * @dev Выпускает ERC-1155 бейдж пользователю.
     *
     * ID определяется типом достижения:
     * FirstGoodDeed  = 1;
     * RegularSupport = 2;
     * AnimalFriend   = 3;
     * RescueHero     = 4.
     *
     * Каждый пользователь может получить только один
     * экземпляр каждого типа бейджа.
     */
    function _awardBadge(
        address recipient,
        BadgeType badgeType
    )
        internal
    {
        require(
            recipient != address(0),
            "Invalid recipient"
        );

        require(
            !hasBadge[recipient][badgeType],
            "Badge already issued"
        );

        // ID ERC-1155 соответствует типу достижения + 1.
        uint256 tokenId = uint256(badgeType) + 1;

        // Отмечаем получение достижения.
        hasBadge[recipient][badgeType] = true;

        badgeTokenId[recipient][badgeType] = tokenId;

        totalBadgesIssued++;

        // Выпускаем один экземпляр соответствующего бейджа.
        // Используется _mint, а не _safeMint:
        // это исключает вызов onERC1155Received у получателя.
        _mint(
            recipient,
            tokenId,
            1,
            ""
        );

        emit BadgeAwarded(
            recipient,
            badgeType,
            tokenId
        );
    }

    // =========================================================
    // METADATA ERC-1155
    // =========================================================

    /**
     * @dev Формирует JSON-метаданные ERC-1155 непосредственно
     * в контракте.
     *
     * Для каждого ID генерируется соответствующее изображение SVG.
     * Изображение кодируется в Base64.
     *
     * В отличие от ERC-721, в ERC-1155 используется функция uri().
     */
    function uri(
        uint256 tokenId
    )
        public
        view
        override
        returns (string memory)
    {
        require(
            tokenId >= 1 && tokenId <= 4,
            "Invalid badge ID"
        );

        BadgeType badgeType = tokenBadgeType[tokenId];

        string memory name = _badgeName(badgeType);

        string memory description = _badgeDescription(badgeType);

        string memory image = _badgeImage(badgeType);

        string memory attributes = string(
            abi.encodePacked(
                '[{"trait_type":"Achievement","value":"',
                name,
                '"},{"trait_type":"Badge Type","value":"',
                uint256(badgeType).toString(),
                '"},{"trait_type":"Soulbound","value":"Yes"}]'
            )
        );

        string memory json = string(
            abi.encodePacked(
                '{"name":"',
                name,
                '","description":"',
                description,
                '","image":"data:image/svg+xml;base64,',
                Base64.encode(bytes(image)),
                '","attributes":',
                attributes,
                '}'
            )
        );

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(bytes(json))
            )
        );
    }

    // =========================================================
    // НАЗВАНИЯ ДОСТИЖЕНИЙ
    // =========================================================

    function _badgeName(
        BadgeType badgeType
    )
        internal
        pure
        returns (string memory)
    {
        if (badgeType == BadgeType.FirstGoodDeed) {
            return "First Good Deed";
        }

        if (badgeType == BadgeType.RegularSupport) {
            return "Regular Support";
        }

        if (badgeType == BadgeType.AnimalFriend) {
            return "Friend of Animals";
        }

        return "Rescue Hero";
    }

    // =========================================================
    // ОПИСАНИЯ ДОСТИЖЕНИЙ
    // =========================================================

    function _badgeDescription(
        BadgeType badgeType
    )
        internal
        pure
        returns (string memory)
    {
        if (badgeType == BadgeType.FirstGoodDeed) {
            return "Awarded for making the first successful donation to RescueDAO.";
        }

        if (badgeType == BadgeType.RegularSupport) {
            return "Awarded for making at least five successful donations.";
        }

        if (badgeType == BadgeType.AnimalFriend) {
            return "Awarded for supporting at least three different animal rescue requests.";
        }

        return "Awarded for supporting an animal rescue request that has been completed.";
    }

    // =========================================================
    // SVG ИЗОБРАЖЕНИЯ
    // =========================================================

    /**
     * @dev Создает SVG-изображение соответствующего достижения.
     *
     * Все изображения хранятся в коде контракта.
     * Внешние изображения и IPFS не требуются.
     */
    function _badgeImage(
        BadgeType badgeType
    )
        internal
        pure
        returns (string memory)
    {
        string memory title = _badgeName(badgeType);

        string memory symbol;
        string memory color;
        string memory subtitle;

        if (badgeType == BadgeType.FirstGoodDeed) {

            symbol = "P";
            color = "#E7A83E";
            subtitle = "FIRST DONATION";

        } else if (badgeType == BadgeType.RegularSupport) {

            symbol = "H";
            color = "#D96B75";
            subtitle = "REGULAR SUPPORT";

        } else if (badgeType == BadgeType.AnimalFriend) {

            symbol = "A";
            color = "#58A78A";
            subtitle = "THREE RESCUE REQUESTS";

        } else {

            symbol = "R";
            color = "#8171C7";
            subtitle = "RESCUE COMPLETED";
        }

        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" ',
                'width="500" height="500" viewBox="0 0 500 500">',

                '<defs>',
                '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
                '<stop offset="0%" stop-color="#FFFDF8"/>',
                '<stop offset="100%" stop-color="#F1EBDD"/>',
                '</linearGradient>',
                '</defs>',

                '<rect width="500" height="500" rx="48" fill="url(#bg)"/>',

                '<circle cx="250" cy="220" r="145" fill="',
                color,
                '" opacity="0.13"/>',

                '<circle cx="250" cy="220" r="112" fill="',
                color,
                '"/>',

                '<circle cx="250" cy="220" r="98" fill="none" stroke="#FFFFFF" stroke-width="5"/>',

                '<text x="250" y="258" text-anchor="middle" ',
                'font-family="Arial, sans-serif" font-size="112" ',
                'font-weight="bold" fill="#FFFFFF">',
                symbol,
                '</text>',

                '<text x="250" y="405" text-anchor="middle" ',
                'font-family="Arial, sans-serif" font-size="26" ',
                'font-weight="bold" fill="#403B35">',
                title,
                '</text>',

                '<text x="250" y="445" text-anchor="middle" ',
                'font-family="Arial, sans-serif" font-size="15" ',
                'letter-spacing="2" fill="#81796D">',
                subtitle,
                '</text>',

                '</svg>'
            )
        );
    }

    // =========================================================
    // ИНФОРМАЦИЯ О ДОСТИЖЕНИЯХ
    // =========================================================

    /**
     * @dev Возвращает статистику пользователя.
     */
    function getDonorStats(
        address donor
    )
        external
        view
        returns (
            uint256 donations,
            uint256 uniqueRequests,
            uint256 badgesReceived
        )
    {
        donations = donationCount[donor];

        uniqueRequests = uniqueRequestsSupported[donor];

        uint256 count;

        if (hasBadge[donor][BadgeType.FirstGoodDeed]) {
            count++;
        }

        if (hasBadge[donor][BadgeType.RegularSupport]) {
            count++;
        }

        if (hasBadge[donor][BadgeType.AnimalFriend]) {
            count++;
        }

        if (hasBadge[donor][BadgeType.RescueHero]) {
            count++;
        }

        badgesReceived = count;
    }

    /**
     * @dev Проверяет наличие конкретного достижения.
     */
    function checkBadge(
        address donor,
        BadgeType badgeType
    )
        external
        view
        returns (bool)
    {
        return hasBadge[donor][badgeType];
    }

    /**
     * @dev Возвращает ID ERC-1155 конкретного достижения.
     * Если бейдж еще не получен, возвращает 0.
     */
    function getBadgeTokenId(
        address donor,
        BadgeType badgeType
    )
        external
        view
        returns (uint256)
    {
        return badgeTokenId[donor][badgeType];
    }

    /**
     * @dev Возвращает количество экземпляров конкретного
     * бейджа у пользователя.
     *
     * Для данной системы значение может быть только 0 или 1.
     */
    function getBadgeBalance(
        address donor,
        BadgeType badgeType
    )
        external
        view
        returns (uint256)
    {
        uint256 tokenId = uint256(badgeType) + 1;

        return balanceOf(donor, tokenId);
    }

    // =========================================================
    // ЗАПРЕТ ПЕРЕДАЧИ БЕЙДЖЕЙ (SOULBOUND)
    // =========================================================

    /**
     * @dev Разрешаем только выпуск и сжигание токенов.
     *
     * Любая передача между адресами запрещена.
     *
     * Переопределение соответствует OpenZeppelin 4.9.6 ERC-1155.
     */
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    )
        internal
        override
    {
        require(
            from == address(0) || to == address(0),
            "Soulbound: transfer disabled"
        );

        super._beforeTokenTransfer(
            operator,
            from,
            to,
            ids,
            amounts,
            data
        );
    }

    /**
     * @dev Запрещаем выдачу разрешений на массовую передачу.
     *
     * Это дополнительная мера для soulbound-модели.
     */
    function setApprovalForAll(
        address,
        bool
    )
        public
        pure
        override
    {
        revert("Soulbound: approval disabled");
    }
}
