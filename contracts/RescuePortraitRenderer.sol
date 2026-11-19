
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@4.9.6/utils/Strings.sol";

contract RescuePortraitRenderer {
    using Strings for uint256;

    function primaryColor(uint256 seed) public pure returns (string memory) {
        uint256 i = seed % 8;
        if (i == 0) return "#B77955";
        if (i == 1) return "#647FA3";
        if (i == 2) return "#C87991";
        if (i == 3) return "#729B7B";
        if (i == 4) return "#D49A55";
        if (i == 5) return "#8876B8";
        if (i == 6) return "#A5A16D";
        return "#789C9A";
    }

    function accentColor(uint256 seed) public pure returns (string memory) {
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

    function _ears(string memory p, string memory a, uint8 t)
        internal pure returns (string memory)
    {
        if (t == 0) return string(abi.encodePacked(
            '<path d="M119 180 L105 76 L188 139 Z" fill="',p,'" stroke="',a,'" stroke-width="6" stroke-linejoin="round"/>',
            '<path d="M132 151 L124 105 L164 145 Z" fill="',a,'"/>',
            '<path d="M281 180 L295 76 L212 139 Z" fill="',p,'" stroke="',a,'" stroke-width="6" stroke-linejoin="round"/>',
            '<path d="M268 151 L276 105 L236 145 Z" fill="',a,'"/>'
        ));
        if (t == 1) return string(abi.encodePacked(
            '<ellipse cx="112" cy="188" rx="39" ry="74" transform="rotate(-20 112 188)" fill="',p,'" stroke="',a,'" stroke-width="6"/>',
            '<ellipse cx="288" cy="188" rx="39" ry="74" transform="rotate(20 288 188)" fill="',p,'" stroke="',a,'" stroke-width="6"/>'
        ));
        if (t == 2) return string(abi.encodePacked(
            '<ellipse cx="151" cy="113" rx="25" ry="91" transform="rotate(-12 151 113)" fill="',p,'" stroke="',a,'" stroke-width="6"/>',
            '<ellipse cx="249" cy="113" rx="25" ry="91" transform="rotate(12 249 113)" fill="',p,'" stroke="',a,'" stroke-width="6"/>',
            '<ellipse cx="151" cy="113" rx="11" ry="66" fill="',a,'" opacity="0.8"/>',
            '<ellipse cx="249" cy="113" rx="11" ry="66" fill="',a,'" opacity="0.8"/>'
        ));
        if (t == 3) return string(abi.encodePacked(
            '<path d="M112 190 L88 61 L190 140 Z" fill="',p,'" stroke="',a,'" stroke-width="6" stroke-linejoin="round"/>',
            '<path d="M288 190 L312 61 L210 140 Z" fill="',p,'" stroke="',a,'" stroke-width="6" stroke-linejoin="round"/>',
            '<path d="M120 151 L105 88 L165 144 Z" fill="',a,'"/>',
            '<path d="M280 151 L295 88 L235 144 Z" fill="',a,'"/>'
        ));
        if (t == 4) return string(abi.encodePacked(
            '<circle cx="128" cy="145" r="42" fill="',p,'" stroke="',a,'" stroke-width="6"/>',
            '<circle cx="272" cy="145" r="42" fill="',p,'" stroke="',a,'" stroke-width="6"/>',
            '<circle cx="128" cy="145" r="21" fill="',a,'"/>',
            '<circle cx="272" cy="145" r="21" fill="',a,'"/>'
        ));
        return string(abi.encodePacked(
            '<path d="M135 150 Q105 87 143 55 Q166 105 177 143 Z" fill="',a,'" stroke="',p,'" stroke-width="6"/>',
            '<path d="M265 150 Q295 87 257 55 Q234 105 223 143 Z" fill="',a,'" stroke="',p,'" stroke-width="6"/>'
        ));
    }

    function _head(string memory p, string memory a, uint8 t)
        internal pure returns (string memory)
    {
        if (t == 0) return string(abi.encodePacked(
            '<path d="M110 200 Q110 115 200 116 Q290 115 290 200 Q290 292 200 302 Q110 292 110 200 Z" fill="',p,'" stroke="',a,'" stroke-width="7"/>'
        ));
        if (t == 1) return string(abi.encodePacked(
            '<ellipse cx="200" cy="207" rx="104" ry="101" fill="',p,'" stroke="',a,'" stroke-width="7"/>'
        ));
        if (t == 2) return string(abi.encodePacked(
            '<ellipse cx="200" cy="205" rx="91" ry="103" fill="',p,'" stroke="',a,'" stroke-width="7"/>'
        ));
        if (t == 3) return string(abi.encodePacked(
            '<path d="M107 205 Q110 119 200 116 Q290 119 293 205 L260 276 Q200 325 140 276 Z" fill="',p,'" stroke="',a,'" stroke-width="7"/>'
        ));
        if (t == 4) return string(abi.encodePacked(
            '<circle cx="200" cy="205" r="104" fill="',p,'" stroke="',a,'" stroke-width="8"/>'
        ));
        return string(abi.encodePacked(
            '<path d="M200 105 Q295 120 290 218 Q280 302 200 302 Q120 302 110 218 Q105 120 200 105 Z" fill="',p,'" stroke="',a,'" stroke-width="7"/>'
        ));
    }

    function _fur(uint256 seed, string memory a, uint8 coat)
        internal pure returns (string memory r)
    {
        if (coat == 0) return "";
        if (coat == 1 || coat == 3) {
            for (uint256 i; i < 7; i++) {
                uint256 v = uint256(keccak256(abi.encodePacked(seed,i,uint256(71))));
                r = string(abi.encodePacked(r,
                    '<circle cx="',(137+v%126).toString(),
                    '" cy="',(151+(v>>16)%91).toString(),
                    '" r="',(3+(v>>32)%6).toString(),
                    '" fill="',a,'" opacity="0.75"/>'
                ));
            }
            return r;
        }
        if (coat == 2) {
            for (uint256 i; i < 4; i++) {
                uint256 x = 145 + i*37;
                r = string(abi.encodePacked(r,
                    '<path d="M',x.toString(),' 137 Q',(x+15).toString(),
                    ' 174 ',(x+5).toString(),
                    ' 204" fill="none" stroke="',a,
                    '" stroke-width="8" opacity="0.65" stroke-linecap="round"/>'
                ));
            }
            return r;
        }
        if (coat == 4) return string(abi.encodePacked(
            '<path d="M117 230 Q200 275 283 230 Q265 300 200 301 Q135 300 117 230 Z" fill="',a,'" opacity="0.65"/>'
        ));
        return string(abi.encodePacked(
            '<path d="M140 177 Q155 158 169 177 Q155 196 140 177" fill="none" stroke="',a,'" stroke-width="5"/>',
            '<path d="M231 177 Q246 158 260 177 Q246 196 231 177" fill="none" stroke="',a,'" stroke-width="5"/>',
            '<circle cx="200" cy="145" r="7" fill="',a,'"/>'
        ));
    }

    function _eyes(uint8 e) internal pure returns (string memory) {
        if (e == 0) return string(abi.encodePacked(
            '<circle cx="165" cy="200" r="10" fill="#202638"/>',
            '<circle cx="235" cy="200" r="10" fill="#202638"/>',
            '<circle cx="168" cy="196" r="3" fill="#FFFFFF"/>',
            '<circle cx="238" cy="196" r="3" fill="#FFFFFF"/>'
        ));
        if (e == 1) return string(abi.encodePacked(
            '<path d="M148 202 Q165 215 182 202" fill="none" stroke="#202638" stroke-width="7" stroke-linecap="round"/>',
            '<path d="M218 202 Q235 215 252 202" fill="none" stroke="#202638" stroke-width="7" stroke-linecap="round"/>'
        ));
        if (e == 2) return string(abi.encodePacked(
            '<ellipse cx="165" cy="199" rx="8" ry="14" fill="#202638"/>',
            '<ellipse cx="235" cy="199" rx="8" ry="14" fill="#202638"/>',
            '<circle cx="168" cy="195" r="3" fill="#FFFFFF"/>',
            '<circle cx="238" cy="195" r="3" fill="#FFFFFF"/>'
        ));
        return string(abi.encodePacked(
            '<circle cx="165" cy="199" r="12" fill="#FFFFFF"/>',
            '<circle cx="235" cy="199" r="12" fill="#FFFFFF"/>',
            '<circle cx="165" cy="199" r="6" fill="#202638"/>',
            '<circle cx="235" cy="199" r="6" fill="#202638"/>',
            '<circle cx="167" cy="196" r="2.5" fill="#FFFFFF"/>',
            '<circle cx="237" cy="196" r="2.5" fill="#FFFFFF"/>'
        ));
    }

    function _face(string memory a, uint8 e, uint8 t)
        internal pure returns (string memory)
    {
        string memory muzzle = (t == 2 || t == 4)
            ? '<ellipse cx="200" cy="237" rx="43" ry="30" fill="#FFFFFF" opacity="0.82"/>'
            : '<ellipse cx="200" cy="236" rx="51" ry="35" fill="#FFFFFF" opacity="0.88"/>';

        return string(abi.encodePacked(
            muzzle,_eyes(e),
            '<path d="M191 226 Q200 218 209 226 Q200 239 191 226 Z" fill="#44343B"/>',
            '<path d="M200 237 Q194 251 182 247 M200 237 Q206 251 218 247" fill="none" stroke="#44343B" stroke-width="4" stroke-linecap="round"/>',
            '<circle cx="145" cy="229" r="10" fill="',a,'" opacity="0.75"/>',
            '<circle cx="255" cy="229" r="10" fill="',a,'" opacity="0.75"/>'
        ));
    }

    function _accessory(uint8 n, string memory a, string memory p)
        internal pure returns (string memory)
    {
        if (n == 0) return string(abi.encodePacked(
            '<path d="M178 119 Q145 91 143 119 Q145 144 178 130 Z" fill="',a,'" stroke="',p,'" stroke-width="4"/>',
            '<path d="M222 119 Q255 91 257 119 Q255 144 222 130 Z" fill="',a,'" stroke="',p,'" stroke-width="4"/>',
            '<circle cx="200" cy="123" r="10" fill="',p,'"/>'
        ));
        if (n == 1) return string(abi.encodePacked(
            '<path d="M150 113 L145 69 L177 92 L200 55 L223 92 L255 69 L250 113 Z" fill="',a,'" stroke="#F8D77B" stroke-width="5" stroke-linejoin="round"/>',
            '<rect x="151" y="109" width="98" height="12" rx="5" fill="#F8D77B"/>',
            '<circle cx="200" cy="82" r="6" fill="#FFFFFF"/>'
        ));
        if (n == 2) return string(abi.encodePacked(
            '<path d="M133 276 Q200 301 267 276 L258 307 Q200 329 142 307 Z" fill="',a,'" stroke="',p,'" stroke-width="4"/>',
            '<path d="M226 301 L249 301 L242 349 L218 341 Z" fill="',a,'" stroke="',p,'" stroke-width="4"/>'
        ));
        if (n == 3) return string(abi.encodePacked(
            '<rect x="135" y="181" width="58" height="39" rx="13" fill="none" stroke="#F6E8C5" stroke-width="6"/>',
            '<rect x="207" y="181" width="58" height="39" rx="13" fill="none" stroke="#F6E8C5" stroke-width="6"/>',
            '<path d="M193 194 L207 194" stroke="#F6E8C5" stroke-width="6"/>',
            '<path d="M130 193 L116 187 M270 193 L284 187" stroke="#F6E8C5" stroke-width="5"/>'
        ));
        if (n == 4) return string(abi.encodePacked(
            '<circle cx="200" cy="120" r="10" fill="#F6D36D"/>',
            '<circle cx="200" cy="101" r="12" fill="',a,'"/>',
            '<circle cx="219" cy="120" r="12" fill="',a,'"/>',
            '<circle cx="200" cy="139" r="12" fill="',a,'"/>',
            '<circle cx="181" cy="120" r="12" fill="',a,'"/>'
        ));
        if (n == 5) return string(abi.encodePacked(
            '<path d="M171 286 L229 286 L200 325 Z" fill="',a,'" stroke="#F5D27D" stroke-width="4"/>',
            '<circle cx="200" cy="302" r="17" fill="#F5D27D"/>',
            '<path d="M200 289 L204 299 L215 300 L207 307 L209 318 L200 312 L191 318 L193 307 L185 300 L196 299 Z" fill="#FFFFFF"/>'
        ));
        if (n == 6) return "";
        return string(abi.encodePacked(
            '<path d="M200 55 L210 78 L235 80 L216 96 L222 121 L200 108 L178 121 L184 96 L165 80 L190 78 Z" fill="',a,'" stroke="#F5D27D" stroke-width="4"/>'
        ));
    }

    function renderPortrait(uint256 seed) external pure returns (string memory) {
        uint8 archetype = uint8(seed % 6);
        uint8 coat = uint8((seed >> 8) % 6);
        uint8 eyes = uint8((seed >> 16) % 4);
        uint8 accessory = uint8((seed >> 24) % 8);
        string memory p = primaryColor(seed);
        string memory a = accentColor(seed);

        return string(abi.encodePacked(
            _ears(p,a,archetype),
            _head(p,a,archetype),
            _fur(seed,a,coat),
            _face(a,eyes,archetype),
            _accessory(accessory,a,p)
        ));
    }
}
