# Contract audit, 2026-09-16

Scope: every contract in `src/`. KillSwitch, HumanTouch, WebAuthn, AgentLabels,
RefundRail, the demo Counterparty, and the out-of-product OperatorRegistry and
BLS. Read in full, line by line. Findings are listed by severity. Every finding
marked fixed has a test named beside it in the suite. 94 tests pass after the
fixes; 11 of them are new.

This is a self review by the author, on testnet code, before any outside
audit. It is not a substitute for one.

## Findings

### KillSwitch

**M1. An owner's own pause could be escalated to a revoke by a guardian.** Fixed.
`guardianEscalate` checked only that the agent was paused and that three days
had passed. It did not check who paused it. An owner who paused their own agent
for a week would have found it permanently revoked by any guardian on day
three. A `guardianPaused` flag is set only when a guardian vote reaches the
threshold, cleared on every other status change, and required by escalation.
Tests: `test_ownerPauseCannotBeEscalated`, `test_ownerResumeClearsGuardianPauseFlag`,
`test_guardianPauseEscalatesAfterDelay`.

**M2. A registration could name a cold key nobody holds.** Fixed. `register`
accepted the zero address as the cold key, which is an agent nobody can ever
stop, and accepted the agent's own key as its cold key, which is a switch the
agent holds itself. Both now revert with `BadKeys`. Test:
`test_registerRejectsZeroAndSelfKeys`.

**M3. Anyone could register any agent key.** Fixed. The first registration of
a key won, so someone who learned an agent's address before its owner could
register it under their own cold key and lock the owner out. `register` now
takes the agent key's consent: an EIP-191 signature by the agent key over
`registrationDigest(agentKey, revocationKey)`, bound to the switch's address
and the chain, or the agent registers itself as the caller. The page signs the
consent for a generated key and asks for it when a key is pasted. Tests:
`test_registerWithoutConsentReverts`, `test_agentRegistersItselfWithoutSignature`,
`test_consentIsBoundToChain`.

**L1. Guardian votes never expired.** Fixed. A vote cast a year ago in an
unresolved round still counted toward a pause today, across any number of
owner pauses and resumes in between. Every status change now closes the
current vote round. Test: `test_staleVoteDoesNotCount`.

**L2. A successor could be somebody else's agent.** Fixed. `rotate` required the
successor to be active but not to be the same owner's, so "trust moved to X"
could point at an agent the owner did not control. The successor must now
belong to the caller. Test: `test_rotateRequiresOwnSuccessor`.

**I1. Proposing the zero address cancels a pending cold key change.** Not a
bug; undocumented. `proposeRevocationKey(id, address(0))` leaves nothing to
apply. This is the cancel path and should be named as such in the page.

**I2. History is unbounded.** An owner can grow their own agent's history by
pausing and resuming, and `statusAt` scans it linearly. Only that owner's view
calls get slower. Acceptable.

**I3. Guardian lists are not deduplicated.** A duplicate address counts once,
since votes are per address. The cold key or the agent key may be listed as a
guardian; harmless, and the page prevents it.

### HumanTouch

**M4. A registered agent key could stamp anyone's action as "agent" first.** Fixed.
`originOf` was keyed by action hash alone. Anyone holding any registered agent
key could call `attestAgent(txHash)` on somebody else's stop transaction before
the human proof, and the proof would then revert `AlreadyAttested`. Origin is
now keyed by account and action hash together, so an agent can only speak for
its own address. `originOf(account, actionHash)` replaces `originOf(actionHash)`;
`accountOf` is gone. Test: `test_agentCannotBlockAnotherAccountsAction`.

**L3. The passkey challenge had no chain id.** Fixed. A contract deployed to the
same address on another chain would have accepted the same assertion. The
challenge is now `keccak256(this, chainid, account, actionHash)`. The WebAuthn
test vectors were regenerated for it. Test: `test_challengeCarriesChainId`.

**I4. `registerPasskey` overwrites freely.** Only the account's own key, so this
is a feature: a new device replaces the old. No on-curve check on (x, y); a
bad key simply never verifies.

### WebAuthn

No findings. The substring checks for `"type":"webauthn.get"` and the
base64url challenge are the same shape as the widely used implementations,
and the assertion's own signature covers the whole client data. High-s is
rejected. An absent precompile or a bad signature both come back as empty
output and are treated as false.

### RefundRail

**M5. A fee-on-transfer token would have locked funds forever.** Fixed. The rail
recorded the amount asked for, not the amount received. With a token that takes
a fee on transfer it held less than it recorded, so both settle and refund
would revert on payout and the money would never leave. The rail now measures
its balance before and after the pull and holds what actually arrived. Test:
`test_feeOnTransferTokenHoldsWhatArrived`.

**I5. A refund at the deadline can beat a late receipt.** By design: the window
is the service's, and after it closes anyone may send the money home even if
the service is about to settle. Documented on the page.

**I6. A payer that is a contract refusing native transfers cannot be refunded.**
Their own choice of address; the rail cannot fix it. Services that refuse are
handled: the payer refunds after the window.

### AgentLabels

No findings. Only the current cold key may write, so a label follows control
when the cold key changes, and the tests cover that.

### Counterparty

Demo only. Checks the caller is the agent's key and that the switch says
active, in one call, which is the pattern the landing page shows.

### OperatorRegistry and BLS (not in the product)

**M6. Self-slash was an instant exit.** Fixed. The whole bond went to the
challenger, so an operator could sign a deliberately false statement, slash
itself from a second address, and recover its bond at once instead of waiting
out the exit delay. Half the bond now goes to the challenger and half is
burned, so a slash always costs. Still not deployed and not wired to anything.
Test: `test_slashOnContradictedStatement`.

