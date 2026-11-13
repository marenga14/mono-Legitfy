import { Contract, RpcProvider, num, shortString, type Abi } from "starknet";
import type { Hex } from "viem";
import type { RegistryStatus, Verification } from "./chain.js";
import built from "./starknet-registry.json" with { type: "json" };

/** Starknet's chain IDs are short strings, so they're stored that way rather than as numbers. */
export const STARKNET_CHAINS = ["SN_MAIN", "SN_SEPOLIA"] as const;
export type StarknetChainId = (typeof STARKNET_CHAINS)[number];

/** Class hashes of registries built from this repo. Add the new one after changing the contract. */
export const REGISTRY_CLASS_HASHES = [built.classHash];

export interface StarknetTarget { rpcUrl: string; registry: string }

/** Everything the API reads from a Starknet registry. Faked in tests. */
export interface StarknetReader {
  verify(by: "id" | "hash", value: Hex, target: StarknetTarget): Promise<Verification>;
  /** Proves the address holds our registry, and says which chain the RPC is on. */
  probe(target: StarknetTarget): Promise<{ chainId: string; classHash: string; owner: string }>;
}

const STATUSES: RegistryStatus[] = ["not_found", "authentic", "revoked", "replaced", "suspended"];
const REASONS = [null, "issued_in_error", "fraud", "withdrawn", "other"];

/** u256 values come back as bigints; the rest of the app speaks 32-byte hex. */
export const toBytes32 = (v: bigint): Hex => `0x${v.toString(16).padStart(64, "0")}`;
const isoDate = (seconds: bigint) => (seconds ? new Date(Number(seconds) * 1000).toISOString() : null);

interface RawVerification {
  status: bigint;
  credential_id: bigint;
  institution_name: string;
  credential: { issued_at: bigint; revoked_at: bigint; revocation_reason: bigint; replaced_by: bigint; file_hash: bigint };
}

export function decodeVerification(v: RawVerification): Verification {
  const c = v.credential;
  return {
    status: STATUSES[Number(v.status)] ?? "not_found",
    credentialId: toBytes32(v.credential_id),
    institution: v.institution_name,
    issuedAt: isoDate(c.issued_at),
    revokedAt: isoDate(c.revoked_at),
    revocationReason: REASONS[Number(c.revocation_reason)] ?? null,
    replacedBy: c.replaced_by ? toBytes32(c.replaced_by) : null,
    fileHash: toBytes32(c.file_hash),
  };
}

export function starknetReader(): StarknetReader {
  const providers = new Map<string, RpcProvider>();
  const providerFor = (rpcUrl: string) => {
    let p = providers.get(rpcUrl);
    if (!p) providers.set(rpcUrl, (p = new RpcProvider({ nodeUrl: rpcUrl })));
    return p;
  };
  const registryAt = (t: StarknetTarget) =>
    new Contract({ abi: built.abi as Abi, address: t.registry, providerOrAccount: providerFor(t.rpcUrl) });

  return {
    async verify(by, value, target) {
      const registry = registryAt(target);
      const raw = await registry.call(by === "id" ? "verify_by_id" : "verify_by_hash", [BigInt(value)]);
      return decodeVerification(raw as unknown as RawVerification);
    },
    async probe(target) {
      const provider = providerFor(target.rpcUrl);
      const [chainId, classHash, owner] = await Promise.all([
        provider.getChainId(),
        provider.getClassHashAt(target.registry),
        registryAt(target).call("owner", []),
      ]);
      return {
        chainId: shortString.decodeShortString(chainId),
        classHash: num.toHex(classHash),
        owner: num.toHex(owner as bigint),
      };
    },
  };
}
