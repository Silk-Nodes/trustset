// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title BLS12-381 aggregate verification over the EIP-2537 precompiles (live on Monad, 0x0b to 0x11).
/// @notice Min-pubkey scheme: public keys in G1 (128 byte uncompressed precompile encoding),
///         signatures in G2 (256 byte uncompressed), messages hashed to G2 per RFC 9380 with SHA-256.
/// @dev Verification checks e(-G1, sig) * e(aggPk, H(m)) == 1 via the pairing precompile.
library BLS {
    address constant G1_ADD = address(0x0b);
    address constant PAIRING = address(0x0f);
    address constant MAP_FP2_TO_G2 = address(0x11);
    address constant G2_ADD = address(0x0d);

    uint256 constant G1_LEN = 128;
    uint256 constant G2_LEN = 256;
    uint256 constant FP_LEN = 64;

    // -G1 generator, precompile encoding (two 64 byte big-endian field elements, 16 zero bytes padding each).
    bytes constant NEG_G1 =
        hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb"
        hex"00000000000000000000000000000000114d1d6855d545a8aa7d76c8cf2e21f267816aef1db507c96655b9d5caac42364e6f38ba0ecb751bad54dcd6b939c2ca";

    bytes constant DST = "OPERATOR_TRUST_NETWORK_BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_";

    error PrecompileFailed(address which);
    error BadLength();

    function g1Add(bytes memory a, bytes memory b) internal view returns (bytes memory out) {
        if (a.length != G1_LEN || b.length != G1_LEN) revert BadLength();
        bool ok;
        (ok, out) = G1_ADD.staticcall(bytes.concat(a, b));
        if (!ok || out.length != G1_LEN) revert PrecompileFailed(G1_ADD);
    }

    function g2Add(bytes memory a, bytes memory b) internal view returns (bytes memory out) {
        if (a.length != G2_LEN || b.length != G2_LEN) revert BadLength();
        bool ok;
        (ok, out) = G2_ADD.staticcall(bytes.concat(a, b));
        if (!ok || out.length != G2_LEN) revert PrecompileFailed(G2_ADD);
    }

    /// @notice RFC 9380 expand_message_xmd with SHA-256, producing lenInBytes bytes.
    function expandMessageXmd(bytes memory msg_, bytes memory dst, uint256 lenInBytes) internal pure returns (bytes memory) {
        uint256 ell = (lenInBytes + 31) / 32;
        require(ell <= 255 && dst.length <= 255, "xmd params");
        bytes memory dstPrime = bytes.concat(dst, bytes1(uint8(dst.length)));
        bytes memory zPad = new bytes(64);
        bytes32 b0 = sha256(bytes.concat(zPad, msg_, bytes1(uint8(lenInBytes >> 8)), bytes1(uint8(lenInBytes)), bytes1(0), dstPrime));
        bytes memory out = new bytes(lenInBytes);
        bytes32 bi = sha256(bytes.concat(b0, bytes1(uint8(1)), dstPrime));
        _copy(out, 0, bi);
        for (uint256 i = 2; i <= ell; i++) {
            bi = sha256(bytes.concat(b0 ^ bi, bytes1(uint8(i)), dstPrime));
            _copy(out, (i - 1) * 32, bi);
        }
        return out;
    }

    function _copy(bytes memory out, uint256 offset, bytes32 word) private pure {
        for (uint256 j = 0; j < 32 && offset + j < out.length; j++) {
            out[offset + j] = word[j];
        }
    }

    /// @notice hash_to_field for Fp2 with count 2 (m = 2, L = 64): four 64 byte field elements reduced mod p.
    /// @dev The precompile map_fp2_to_g2 requires each coordinate < p, so we reduce the 64 byte expansions.
    function hashToFieldFp2(bytes memory msg_) internal view returns (bytes memory u0, bytes memory u1) {
        bytes memory uniform = expandMessageXmd(msg_, DST, 256);
        u0 = bytes.concat(_reduce(uniform, 0), _reduce(uniform, 64));
        u1 = bytes.concat(_reduce(uniform, 128), _reduce(uniform, 192));
    }

    // p for BLS12-381
    uint256 constant P_HI = 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f624;
    uint256 constant P_LO = 0x1eabfffeb153ffffb9feffffffffaaab;

    /// @dev Reduce a 64 byte big-endian integer modulo p, returning the 64 byte precompile field encoding.
    function _reduce(bytes memory src, uint256 offset) private view returns (bytes memory) {
        // Use modexp precompile (0x05): base^1 mod p, base is 64 bytes, modulus 48 bytes.
        bytes memory base = new bytes(64);
        for (uint256 i = 0; i < 64; i++) base[i] = src[offset + i];
        // modulus is 48 bytes: P_HI is the top 32 bytes, P_LO the low 16 bytes
        bytes memory modulus = abi.encodePacked(bytes32(P_HI), bytes16(uint128(P_LO)));
        bytes memory input = abi.encodePacked(uint256(64), uint256(1), uint256(48), base, bytes1(0x01), modulus);
        (bool ok, bytes memory out) = address(0x05).staticcall(input);
        require(ok && out.length == 48, "modexp");
        return bytes.concat(new bytes(16), out);
    }

    function hashToG2(bytes memory msg_) internal view returns (bytes memory) {
        (bytes memory u0, bytes memory u1) = hashToFieldFp2(msg_);
        (bool ok0, bytes memory q0) = MAP_FP2_TO_G2.staticcall(u0);
        (bool ok1, bytes memory q1) = MAP_FP2_TO_G2.staticcall(u1);
        if (!ok0 || !ok1 || q0.length != G2_LEN || q1.length != G2_LEN) revert PrecompileFailed(MAP_FP2_TO_G2);
        return g2Add(q0, q1);
    }

    /// @notice Verify an aggregate signature over one message for the given aggregated public key.
    function verify(bytes memory aggPubkey, bytes memory msg_, bytes memory signature) internal view returns (bool) {
        if (aggPubkey.length != G1_LEN || signature.length != G2_LEN) revert BadLength();
        bytes memory hm = hashToG2(msg_);
        bytes memory input = bytes.concat(NEG_G1, signature, aggPubkey, hm);
        (bool ok, bytes memory out) = PAIRING.staticcall(input);
        if (!ok || out.length != 32) revert PrecompileFailed(PAIRING);
        return abi.decode(out, (uint256)) == 1;
    }
}
