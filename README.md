# trustset

an on-chain off switch for ai agents, on monad.

an agent with a key can trade, pay and sign for as long as it runs. trustset gives the person who
owns it one place to say stop, and gives every app the agent talks to one call to check before it
acts. pausing is reversible, stopping for good is not, and both land in the next block.

built for monad metropolis, track 04: trust, identity and ai infrastructure.

- live: https://trustset.silknodes.io
- chain: monad testnet, chain id 10143
- switch: [`0x54D8211233Cc65b62C594cBAb900930dd37ED3b8`](https://testnet.monadexplorer.com/address/0x54D8211233Cc65b62C594cBAb900930dd37ED3b8)

## check an agent

```bash
npm i @trustset/check ethers
```

```js
import { client } from "@trustset/check";

const trustset = client();            // monad testnet, the address above, by default

if (await trustset.isTrusted(7)) {
  await placeTheTrade();
}
```

that is the whole integration. one view call, no keys, no accounts, nothing to sync. the same call
works from two places and they are not equally strong. inside your own agent it is obedience you
chose, and it does not save you from an agent that has been taken over and rewritten. inside a
venue's own function it is compulsory, and nothing upstream can skip it. `sdk/README.md` is honest
about which you are getting.

## the four ways an agent stops

two of them need somebody to send a transaction and two do not.

| | who | reversible |
| --- | --- | --- |
| pause | the cold key, or a nominated passkey | yes |
| stop for good | the cold key | no, revoked is terminal |
| the end date passes | nobody, it is a timestamp | only by moving the date |
| a heartbeat is missed | nobody, the agent stopped calling `beat()` | yes, by beating again |

the last two matter more than they look. an agent that is compromised, wedged or simply forgotten
goes quiet on its own, without anybody noticing in time to act. `isTrusted` already accounts for
all four, so checking it is enough; `why()` returns the word a person will read in a log later.

## pausing with a fingerprint

the case this exists for: something is wrong and the wallet is on a laptop in another room. a phone
and a fingerprint pause the agent instead.

the owner nominates a passkey from `/passkey`. the private half is created inside the device and
never leaves it; what goes on chain is the public p256 point and the sha256 of the site it is bound
to. afterwards anyone holding that device can pause the agent from `/panic` with no wallet, no seed
phrase and no gas: a relayer carries the assertion and pays, which is safe because the assertion is
the authority and a relayer can forge none of it.

the contract verifies the signature itself through the p256 precompile at `0x0100`, requires the
device to have verified a person rather than just felt a touch, and spends a nonce so an assertion
is good exactly once. a passkey can pause and nothing else: it cannot resume, end, relimit or
rekey. so a stolen phone costs its owner an interruption.

proved on testnet: [`0x391f1ad4…237f34b6`](https://testnet.monadexplorer.com/tx/0x391f1ad46bece914fd739e6e06fc4c1ce17a3f9bddd7f26906b26761237f34b6)
paused agent 7 from a phone, with `keccak("paused with a passkey")` as the recorded reason.

## losing the cold key

guardians the owner named can vote to move an agent to a new key. the vote needs a threshold, then
waits out a delay during which the real cold key can cancel it with one call. so guardians cannot
take an agent quietly, and the owner does not lose one to a lost key.

## reading the past

`isTrustedAt(id, timestamp)` answers whether an agent was trusted at a moment, not just now. that
is what lets an app judge an order it received an hour ago by what was true when it was signed
rather than by what is true when it gets around to filling it. `verifySigned()` in the sdk does the
whole thing: recover the signer, find its agent, ask the switch about that moment.

## erc-8004

the trustless agents registries are live on monad testnet. the live agent holds identity token
**1873**, and its registration points back at this switch. the registry has no revocation primitive
of its own, only an `active` flag in an off-chain json, which is the gap this fills.

the pointer is read in both directions, and the second one is the useful one. an app that knows an
agent only by its 8004 identity can ask whether that agent has been switched off, without knowing
trustset exists beforehand and without asking any server of ours:

```bash
npx @trustset/check --erc8004 1873
```

```
erc-8004 agent 1873 points at trustset agent 7 on chain 10143.

agent 7  REFUSED
  why        paused, paused by its owner, and may come back
```

two view calls against two public contracts. the pointer is the token owner's claim, so it is
checked for the chain and the switch it names rather than believed. what cannot be checked is the
reverse binding, and `AUDIT.md` says so plainly.

## contracts

| contract | holds funds | what it does |
| --- | --- | --- |
| `KillSwitch` | no | the whole product. per agent: hot key, cold key with a change delay, guardians, expiry, heartbeat, passkey, status with history. `isTrustedAt(id, at)` for judging old signatures |
| `AgentLabels` | no | a human name for an agent id, set by its cold key |
| `HumanTouch` | no | webauthn assertions as general proof a person was present, beyond the panic button |
| `RefundRail` | escrow | authorise and capture for x402 style payments, so a stopped agent's in-flight money can come back |
| `OperatorRegistry` | operator bonds | validators opting in as trust operators, bls aggregate statements, slashing on a contradiction. the original direction, kept because it works and the bls library is tested against monad's own precompiles |
| `libraries/WebAuthn` | no | authenticator data, client data and low-s normalisation over the p256 precompile at `0x0100` |
| `libraries/BLS` | no | rfc 9380 hash to g2, g1 and g2 add, pairing check |

## the rest of it

- `sdk/` the npm package apps integrate, `@trustset/check`
- `agent/` a real agent on testnet: it checks the switch every minute, trades every hour, and stops when told
- `indexer/` walks the chain into postgres, around monad's 100 block log cap, so the explorer is log derived rather than trusted
- `web/` the site: the landing page, the explorer, the `/demo` walkthrough, `/panic` and `/passkey`

## monad specifics

- monad charges the **gas limit, not the gas used**, so every transaction the agent and the site
  send estimates first and pads, rather than guessing high
- `eth_getLogs` is capped at 100 blocks and 15 requests per second per address; the indexer is
  built around both
- execution is asynchronous, so the `finalized` tag can name a block that has not executed. reads
  go to finalised minus four
- `isTrustedAt` reads history by timestamp and never `latest`, because `latest` is speculative
- one struct per agent, so a status read is one storage page under mip-8
- the staking precompile at `0x1000` has no code on testnet, which is why `OperatorRegistry` is not
  part of the deployed path

## run

```bash
forge test                  # 139 passing, 1 skipped
scripts/demo.sh             # anvil, contracts, a venue, and a browser demo on 127.0.0.1:8787
```

## honest limits

`AUDIT.md` is the part worth reading if you are deciding whether to trust this. it says what each
piece does not protect against, including the one that matters most: a switch only binds an agent
that checks it, or a venue that checks it for them.
