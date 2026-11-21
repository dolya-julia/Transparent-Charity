
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@4.9.6/utils/Strings.sol";

contract RescuePassportLayout {
    using Strings for uint256;

    function _bg(uint8 i) internal pure returns (string memory) {
        if (i == 0) return "#24344D";
        if (i == 1) return "#3B3155";
        if (i == 2) return "#294B4A";
        if (i == 3) return "#604052";
        if (i == 4) return "#51452F";
        if (i == 5) return "#34465D";
        return "#35414D";
    }

    function _bgEnd(uint8 i) internal pure returns (string memory) {
        if (i == 0) return "#647D9A";
        if (i == 1) return "#9274A8";
        if (i == 2) return "#6C9C89";
        if (i == 3) return "#B77D88";
        if (i == 4) return "#B18B58";
        if (i == 5) return "#738DAA";
        return "#718B91";
    }

    function _accent(uint256 seed) internal pure returns (string memory) {
        uint256 i = (seed >> 8) % 8;

        if (i == 0) return "#F3C7A5";
        if (i == 1) return "#C3DDF1";
        if (i == 2) return "#F3B6C8";
        if (i == 3) return "#C5E3C6";
        if (i == 4) return "#F5D19A";
        if (i == 5) return "#D7C9F2";
        if (i == 6) return "#E7E0AD";

        return "#BCE2D9";
    }

    function _write(
        bytes memory d,
        uint256 o,
        bytes memory v
    ) internal pure {
        for (uint256 i; i < v.length; i++) {
            d[o + i] = v[i];
        }
    }

    function _escapeXML(
        string memory input
    ) internal pure returns (string memory) {
        bytes memory s = bytes(input);
        bytes memory r = new bytes(s.length * 6);

        uint256 n;

        for (uint256 i; i < s.length; i++) {
            bytes1 c = s[i];

            if (c == 0x26) {
                _write(r, n, bytes("&amp;"));
                n += 5;
            } else if (c == 0x3C) {
                _write(r, n, bytes("&lt;"));
                n += 4;
            } else if (c == 0x3E) {
                _write(r, n, bytes("&gt;"));
                n += 4;
            } else if (c == 0x22) {
                _write(r, n, bytes("&quot;"));
                n += 6;
            } else if (c == 0x27) {
                _write(r, n, bytes("&apos;"));
                n += 6;
            } else {
                r[n++] = c;
            }
        }

        bytes memory out = new bytes(n);

        for (uint256 j; j < n; j++) {
            out[j] = r[j];
        }

        return string(out);
    }

    // =========================================================
    // СТАТУСЫ ЗАЯВКИ
    //
    // 0 - UnderReview
    // 1 - ChangesRequested
    // 2 - Approved
    // 3 - Rejected
    // 4 - Completed
    // 5 - Cancelled
    // =========================================================

    function _statusText(
        uint8 s
    ) internal pure returns (string memory) {
        if (s == 0) return "Waiting for Review";
        if (s == 1) return "Changes Requested";
        if (s == 2) return "Help in Progress";
        if (s == 3) return "Request Rejected";
        if (s == 4) return "Program Completed";
        if (s == 5) return "Cancelled";

        return "Unknown";
    }

    function _statusColor(
        uint8 s
    ) internal pure returns (string memory) {
        // Ожидание проверки — жёлтый
        if (s == 0) return "#F4C66A";

        // Требуются изменения — голубой
        if (s == 1) return "#72C8D6";

        // Заявка одобрена — зелёный
        if (s == 2) return "#85D6A3";

        // Заявка отклонена — красный
        if (s == 3) return "#E68C8C";

        // Программа завершена — насыщенный зелёный
        if (s == 4) return "#85D6A3";

        // Заявка отменена — серый
        if (s == 5) return "#A7A7B5";

        return "#CBD5E1";
    }

    function _progressDecoration(
        uint256 progress,
        string memory a
    ) internal pure returns (string memory) {
        if (progress == 0) return "";

        if (progress < 50) {
            return string(abi.encodePacked(
                '<circle cx="90" cy="170" r="5" fill="',
                a,
                '" opacity="0.7"/>',
                '<circle cx="310" cy="245" r="4" fill="',
                a,
                '" opacity="0.7"/>',
                '<circle cx="320" cy="100" r="3" fill="',
                a,
                '" opacity="0.65"/>'
            ));
        }

        if (progress < 100) {
            return string(abi.encodePacked(
                '<circle cx="90" cy="170" r="7" fill="',
                a,
                '" opacity="0.85"/>',
                '<circle cx="310" cy="245" r="7" fill="',
                a,
                '" opacity="0.85"/>',
                '<path d="M85 110 L91 124 L106 130 L91 136 L85 151 L79 136 L64 130 L79 124 Z" fill="',
                a,
                '" opacity="0.8"/>',
                '<path d="M315 145 L321 159 L336 165 L321 171 L315 186 L309 171 L294 165 L309 159 Z" fill="',
                a,
                '" opacity="0.8"/>',
                '<circle cx="200" cy="68" r="4" fill="#FFFFFF" opacity="0.9"/>'
            ));
        }

        return string(abi.encodePacked(
            '<circle cx="90" cy="170" r="9" fill="#F8D77B"/>',
            '<circle cx="310" cy="245" r="9" fill="#F8D77B"/>',
            '<path d="M85 110 L91 124 L106 130 L91 136 L85 151 L79 136 L64 130 L79 124 Z" fill="#F8D77B"/>',
            '<path d="M315 145 L321 159 L336 165 L321 171 L315 186 L309 171 L294 165 L309 159 Z" fill="#F8D77B"/>',
            '<circle cx="200" cy="208" r="145" fill="none" stroke="#F8D77B" stroke-width="3" opacity="0.65"/>',
            '<path d="M200 65 L208 81 L226 84 L213 97 L216 115 L200 106 L184 115 L187 97 L174 84 L192 81 Z" fill="#F8D77B"/>',
            '<circle cx="112" cy="285" r="5" fill="#F8D77B"/>',
            '<circle cx="288" cy="285" r="5" fill="#F8D77B"/>'
        ));
    }

    function _backgroundDecoration(
        uint256 seed,
        string memory a
    ) internal pure returns (string memory r) {
        for (uint256 i; i < 12; i++) {
            uint256 v = uint256(
                keccak256(abi.encodePacked(seed, i, uint256(99)))
            );

            r = string(abi.encodePacked(
                r,
                '<circle cx="',
                (25 + v % 350).toString(),
                '" cy="',
                (55 + (v >> 16) % 265).toString(),
                '" r="',
                (2 + (v >> 32) % 5).toString(),
                '" fill="',
                a,
                '" opacity="0.55"/>'
            ));
        }
    }

    function _frame(
        uint8 f,
        string memory a
    ) internal pure returns (string memory) {
        if (f == 0) {
            return string(abi.encodePacked(
                '<rect x="13" y="13" width="374" height="514" rx="27" fill="none" stroke="',
                a,
                '" stroke-width="4"/>'
            ));
        }

        if (f == 1) {
            return string(abi.encodePacked(
                '<rect x="12" y="12" width="376" height="516" rx="26" fill="none" stroke="',
                a,
                '" stroke-width="7"/>',
                '<rect x="23" y="23" width="354" height="494" rx="19" fill="none" stroke="#F8D77B" stroke-width="2"/>'
            ));
        }

        if (f == 2) {
            return string(abi.encodePacked(
                '<rect x="13" y="13" width="374" height="514" rx="25" fill="none" stroke="',
                a,
                '" stroke-width="4"/>',
                '<path d="M28 75 Q28 35 70 35 M330 35 Q372 35 372 75 M28 465 Q28 505 70 505 M330 505 Q372 505 372 465" fill="none" stroke="#B6D7A8" stroke-width="7" stroke-linecap="round"/>'
            ));
        }

        return string(abi.encodePacked(
            '<rect x="13" y="13" width="374" height="514" rx="27" fill="none" stroke="',
            a,
            '" stroke-width="4" stroke-dasharray="8 7"/>',
            '<circle cx="28" cy="28" r="6" fill="#F8D77B"/>',
            '<circle cx="372" cy="28" r="6" fill="#F8D77B"/>',
            '<circle cx="28" cy="512" r="6" fill="#F8D77B"/>',
            '<circle cx="372" cy="512" r="6" fill="#F8D77B"/>'
        ));
    }

    // =========================================================
    // ВЕРХНЯЯ ЧАСТЬ SVG
    // Фон, градиенты и декоративные элементы
    // =========================================================

    function renderHeader(
        uint256 seed
    ) external pure returns (string memory) {
        uint8 bg = uint8((seed >> 32) % 7);
        string memory a = _accent(seed);

        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="540" viewBox="0 0 400 540">',
            '<defs>',
            '<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
            '<stop offset="0%" stop-color="',
            _bg(bg),
            '"/>',
            '<stop offset="100%" stop-color="',
            _bgEnd(bg),
            '"/>',
            '</linearGradient>',
            '<radialGradient id="glow">',
            '<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.22"/>',
            '<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>',
            '</radialGradient>',
            '</defs>',
            '<rect width="400" height="540" rx="28" fill="url(#bg)"/>',
            '<circle cx="200" cy="205" r="190" fill="url(#glow)"/>',
            _backgroundDecoration(seed, a),
            '<text x="200" y="45" text-anchor="middle" fill="#FFFFFF" font-size="17" font-weight="bold" letter-spacing="2" font-family="sans-serif">RESCUED BY COMMUNITY</text>',
            '<circle cx="200" cy="208" r="139" fill="#FFFFFF" opacity="0.08"/>'
        ));
    }

    // =========================================================
    // НИЖНЯЯ ЧАСТЬ SVG
    // Имя животного, номер паспорта, статус и прогресс
    // =========================================================

    function renderFooter(
        uint256 tokenId,
        string calldata animalName,
        uint8 status,
        uint256 progress,
        uint256 seed
    ) external pure returns (string memory) {
        string memory a = _accent(seed);

        // Защита от значения прогресса выше 100%.
        if (progress > 100) {
            progress = 100;
        }

        uint256 width = 280 * progress / 100;
        uint8 frame = uint8((seed >> 40) % 4);

        return string(abi.encodePacked(
            _progressDecoration(progress, a),

            '<text x="200" y="374" text-anchor="middle" fill="#FFFFFF" font-size="25" font-weight="bold" font-family="sans-serif">',
            _escapeXML(animalName),
            '</text>',

            '<text x="200" y="398" text-anchor="middle" fill="#E2E8F0" font-size="12" font-family="sans-serif">Rescue Passport #',
            tokenId.toString(),
            '</text>',

            '<rect x="55" y="411" width="290" height="32" rx="16" fill="',
            a,
            '" opacity="0.20"/>',

            '<text x="200" y="432" text-anchor="middle" fill="',
            _statusColor(status),
            '" font-size="13" font-weight="bold" font-family="sans-serif">',
            _statusText(status),
            '</text>',

            '<text x="60" y="468" fill="#E2E8F0" font-size="12" font-family="sans-serif">Treatment progress</text>',

            '<text x="340" y="468" text-anchor="end" fill="#FFFFFF" font-size="13" font-weight="bold" font-family="sans-serif">',
            progress.toString(),
            '%</text>',

            '<rect x="60" y="480" width="280" height="10" rx="5" fill="#FFFFFF" opacity="0.22"/>',

            '<rect x="60" y="480" width="',
            width.toString(),
            '" height="10" rx="5" fill="',
            a,
            '"/>',

            '<text x="200" y="516" text-anchor="middle" fill="#CBD5E1" font-size="11" font-family="sans-serif">ANIMAL WELFARE | RESCUED WITH CARE</text>',

            _frame(frame, a),

            '</svg>'
        ));
    }
}
