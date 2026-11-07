import type { Art } from "../components/Illustration.vue";

/** One illustrated row. Pages reuse these, so a claim only ever has to be right in one place. */
export const STORIES = {
  slow: "scatter", fakes: "forgery", waiting: "waiting", exposed: "leak",
  publish: "fingerprint", check: "check", ask: "desk", private: "shield",
  apply: "mandate", share: "share", noPersonalData: "ledger", history: "chain", people: "person",
} as const satisfies Record<string, Art>;

export type Story = keyof typeof STORIES;
