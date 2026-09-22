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

echo "==> sending web/public"
# next reads the CONTENT of public/ from disk at request time, but it fixes
# the LIST of files at build time: a filename that was not there when the
# build ran answers 404 until the next build. so this is sent before the
# build, on purpose. it was not sent at all for the first four days, and the
# og image and the new favicon sat at 404 while every page reported 200.
rsync -az --delete --exclude '.env*' "$ROOT/web/public/" "$HOST:$REMOTE/web/public/"

echo "==> building on the vm"
ssh "$HOST" "cd $REMOTE/web && npm run build 2>&1 | grep -E 'Compiled|Failed|error' || true"

echo
# restart without a keypress when the box allows it. the one time this was
# left to a prompt, enter was pressed before the restart ran and every chunk
# on the site answered 500 for the rest of the day. sudo -n never asks for a
# password: it either works or fails at once, and only then is a person asked.
echo "==> restarting"
if ssh -o BatchMode=yes "$HOST" 'sudo -n systemctl restart trustset-web' 2>/dev/null; then
  echo "    restarted"
else
  echo "    passwordless sudo refused. run this yourself, then come back:"
  echo "    ssh -t $HOST 'sudo systemctl restart trustset-web'"
  read -r -p "press enter once the restart has FINISHED, not before" _
fi
echo "==> waiting for the server to answer"
for i in $(seq 1 30); do
  sleep 1
  curl -sS -o /dev/null --max-time 3 "$SITE/" && break
done

echo "==> checking every asset the pages reference"
fail=0
for path in / /demo /explorer /agents /agents/guarding /agents/refunds /passkey /panic /how; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$SITE$path" || echo 000)
  printf '%-10s %s\n' "$path" "$code"
  [ "$code" = "200" ] || fail=1
  for u in $(curl -sS --max-time 20 "$SITE$path" | grep -o '/_next/static/[a-zA-Z0-9_./-]*\.\(js\|css\)' | sort -u); do
    a=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$SITE$u" || echo 000)
    if [ "$a" != "200" ]; then echo "   $a  $u"; fail=1; fi
  done
done
# the read-only routes the console and anything integrating trustset depend on.
# kept out of the loop above on purpose: that one's failure message says the
# build moved under the server, and a 502 here means the rpc or the index is
# away, which is a different problem with a different fix. agent 1 is a safe
# subject because the registry only ever grows.
echo
echo "==> checking the read-only api"
for path in "/api/chain" "/api/verify?agent=1" "/api/fleet?ids=1,2"; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$SITE$path" || echo 000)
  printf '%-24s %s\n' "$path" "$code"
  [ "$code" = "200" ] || { echo "   not the build: the chain or the index is not answering"; fail=1; }
done
echo
for f in og.png icon.svg favicon-32.png apple-touch-icon.png; do
  a=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$SITE/$f" || echo 000)
  printf '%-10s %s\n' "/$f" "$a"
  [ "$a" = "200" ] || fail=1
done
echo
[ "$fail" = "0" ] && echo "all pages, every chunk they name, and the public assets answered 200" || { echo "SOMETHING IS STALE: restart again, the build moved under the server"; exit 1; }
