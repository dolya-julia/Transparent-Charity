// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@4.9.6/utils/Strings.sol";
import "@openzeppelin/contracts@4.9.6/utils/Base64.sol";

/**
 * @title RescuePassportRenderer
 * @dev Генератор SVG-изображений и JSON-метаданных NFT-паспортов.
 * Вынесен в отдельный контракт для обхода ограничения размера байткода.
 */
contract RescuePassportRenderer {
    using Strings for uint256;

    struct RenderParams {
        uint256 tokenId;
        uint256 requestId;
        string animalName;
        uint8 status;
        uint256 milestoneCount;
        uint256 completedMilestones;
    }

    function _primaryColor(uint256 seed) internal pure returns (string memory) {
        uint256 index = seed % 8;
        if (index == 0) return "#7c3aed";
        if (index == 1) return "#0891b2";
        if (index == 2) return "#db2777";
        if (index == 3) return "#059669";
        if (index == 4) return "#ea580c";
        if (index == 5) return "#4f46e5";
        if (index == 6) return "#ca8a04";
        return "#0f766e";
    }

    function _accentColor(uint256 seed) internal pure returns (string memory) {
        uint256 index = (seed >> 8) % 8;
        if (index == 0) return "#c4b5fd";
        if (index == 1) return "#67e8f9";
        if (index == 2) return "#f9a8d4";
        if (index == 3) return "#6ee7b7";
        if (index == 4) return "#fdba74";
        if (index == 5) return "#a5b4fc";
        if (index == 6) return "#fde68a";
        return "#99f6e4";
    }

    function _statusText(uint8 status) internal pure returns (string memory) {
        if (status == 0) return "Waiting for Help";
        if (status == 1) return "In Rehabilitation";
        if (status == 2) return "Rejected";
        if (status == 3) return "Program Completed";
        if (status == 4) return "Cancelled";
        return "Unknown";
    }

    function _escapeXML(string memory input) internal pure returns (string memory) {
        bytes memory source = bytes(input);
        bytes memory result = new bytes(source.length * 6);
        uint256 outputLength = 0;

        for (uint256 i = 0; i < source.length; i++) {
            bytes1 c = source[i];
            if (c == 0x26) {
                _write(result, outputLength, bytes("&amp;"));
                outputLength += 5;
            } else if (c == 0x3C) {
                _write(result, outputLength, bytes("&lt;"));
                outputLength += 4;
            } else if (c == 0x3E) {
                _write(result, outputLength, bytes("&gt;"));
                outputLength += 4;
            } else if (c == 0x22) {
                _write(result, outputLength, bytes("&quot;"));
                outputLength += 6;
            } else if (c == 0x27) {
                _write(result, outputLength, bytes("&apos;"));
                outputLength += 6;
            } else {
                result[outputLength] = c;
                outputLength++;
            }
        }
        return _trimBytes(result, outputLength);
    }

    function _write(bytes memory destination, uint256 offset, bytes memory value) internal pure {
        for (uint256 i = 0; i < value.length; i++) {
            destination[offset + i] = value[i];
        }
    }

    function _trimBytes(bytes memory source, uint256 length) internal pure returns (string memory) {
        bytes memory result = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = source[i];
        }
        return string(result);
    }

    function _escapeJSON(string memory input) internal pure returns (string memory) {
        bytes memory source = bytes(input);
        bytes memory result = new bytes(source.length * 2);
        uint256 length = 0;

        for (uint256 i = 0; i < source.length; i++) {
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
        return _trimBytes(result, length);
    }

    function _pattern(uint256 seed, string memory color) internal pure returns (string memory) {
        string memory result = "";
        for (uint256 i = 0; i < 5; i++) {
            uint256 value = uint256(keccak256(abi.encodePacked(seed, i)));
            uint256 x = 30 + value % 340;
            uint256 y = 35 + (value >> 16) % 420;
            uint256 r = 4 + (value >> 32) % 8;

            result = string(
                abi.encodePacked(
                    result, '<circle cx="', x.toString(), '" cy="', y.toString(), '" r="', r.toString(), '" fill="', color, '" opacity="0.17"/>'
                )
            );
        }
        return result;
    }

    function _mascot(string memory primary, string memory accent, uint256 seed) internal pure returns (string memory) {
        string memory ears;
        uint256 variation = seed % 3;

        if (variation == 0) {
            ears = string(
                abi.encodePacked(
                    '<path d="M135 180 L125 95 L190 145 Z" fill="', primary, '" stroke="', accent, '" stroke-width="5"/>',
                    '<path d="M265 180 L275 95 L210 145 Z" fill="', primary, '" stroke="', accent, '" stroke-width="5"/>'
                )
            );
        } else if (variation == 1) {
            ears = string(
                abi.encodePacked(
                    '<ellipse cx="145" cy="145" rx="32" ry="60" fill="', primary, '" stroke="', accent, '" stroke-width="5"/>',
                    '<ellipse cx="255" cy="145" rx="32" ry="60" fill="', primary, '" stroke="', accent, '" stroke-width="5"/>'
                )
            );
        } else {
            ears = string(
                abi.encodePacked(
                    '<path d="M145 175 Q95 100 145 70 Q175 110 180 160 Z" fill="', primary, '" stroke="', accent, '" stroke-width="5"/>',
                    '<path d="M255 175 Q305 100 255 70 Q225 110 220 160 Z" fill="', primary, '" stroke="', accent, '" stroke-width="5"/>'
                )
            );
        }

        return string(
            abi.encodePacked(
                ears,
                '<circle cx="200" cy="205" r="91" fill="', primary, '" stroke="', accent, '" stroke-width="6"/>',
                '<ellipse cx="200" cy="230" rx="57" ry="43" fill="#ffffff" opacity="0.9"/>',
                '<circle cx="168" cy="196" r="8" fill="#172033"/>',
                '<circle cx="232" cy="196" r="8" fill="#172033"/>',
                '<path d="M190 220 Q200 210 210 220 Q200 235 190 220 Z" fill="#172033"/>',
                '<path d="M184 239 Q200 254 216 239" fill="none" stroke="#172033" stroke-width="4" stroke-linecap="round"/>',
                '<circle cx="145" cy="225" r="10" fill="', accent, '" opacity="0.8"/>',
                '<circle cx="255" cy="225" r="10" fill="', accent, '" opacity="0.8"/>'
            )
        );
    }

    function _generateSVG(
        uint256 tokenId,
        string memory animalName,
        string memory state,
        uint256 seed,
        uint256 progress
    ) internal pure returns (string memory) {
        string memory primary = _primaryColor(seed);
        string memory accent = _accentColor(seed);
        uint256 progressWidth = 280 * progress / 100;

        string memory header = string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">',
                '<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
                '<stop offset="0%" stop-color="#0f172a"/>',
                '<stop offset="100%" stop-color="#312e81"/>',
                '</linearGradient></defs>',
                '<rect width="400" height="500" rx="28" fill="url(#bg)"/>',
                _pattern(seed, accent),
                '<rect x="14" y="14" width="372" height="472" rx="22" fill="none" stroke="', accent, '" stroke-width="3"/>',
                '<text x="200" y="48" text-anchor="middle" fill="#ffffff" font-size="17" font-weight="bold" font-family="sans-serif">RESCUED BY COMMUNITY</text>',
                '<circle cx="200" cy="205" r="125" fill="#ffffff" opacity="0.06"/>'
            )
        );

        string memory mascot = _mascot(primary, accent, seed);

        string memory footer = string(
            abi.encodePacked(
                '<text x="200" y="345" text-anchor="middle" fill="#ffffff" font-size="24" font-weight="bold" font-family="sans-serif">', _escapeXML(animalName), '</text>',
                '<text x="200" y="370" text-anchor="middle" fill="#94a3b8" font-size="13" font-family="sans-serif">Rescue Passport #', tokenId.toString(), '</text>',
                '<rect x="55" y="389" width="290" height="34" rx="17" fill="', accent, '" opacity="0.20"/>',
                '<text x="200" y="411" text-anchor="middle" fill="', accent, '" font-size="14" font-weight="bold" font-family="sans-serif">', state, '</text>',
                '<text x="60" y="447" fill="#cbd5e1" font-size="12" font-family="sans-serif">Treatment progress</text>',
                '<text x="340" y="447" text-anchor="end" fill="#ffffff" font-size="13" font-weight="bold" font-family="sans-serif">', progress.toString(), '%</text>',
                '<rect x="60" y="458" width="280" height="9" rx="4.5" fill="#334155"/>',
                '<rect x="60" y="458" width="', progressWidth.toString(), '" height="9" rx="4.5" fill="', accent, '"/>',
                '</svg>'
            )
        );

        return string(abi.encodePacked(header, mascot, footer));
    }

    function render(RenderParams memory params) external pure returns (string memory) {
        uint256 progress = 0;
        if (params.milestoneCount > 0) {
            progress = params.completedMilestones * 100 / params.milestoneCount;
            if (progress > 100) progress = 100;
        }

        uint256 seed = uint256(keccak256(abi.encodePacked(params.requestId, params.animalName)));
        string memory state = _statusText(params.status);

        string memory svg = _generateSVG(params.tokenId, params.animalName, state, seed, progress);
        string memory imageBase64 = Base64.encode(bytes(svg));

        string memory json = string(
            abi.encodePacked(
                '{"name":"RescueDAO Animal Passport #', params.tokenId.toString(), '",',
                '"description":"Dynamic on-chain animal passport reflecting history and progress.",',
                '"image":"data:image/svg+xml;base64,', imageBase64, '",',
                '"attributes":[',
                '{"trait_type":"Animal Name","value":"', _escapeJSON(params.animalName), '"},',
                '{"trait_type":"Status","value":"', state, '"},',
                '{"trait_type":"Completed Milestones","value":', params.completedMilestones.toString(), '},',
                '{"trait_type":"Total Milestones","value":', params.milestoneCount.toString(), '},',
                '{"trait_type":"Treatment Progress","value":', progress.toString(), '},',
                '{"trait_type":"Request ID","value":', params.requestId.toString(), '}',
                ']}'
            )
        );

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(bytes(json))
            )
        );
    }
}