import type { Hex } from "viem";
import { starknetNetwork } from "./config";
import { t } from "./i18n";

/** What Argent X, Braavos and other Starknet wallets put on `window` (get-starknet v4 shape). */
export interface StarknetWallet {
  id: string;
  name: string;
  request: (...args: never[]) => Promise<unknown>;
  on: (...args: never[]) => void;
  off: (...args: never[]) => void;
}

/** Each wallet injects itself as window.starknet_<id>; `window.starknet` repeats one of them. */
export function starknetWallets(): StarknetWallet[] {
  const seen = new Map<string, StarknetWallet>();
  for (const [key, value] of Object.entries(window)) {
    if (!key.startsWith("starknet")) continue;
    const w = value as Partial<StarknetWallet> | null;
    if (w && typeof w.id === "string" && typeof w.name === "string" && typeof w.request === "function" && !seen.has(w.id)) {
      seen.set(w.id, w as StarknetWallet);
    }
  }
  return [...seen.values()];
}

function friendly(e: unknown) {
  const message = (e as { message?: string }).message ?? "";
  if (/reject|denied|abort|cancel/i.test(message)) return new Error(t("errors.walletCancelled"));
  return e instanceof Error && e.message ? e : new Error(t("errors.walletFailed"));
}

/**
 * Publishes a document's record on the listed Starknet network from the given wallet.
 * The registry decides who may issue: the wallet must be a member of an active institution there.
 */
export async function issueOnStarknet(wallet: StarknetWallet, credentialId: Hex, fileHash: Hex): Promise<string> {
  const network = starknetNetwork;
  if (!network) throw new Error(t("errors.registryOff"));
  const [{ WalletAccount, CallData, cairo, shortString }, { providerFor, registryAt }] = await Promise.all([
    import("starknet"), import("./starknetRegistry"),
  ]);
  const provider = providerFor(network.rpcUrl);
  let account: InstanceType<typeof WalletAccount>;
  try {
    account = await WalletAccount.connect(provider, wallet as never);
    const wanted = shortString.encodeShortString(String(network.chainId));
    const walletChain = async () => BigInt(String(await wallet.request({ type: "wallet_requestChainId" } as never)));
    if ((await walletChain()) !== BigInt(wanted)) {
      await account.switchStarknetChain(wanted as never).catch(() => undefined);
      if ((await walletChain()) !== BigInt(wanted)) throw new Error(t("starknet.wrongChain", { network: network.name }));
    }
  } catch (e) {
    throw friendly(e);
  }
  // Checked first so a non-member gets a clear answer instead of a failed transaction.
  if (!(await registryAt(network.registry, provider).call("can_issue", [account.address]))) {
    throw new Error(t("starknet.notMember", { account: account.address }));
  }
  try {
    const { transaction_hash } = await account.execute({
      contractAddress: network.registry,
      entrypoint: "issue",
      calldata: CallData.compile({ credential_id: cairo.uint256(credentialId), file_hash: cairo.uint256(fileHash) }),
    });
    const receipt = await provider.waitForTransaction(transaction_hash);
    if (!receipt.isSuccess()) throw new Error(t("errors.txRefused"));
    return transaction_hash;
  } catch (e) {
    throw friendly(e);
  }
}
