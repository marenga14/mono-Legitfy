export type RiskLevel = "low" | "medium" | "high";

export const MAX_LEVEL = 3;
export const LEVEL_NAMES: Record<number, string> = { 1: "Officer", 2: "Registrar", 3: "Legal" };
const SLA_HOURS: Record<number, number> = { 1: 72, 2: 48, 3: 24 };

export const dueAt = (level: number, from: Date): Date =>
  new Date(from.getTime() + (SLA_HOURS[level] ?? 24) * 3_600_000);

export interface RoutingInput {
  level: number;
  risk: RiskLevel;
  confidence: number;
  registryStatus: string;
  /** The registry says a different institution issued this file. */
  otherIssuer?: boolean;
}

export interface Routing {
  level: number;
  priority: "normal" | "high";
  reason: string | null;
}

const CONFIDENCE_FLOOR = 0.5;

/**
 * Routes after triage. This can only raise attention, never lower it: the level never drops,
 * and even a "low risk" reading leaves the request with a person. Document text is untrusted,
 * so an instruction hidden in a PDF has nothing to gain here.
 */
export function routeAfterTriage(input: RoutingInput): Routing {
  const { level, risk, confidence, registryStatus, otherIssuer } = input;
  if (registryStatus === "revoked" || registryStatus === "suspended") {
    return { level: Math.max(level, 2), priority: "high", reason: `Registry shows this credential as ${registryStatus}` };
  }
  if (otherIssuer) {
    return { level: Math.max(level, 2), priority: "high", reason: "Registry shows another institution issued this document" };
  }
  if (risk === "high") return { level: Math.max(level, 2), priority: "high", reason: "Agent flagged high risk" };
  if (confidence < CONFIDENCE_FLOOR) {
    return { level: Math.max(level, 2), priority: "normal", reason: "Agent could not read this document confidently" };
  }
  return { level, priority: risk === "medium" ? "high" : "normal", reason: null };
}

export interface SlaResult {
  level: number;
  dueAt: Date;
  reason: string;
}

/** Next step for an overdue request, or null when already at the top of the ladder. */
export function escalateForSla(level: number, now: Date): SlaResult | null {
  if (level >= MAX_LEVEL) return null;
  const next = level + 1;
  return { level: next, dueAt: dueAt(next, now), reason: `No answer in time at ${LEVEL_NAMES[level]} level` };
}
