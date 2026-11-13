// Copies the Starknet registry's ABI and class hash to the API and web app.
// Run after `scarb build` in contracts-starknet: node scripts/starknet-abi.mjs
// The class hash is how the API recognises our registry when the platform admin lists a network,
// so a contract built from different source is refused.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { hash } = createRequire(path.join(root, "api", "package.json"))("starknet");

const built = path.join(root, "contracts-starknet/target/dev/legitify_starknet_LegitifyRegistry.contract_class.json");
const sierra = JSON.parse(await readFile(built, "utf8"));
const classHash = hash.computeContractClassHash(sierra);
const out = `${JSON.stringify({ classHash, abi: sierra.abi }, null, 1)}\n`;

for (const target of ["api/src/starknet-registry.json", "web/src/lib/starknet-registry.json"]) {
  await writeFile(path.join(root, target), out);
  console.log(`wrote ${target}`);
}
console.log(`class hash ${classHash}`);
