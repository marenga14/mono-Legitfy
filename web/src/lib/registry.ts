import { createPublicClient, http, isHex, parseAbi, type Address, type Hex } from "viem";
import { chain, explorerUrl, networkName, otherNetworks, registryAddress } from "./config";
import { canonicalCode, credentialIdFor } from "./certificateCode";
import { t } from "./i18n";

const abi = parseAbi([
  "struct Credential { address issuer; uint32 institutionId; uint40 issuedAt; uint8 revocationReason; uint40 revokedAt; bytes32 fileHash; bytes32 replacedBy; }",
  "struct Verification { uint8 status; bytes32 credentialId; string institutionName; Credential credential; }",
  "function verifyByHash(bytes32) view returns (Verification)",
  "function verifyById(bytes32) view returns (Verification)",
  "function institutionCount() view returns (uint32)",
  "function credentialCount() view returns (uint256)",
]);

export type VerdictStatus = "not_found" | "authentic" | "revoked" | "replaced" | "suspended";
const STATUSES: VerdictStatus[] = ["not_found", "authentic", "revoked", "replaced", "suspended"];
const REASONS = ["", "issuedInError", "fraud", "withdrawn", "other"];

export interface Verdict {
  status: VerdictStatus;
  credentialId: Hex;
  institution: string;
  issuedAt: Date | null;
  revokedAt: Date | null;
  revocationReason: string;
  replacedBy: Hex | null;
  fileHash: Hex;
  /** Where the record was found. */
  network: string;
  recordUrl: string;
}

const ZERO = `0x${"0".repeat(64)}`;
export const client = createPublicClient({ chain, transport: http() });
const toDate = (s: number) => (s ? new Date(s * 1000) : null);

type RawRecord = {
  status: number; credentialId: Hex; institutionName: string;
  credential: { issuedAt: number; revokedAt: number; revocationReason: number; replacedBy: Hex; fileHash: Hex };
};
interface Target { network: string; recordUrl: string; read(by: "id" | "hash", value: Hex): Promise<RawRecord> }
const evmTarget = (c: typeof client, address: Address, network: string, explorer: string): Target => ({
  network,
  recordUrl: `${explorer}/address/${address}`,
  read: (by, value) => c.readContract({ address, abi, functionName: by === "id" ? "verifyById" : "verifyByHash", args: [value] }),
});
const targets = (): Target[] => [
  evmTarget(client, contract().address, networkName, explorerUrl),
  ...otherNetworks.map((n): Target => n.kind === "starknet"
    ? {
      network: n.name,
      recordUrl: `${n.explorerUrl}/contract/${n.registry}`,
      read: async (by, value) => (await import("./starknetRegistry")).readRecord(n.rpcUrl, n.registry, by, value),
    }
    : evmTarget(createPublicClient({ transport: http(n.rpcUrl) }) as typeof client, n.registry as Address, n.name, n.explorerUrl)),
];

function toVerdict(target: Target, v: RawRecord): Verdict {
  const c = v.credential;
  return {
    status: STATUSES[v.status] ?? "not_found",
    credentialId: v.credentialId,
    institution: v.institutionName,
    issuedAt: toDate(c.issuedAt),
    revokedAt: toDate(c.revokedAt),
    revocationReason: REASONS[c.revocationReason] ?? "",
    replacedBy: c.replacedBy === ZERO ? null : c.replacedBy,
    fileHash: c.fileHash,
    network: target.network,
    recordUrl: target.recordUrl,
  };
}

export const registryConnected = Boolean(registryAddress);
const contract = () => {
  if (!registryAddress) throw new Error(t("errors.registryOff"));
  return { address: registryAddress, abi } as const;
};

/**
 * Searches every listed network. "No record" is only an answer if each one replied: an unreachable
 * network could hold the record, so that case fails instead of telling someone a real file is missing.
 */
async function search(by: "id" | "hash", value: Hex): Promise<Verdict> {
  const results = await Promise.allSettled(targets().map(async (target) => toVerdict(target, await target.read(by, value))));
  const answers = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const found = answers.find((v) => v.status !== "not_found");
  if (found) return found;
  const failed = results.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
  return answers[0]!;
}
export const verifyByHash = (hash: Hex) => search("hash", hash);
export const verifyById = (id: Hex) => search("id", id);
export const isCredentialId = (v: string): v is Hex => isHex(v) && v.length === 66;
/** Takes a printed code or a full on-chain ID, which older links still use. */
export function resolveCredential(input: string): { id: Hex; code: string | null } | null {
  const value = input.trim();
  if (isCredentialId(value)) return { id: value, code: null };
  const code = canonicalCode(value);
  return code ? { id: credentialIdFor(code), code } : null;
}

export async function registryStats() {
  const [institutions, credentials] = await Promise.all([
    client.readContract({ ...contract(), functionName: "institutionCount" }),
    client.readContract({ ...contract(), functionName: "credentialCount" }),
  ]);
  return { institutions: Number(institutions), credentials: Number(credentials) };
}
