"""sign the demo revocation notice with the two demo operators and write demo/config.json.
notice message = keccak256(abi.encode(agentId, uint8(3) /* Revoked */)); the registry wraps it as
keccak256(abi.encode(registry, uint8 duty=1, message)) before hashing to the curve."""
import hashlib, json, sys
from py_ecc.optimized_bls12_381 import multiply, add, normalize, curve_order
from py_ecc.bls.hash_to_curve import hash_to_G2
from eth_abi import encode
from eth_utils import keccak

DST = b"OPERATOR_TRUST_NETWORK_BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_"
def fp(x): return (0).to_bytes(16, "big") + int(x).to_bytes(48, "big")
def g2(p):
    x, y = normalize(p); return fp(x.coeffs[0]) + fp(x.coeffs[1]) + fp(y.coeffs[0]) + fp(y.coeffs[1])
def keygen(seed): return int.from_bytes(hashlib.sha256(seed).digest(), "big") % curve_order
def sign(sk, msg): return multiply(hash_to_G2(msg, DST, hashlib.sha256), sk)

a = json.load(open("demo/addresses.json"))
message = keccak(encode(["uint256", "uint8"], [int(a["agentId"]), 3]))
digest = keccak(encode(["address", "uint8", "bytes32"], [a["registry"], 1, message]))
sk1, sk2 = keygen(b"operator-1"), keygen(b"operator-2")
agg = add(sign(sk1, digest), sign(sk2, digest))
cfg = dict(a)
cfg.update({"noticeMessage": "0x" + message.hex(), "noticeDigest": "0x" + digest.hex(), "noticeAggSig": "0x" + g2(agg).hex(), "signerBitmap": 3,
            "ownerKey": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            "agentPrivKey": "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
            "auth1Key": "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
            "auth2Key": "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"})
json.dump(cfg, open("demo/config.json", "w"), indent=1)
print("demo/config.json written")
