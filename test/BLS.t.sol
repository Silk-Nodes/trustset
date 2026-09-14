// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {BLS} from "../src/libraries/BLS.sol";

/// @dev Exposes the library so failures surface as reverts with reasons.
contract BLSHarness {
    function hashToG2(bytes memory m) external view returns (bytes memory) { return BLS.hashToG2(m); }
    function verify(bytes memory pk, bytes memory m, bytes memory sig) external view returns (bool) { return BLS.verify(pk, m, sig); }
    function g1Add(bytes memory a, bytes memory b) external view returns (bytes memory) { return BLS.g1Add(a, b); }
    function g2Add(bytes memory a, bytes memory b) external view returns (bytes memory) { return BLS.g2Add(a, b); }
    function expand(bytes memory m, bytes memory dst, uint256 n) external pure returns (bytes memory) { return BLS.expandMessageXmd(m, dst, n); }
}

/// @notice Vectors generated with py_ecc 8.0.0: min-pubkey scheme, hash_to_G2 with SHA-256 and the contract DST.
///         Runs against the EIP-2537 precompiles, which Foundry provides under evm_version prague and Monad ships live.
contract BLSTest is Test {
    BLSHarness h;
    bytes constant MSG = hex"1111111111111111111111111111111111111111111111111111111111111111";
    bytes constant PK1 = hex"0000000000000000000000000000000013ac1a4c00e5b7e169ae03d67ded85b613c325b08b88a0c51efc36d6aeb6fe789ad7572b89faae43a988f636f33059e2000000000000000000000000000000001843ffe646781638da018573d9a41f6b15670a564565e96479365f52629367e71b680ccb8613953d880316ea33421ba7";
    bytes constant PK2 = hex"00000000000000000000000000000000189dafaea5e9a854c4b8d9c1c2e6fb520749b14011532adb9bee9b93911bb4bb18116d32ba687f775272a9820bd2bd0b00000000000000000000000000000000063dcba24dcd13ba15aa02f6b5a5246260e9db379c019d14098179df3ab70e4d8f43b1f97ada3293101a21c41039a928";
    bytes constant SIG1 = hex"000000000000000000000000000000000b10f819cda4a2136af150bb481b117d9255cfb64a0875a9194e99ae8ae06c12551b780a959989467b72073faeff92f1000000000000000000000000000000001039f80bf42eb88b32aadc71d0266ef9af466c7fc387c8267af1661cf6c3f4a6ab5d25a79de43a22cc9e14f2582e99c3000000000000000000000000000000001415aadfdb4a34ffe393c3cfa3abfc95b3fd1d2d022e0cd7590d7823531315b1a6b3eba7964c62418d2ca48c223706f900000000000000000000000000000000022ed51b7f5fe7619bc73e2b44ddd123f68ee209f63e2ad65ddd0300786245a38a675f8e6af61ecd5ec832d626e9dc14";
    bytes constant SIG2 = hex"00000000000000000000000000000000063f46eb0cbacd845f1d1d7d8d459e747347e96e035c78ba56485c05ee6101c07d0213967fa03c6456152b74691c7dda000000000000000000000000000000000f9ae9d03b1a820099b939dd87b9461db4540addde1b18b7a598b19652dfaceec851221c6a4a5062e3eb86d1fc49a36300000000000000000000000000000000026b5f8d1266fa8f92287fcf51de9afe5892304e22cf1d83d099f1b3d5acecbb9b81d3b164af530798b6f1888cbab1190000000000000000000000000000000008fdef6ca808a6323a0aa6e37def7664b55718b2284d5a05b970011f99f5fc5a462fa95a0f291c816ad8e122ed856675";
    bytes constant AGG_SIG = hex"000000000000000000000000000000000229300661d5f4651c64d0e3b708a3149370d31c35800e22cdfd782c1b6dcb594aa06833ea4300554140136b4a53288600000000000000000000000000000000171b5a17ba1449c1961ea21e5645983aafbac87f5bafebcd2224e7afaea26cd785fe1af90e8953fa3e83824d3a20cd7e000000000000000000000000000000000e6b7ca200b8f28733f605932d4b30c4cdb8c8319391a2382e08bdfa163a6c28be010194da999efaf253e50e099968cf0000000000000000000000000000000008a4c86a725f707e311605110164b748de19b9449999993d179d3bf33337e12b463e2b9a1846f2b55219143e85c44748";
    bytes constant AGG_PK = hex"0000000000000000000000000000000010f455d53435b0dd3c553373cbcd2f48b33c210b8490c2362006b936c5456a4804bd4b264a15adc054f98a1c7873f5fd0000000000000000000000000000000004979c48e893e3f1f3e06d1cdb23f955db1eb242093f2defcf04254c168e4702a20986fad65061d1cb33bc2821fe4f01";
    bytes constant HM = hex"00000000000000000000000000000000055d0e3128d6c97df4d2bcc0401ea84c4d2248c92473ac7c3cbeb8298730f9f07d762e9074e427b2e6b8fc26990d9a780000000000000000000000000000000010db626ec5721bcee1de8335db8afb699dad911f9f16b75229dd003675687f4d3f8ff9b6c2362d6e0add2879833c99e80000000000000000000000000000000017914e7e723006b691a3e267a76b51b7ba665cd9667d9c547425fcf93c6bf66f946cf8f79d448a559670f499570c91630000000000000000000000000000000017054d2b4eae3036980a75d07398e1e30022c7c6ce71f28f69c0aef0daed171a26726a70bfea2819859812cd4b4cd6c0";

    function setUp() public { h = new BLSHarness(); }

    function test_expandMessageXmd_rfc9380_vector() public view {
        // RFC 9380 appendix K.1: expand_message_xmd(SHA-256), DST "QUUX-V01-CS02-with-expander-SHA256-128", msg "", len 32
        bytes memory out = h.expand("", "QUUX-V01-CS02-with-expander-SHA256-128", 32);
        assertEq(out, hex"68a985b87eb6b46952128911f2a4412bbc302a9d759667f87f7a21d803f07235");
        // msg "abc", len 128
        bytes memory out2 = h.expand("abc", "QUUX-V01-CS02-with-expander-SHA256-128", 128);
        assertEq(out2, hex"abba86a6129e366fc877aab32fc4ffc70120d8996c88aee2fe4b32d6c7b6437a647e6c3163d40b76a73cf6a5674ef1d890f95b664ee0afa5359a5c4e07985635bbecbac65d747d3d2da7ec2b8221b17b0ca9dc8a1ac1c07ea6a1e60583e2cb00058e77b7b72a298425cd1b941ad4ec65e8afc50303a22c0f99b0509b4c895f40");
    }

    function test_hashToG2_matchesPyEcc() public view {
        assertEq(h.hashToG2(MSG), HM);
    }

    function test_verifySingle() public view {
        assertTrue(h.verify(PK1, MSG, SIG1));
        assertTrue(h.verify(PK2, MSG, SIG2));
    }

    function test_verifyRejectsWrongMessageAndKey() public view {
        assertFalse(h.verify(PK1, hex"22", SIG1));
        assertFalse(h.verify(PK2, MSG, SIG1));
    }

    function test_aggregate() public view {
        assertEq(h.g1Add(PK1, PK2), AGG_PK);
        assertEq(h.g2Add(SIG1, SIG2), AGG_SIG);
        assertTrue(h.verify(AGG_PK, MSG, AGG_SIG));
        assertFalse(h.verify(PK1, MSG, AGG_SIG), "single key cannot verify the aggregate");
    }

    function test_badLengthsRevert() public {
        vm.expectRevert(BLS.BadLength.selector);
        h.verify(new bytes(48), MSG, SIG1);
        vm.expectRevert(BLS.BadLength.selector);
        h.verify(PK1, MSG, new bytes(96));
    }
}
