
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@4.9.6/utils/Strings.sol";
import "@openzeppelin/contracts@4.9.6/utils/Base64.sol";

// =========================================================
// ИНТЕРФЕЙС ГЕНЕРАТОРА ПОРТРЕТА
// =========================================================

interface IRescuePortraitRenderer {
    function renderPortrait(
        uint256 seed
    ) external pure returns (string memory);
}

// =========================================================
// ИНТЕРФЕЙС МАКЕТА NFT-ПАСПОРТА
// =========================================================

interface IRescuePassportLayout {

    function renderHeader(
        uint256 seed
    ) external pure returns (string memory);

    function renderFooter(
        uint256 tokenId,
        string calldata animalName,
        uint8 status,
        uint256 progress,
        uint256 seed
    ) external pure returns (string memory);
}

/**
 * @title RescuePassportRenderer
 * @dev Генерирует SVG-изображение и JSON metadata NFT-паспорта.
 *
 * Статусы заявки:
 * 0 — UnderReview
 * 1 — ChangesRequested
 * 2 — Approved
 * 3 — Rejected
 * 4 — Completed
 * 5 — Cancelled
 */
contract RescuePassportRenderer {

    using Strings for uint256;

    // =========================================================
    // ПАРАМЕТРЫ РЕНДЕРИНГА
    // =========================================================

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

    // =========================================================
    // ВНЕШНИЕ RENDERER-КОНТРАКТЫ
    // =========================================================

    IRescuePortraitRenderer public portraitRenderer;
    IRescuePassportLayout public passportLayout;

    // =========================================================
    // КОНСТРУКТОР
    // =========================================================

    constructor(
        address portraitAddress,
        address layoutAddress
    ) {
        require(
            portraitAddress != address(0),
            "Invalid portrait address"
        );

        require(
            layoutAddress != address(0),
            "Invalid layout address"
        );

        require(
            portraitAddress.code.length > 0,
            "Portrait renderer does not exist"
        );

        require(
            layoutAddress.code.length > 0,
            "Layout contract does not exist"
        );

        portraitRenderer = IRescuePortraitRenderer(
            portraitAddress
        );

        passportLayout = IRescuePassportLayout(
            layoutAddress
        );
    }

    // =========================================================
    // НАЗВАНИЯ ВИЗУАЛЬНЫХ ХАРАКТЕРИСТИК
    // =========================================================

    function _archetypeName(
        uint8 v
    )
        internal
        pure
        returns (string memory)
    {
        if (v == 0) return "Cat";
        if (v == 1) return "Dog";
        if (v == 2) return "Rabbit";
        if (v == 3) return "Fox";
        if (v == 4) return "Bear";

        return "Fantasy Creature";
    }

    function _coatName(
        uint8 v
    )
        internal
        pure
        returns (string memory)
    {
        if (v == 0) return "Solid";
        if (v == 1) return "Spotted";
        if (v == 2) return "Striped";
        if (v == 3) return "Freckled";
        if (v == 4) return "Two-tone";

        return "Decorative";
    }

    function _eyesName(
        uint8 v
    )
        internal
        pure
        returns (string memory)
    {
        if (v == 0) return "Round";
        if (v == 1) return "Sleepy";
        if (v == 2) return "Curious";

        return "Bright";
    }

    function _accessoryName(
        uint8 v
    )
        internal
        pure
        returns (string memory)
    {
        if (v == 0) return "Ribbon";
        if (v == 1) return "Crown";
        if (v == 2) return "Scarf";
        if (v == 3) return "Glasses";
        if (v == 4) return "Flower";
        if (v == 5) return "Medallion";
        if (v == 6) return "None";

        return "Golden Star";
    }

    function _backgroundName(
        uint8 v
    )
        internal
        pure
        returns (string memory)
    {
        if (v == 0) return "Midnight Blue";
        if (v == 1) return "Dream Violet";
        if (v == 2) return "Forest Green";
        if (v == 3) return "Rose Garden";
        if (v == 4) return "Golden Sunset";
        if (v == 5) return "Ocean Mist";

        return "Silver Sky";
    }

    function _frameName(
        uint8 v
    )
        internal
        pure
        returns (string memory)
    {
        if (v == 0) return "Classic";
        if (v == 1) return "Royal";
        if (v == 2) return "Botanical";

        return "Celestial";
    }

    // =========================================================
    // СТАТУС ЗАЯВКИ
    // =========================================================

    /**
     * @dev Преобразует числовой статус DAO в текст.
     *
     * Важно: значения соответствуют новой схеме без Voting.
     */
    function _statusText(
        uint8 s
    )
        internal
        pure
        returns (string memory)
    {
        if (s == 0) return "Waiting for Review";
        if (s == 1) return "Changes Requested";
        if (s == 2) return "Approved - Help in Progress";
        if (s == 3) return "Rejected";
        if (s == 4) return "Program Completed";
        if (s == 5) return "Cancelled";

        return "Unknown";
    }

    // =========================================================
    // СТАДИЯ ВОССТАНОВЛЕНИЯ
    // =========================================================

    function _progressStageName(
        uint256 progress
    )
        internal
        pure
        returns (string memory)
    {
        if (progress == 0) return "Not Started";
        if (progress < 50) return "Early Progress";
        if (progress < 100) return "Advanced Progress";

        return "Completed";
    }

    // =========================================================
    // ЭКРАНИРОВАНИЕ JSON
    // =========================================================

    function _escapeJSON(
        string memory input
    )
        internal
        pure
        returns (string memory)
    {
        bytes memory source = bytes(input);

        bytes memory result = new bytes(
            source.length * 2
        );

        uint256 length;

        for (uint256 i; i < source.length; i++) {
            bytes1 c = source[i];

            if (c == 0x22 || c == 0x5C) {
                result[length] = 0x5C;
                length++;
            }

            if (uint8(c) < 0x20) {
                result[length] = 0x20;
            } else {
                result[length] = c;
            }

            length++;
        }

        bytes memory trimmed = new bytes(length);

        for (uint256 j; j < length; j++) {
            trimmed[j] = result[j];
        }

        return string(trimmed);
    }

    // =========================================================
    // ПРЕОБРАЗОВАНИЕ WEI В ETH
    // =========================================================

    function _formatEther(
        uint256 weiAmount
    )
        internal
        pure
        returns (string memory)
    {
        uint256 whole = weiAmount / 1 ether;
        uint256 remainder = weiAmount % 1 ether;

        string memory wholePart = whole.toString();

        if (remainder == 0) {
            return wholePart;
        }

        bytes memory fraction = new bytes(18);

        for (uint256 i = 18; i > 0; i--) {
            fraction[i - 1] = bytes1(
                uint8(48 + (remainder % 10))
            );

            remainder /= 10;
        }

        uint256 fractionLength = 18;

        while (
            fractionLength > 0 &&
            fraction[fractionLength - 1] == bytes1("0")
        ) {
            fractionLength--;
        }

        bytes memory trimmedFraction = new bytes(
            fractionLength
        );

        for (uint256 j = 0; j < fractionLength; j++) {
            trimmedFraction[j] = fraction[j];
        }

        return string(
            abi.encodePacked(
                wholePart,
                ".",
                string(trimmedFraction)
            )
        );
    }

    // =========================================================
    // РАСЧЁТ SEED
    // =========================================================

    function _seed(
        RenderParams memory p
    )
        internal
        pure
        returns (uint256)
    {
        return uint256(
            keccak256(
                abi.encodePacked(
                    p.requestId,
                    p.animalName
                )
            )
        );
    }

    // =========================================================
    // ПРОГРЕСС ЛЕЧЕНИЯ
    // =========================================================

    function _progress(
        RenderParams memory p
    )
        internal
        pure
        returns (uint256)
    {
        if (p.milestoneCount == 0) {
            return 0;
        }

        if (p.completedMilestones >= p.milestoneCount) {
            return 100;
        }

        return (
            p.completedMilestones * 100 /
            p.milestoneCount
        );
    }

    // =========================================================
    // ПРОГРЕСС ФИНАНСИРОВАНИЯ
    // =========================================================

    function _fundingProgress(
        RenderParams memory p
    )
        internal
        pure
        returns (uint256)
    {
        if (p.requestedAmount == 0) {
            return 0;
        }

        if (p.targetDonations >= p.requestedAmount) {
            return 100;
        }

        return (
            p.targetDonations * 100 /
            p.requestedAmount
        );
    }

    // =========================================================
    // ФОРМИРОВАНИЕ SVG
    // =========================================================

    function _generateSVG(
        RenderParams memory p,
        uint256 seed,
        uint256 progress
    )
        internal
        view
        returns (string memory)
    {
        string memory header =
            passportLayout.renderHeader(seed);

        string memory portrait =
            portraitRenderer.renderPortrait(seed);

        string memory footer =
            passportLayout.renderFooter(
                p.tokenId,
                p.animalName,
                p.status,
                progress,
                seed
            );

        return string(
            abi.encodePacked(
                header,
                portrait,
                footer
            )
        );
    }

    // =========================================================
    // ВИЗУАЛЬНЫЕ АТРИБУТЫ NFT
    // =========================================================

    function _generateVisualAttributes(
        string memory animalName,
        uint256 seed
    )
        internal
        pure
        returns (string memory)
    {
        string memory part1 = string(
            abi.encodePacked(
                '{"trait_type":"Animal Name","value":"',
                _escapeJSON(animalName),
                '"},',

                '{"trait_type":"Portrait Style","value":"',
                _archetypeName(uint8(seed % 6)),
                '"},',

                '{"trait_type":"Coat Pattern","value":"',
                _coatName(uint8((seed >> 8) % 6)),
                '"},',

                '{"trait_type":"Eyes","value":"',
                _eyesName(uint8((seed >> 16) % 4)),
                '"},'
            )
        );

        string memory part2 = string(
            abi.encodePacked(
                '{"trait_type":"Accessory","value":"',
                _accessoryName(uint8((seed >> 24) % 8)),
                '"},',

                '{"trait_type":"Background","value":"',
                _backgroundName(uint8((seed >> 32) % 7)),
                '"},',

                '{"trait_type":"Frame","value":"',
                _frameName(uint8((seed >> 40) % 4)),
                '"},'
            )
        );

        return string(
            abi.encodePacked(
                part1,
                part2
            )
        );
    }

    // =========================================================
    // АТРИБУТЫ ЛЕЧЕНИЯ И ФИНАНСИРОВАНИЯ
    // =========================================================

    function _generateProgressAttributes(
        RenderParams memory p,
        uint256 treatmentProgress,
        uint256 fundingProgress
    )
        internal
        pure
        returns (string memory)
    {
        string memory treatmentAttributes = string(
            abi.encodePacked(
                '{"trait_type":"Status","value":"',
                _statusText(p.status),
                '"},',

                '{"trait_type":"Completed Milestones","value":',
                p.completedMilestones.toString(),
                '},',

                '{"trait_type":"Total Milestones","value":',
                p.milestoneCount.toString(),
                '},',

                '{"trait_type":"Treatment Progress","value":',
                treatmentProgress.toString(),
                '},',

                '{"trait_type":"Recovery Stage","value":"',
                _progressStageName(treatmentProgress),
                '"},'
            )
        );

        string memory fundingAttributes = string(
            abi.encodePacked(
                '{"trait_type":"Funding Progress","value":',
                fundingProgress.toString(),
                '},',

                '{"trait_type":"Requested Amount (ETH)","value":"',
                _formatEther(p.requestedAmount),
                '"},',

                '{"trait_type":"Target Donations (ETH)","value":"',
                _formatEther(p.targetDonations),
                '"},',

                '{"trait_type":"Request ID","value":',
                p.requestId.toString(),
                '}'
            )
        );

        return string(
            abi.encodePacked(
                treatmentAttributes,
                fundingAttributes
            )
        );
    }

    // =========================================================
    // ОБЪЕДИНЕНИЕ АТРИБУТОВ
    // =========================================================

    function _generateAttributes(
        RenderParams memory p,
        uint256 seed,
        uint256 treatmentProgress,
        uint256 fundingProgress
    )
        internal
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                _generateVisualAttributes(
                    p.animalName,
                    seed
                ),

                _generateProgressAttributes(
                    p,
                    treatmentProgress,
                    fundingProgress
                )
            )
        );
    }

    // =========================================================
    // ГЕНЕРАЦИЯ JSON METADATA
    // =========================================================

    function _generateJSON(
        RenderParams memory p,
        uint256 seed,
        uint256 treatmentProgress,
        uint256 fundingProgress,
        string memory imageBase64
    )
        internal
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                '{"name":"RescueDAO Animal Passport #',
                p.tokenId.toString(),
                '",',

                '"description":"A unique procedurally generated on-chain animal passport. Its portrait, visual traits, treatment progress and funding information are generated from RescueDAO data.",',

                '"image":"data:image/svg+xml;base64,',
                imageBase64,
                '",',

                '"attributes":[',

                _generateAttributes(
                    p,
                    seed,
                    treatmentProgress,
                    fundingProgress
                ),

                ']}'
            )
        );
    }

    // =========================================================
    // ОСНОВНАЯ ФУНКЦИЯ RENDER
    // =========================================================

    function render(
        RenderParams memory params
    )
        external
        view
        returns (string memory)
    {
        uint256 seed = _seed(params);

        uint256 treatmentProgress =
            _progress(params);

        uint256 fundingProgress =
            _fundingProgress(params);

        string memory svg = _generateSVG(
            params,
            seed,
            treatmentProgress
        );

        string memory imageBase64 = Base64.encode(
            bytes(svg)
        );

        string memory json = _generateJSON(
            params,
            seed,
            treatmentProgress,
            fundingProgress,
            imageBase64
        );

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(bytes(json))
            )
        );
    }
}
