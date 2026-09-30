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

**M2. A registration could name an owner nobody holds.** Fixed. `register`
accepted the zero address as the owner, which is an agent nobody can ever
stop, and accepted the agent's own key as its owner, which is a switch the
agent holds itself. Both now revert with `BadKeys`. Test:
`test_registerRejectsZeroAndSelfKeys`.

**M3. Anyone could register any agent address.** Fixed. The first registration of
a key won, so someone who learned an agent's address before its owner could
register it under their own wallet and lock the real owner out. `register` now
takes the agent's consent: an EIP-191 signature by the agent's key over
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

**I1. Proposing the zero address cancels a pending owner change.** Not a
bug; undocumented. `proposeRevocationKey(id, address(0))` leaves nothing to
apply. This is the cancel path and should be named as such in the page.

**I2. History is unbounded.** An owner can grow their own agent's history by
pausing and resuming, and `statusAt` scans it linearly. Only that owner's view
calls get slower. Acceptable.

**I3. Guardian lists are not deduplicated.** A duplicate address counts once,
since votes are per address. The owner or the agent address may be listed as a
guardian; harmless, and the page prevents it.

### HumanTouch

**M4. A registered agent could stamp anyone's action as "agent" first.** Fixed.
`originOf` was keyed by action hash alone. Anyone holding any registered agent's
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

No findings. Only the current owner may write, so a label follows control
when the owner changes, and the tests cover that.

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
`beat`. Both are set by the owner alone, both are off by default, and both
only ever narrow what an agent may do. Notes from reviewing them:

- **A lapsed heartbeat cannot be cleared by the agent.** `beat` reverts once the
  window has passed. If it did not, a key that went quiet because somebody else
  took it would be revived by that somebody at the moment they were ready to use
  it. Coming back is the owner's decision. Test: `test_agentCannotReviveItself`.
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

## Added after the audit: guardian recovery of an owner

Until now an owner that was lost meant losing the agent: guardians could pause
it, but nobody could replace the key, and the only ending was a stop. Guardians
can now agree on a new owner, and after `guardianRecoveryDelay` any of them
may execute it. Notes from designing it:

- **It is for a key that was lost, not one that was stolen.** The current owner
  can cancel any recovery, so a thief holding it cancels every attempt
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
- **Executing clears the old owner's pending handover.** Otherwise an owner
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
token, and it is not built in the contract. since sdk 0.3.0, `from8004` checks
it from the other side instead: the token must be held by the agent's owner on
the switch or by the agent's own address, and anything else is refused, so a
pointer can no longer borrow a stranger's trusted agent.

## what the invariant suite does not reach

`test/Invariants.t.sol` is the strongest evidence in this repo, so it is worth saying where it
stops.

it cannot forge a webauthn assertion, so `pauseWithPasskey` is never called in a fuzz run and no
invariant there can fail. an invariant asserting the stop key nonce only rises was written, proved
vacuous by deleting the `nonce++` from the contract and watching it stay green, and removed.
`Panic.t.sol` covers that path with real signed vectors instead.

two design choices in the handler bound what the fuzzer explores. it drives three agents with a
fixed set of five actors, so nothing is said about many agents, many guardians, or a guardian who
is also an agent address. and reaching a guardian agreement plus its delay is too unlikely to be found
by a uniform fuzzer, so the handler offers those sequences as single actions. every call inside
them goes through the real contract with real authorisation and the threshold is counted rather
than assumed, but the fuzzer is being helped to the door rather than finding it.

the run is 256 sequences of 500 calls. absence of a counterexample there is not proof.
## second review, 2026-09-29: known limits of the live deployment

a second pass, this time multi-agent: five hunters, one per area, each finding
attacked by three independent skeptics (reachability, a proof of concept in a
scratch copy, and intent against these docs), kept only when two of three
could not refute it. the off-chain findings are fixed in the web app, the
indexer, the sdk and the scripts. the contract findings below are not: fixing
them means new contracts, new addresses and every live agent registered again,
which is not worth the risk this close to submission. they are listed with
what already softens each one and the change a redeploy would carry.

### KillSwitch

