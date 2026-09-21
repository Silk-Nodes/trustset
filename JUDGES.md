# for judges

everything below works with **no wallet, no testnet MON and no sign-up**. there
are no test credentials to hand out because nothing here asks you to log in.

live: **https://trustset.silknodes.io**
chain: monad testnet, chain id 10143

## the sixty second version

```bash
npx @trustset/check 7
```

that reads the switch on monad testnet and prints whether agent 7 may act. no
keys, no accounts, no config. it is the whole integration, and it is the same
call an app makes.

## the three minute version, in a browser

open **https://trustset.silknodes.io/demo** and work down the page. you do not
need to connect anything: while no wallet is connected the walkthrough uses a
real agent on testnet that our server owns and pays gas for, and the page says
so rather than hiding it.

you will, in order:

1. watch a real agent trade against a venue contract on monad testnet
2. press stop, which sends a real transaction
3. watch the same venue refuse the agent's very next trade, in its own call
4. see a guardian vote land, and the agent come back

every step links the transaction on the explorer. nothing is simulated, and
nothing in the path is ours except the page you are reading.

**if you would rather use your own wallet**, connect one and the page registers
an agent whose cold key is your address, so the stop is signed by you. that
needs a little testnet MON for gas, from
[the official faucet](https://faucet.monad.xyz) or
[Alchemy's](https://www.alchemy.com/faucets/monad-testnet). it is the same
walkthrough either way, so skip it unless you want to sign.

## the panic button, if you have a phone

**https://trustset.silknodes.io/passkey** nominates a passkey as an agent's
panic button, and **/panic** uses it. the private half never leaves your
device; what goes on chain is the public p256 point and the hash of the site
it is bound to. pausing from the phone needs no wallet, no seed phrase and no
gas, because a relayer carries the assertion and the contract verifies it
through monad's p256 precompile at `0x0100`.

already proved on testnet, if you would rather read it than do it:
[`0x391f1ad4…237f34b6`](https://testnet.monadexplorer.com/tx/0x391f1ad46bece914fd739e6e06fc4c1ce17a3f9bddd7f26906b26761237f34b6)

## what to check if you do not trust the page

the point of this project is that none of it needs believing. every claim has
an address behind it.

| | |
| --- | --- |
| the switch, the contract an app reads | [`0x54D8211233Cc65b62C594cBAb900930dd37ED3b8`](https://testnet.monadexplorer.com/address/0x54D8211233Cc65b62C594cBAb900930dd37ED3b8) |
| human touch, passkey assertions | [`0x059563eb1dC1BBd7a8261309E92063A3f41AAda0`](https://testnet.monadexplorer.com/address/0x059563eb1dC1BBd7a8261309E92063A3f41AAda0) |
| refund rail, escrow for agent payments | [`0xf8E44F08263fFB04660483Af44b70E1b25347748`](https://testnet.monadexplorer.com/address/0xf8E44F08263fFB04660483Af44b70E1b25347748) |
| agent labels | [`0x1fc5CF0a5bD938cc36EcE4ca34F2279e0e5b5f0f`](https://testnet.monadexplorer.com/address/0x1fc5CF0a5bD938cc36EcE4ca34F2279e0e5b5f0f) |
| the venue the walkthrough trades against | [`0x532cC6c80B4a55249131d3790dF8B79D896Ba145`](https://testnet.monadexplorer.com/address/0x532cC6c80B4a55249131d3790dF8B79D896Ba145) |

`KillSwitch` is immutable. it has no admin, no owner and no upgrade path, and
it holds no funds. there is no key we could be asked for and no switch we could
flip. you can confirm that from the verified source at the address above rather
than from this sentence.

**https://trustset.silknodes.io/explorer** is built from chain logs only, so it
cannot show you anything the chain did not say.

## running it yourself

```bash
git clone https://github.com/Silk-Nodes/trustset && cd trustset
forge test
```

141 passing, 1 skipped. forge-std is vendored, so there is no submodule step.
`test/Invariants.t.sol` is the one worth looking at: 128,000 fuzzed calls per
run asserting eleven properties, and each was checked by deleting the guard it
depends on and confirming the suite goes red.

```bash
scripts/demo.sh
```

brings up anvil, the contracts, a venue and a browser demo on 127.0.0.1:8787,
with no network needed at all.

## what is honestly not true yet

- **testnet, and no third-party audit.** every contract was read line by line
  and the findings are in [`AUDIT.md`](AUDIT.md), each fix with its test named
  beside it. that is a self review by the author, not a substitute for an
  outside one. do not put real money behind it.
- **a switch only binds an agent that checks it, or a venue that checks it for
  them.** an agent that never asks is not stopped by anything here. this is the
  real limit and [`AUDIT.md`](AUDIT.md) leads with it rather than burying it.
- **no external integrations.** the live agent obeys the switch, which proves
  the mechanism and proves nothing about whether anybody else wants it.
  [`ADOPTION.md`](ADOPTION.md) says who we think would, and why, and names the
  people who would not.

## if something is broken while you are looking

the live agent keeps a heartbeat, and a watchdog restarts it and alerts us if
it stops. if `npx @trustset/check 7` ever says `NOT TRUSTED` with the reason
`lapsed`, that is our process being down rather than the product misbehaving,
and the demo above is unaffected because it uses its own agent.
