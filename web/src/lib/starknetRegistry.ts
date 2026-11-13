// Loaded on demand, so people on sites that list no Starknet network never download starknet.js.
import { Contract, RpcProvider, type Abi, type AccountInterface, type ProviderInterface } from "starknet";
import type { Hex } from "viem";
import built from "./starknet-registry.json";

export const registryAbi = built.abi as Abi;

const providers = new Map<string, RpcProvider>();
export function providerFor(rpcUrl: string) {
  let p = providers.get(rpcUrl);
  if (!p) providers.set(rpcUrl, (p = new RpcProvider({ nodeUrl: rpcUrl })));
  return p;
}
export const registryAt = (address: string, providerOrAccount: ProviderInterface | AccountInterface) =>
  new Contract({ abi: registryAbi, address, providerOrAccount });

const hex32 = (v: bigint): Hex => `0x${v.toString(16).padStart(64, "0")}`;

/** Reads one record and returns it in the shape the EVM registry uses, so both share one decoder. */
export async function readRecord(rpcUrl: string, registry: string, by: "id" | "hash", value: Hex) {
  const v = (await registryAt(registry, providerFor(rpcUrl)).call(by === "id" ? "verify_by_id" : "verify_by_hash", [BigInt(value)])) as {
    status: bigint; credential_id: bigint; institution_name: string;
    credential: { issued_at: bigint; revoked_at: bigint; revocation_reason: bigint; replaced_by: bigint; file_hash: bigint };
  };
  const c = v.credential;
  return {
    status: Number(v.status),
    credentialId: hex32(v.credential_id),
    institutionName: v.institution_name,
    credential: {
      issuedAt: Number(c.issued_at), revokedAt: Number(c.revoked_at), revocationReason: Number(c.revocation_reason),
      replacedBy: hex32(c.replaced_by), fileHash: hex32(c.file_hash),
    },
  };
}