No other findings. Aggregate verification requires every signer in the bitmap
to be active, which is strict and correct.

## What changed on the page

The HumanTouch fix changes two things the site uses: the challenge now
includes the chain id, so the browser derives it with the chain id too, and
`originOf` takes the account as well as the action hash. Both are one-line
changes and land with the redeploy.

## Added after the audit: expiry and heartbeat

Two ways for trust to end with nobody sending a transaction. `expiresAt` is a
timestamp after which `isTrusted` is false; `heartbeatWindow` is how long the
agent may go silent before the same happens, refreshed by the agent calling
`beat`. Both are set by the cold key alone, both are off by default, and both
only ever narrow what an agent may do. Notes from reviewing them:

- **A lapsed heartbeat cannot be cleared by the agent.** `beat` reverts once the
  window has passed. If it did not, a key that went quiet because somebody else
  took it would be revived by that somebody at the moment they were ready to use
  it. Coming back is the cold key's decision. Test: `test_agentCannotReviveItself`.
- **Resuming a paused agent starts a fresh window.** Otherwise an agent paused
  for a week with a one day window would be lapsed the instant it was resumed,
  and the owner would have no way to resume it at all. Test:
  `test_resumeStartsAFreshWindow`. Resuming does not move an end date, which is
  an absolute time and not a duration. Test: `test_pausedAndExpiredStaysUntrustedOnResume`.
- **An end date in the past is refused** at registration and at `setLimits`,
  because it registers an agent that is born untrusted and is almost always a
  units mistake. Test: `test_expiryInThePastRejected`.
- **The agent's consent signature covers the keys, not the limits.** A registrar
  who adds a limit the agent did not ask for can only give it less authority, so
  the digest was left alone rather than made incompatible with what is deployed.
- **`isTrustedAt` checks the expiry against the current end date**, because only
  the current one is stored. Moving the end date therefore changes the answer
  about the past, the same as any read of current state. The heartbeat is not
  checked historically at all: no record of past beats is kept, and liveness is
  a claim about now. Both are stated in the contract's own comments so nobody
  reads more into that view than it can carry.
- **The status is untouched by either limit.** An expired agent is still Active
  in the contract and simply not trusted, so the page has to say so itself
  rather than reading the status word. Test: `test_expiredAgentIsStillActive`.

20 tests cover these, in `test/Limits.t.sol`. 114 pass in total.

## Added after the audit: guardian recovery of a cold key

Until now a cold key that was lost meant losing the agent: guardians could pause
it, but nobody could replace the key, and the only ending was a stop. Guardians
can now agree on a new cold key, and after `guardianRecoveryDelay` any of them
may execute it. Notes from designing it:

- **It is for a key that was lost, not one that was stolen.** The current cold
  key can cancel any recovery, so a thief holding it cancels every attempt
  forever. That is deliberate: the alternative, a recovery the owner cannot
  refuse, lets a threshold of guardians take an agent from an owner who is
  standing right there. For a stolen key the answer is the path that already
  existed, pause and then escalate, which ends the agent rather than handing it
  to anybody. Test: `test_aStolenColdKeyCancelsForever` walks both halves.
- **Cancelling clears the votes.** The round moves on, so a guardian who still
  wants the change has to say so again and an old vote cannot be carried into a
  later attempt. Test: `test_votesDoNotSurviveACancel`.
- **Guardians naming different keys are not agreeing.** Naming a new key starts
  a fresh round rather than accumulating votes across targets, which would let
  two guardians who want different things add up to a threshold. Test:
  `test_namingADifferentKeyStartsOver`.
- **Executing clears the old owner's pending handover.** Otherwise a cold key
  change the previous owner proposed before losing the agent would land
  afterwards and take it straight back out. Test:
  `test_recoveryKillsTheOldOwnersPendingHandover`.
- **The new key gets the same checks a registration makes:** not zero, not the
  agent's own key, and not the key that already holds it.
- **An agent with no guardians cannot be recovered.** That is the owner's choice
  at registration and the contract does not second-guess it.

15 tests cover this, in `test/Recovery.t.sol`. 139 pass in total.

## Redeployed

Twice on 2026-09-16. First for the audit fixes, then again for the limits above.
The current deployment is kill switch
`0x264a36Afd412Ac32352d0Cd399768c5e9ddD8315`, human touch
`0xB39Fc533A33218d275E68c79EAc5A1bBD348aDC1`, labels
`0xdEa1fCfb49C2b9FC605a9E4d133594C6d6DA5687`, example counterparty
`0x12535799A3b0e54162716ED1aFa2E1cc64b856cd`. The refund rail
`0xf8E44F08263fFB04660483Af44b70E1b25347748` and its mock dollar do not read the
switch, so they were not redeployed. The guardian escalation delay on
this deployment is ten minutes rather than three days, so the escalation path
can be exercised on a testnet. The previous contracts are abandoned with their
state.

## the erc-8004 pointer is one directional

`from8004` reads a `trustset` metadata key off an ERC-8004 identity and follows
it to an agent on this switch. the pointer is checked for the chain and the
switch it names, and refused when either is somebody else's.

what is not checked, because it cannot be: the switch does not record which
8004 token claims which agent, so anybody may publish a pointer at an agent
whose owner never agreed to it. the answer that comes back is still about the
agent that was named, so a false pointer misreports whose agent it is, never
whether that agent may act. an app that cares about ownership has to establish
it some other way, and should not read a working `from8004` as proof of it.

the reverse binding would need a claim on this side too, agent owner names
token, and it is not built.
