#!/usr/bin/env bash
# one command local demo: anvil with prague precompiles, deploy, sign the notice, serve the page.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
PY=${PY:-.venv/bin/python}
if [ ! -x "$PY" ]; then python3 -m venv .venv && .venv/bin/pip install -q py_ecc eth_abi eth_utils "eth-hash[pycryptodome]"; fi
pkill -f "anvil --hardfork prague" 2>/dev/null || true
anvil --hardfork prague --silent --port 8545 > /tmp/anvil-demo.log 2>&1 &
sleep 1.5
forge script script/Demo.s.sol:Demo --rpc-url http://127.0.0.1:8545 --broadcast -q >/dev/null
$PY scripts/sign_demo_notice.py
echo "demo ready: http://127.0.0.1:8787"
cd demo && exec python3 -m http.server 8787 --bind 127.0.0.1
