// EIP-1193 wallet access with EIP-6963 discovery.
//
// Relying on window.ethereum alone breaks when more than one wallet is
// installed: whichever extension loaded last owns the global, so the button
// opens Phantom when the visitor wanted Rainbow, or finds nothing at all.
// EIP-6963 lets every wallet announce itself, so we can list them and let
// the visitor pick.

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

export type WalletInfo = {
  uuid: string;
  name: string;
  icon: string;
  provider: Eip1193;
};

type Eip6963Detail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193;
};

declare global {
  interface Window {
    ethereum?: Eip1193 & { providers?: Eip1193[]; isMetaMask?: boolean };
  }
}

const discovered = new Map<string, WalletInfo>();
let listening = false;
const listeners = new Set<(w: WalletInfo[]) => void>();

function emit() {
  const list = wallets();
  listeners.forEach((fn) => fn(list));
}

/// Start listening for wallet announcements. Safe to call repeatedly.
export function startDiscovery(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;

  window.addEventListener("eip6963:announceProvider", (event: Event) => {
    const detail = (event as CustomEvent<Eip6963Detail>).detail;
    if (!detail?.info?.uuid || !detail.provider) return;
    discovered.set(detail.info.uuid, {
      uuid: detail.info.uuid,
      name: detail.info.name,
      icon: detail.info.icon,
      provider: detail.provider,
    });
    emit();
  });

  // Ask any wallet already loaded to announce itself.
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function onWallets(fn: (w: WalletInfo[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/// Every wallet we can see, including a legacy window.ethereum that never
/// announced itself.
export function wallets(): WalletInfo[] {
  const list = Array.from(discovered.values());
  if (list.length > 0) return list;

  if (typeof window !== "undefined" && window.ethereum) {
    const eth = window.ethereum;
    const legacy = Array.isArray(eth.providers) && eth.providers.length > 0
      ? eth.providers
      : [eth];
    return legacy.map((p, i) => ({
      uuid: `legacy-${i}`,
      name: (p as { isMetaMask?: boolean }).isMetaMask ? "MetaMask" : "Browser wallet",
      icon: "",
      provider: p,
    }));
  }
  return [];
}

// The provider the visitor actually connected with, so later calls (chain
// switches, signing) go to the same wallet rather than whichever owns the
// global.
let active: Eip1193 | null = null;

export function setActiveProvider(p: Eip1193 | null) {
  active = p;
}

export function getProvider(): Eip1193 | null {
  if (active) return active;
  if (typeof window === "undefined") return null;
  const first = wallets()[0];
  return first ? first.provider : null;
}

export function hasWallet(): boolean {
  return wallets().length > 0;
}

export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

/// Reopens the current page inside MetaMask's in-app browser. The link must
/// carry the full path and query, or the visitor lands on the wrong page.
export function metamaskDeepLink(): string {
  if (typeof window === "undefined") return "https://metamask.io/download/";
  const { host, pathname, search } = window.location;
  return `https://metamask.app.link/dapp/${host}${pathname}${search}`;
}

export async function connect(provider?: Eip1193): Promise<string | null> {
  const p = provider ?? getProvider();
  if (!p) return null;
  const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
  const addr = accounts?.[0] ?? null;
  if (addr) setActiveProvider(p);
  return addr;
}

export async function currentAccount(): Promise<string | null> {
  const p = getProvider();
  if (!p) return null;
  try {
    const accounts = (await p.request({ method: "eth_accounts" })) as string[];
    const addr = accounts?.[0] ?? null;
    if (addr) setActiveProvider(p);
    return addr;
  } catch {
    return null;
  }
}

export async function currentChainId(): Promise<number | null> {
  const p = getProvider();
  if (!p) return null;
  try {
    const hex = (await p.request({ method: "eth_chainId" })) as string;
    return Number.parseInt(hex, 16);
  } catch {
    return null;
  }
}

export async function switchChain(
  chainId: number,
  name: string,
  rpcUrl: string,
  explorer: string,
): Promise<boolean> {
  const p = getProvider();
  if (!p) return false;
  const hex = "0x" + chainId.toString(16);
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    return true;
  } catch (err) {
    if ((err as { code?: number })?.code === 4902 && rpcUrl) {
      try {
        await p.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: hex,
            chainName: name,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [rpcUrl],
            blockExplorerUrls: explorer ? [explorer] : [],
          }],
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
