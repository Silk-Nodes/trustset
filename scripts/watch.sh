#!/usr/bin/env sh
# the watchdog, wrapped for cron.
#
# cron runs with almost no environment and no shell profile, so the
# configuration is read from a file on the machine rather than from the
# crontab line. that file holds the alert webhook, so it is mode 600 and it
# never goes in the repository.
#
# installed with:
#   crontab -e
#   */10 * * * * /path/to/trustset/scripts/watch.sh >> /path/to/watch.log 2>&1
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${TRUSTSET_ROOT:-$(cd "$HERE/.." && pwd)}

# WATCH_ENV names the config file. no default is invented for it: a watchdog
# that runs with guessed settings reports on something nobody asked it to watch.
if [ -z "${WATCH_ENV:-}" ]; then
  echo "WATCH_ENV is not set. Point it at the file holding this box's watchdog settings." >&2
  exit 2
fi
if [ ! -f "$WATCH_ENV" ]; then
  echo "WATCH_ENV points at $WATCH_ENV, which does not exist." >&2
  exit 2
fi
# set -a exports everything the file assigns. without it the assignments are
# shell variables only, the node process inherits none of them, and the
# watchdog exits complaining that it was given no configuration.
set -a
. "$WATCH_ENV"
set +a

NODE=${NODE_BIN:-$(command -v node || true)}
if [ -z "$NODE" ]; then
  echo "node is not on PATH and NODE_BIN is not set, so the watchdog cannot run." >&2
  exit 2
fi

cd "$ROOT"
exec "$NODE" scripts/watch.mjs
