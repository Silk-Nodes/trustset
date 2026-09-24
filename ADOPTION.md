# who adopts this, and why not build it themselves

the honest version, written before anybody has integrated it, so it can be
checked against what actually happens.

a kill switch is worth nothing on its own. it is worth something when the
places an agent spends money check it. that makes adoption the whole product
risk, not a go-to-market afterthought, and it is the question this file exists
to answer specifically rather than optimistically.

## the shape of the problem

there are two sides and they do not want the same thing.

**the agent's owner wants the switch.** they are the one holding a key that can
trade until somebody stops it. they have every reason to register, and the cost
to them is one transaction.

**the venue does not.** it carries none of the loss when somebody else's agent
goes wrong, and integrating is work. this is the side that decides whether any
of it matters, and assuming they will adopt because it is good for the ecosystem
is exactly the assumption that kills infrastructure projects.

so the order below is deliberate. it starts with the people who already carry
the risk and ends with the ones who have to be convinced.

## 1. agent launchpads, starting with monad's own Agent Hub

monad shipped [Agent Hub](https://www.monad.xyz/announcements/introducing-monad-ai-blueprint)
in july 2026: deploy an agent in one click, with skills across uniswap, morpho,
balancer, kuru, clober, nad.fun, devfun and blinq.fi.

a one-click agent is a standing authorisation handed to somebody who did not
read what it authorises. the platform that handed it over is the party that gets
blamed the first time one of them empties a wallet, and it is the party with no
answer today beyond telling the user to move their funds.

**what they integrate:** register the agent at deploy time, one call, and put a
stop button in the dashboard they already have. the agent id is the only new
piece of state.

**why not roll their own:** because a switch Agent Hub controls is a switch its
users have to trust Agent Hub with. the entire value of the thing is that
nobody but the owner can flip it, and a platform cannot certify that about
itself. an immutable contract with no admin, no owner and no funds is a claim a
third party can verify in one `eth_getCode`, and it is not a claim you can build
in-house, because in-house is the part users are worried about.

## 2. the orderbook venues that already take agent flow

kuru and clober are in Agent Hub's skill list. hanji climbed to second by weekly
volume on monad. monday trade runs perps at up to 33x. all of them take orders
that were signed at one moment and filled at another.

that gap is the case `isTrustedAt(id, timestamp)` exists for. a venue filling an
order an hour old should judge it by what was true when it was signed, not by
what is true when it gets round to filling it, and reading `latest` on a chain
with speculative heads gets that wrong in both directions.

**what they integrate:** one view call inside the function that fills. the whole
diff is:

```solidity
if (!killSwitch.isTrustedAt(agentId, order.signedAt)) revert AgentNotTrusted(agentId);
```

**why not roll their own:** a venue that builds its own agent registry has to
get every agent operator to register with **it**. one shared switch means an
owner pauses once and every integrated venue honours it. that is n plus m
integrations instead of n times m, and the venue that builds its own is the one
paying to onboard every agent operator individually, forever.

## 3. the API Hub and anything charging agents per call

monad's [API Hub for AI agents](https://www.monad.xyz/ecosystem) launched in
september 2026, with agents paying per call in USDC.

an agent that is stopped mid-flight has money sitting in escrow for work that
will now never be delivered. somebody has to send the transaction that returns
it, and a deadline passing moves nothing on its own.

**what they integrate:** `RefundRail`, which is already built for exactly this.
authorise, capture on delivery, and once the window closes anybody at all can
call `refund(id)`, which pays the payer named in storage rather than whoever
called it.

**why not roll their own:** most people building this build capture and forget
the refund, because the refund only matters on the day something breaks. the
permissionless trigger is the part that is easy to get wrong in a way nobody
notices until a user is out of pocket and nobody has the standing to fix it.

## 4. agent frameworks, the cheapest integration in the list

there are already frameworks for building monad agents, including
[ainad](https://github.com/Techgethr/ainad). a framework is the highest leverage
place to put the check, because one merged pull request gives every agent built
on it a switch without any of those developers doing anything.

**what they integrate:** one call in whatever function the agent goes through
before it acts. `@trustset/check` is on npm, has one dependency, and needs no
keys, no accounts and no configuration.

**why not roll their own:** at this size nobody rolls their own, they just do
nothing. the competition here is not a better kill switch, it is the absence of
one.

**the honest caveat, which the docs also say:** a check inside the agent is
obedience the operator chose. it does not save anybody from an agent that has
been taken over and rewritten to skip the check. that is why the venue-side
integration matters more, and saying so is better than selling a framework
integration as protection it is not.

## 5. teams running their own treasury or ops agents

the smallest and least glamorous segment, and the one most likely to be first,
because they adopt without asking anybody's permission.

the specific thing they get is the case the passkey exists for: something is
wrong and the wallet is on a laptop in another room. a phone and a fingerprint
pause the agent, with no wallet, no seed phrase and no gas. plus guardians, so a
lost owner wallet is not a lost agent.

## why not roll your own, in general

four arguments, in the order they actually land:

**neutrality is not buildable in-house.** every other reason is negotiable. this
one is not, and it is the only reason that gets stronger the more successful the
adopter is.

**the expensive parts are the ones you would skip.** anybody can write
`mapping(uint256 => bool) paused`. what takes the time is p256 verification with
low-s normalisation and a spent nonce, a guardian threshold with a delay the
owner can cancel so recovery cannot become theft, history indexed by timestamp,
and the two ways an agent stops that need nobody to send anything at all. the
invariant suite that proves the ordering caught three real timing bugs, all
three of which passed every unit test first.

**your own switch stops at your own border.** the value is in being the same
switch everywhere.

**it costs one view call and nothing else.** no fee, no token, no upgrade key,
no api key, no dependency on us continuing to exist. the contract is immutable,
so there is nothing to be rugged by and nothing to renegotiate later.

## who will not adopt, and we should stop pretending otherwise

**agents that never check.** a switch only binds an agent that asks, or a venue
that asks for them. an autonomous agent running its own code against a venue
with no integration is not stopped by anything here. this is the real limit and
it is in `AUDIT.md` rather than buried.

**custodial products.** anything that already holds the user's keys has a stop
button: its own database. they have no problem to solve.

**venues with no agent flow yet.** correct call on their part. asking them now
wastes their time and our credibility, and the ask gets easy the week their flow
turns up.

## the path from here

ordered by cost, because the cheapest ones are also the fastest to disprove.

1. **a framework pull request.** one merge, every agent built on it inherits the
   check. the smallest ask in the list and the widest blast radius.
2. **one orderbook venue on testnet**, integrated end to end, as a worked
   reference rather than a pitch. the ask to the second venue is "here is the
   diff the first one merged".
3. **Agent Hub**, once there is a reference integration to point at. approaching
   the largest party first with nothing to show is how you get one polite no and
   no second chance.
4. **the hackathon itself.** the fastest possible first integration is another
   team here, and the sdk exists so that ask takes an afternoon of their time.

## what is actually true today

no external integrations. the live agent on testnet checks the switch every
minute and stops when told, which proves the mechanism works end to end and
proves nothing at all about whether anybody else wants it.

the sdk is published, the contract is deployed and immutable, and the erc-8004
read works in both directions so an app that knows an agent only by its identity
token can ask whether it has been switched off without knowing trustset exists.
that lowers the cost of the first integration. it does not substitute for one.
