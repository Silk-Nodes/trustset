"""generate bls12-381 test vectors for the operator registry.

min-pubkey scheme: public keys in g1, signatures in g2, hash_to_curve g2 with sha-256 and the contract dst.
encodings follow eip-2537 precompile layout: each fp is 64 bytes, 16 zero bytes then 48 big endian.

usage: python -m venv .venv && .venv/bin/pip install py_ecc && .venv/bin/python scripts/gen_bls_vectors.py
seeds operator-1 and operator-2 are the two test operators. digests come from
`forge test -vv --match-test test_probeAddressesForOfflineSigning`.
"""
import hashlib, json, sys
from py_ecc.optimized_bls12_381 import multiply, G1, add, normalize, curve_order
from py_ecc.bls.hash_to_curve import hash_to_G2

DST = b"OPERATOR_TRUST_NETWORK_BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_"

def fp(x): return (0).to_bytes(16, "big") + int(x).to_bytes(48, "big")
def g1(p): x, y = normalize(p); return fp(x) + fp(y)
def g2(p):
    x, y = normalize(p)
    return fp(x.coeffs[0]) + fp(x.coeffs[1]) + fp(y.coeffs[0]) + fp(y.coeffs[1])
def keygen(seed): return int.from_bytes(hashlib.sha256(seed).digest(), "big") % curve_order
def sign(sk, msg): return multiply(hash_to_G2(msg, DST, hashlib.sha256), sk)

sk1, sk2 = keygen(b"operator-1"), keygen(b"operator-2")
pk1, pk2 = multiply(G1, sk1), multiply(G1, sk2)
msg = bytes.fromhex("11" * 32)
s1, s2 = sign(sk1, msg), sign(sk2, msg)
base = {
    "msg": msg.hex(), "pk1": g1(pk1).hex(), "pk2": g1(pk2).hex(),
    "sig1": g2(s1).hex(), "sig2": g2(s2).hex(),
    "aggSig": g2(add(s1, s2)).hex(), "aggPk": g1(add(pk1, pk2)).hex(),
    "hm": g2(hash_to_G2(msg, DST, hashlib.sha256)).hex(),
}
json.dump(base, open("test/vectors-bls.json", "w"), indent=1)

if len(sys.argv) == 3:
    agg_digest, stmt_digest = bytes.fromhex(sys.argv[1]), bytes.fromhex(sys.argv[2])
    reg = {
        "aggSigHello": g2(add(sign(sk1, agg_digest), sign(sk2, agg_digest))).hex(),
        "sig1Hello": g2(sign(sk1, agg_digest)).hex(),
        "sig1Statement": g2(sign(sk1, stmt_digest)).hex(),
    }
    json.dump(reg, open("test/vectors-bls-registry.json", "w"), indent=1)
print("vectors written")
