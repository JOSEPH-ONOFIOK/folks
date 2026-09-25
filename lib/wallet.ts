// Minimal EIP-1193 wallet access. No SDK: every injected wallet (MetaMask,
// Rainbow, Coinbase Wallet, Trust, and the in-app browsers on mobile)
// exposes this same interface on window.ethereum.

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193 & { providers?: Eip1193[] };
  }
}

export function getProvider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const eth = window.ethereum;
  if (!eth) return null;
  // Several wallets installed at once stack themselves here; any of them works.
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    return eth.providers[0];
  }
  return eth;
}

export function hasWallet(): boolean {
  return getProvider() !== null;
}

// True on phones and tablets, where a desktop extension is never present and
// the fix is to open the site inside a wallet's own browser instead.
export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

// Deep link that reopens the current page inside MetaMask's in-app browser.
export function metamaskDeepLink(): string {
  if (typeof window === "undefined") return "https://metamask.io/download/";
  const target = `${window.location.host}${window.location.pathname}`;
  return `https://metamask.app.link/dapp/${target}`;
}

export async function connect(): Promise<string | null> {
  const provider = getProvider();
  if (!provider) return null;
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  return accounts?.[0] ?? null;
}

// Accounts already authorised, without prompting. Used to restore the
// session on reload so a returning visitor is not asked again.
export async function currentAccount(): Promise<string | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const accounts = (await provider.request({
      method: "eth_accounts",
    })) as string[];
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

/// Current chain as a decimal number, or null when no wallet is present.
export async function currentChainId(): Promise<number | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    return Number.parseInt(hex, 16);
  } catch {
    return null;
  }
}

/// Ask the wallet to move to `chainId`, adding the network if it isn't known.
export async function switchChain(
  chainId: number,
  name: string,
  rpcUrl: string,
  explorer: string,
): Promise<boolean> {
  const provider = getProvider();
  if (!provider) return false;
  const hex = "0x" + chainId.toString(16);
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
    return true;
  } catch (err) {
    // 4902: the wallet doesn't have this network yet, so offer to add it.
    if ((err as { code?: number })?.code === 4902 && rpcUrl) {
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hex,
              chainName: name,
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [rpcUrl],
              blockExplorerUrls: explorer ? [explorer] : [],
            },
          ],
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