**K1. the agent's consent does not cover its guardians.** `registrationDigest`
binds the switch, the chain, the agent address and the owner, not the
guardians, the threshold or the limits. whoever sees a signed registration in
the mempool can resend it with their own guardian, and with guardian recovery
that guardian can later propose itself as owner. softened: the owner sees the
guardians on the agent page and, since this review, a banner with a cancel
button whenever a recovery is open. fix: add the guardians, threshold and
limits to the digest, or require the owner to send a signed registration.

**K2. one guardian can keep resetting an agreed recovery.** `proposeRecovery`
with a different key wipes the votes and the clock, even after the threshold
was reached, so a single guardian can stop a lost-key recovery from ever
completing. fix: refuse a new key while one is pending, or count votes per key.

**K3. a matured recovery survives an owner handover.** a recovery that became
executable before `applyRevocationKey` can be executed in the same block as the
handover, so a seller's guardians take the agent back and the buyer never gets
a cancel window. fix: clear any open recovery in `applyRevocationKey`.

**K4. a thief with the owner key can undo the guardians.** a guardian pause is
cleared by any owner status change, so a stolen owner key re-pauses (which
clears `guardianPaused` and restarts the escalation clock) and then resumes.
the documented answer to a stolen owner key only works against an owner who
does nothing. fix: while a guardian pause stands, the owner can stop but not
resume, until the delay passes or the guardians agree.

**K5. same-second blocks.** monad makes several blocks a second and the history
records seconds. `statusAt` returns the last change in a second, so a statement
that was true early in a second can read as contradicted after a later change in
the same second, and an order signed in the gap can verify. softened: the sdk
now only believes a signed time inside a window before the venue saw it. fix:
record the block number with each change and answer by block.

**K6. the agent address can be its own guardian, or its own owner through a
handover.** `_register` rejects it as owner but not as guardian, and
`proposeRevocationKey` does not reject it at all. with a threshold of one, the
agent key alone could then take the owner. fix: reject the agent key in both.

**K7. smaller ones.** `liveness()` reverts for a heartbeat window near
2^64 (uint64 overflow; `isTrusted` is unaffected). `rotate` accepts a successor
that is active but expired or silent. `beat()` still works on a paused,
stopped or rotated agent and emits a beat for it. an unspent panic assertion
does not expire: it survives a pause and resume and a re-nomination of the same
passkey, so a relay that holds one back can use it later. fixes: compute in
uint256, require a trusted successor, beat only when active, and bind the
panic challenge to the status history length.

**K8. practice agents made before 2026-09-30 keep a guardian anyone can
compute.** the /demo guardian was derived from a public string and the owner's
address, so its key could be worked out by anybody, who could then vote to
pause, or escalate to stop, that visitor's practice agent. guardians cannot be
changed on chain, so those agents keep it. they hold a few testnet MON and
nothing else, and their owner can resume a pause at once. practice agents made
since then get a guardian derived with a server secret. the fleet agents
registered from `script/` the same way were revoked on 2026-09-30.

### HumanTouch

**H1. "human" means holder of a passkey the account registered.** any address,
an agent included, can register a P256 key it holds in memory and assert with
the user-verified flag set, so the result proves a key, not a person. the page
says what it proves; the contract name oversells it. fix: refuse accounts that
are registered agent addresses, and verify an attestation for a real claim.

### RefundRail

**R1. the payer is trusted for settlement.** the service is paid only on a
receipt the payer releases or signs, so a payer can take the service and let
the window run out. this is the design, stated plainly now in the faq: the
rail protects the payer, not the service.

### OperatorRegistry and BLS (not in the product, not deployed as part of it)

no proof of possession at registration, so a rogue key can make an aggregate
verify for operators who never signed; no identity or subgroup check on keys;
one auth address with two operators overwrites the first and locks its bond;
`verifyAggregate` and `slash` use different digests, so an aggregate cannot be
slashed; digests carry no chain id; the reward goes to whoever sends the slash
first; the bitmap addresses 256 operators. all are fixes for the day this is
wired into anything: a proof of possession, subgroup checks, one digest with
the chain id, and a commit before a slash.
