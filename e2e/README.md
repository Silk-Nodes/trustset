# end to end tests

```bash
cd e2e && npm install
npm run e2e          # the owner flow on a local chain, the api guards, the off-chain services
npm run e2e:live     # read only checks against the deployed site
```

**local**: a fresh anvil on a free port, the contracts from `script/Demo.s.sol`,
and the site on another free port pointed at it, with its own build directory.
It walks the owner's console the way a person does (the list, a tap to pause
and back, set both keeping the end date, escape cancelling a hold to stop, an
unbroken hold stopping for good, registering an agent with its consent and a
guardian, a guardian's pause showing as a trip) and checks the contract after
each step. Anvil's published test keys only.

**api**: the guards on every route that signs or sends, against the same local
server. Nothing is sent.

**live**: every public page answers with no console errors and nothing blocked
by the security policy; at 393, 768 and 1400 in both themes there is no
sideways scroll, no button label broken over two lines and no text under 4.5:1;
the explorer's verdict matches the chain for a trusted, a stopped and a lapsed
agent. `E2E_LIVE_URL` points it elsewhere.

**services**: the real indexer and keeper against mock chains that misbehave
on purpose, with a throwaway postgres (skipped if postgres is not installed).

Needs foundry (anvil, forge) and Google Chrome. `PW_EXE` points Playwright at
another browser binary instead.
