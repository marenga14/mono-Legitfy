import { defineChain, type Address } from "viem";

const NETWORKS = {
  677: { name: "BOT Chain", rpc: "https://rpc.botchain.ai", explorer: "https://scan.botchain.ai" },
  968: { name: "BOT Chain Testnet", rpc: "https://rpc.bohr.life", explorer: "https://scan.bohr.life" },
} as const;

const env = import.meta.env;
export const apiUrl: string = env.VITE_API_URL ?? "http://localhost:8787";

interface Network { name: string; chainId: number; rpcUrl: string; explorerUrl: string; registry: string; hasLogo?: boolean }
/** Starknet chain IDs are short strings ("SN_MAIN"); EVM ones are numbers. */
interface ListedNetwork extends Omit<Network, "chainId"> { kind?: "evm" | "starknet"; chainId: number | string }
/**
 * The platform admin can update these after deployment, so they're read when the page loads.
 * Public checks don't otherwise need the API, so a slow or missing API must not stop them.
 */
const live: Partial<Network> & { others?: ListedNetwork[] } = await fetch(`${apiUrl}/network`, { signal: AbortSignal.timeout(2500) })
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}));

export const chainId = live.chainId ?? Number(env.VITE_CHAIN_ID ?? 968);
const network = NETWORKS[chainId as keyof typeof NETWORKS];

/** A development chain isn't something the public should ever read about. */
export const isDevChain = !network;
export const networkName = isDevChain ? NETWORKS[677].name : live.name ?? network.name;
export const explorerUrl: string = isDevChain ? NETWORKS[677].explorer : live.explorerUrl ?? network.explorer;
export const botChainSite = "https://botchain.ai";
/** Always the mainnet explorer, which BOT Chain asked to be linked by name. */
export const botChainExplorer = "https://scan.botchain.ai";
export const rpcUrl: string = live.rpcUrl || env.VITE_RPC_URL || network?.rpc || "http://127.0.0.1:8545";
/** A personal address until the company one is ready. Set VITE_CONTACT_EMAIL to replace it. */
export const contactEmail: string = env.VITE_CONTACT_EMAIL || "marengajulius@gmail.com";
/** Shown in the site footer. */
export const supportEmail: string = env.VITE_SUPPORT_EMAIL || "support@legitfy.dev";
export const registryAddress = (live.registry || env.VITE_REGISTRY_ADDRESS || undefined) as Address | undefined;

const logoFor = (n: { chainId: number | string; hasLogo?: boolean }) => (n.hasLogo ? `${apiUrl}/networks/${n.chainId}/logo` : null);

export interface SearchedNetwork {
  kind: "evm" | "starknet"; name: string; chainId: number | string; rpcUrl: string; explorerUrl: string; registry: string; logo: string | null;
}
/** Other networks public checks search. Each was confirmed to hold our registry when it was added. */
export const otherNetworks: SearchedNetwork[] = (live.others ?? []).map((n) => ({ ...n, kind: n.kind ?? "evm", logo: logoFor(n) }));
/** Where institutions can also publish with a Starknet wallet. The first one listed, if any. */
export const starknetNetwork = otherNetworks.find((n) => n.kind === "starknet");
/** BOT Chain's own logo, from botchain.ai. A network without an uploaded logo shows its name only. */
const mainLogo = logoFor({ chainId, hasLogo: live.hasLogo }) ?? (isDevChain || network ? "/chains/bot-chain.png" : null);
export const shownNetworks: { name: string; explorerUrl: string; logo: string | null }[] = [
  { name: networkName, explorerUrl, logo: mainLogo },
  ...otherNetworks,
];
/** "BOT Chain and Base", in the reader's language. */
export const networkList = (locale: string) =>
  new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(shownNetworks.map((n) => n.name));

/** What public pages show. On a development chain these are the public network's details. */
export const shownChainId = isDevChain ? 677 : chainId;
export const shownRpcUrl = isDevChain ? NETWORKS[677].rpc : rpcUrl;
export const shownRegistry = isDevChain ? undefined : registryAddress;

export const chain = defineChain({
  id: chainId,
  name: networkName,
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
