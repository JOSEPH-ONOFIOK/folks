// Exercises the discovery logic with a hand-rolled window, so no jsdom and
// no browser are needed. The timings mirror real extensions: they answer the
// announce request a moment after it is dispatched.

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log("  PASS", m)) : (fail++, console.log("  FAIL", m)); };

// --- a minimal EventTarget-backed window -------------------------------
class FakeWindow extends EventTarget {}
const win = new FakeWindow();
globalThis.window = win;
// navigator already exists in Node 24 and is read-only; isMobile() is not under test here.

const mk = (name, uuid, addr) => ({
  info: { uuid, name, icon: "", rdns: "t." + uuid },
  provider: {
    request: async ({ method }) =>
      method === "eth_requestAccounts" || method === "eth_accounts" ? [addr] : null,
    on() {}, removeListener() {},
  },
});

const ALPHA = "0x1111111111111111111111111111111111111111";
const BETA  = "0x2222222222222222222222222222222222222222";

// Wallets answer LATE. This is the timing that broke connect.
win.addEventListener("eip6963:requestProvider", () => {
  setTimeout(() => win.dispatchEvent(Object.assign(
    new Event("eip6963:announceProvider"), { detail: mk("Alpha", "ua", ALPHA) })), 60);
  setTimeout(() => win.dispatchEvent(Object.assign(
    new Event("eip6963:announceProvider"), { detail: mk("Beta", "ub", BETA) })), 90);
});

const w = await import("../.wallet-test/wallet.js");

console.log("-- discovery --");
ok(w.wallets().length === 0, "nothing known before the page asks");

// The old bug: reading the list synchronously right after startDiscovery().
w.startDiscovery();
ok(w.wallets().length === 0, "still empty immediately after asking (the race)");

const found = await w.readyWallets();
ok(found.length === 2, `readyWallets() waited and found ${found.length}`);
ok(found.map(x => x.name).sort().join(",") === "Alpha,Beta", "both wallets present");

console.log("\n-- connecting --");
const a = await w.connect(found.find(x => x.name === "Beta").provider);
ok(a === BETA, "connects to the wallet that was chosen, not the first one");

const restored = await w.currentAccount();
ok(restored === BETA, "session restores through the same provider");

console.log("\n-- a second call is cheap --");
const t0 = Date.now();
const again = await w.readyWallets();
ok(Date.now() - t0 < 30, `returns immediately once known (${Date.now() - t0}ms)`);
ok(again.length === 2, "and still lists both");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
