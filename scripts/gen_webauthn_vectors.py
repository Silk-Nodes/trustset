"""webauthn assertion vectors for HumanTouch tests.

builds a p256 passkey, a webauthn authenticatorData (rpIdHash, flags UP|UV, counter) and a
clientDataJSON carrying the base64url challenge, signs sha256(authData || sha256(clientData))
with deterministic ecdsa, and low-s normalises. the challenge is what HumanTouch expects:
keccak256(abi.encode(touchAddress, account, actionHash)), passed on the command line.

usage: .venv/bin/python scripts/gen_webauthn_vectors.py <challenge_hex32> [out.json]
"""
import base64, hashlib, json, sys
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551

def b64url(b: bytes) -> str: return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
def vector(challenge: bytes, uv: bool, rp: str = "trustset.silknodes.io", seed: int = 1):
    priv = ec.derive_private_key(seed, ec.SECP256R1())
    pub = priv.public_key().public_numbers()
    rp_hash = hashlib.sha256(rp.encode()).digest()
    flags = 0x01 | (0x04 if uv else 0)
    auth = rp_hash + bytes([flags]) + (7).to_bytes(4, "big")
    client = ('{"type":"webauthn.get","challenge":"%s","origin":"https://%s","crossOrigin":false}' % (b64url(challenge), rp)).encode()
    msg = auth + hashlib.sha256(client).digest()
    der = priv.sign(msg, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    if s > N // 2: s = N - s
    return {"x": hex(pub.x), "y": hex(pub.y), "rpIdHash": "0x" + rp_hash.hex(), "authenticatorData": "0x" + auth.hex(), "clientDataJSON": "0x" + client.hex(), "r": hex(r), "s": hex(s), "challenge": "0x" + challenge.hex()}

challenge = bytes.fromhex(sys.argv[1].replace("0x", ""))
"""the second argument names the file, because two suites need vectors for two different
challenges: HumanTouch's attestation and the kill switch's panic button."""
out = {"uv": vector(challenge, True), "noUv": vector(challenge, False)}
path = sys.argv[2] if len(sys.argv) > 2 else "test/vectors-webauthn.json"
json.dump(out, open(path, "w"), indent=1)
print("written; pubkey", out["uv"]["x"][:12], "...")
