# operator trust network

agent trust on monad, signed by the validators that run monad.

validators in the consensus set opt in as trust operators: post a bond, register a bls key, declare duties,
heartbeat every epoch. statements they sign are verified in aggregate with one pairing on the eip-2537
precompiles. a signed statement that a duty contract can prove false costs the operator its bond.

built for monad metropolis, trust, identity and ai infrastructure track. plan and threat model live in
`../agent-trust-stack-plan.md`.

## contracts

| contract | holds funds | what it does |
| --- | --- | --- |
| `OperatorRegistry` | operator bonds | membership from the staking precompile at 0x1000, bond, heartbeat, exit with delay, slash on a contradicted statement, bls aggregate verification |
| `KillSwitch` | no | per agent: hot key, cold revocation key, guardians, status with history. revoked is terminal, rotated names a successor. `isTrustedAt(id, timestamp)` for judging old signatures. also the duty verifier for revocation witnesses |
| `libraries/BLS` | no | rfc 9380 hash to g2 (sha-256 xmd), g1 and g2 add, pairing check over 0x0b to 0x11 |

layers still to come: human touch attestation (p256 at 0x0100 over webauthn authenticator data), refund
rail for x402 (auth and capture escrow fork), erc-8004 adapter and the kya record.

## monad specifics

- `IStaking` mirrors docs.monad.xyz/reference/staking/api: `getValidator(uint64)` selector `0x2b6d639a`,
  `getEpoch()` selector `0x757991a8`. the precompile is CALL only, so registry views that read it are not `view`.
- bls12-381 precompiles are live on monad at fusaka addresses. foundry provides them under `evm_version = "prague"`.
- `isTrustedAt` reads history by timestamp, never `latest`, because `latest` is speculative on monad.
- one struct per operator and per agent so a status read is one storage page under mip-8.

## run

```bash
forge test
forge test --fork-url https://rpc.monad.xyz --match-contract BLSTest   # same vectors against monad's precompiles
```

## test vectors

`scripts/gen_bls_vectors.py` regenerates the bls vectors with py_ecc. the registry vectors are signed over
digests that include the registry's deployment address, which is deterministic in the test; if `setUp`
changes deployment order, rerun the probe test and regenerate:

```bash
forge test -vv --match-test test_probeAddressesForOfflineSigning
.venv/bin/python scripts/gen_bls_vectors.py <aggDigest> <statementDigest>
```

## status

week 1 of 4. local only, nothing deployed, nothing pushed.
