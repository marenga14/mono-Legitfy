import { createPublicClient, http, keccak256, parseAbi, type Address, type Hex } from "viem";

export type MemberRole = "none" | "operator" | "admin";
export interface Member {
  institutionId: number;
  role: MemberRole;
}
export type RegistryStatus = "not_found" | "authentic" | "revoked" | "replaced" | "suspended";
export interface RegistryMatch {
  status: RegistryStatus;
  institutionName: string | null;
  institutionId: number | null;
}
export interface InstitutionInfo {
  id: number;
  name: string;
  active: boolean;
  admin: Address;
}

export interface Verification {
  status: RegistryStatus;
  credentialId: Hex;
  institution: string;
  issuedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  replacedBy: Hex | null;
  fileHash: Hex;
}

/** Everything the API reads from chain. Faked in tests. */
export interface Chain {
  platformOwner(): Promise<Address>;
  accountOf(owner: Address): Promise<Address>;
  getMember(account: Address): Promise<Member>;
  canIssue(account: Address): Promise<boolean>;
  verifyByHash(fileHash: Hex): Promise<RegistryMatch>;
  /** Reads one record, from another network when `target` is given. */
  verify(by: "id" | "hash", value: Hex, target?: { rpcUrl: string; registry: Address }): Promise<Verification>;
  listInstitutions(): Promise<InstitutionInfo[]>;
  /** Reads a candidate network without switching to it. */
  probeNetwork(rpcUrl: string, registry: Address): Promise<{ chainId: number; owner: Address }>;
  useNetwork(rpcUrl: string, registry: Address): void;
}

const registryAbi = parseAbi([
  "struct Member { uint32 institutionId; uint8 role; }",
  "struct Institution { address admin; uint8 status; string name; }",
  "struct Credential { address issuer; uint32 institutionId; uint40 issuedAt; uint8 revocationReason; uint40 revokedAt; bytes32 fileHash; bytes32 replacedBy; }",
  "struct Verification { uint8 status; bytes32 credentialId; string institutionName; Credential credential; }",
  "function getMember(address) view returns (Member)",
  "function getInstitution(uint32) view returns (Institution)",
  "function institutionCount() view returns (uint32)",
  "function owner() view returns (address)",
  "function canIssue(address) view returns (bool)",
  "function verifyByHash(bytes32) view returns (Verification)",
  "function verifyById(bytes32) view returns (Verification)",
]);
const factoryAbi = parseAbi(["function getAddress(address owner, uint256 salt) view returns (address)"]);

const ROLES: MemberRole[] = ["none", "operator", "admin"];
const REASONS = [null, "issued_in_error", "fraud", "withdrawn", "other"];
const NO_ID = `0x${"0".repeat(64)}`;
const isoDate = (seconds: number) => (seconds ? new Date(seconds * 1000).toISOString() : null);
const STATUSES: RegistryStatus[] = ["not_found", "authentic", "revoked", "replaced", "suspended"];

export function viemChain(opts: { rpcUrl: string; registry: Address; factory: Address }): Chain {
  const clientFor = (rpcUrl: string) => createPublicClient({ transport: http(rpcUrl) });
  const contractAt = (address: Address) => ({ address, abi: registryAbi }) as const;
  let client = clientFor(opts.rpcUrl);
  let registry = contractAt(opts.registry);
  return {
    async probeNetwork(rpcUrl, address) {
      const candidate = clientFor(rpcUrl);
      // verifyByHash proves this is our current contract. Plenty of contracts have an owner.
      const [chainId, owner] = await Promise.all([
        candidate.getChainId(),
        candidate.readContract({ ...contractAt(address), functionName: "owner" }),
        candidate.readContract({ ...contractAt(address), functionName: "verifyByHash", args: [`0x${"0".repeat(64)}`] }),
      ]);
      return { chainId, owner };
    },
    useNetwork(rpcUrl, address) {
      client = clientFor(rpcUrl);
      registry = contractAt(address);
    },
    platformOwner: () => client.readContract({ ...registry, functionName: "owner" }),
    accountOf: (owner) =>
      client.readContract({ address: opts.factory, abi: factoryAbi, functionName: "getAddress", args: [owner, 0n] }),
    async getMember(account) {
      const m = await client.readContract({ ...registry, functionName: "getMember", args: [account] });
      return { institutionId: m.institutionId, role: ROLES[m.role] ?? "none" };
    },
    canIssue: (account) => client.readContract({ ...registry, functionName: "canIssue", args: [account] }),
    async verifyByHash(fileHash) {
      const v = await client.readContract({ ...registry, functionName: "verifyByHash", args: [fileHash] });
      return {
        status: STATUSES[v.status] ?? "not_found",
        institutionName: v.institutionName || null,
        institutionId: v.credential.institutionId || null,
      };
    },
    async verify(by, value, target) {
      const v = await (target ? clientFor(target.rpcUrl) : client).readContract({
        ...(target ? contractAt(target.registry) : registry),
        functionName: by === "id" ? "verifyById" : "verifyByHash",
        args: [value],
      });
      const c = v.credential;
      return {
        status: STATUSES[v.status] ?? "not_found",
        credentialId: v.credentialId,
        institution: v.institutionName,
        issuedAt: isoDate(c.issuedAt),
        revokedAt: isoDate(c.revokedAt),
        revocationReason: REASONS[c.revocationReason] ?? null,
        replacedBy: c.replacedBy === NO_ID ? null : c.replacedBy,
        fileHash: c.fileHash,
      };
    },
    async listInstitutions() {
      const count = await client.readContract({ ...registry, functionName: "institutionCount" });
      const out: InstitutionInfo[] = [];
      for (let id = 1; id <= count; id++) {
        const i = await client.readContract({ ...registry, functionName: "getInstitution", args: [id] });
        out.push({ id, name: i.name, active: i.status === 1, admin: i.admin });
      }
      return out;
    },
  };
}

/** The web app derives the same value: see web/src/lib/certificateCode.ts. */
export const credentialIdFor = (code: string): Hex => keccak256(new TextEncoder().encode(`legitify:credential:${code}`));
export const keccakChallenge = (text: string) => keccak256(new TextEncoder().encode(text));
