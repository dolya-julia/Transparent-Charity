// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@4.9.6/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts@4.9.6/access/Ownable.sol";
import "@openzeppelin/contracts@4.9.6/utils/Strings.sol";
import "@openzeppelin/contracts@4.9.6/utils/Base64.sol";

interface IHeroCardsDAO {
    function getRequestTextAndMeta(uint256 requestId)
        external view
        returns (
            string memory animalName,
            string memory description,
            string memory evidenceURI,
            bytes32 evidenceHash,
            address requester,
            bool exists
        );
}

interface IHeroCardsPassport {
    function requestToToken(uint256 requestId)
        external view returns (uint256);
}

contract RescueHeroCards is ERC721Enumerable, Ownable {
    using Strings for uint256;

    struct Participation {
        uint256 timestamp;
        uint256 amount;
        uint256 totalAfter;
    }

    struct HeroCard {
        uint256 serialNumber;
        uint256 requestId;
        uint256 passportTokenId;
        uint256 totalContribution;
        uint256 issuedAt;
    }

    address public immutable daoContract;
    address public immutable passportContract;

    uint256 private _nextTokenId = 1;
    uint256 public totalCardsIssued;

    mapping(uint256 => HeroCard) private _cards;
    mapping(uint256 => Participation[]) private _history;

    mapping(address => mapping(uint256 => uint256))
        public donorRequestCard;

    // Защита от повторного восстановления одной транзакции.
    mapping(bytes32 => bool)
        public processedRecoveryTransactions;

    event HeroCardIssued(
        address indexed donor,
        uint256 indexed tokenId,
        uint256 indexed requestId,
        uint256 passportTokenId,
        uint256 serialNumber
    );

    event ParticipationRecorded(
        uint256 indexed tokenId,
        address indexed donor,
        uint256 indexed requestId,
        uint256 amount,
        uint256 totalContribution,
        uint256 timestamp
    );

    event HistoricalDonationRecovered(
        bytes32 indexed sourceTxHash,
        address indexed donor,
        uint256 indexed requestId,
        uint256 tokenId,
        uint256 amount
    );

    modifier onlyDAO() {
        require(msg.sender == daoContract, "Only RescueDAO");
        _;
    }

    constructor(address dao, address passport)
        ERC721("RescueDAO Hero Cards", "HERO")
        Ownable()
    {
        require(
            dao != address(0) && dao.code.length > 0,
            "Invalid DAO"
        );

        require(
            passport != address(0) && passport.code.length > 0,
            "Invalid passport"
        );

        daoContract = dao;
        passportContract = passport;
    }

    /**
     * Обычная регистрация пожертвования через RescueDAO.
     */
    function recordDonation(
        address donor,
        uint256 requestId,
        uint256 amount
    ) external onlyDAO {
        _recordDonation(donor, requestId, amount);
    }

    /**
     * Восстановление исторического пожертвования.
     *
     * Доступно только владельцу контракта.
     * sourceTxHash — хеш исходной транзакции пожертвования.
     *
     * ВАЖНО: контракт не проверяет историю транзакции
     * автоматически. Перед вызовом необходимо проверить
     * её в истории DAO.
     */
    function recoverHistoricalDonation(
        address donor,
        uint256 requestId,
        uint256 amount,
        bytes32 sourceTxHash
    ) external onlyOwner {
        require(
            sourceTxHash != bytes32(0),
            "Invalid transaction hash"
        );

        require(
            !processedRecoveryTransactions[sourceTxHash],
            "Transaction already recovered"
        );

        processedRecoveryTransactions[sourceTxHash] = true;

        uint256 tokenId = _recordDonation(
            donor,
            requestId,
            amount
        );

        emit HistoricalDonationRecovered(
            sourceTxHash,
            donor,
            requestId,
            tokenId,
            amount
        );
    }

    /**
     * Общая внутренняя логика выпуска карточки
     * и добавления участия.
     */
    function _recordDonation(
        address donor,
        uint256 requestId,
        uint256 amount
    ) internal returns (uint256 tokenId) {
        require(donor != address(0), "Invalid donor");
        require(requestId > 0, "Invalid request");
        require(amount > 0, "Zero donation");

        uint256 passportId =
            IHeroCardsPassport(passportContract)
                .requestToToken(requestId);

        require(
            passportId > 0,
            "Animal passport does not exist"
        );

        tokenId = donorRequestCard[donor][requestId];

        if (tokenId == 0) {
            tokenId = _nextTokenId++;

            uint256 serial = totalCardsIssued + 1;
            totalCardsIssued = serial;

            donorRequestCard[donor][requestId] = tokenId;

            _cards[tokenId] = HeroCard({
                serialNumber: serial,
                requestId: requestId,
                passportTokenId: passportId,
                totalContribution: 0,
                issuedAt: block.timestamp
            });

            _safeMint(donor, tokenId);

            emit HeroCardIssued(
                donor,
                tokenId,
                requestId,
                passportId,
                serial
            );
        } else {
            require(
                _cards[tokenId].passportTokenId == passportId,
                "Passport link changed"
            );
        }

        HeroCard storage card = _cards[tokenId];

        card.totalContribution += amount;

        _history[tokenId].push(
            Participation({
                timestamp: block.timestamp,
                amount: amount,
                totalAfter: card.totalContribution
            })
        );

        emit ParticipationRecorded(
            tokenId,
            donor,
            requestId,
            amount,
            card.totalContribution,
            block.timestamp
        );
    }

    function getCard(uint256 tokenId)
        external view returns (HeroCard memory)
    {
        ownerOf(tokenId);
        return _cards[tokenId];
    }

    function getParticipationCount(uint256 tokenId)
        external view returns (uint256)
    {
        ownerOf(tokenId);
        return _history[tokenId].length;
    }

    function getParticipation(
        uint256 tokenId,
        uint256 index
    )
        external view
        returns (
            uint256 timestamp,
            uint256 amount,
            uint256 totalAfter
        )
    {
        ownerOf(tokenId);

        require(
            index < _history[tokenId].length,
            "History index out of bounds"
        );

        Participation storage item = _history[tokenId][index];

        return (
            item.timestamp,
            item.amount,
            item.totalAfter
        );
    }

    function getHistory(uint256 tokenId)
        external view returns (Participation[] memory)
    {
        ownerOf(tokenId);
        return _history[tokenId];
    }

    function tokenURI(uint256 tokenId)
        public view override returns (string memory)
    {
        ownerOf(tokenId);

        HeroCard storage card = _cards[tokenId];

        (
            string memory animalName,
            ,
            ,
            ,
            ,
            bool exists
        ) = IHeroCardsDAO(daoContract)
            .getRequestTextAndMeta(card.requestId);

        require(exists, "Request does not exist");

        string memory image = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" ',
            'width="600" height="800" viewBox="0 0 600 800">',
            '<defs><linearGradient id="g" x2="1" y2="1">',
            '<stop stop-color="#142d3b"/>',
            '<stop offset="1" stop-color="#386b68"/>',
            '</linearGradient></defs>',
            '<rect width="600" height="800" rx="36" fill="url(#g)"/>',
            '<rect x="24" y="24" width="552" height="752" ',
            'rx="28" fill="none" stroke="#e8c77b" stroke-width="5"/>',
            '<text x="300" y="105" text-anchor="middle" ',
            'fill="#e8c77b" font-size="28" ',
            'font-family="sans-serif">RESCUEDAO · HERO CARD</text>',
            '<text x="300" y="300" text-anchor="middle" ',
            'fill="white" font-size="58">RESCUE</text>',
            '<text x="300" y="390" text-anchor="middle" ',
            'fill="white" font-size="42" font-family="sans-serif">',
            animalName,
            '</text>',
            '<text x="300" y="490" text-anchor="middle" ',
            'fill="#e8c77b" font-size="26" font-family="sans-serif">',
            'CARD № ', card.serialNumber.toString(),
            '</text>',
            '<text x="300" y="550" text-anchor="middle" ',
            'fill="white" font-size="22" font-family="sans-serif">',
            'ANIMAL PASSPORT #', card.passportTokenId.toString(),
            '</text>',
            '<text x="300" y="620" text-anchor="middle" ',
            'fill="white" font-size="22" font-family="sans-serif">',
            'REQUEST #', card.requestId.toString(),
            '</text>',
            '<text x="300" y="700" text-anchor="middle" ',
            'fill="#e8c77b" font-size="20" font-family="sans-serif">',
            'THANK YOU FOR RESCUING</text></svg>'
        ));

        string memory attributes = string(abi.encodePacked(
            '[{"trait_type":"Serial number","value":',
            card.serialNumber.toString(),
            '},{"trait_type":"Animal","value":"',
            animalName,
            '"},{"trait_type":"Request ID","value":',
            card.requestId.toString(),
            '},{"trait_type":"Passport token ID","value":',
            card.passportTokenId.toString(),
            '},{"trait_type":"Total contribution (wei)","value":',
            card.totalContribution.toString(),
            '}]'
        ));

        string memory json = string(abi.encodePacked(
            '{"name":"Hero Card #',
            card.serialNumber.toString(),
            ' — ',
            animalName,
            '","description":"RescueDAO donor participation collectible ',
            'linked to the animal passport.",',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(image)),
            '","attributes":',
            attributes,
            '}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }
}