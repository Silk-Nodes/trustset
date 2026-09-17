-- trustset index: what the switch has done, kept so a browser can read it.
--
-- monad caps eth_getLogs at a hundred blocks, so after an hour of chain no
-- browser can reconstruct an agent's history by itself. this is that history,
-- written once by a service that walks the chain in windows and read by the
-- explorer in one query.
--
-- every row here comes from a log. nothing is inferred, nothing is recorded by
-- our own servers, and a refused trade is deliberately absent: it is a reverted
-- transaction, which emits no logs at all, and no index built this way can
-- honestly claim to have seen one.

CREATE TABLE IF NOT EXISTS cursor (
  name  text PRIMARY KEY,
  block bigint NOT NULL
);

-- the feed. append only, and unique on its position in the chain, so a restart
-- or a re-run of any window cannot count anything twice.
CREATE TABLE IF NOT EXISTS events (
  id        bigserial PRIMARY KEY,
  block     bigint      NOT NULL,
  tx_hash   text        NOT NULL,
  log_index int         NOT NULL,
  at        timestamptz NOT NULL,
  kind      text        NOT NULL,
  agent_id  bigint,
  actor     text,
  data      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS events_block_desc ON events (block DESC, log_index DESC);
CREATE INDEX IF NOT EXISTS events_agent      ON events (agent_id, block DESC);
CREATE INDEX IF NOT EXISTS events_kind       ON events (kind, block DESC);

-- current state per agent, folded from the same events. a list of five hundred
-- agents is one query rather than five hundred.
CREATE TABLE IF NOT EXISTS agents (
  id               bigint PRIMARY KEY,
  agent_key        text NOT NULL,
  cold_key         text NOT NULL,
  guardians        text[] NOT NULL DEFAULT '{}',
  threshold        int    NOT NULL DEFAULT 0,
  status           text   NOT NULL,
  status_block     bigint NOT NULL,
  status_at        timestamptz NOT NULL,
  registered_block bigint NOT NULL,
  registered_at    timestamptz NOT NULL,
  registered_tx    text   NOT NULL,
  successor_id     bigint,
  expires_at       bigint NOT NULL DEFAULT 0,
  heartbeat_window bigint NOT NULL DEFAULT 0,
  last_beat        bigint NOT NULL DEFAULT 0,
  name             text,
  purpose          text,
  labelled_at      timestamptz
);
/* the ERC-8004 token that claims this agent, when one has published the pointer.
   nullable, because most agents have no 8004 identity and do not need one. */
ALTER TABLE agents ADD COLUMN IF NOT EXISTS erc8004_id bigint;

CREATE INDEX IF NOT EXISTS agents_cold   ON agents (lower(cold_key));
CREATE INDEX IF NOT EXISTS agents_key    ON agents (lower(agent_key));
CREATE INDEX IF NOT EXISTS agents_status ON agents (status, id DESC);
