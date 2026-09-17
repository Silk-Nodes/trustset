// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title WebAuthn assertion verification on the P256 precompile (0x0100, EIP-7951, live on Monad).
/// @notice Verifies that a passkey produced an assertion for a given challenge, and reports the
///         authenticator flags so a caller can require user presence and user verification.
/// @dev Deliberately strict. Anything malformed returns ok=false; nothing here ever reverts on
///      untrusted input except length underflow, which is checked first.
library WebAuthn {
    address constant P256_VERIFY = address(0x0100);
    uint256 constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint256 constant HALF_N = N / 2;

    uint8 constant FLAG_UP = 0x01;
    uint8 constant FLAG_UV = 0x04;

    struct Assertion {
        bytes authenticatorData; // rpIdHash(32) || flags(1) || signCount(4) || ...
        bytes clientDataJSON;    // {"type":"webauthn.get","challenge":"<base64url>",...}
        uint256 r;
        uint256 s;
    }

    /// @return ok whether the signature verifies for (x, y) and the challenge is the one embedded
    /// @return flags the authenticator flags byte, so the caller can require UP and UV
    function verify(Assertion memory a, bytes32 challenge, bytes32 rpIdHash, uint256 x, uint256 y)
        internal
        view
        returns (bool ok, uint8 flags)
    {
        if (a.authenticatorData.length < 37) return (false, 0);
        // rpIdHash must match the relying party the account registered with
        bytes32 gotRp;
        bytes memory ad = a.authenticatorData;
        assembly { gotRp := mload(add(ad, 32)) }
        if (gotRp != rpIdHash) return (false, 0);
        flags = uint8(ad[32]);
        if (flags & FLAG_UP == 0) return (false, flags);
        // clientDataJSON must be a get and must carry this exact challenge
        if (!_contains(a.clientDataJSON, bytes('"type":"webauthn.get"'))) return (false, flags);
        bytes memory expected = bytes.concat(bytes('"challenge":"'), bytes(_base64url(abi.encodePacked(challenge))), bytes('"'));
        if (!_contains(a.clientDataJSON, expected)) return (false, flags);
        // malleability: reject high s
        if (a.s > HALF_N || a.s == 0 || a.r == 0) return (false, flags);
        bytes32 h = sha256(bytes.concat(a.authenticatorData, sha256(a.clientDataJSON)));
        (bool success, bytes memory out) = P256_VERIFY.staticcall(abi.encode(h, a.r, a.s, x, y));
        ok = success && out.length == 32 && abi.decode(out, (uint256)) == 1;
    }

    function _contains(bytes memory hay, bytes memory needle) private pure returns (bool) {
        if (needle.length == 0 || hay.length < needle.length) return false;
        for (uint256 i = 0; i + needle.length <= hay.length; i++) {
            bool m = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (hay[i + j] != needle[j]) { m = false; break; }
            }
            if (m) return true;
        }
        return false;
    }

    /// @dev base64url without padding, as WebAuthn encodes the challenge in clientDataJSON.
    function _base64url(bytes memory data) private pure returns (string memory) {
        bytes memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        uint256 len = data.length;
        uint256 outLen = (len * 4 + 2) / 3;
        bytes memory out = new bytes(outLen);
        uint256 o = 0;
        for (uint256 i = 0; i < len; i += 3) {
            uint256 b0 = uint8(data[i]);
            uint256 b1 = i + 1 < len ? uint8(data[i + 1]) : 0;
            uint256 b2 = i + 2 < len ? uint8(data[i + 2]) : 0;
            uint256 n = (b0 << 16) | (b1 << 8) | b2;
            out[o++] = table[(n >> 18) & 63];
            out[o++] = table[(n >> 12) & 63];
            if (i + 1 < len) out[o++] = table[(n >> 6) & 63];
            if (i + 2 < len) out[o++] = table[n & 63];
        }
        return string(out);
    }
}
