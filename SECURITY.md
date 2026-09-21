# security policy

## the short version

this is **testnet software, and it is unaudited**. do not put money behind it
that you would miss. there is no bug bounty, and this file does not pretend
there is one.

if you find something, open a
[private security advisory](https://github.com/Silk-Nodes/trustset/security/advisories/new)
on this repository. that route reaches us without the finding becoming public
first, and it needs no email address from either of us.

## the thing worth knowing before you report

**`KillSwitch` is immutable.** it has no admin, no owner, no pause and no
upgrade path, which is the property the whole project rests on: nobody can flip
your switch, including us.

the cost of that property is the thing a researcher should understand up front.
**a bug in the deployed contract cannot be patched.** there is no proxy to
upgrade and no admin key to intervene with. the only response to a critical
finding is to deploy a new contract and ask everybody to move to it, which is
slow, public and visible to anybody watching the chain.

so a report here does not lead to a quiet fix. it leads to a migration, or to
the finding being written into [`AUDIT.md`](AUDIT.md) as a limit people have to
know about. both are better than the alternative, but neither is fast, and it
is worth knowing that before deciding how to disclose.

## please read AUDIT.md first

[`AUDIT.md`](AUDIT.md) already records what each piece does not protect against,
including the limits found after the audit and the ones the invariant suite
does not reach. the biggest one is stated in the readme too: **a switch only
binds an agent that checks it, or a venue that checks it for them.** an agent
that never asks is not stopped by anything here. that is a design boundary
rather than a vulnerability, and a report that restates it will be pointed back
at this paragraph.

the erc-8004 pointer being one directional, `isTrustedAt` checking expiry
against the agent's current end date, and the heartbeat not forming part of the
historical answer are all recorded there as well.

## in scope

- the contracts in `src/`, deployed at the addresses in
  [`deployments/monad-testnet.json`](deployments/monad-testnet.json)
- `libraries/WebAuthn`, especially the p256 verification, the low-s
  normalisation and the nonce that makes an assertion good exactly once
- `libraries/BLS`
- the `@trustset/check` package on npm
- the site at trustset.silknodes.io, including the relayer that carries passkey
  assertions and pays for them

## out of scope

- **the demo payer key.** the walkthrough funds a shared agent so a visitor with
  no wallet can finish it. that key is testnet only, holds a small float, and
  draining it breaks the demo and nothing else. it is a cost, not a
  vulnerability, and it is deliberate.
- anvil's published default keys, used by `scripts/demo.sh`
- `OperatorRegistry`, which is in the repository and out of the product
- rate limits, missing security headers and similar findings on the site that do
  not lead to an agent's status being wrong

## what to expect

we are one operator, not a security team. you will get a human reply, usually
within a few days. if a finding is real we will say so plainly, write it into
`AUDIT.md`, and credit you unless you would rather we did not.

## what we already do

- the testnet deployer key is generated locally into a gitignored file and has
  never been anywhere else. `cache/` and `broadcast/` are gitignored too, so
  foundry's own sensitive-values file is never committed
- every key the services use is generated on the machine that runs them, mode
  600, outside the checkout, and read from the environment
- no address, host or port is in the source. a missing variable is logged by
  name and the service degrades visibly rather than substituting a default
- the console never handles a connected wallet's private key
- `test/Invariants.t.sol` runs 128,000 fuzzed calls per run against eleven
  properties, and each was verified by deleting the guard it depends on and
  confirming the suite goes red
