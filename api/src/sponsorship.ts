import { decodeFunctionData, getAddress, parseAbi, type Address, type Hex } from "viem";

const accountAbi = parseAbi(["function execute(address dest, uint256 value, bytes func)"]);
const registryAbi = parseAbi([
  "function issue(bytes32,bytes32)",
  "function issueBatch((bytes32,bytes32)[])",
  "function revoke(bytes32,uint8)",
  "function supersede(bytes32,bytes32,bytes32)",
  "function addOperator(address)",
  "function removeOperator(address)",
]);

export type Denial = "bad_call" | "wrong_target" | "value_not_allowed" | "not_a_member" | "quota_exceeded";

export interface SponsorInput {
  sender: Address;
  callData: Hex;
  registry: Address;
  isActiveMember: boolean;
  usedToday: number;
  dailyQuota: number;
}

/** Decides whether Legitfy pays for a UserOperation. Anything unrecognised is refused. */
export function evaluateSponsorship(input: SponsorInput): Denial | null {
  if (!input.isActiveMember) return "not_a_member";
  if (input.usedToday >= input.dailyQuota) return "quota_exceeded";
  try {
    const outer = decodeFunctionData({ abi: accountAbi, data: input.callData });
    const [dest, value, func] = outer.args;
    if (getAddress(dest) !== getAddress(input.registry)) return "wrong_target";
    if (value !== 0n) return "value_not_allowed";
    decodeFunctionData({ abi: registryAbi, data: func });
    return null;
  } catch {
    return "bad_call";
  }
}
