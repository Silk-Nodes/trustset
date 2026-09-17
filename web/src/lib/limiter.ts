/* the public Monad testnet RPC allows fifteen requests a second per address,
 * and answers the sixteenth with an error that ethers reports as a call that
 * returned nothing. every read in the app goes through this: at most ten
 * starts in any rolling second, the rest queued in order. ten, not fifteen,
 * because the same address also carries the wallet's own traffic and the
 * live figures in the header. */
const PER_SECOND = 10;
const starts: number[] = [];
const queue: (() => void)[] = [];
let draining = false;

function drain() {
  if (draining) return; draining = true;
  const tick = () => {
    const now = Date.now();
    while (starts.length && now - starts[0] > 1000) starts.shift();
    while (queue.length && starts.length < PER_SECOND) { starts.push(Date.now()); queue.shift()!(); }
    if (queue.length) setTimeout(tick, Math.max(20, 1000 - (Date.now() - starts[0]) + 5));
    else draining = false;
  };
  tick();
}

export function limited<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => fn().then(resolve, reject));
    drain();
  });
}
