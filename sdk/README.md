# @trustset/check

Ask the trustset switch whether an agent may act, before you act for it.

```bash
npm i @trustset/check ethers
```

```js
import { client } from "@trustset/check";

const trustset = client();                  // Monad testnet by default

if (await trustset.isTrusted(7)) {
  await placeTheTrade();
}
```

That is the whole integration. One view call, no keys, no accounts, nothing to
sync. The same call works from two places and they are not equally strong:

**Inside your agent**, before it acts. Your agent obeys its own switch with
nobody else's cooperation. It does not save you from an agent that has been
taken over and rewritten, and you should not pretend otherwise.

**Inside a venue's own function**, before it acts for somebody else's agent.
Now the obedience is compulsory, and nothing upstream can skip it.

## Why an agent would go quiet

```js
await trustset.why(7);        // "trusted" | "expired" | "silent" | "paused" | "stopped"
await trustset.limits(7);     // { expiresAt, nextBeatBy, ... }
```

An agent can stop being trusted without anybody sending a transaction: its end
date passes, or it misses its heartbeat. `isTrusted` already accounts for both,
so checking it is enough; `why` is for the log line a person will read later.

## Orders signed off chain

A venue that settles on chain asks `isTrusted` and is done. A venue that takes
**signed orders off chain** cannot: the question is not whether the agent is
trusted now, it is whether it was trusted at the moment it signed. A stop at
14:32 must not void an order signed at 14:30, and must void one signed at 14:35.

```js
const { ok, agentId, signer, reason } = await trustset.verifySigned({
  message: order,          // exactly what the agent signed
  signature: order.sig,
  when: order.signedAt,    // seconds, or ms, or a Date
});
```

It verifies the signature, resolves the key to an agent, and asks the switch
whether that agent was trusted then. Run against a real agent on testnet, either
side of a stop:

```
order signed BEFORE the stop: HONOURED · trusted when it signed
order signed AFTER the stop:  refused · agent 2 was paused at that moment
```

`when` should come from the order itself, and a venue should refuse a timestamp
it did not see. Nothing here can tell you whether a claimed time is true; it can
only tell you what the switch said at that time.

**Two limits, stated rather than hidden.** An end date is checked against the
agent's *current* end date, because only the current one is stored, so moving
the date changes the answer about the past. And a heartbeat cannot be judged
historically at all: no record of past beats is kept, so a lapse does not show
up here. Both are in AUDIT.md.

```js
await trustset.trustedAt(7, Date.now() - 3600_000);   // an hour ago
await trustset.history(7);                            // every status change, oldest first
```

## Keeping a heartbeat

```js
await trustset.beat(7, wallet);   // only the agent key, only inside its window
```

Once the window has passed the agent cannot revive itself, by design: a key
that went quiet because somebody else took it must not be brought back by that
somebody. Only the cold key starts a new window.

## Another chain, another deployment

```js
client({ rpc: "...", killSwitch: "0x..." });
```

Contracts, addresses and the audit: https://github.com/silk-nodes/trustset
