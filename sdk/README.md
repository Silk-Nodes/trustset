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
