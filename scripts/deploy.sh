#!/usr/bin/env bash
# deploy the site to the vm.
#
# the order matters and is the whole reason this file exists. next serves html
# from the manifest it loaded at startup, so rebuilding .next under a running
# server leaves it naming chunk files that no longer exist: the page arrives,
# its css and a chunk answer 500, and the site looks broken while systemd
# happily reports it active. build first, restart immediately after, and check.
#
# the restart needs a password, so this stops and hands you the command rather
# than pretending it can finish on its own.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)

# the box is not in this file. an address in a repo is a hostname and an open
# port handed to whoever reads it, and an address that moves should be one line
# edited on the machine rather than a commit and a redeploy.
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
if [ -z "${DEPLOY_HOST:-}" ]; then
  echo "DEPLOY_HOST is not set. Put it in $ROOT/.env as DEPLOY_HOST=user@host" >&2
  exit 1
fi
HOST=$DEPLOY_HOST
SITE=${DEPLOY_SITE:-https://trustset.silknodes.io}
if [ -z "${DEPLOY_PATH:-}" ]; then
  echo "DEPLOY_PATH is not set. Put it in $ROOT/.env as DEPLOY_PATH=/path/on/the/host" >&2
  exit 1
fi
REMOTE=$DEPLOY_PATH

echo "==> sending web/src"
# anchored, so it excludes the top level demo/ and never web/src/app/demo
rsync -az --delete \
  --exclude '/demo/' --exclude 'node_modules/' --exclude '.next/' \
  --exclude '.next-*/' --exclude '.env*' \
  "$ROOT/web/src/" "$HOST:$REMOTE/web/src/"

echo "==> building on the vm"
ssh "$HOST" "cd $REMOTE/web && npm run build 2>&1 | grep -E 'Compiled|Failed|error' || true"

echo
echo "==> now restart, in the same breath as the build:"
echo "    ssh -t $HOST 'sudo systemctl restart trustset-web'"
echo
read -r -p "press enter once that has finished, to verify" _

echo "==> checking every asset the pages reference"
fail=0
for path in / /demo /explorer /agents /passkey /panic; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$SITE$path" || echo 000)
  printf '%-10s %s\n' "$path" "$code"
  [ "$code" = "200" ] || fail=1
  for u in $(curl -sS --max-time 20 "$SITE$path" | grep -o '/_next/static/[a-zA-Z0-9_./-]*\.\(js\|css\)' | sort -u); do
    a=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$SITE$u" || echo 000)
    if [ "$a" != "200" ]; then echo "   $a  $u"; fail=1; fi
  done
done
echo
[ "$fail" = "0" ] && echo "all pages and every asset they name answered 200" || { echo "SOMETHING IS STALE: restart again, the build moved under the server"; exit 1; }
