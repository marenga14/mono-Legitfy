<script setup lang="ts">
import NetworkList from "../components/NetworkList.vue";
import { apiUrl, explorerUrl, networkName, shownChainId, shownRegistry, shownRpcUrl } from "../lib/config";
import { t } from "../lib/i18n";
const apiSample = `# By certificate ID
curl ${apiUrl}/public/verify/UD-26-7K4Q9-XPM2N

# By the SHA-256 hash of a file
curl ${apiUrl}/public/verify/file/0x<sha256>

{
  "status": "authentic",
  "institution": "University of Dar es Salaam",
  "issuedAt": "2026-11-07T09:30:00.000Z",
  "revokedAt": null,
  "revocationReason": null,
  "replacedBy": null,
  "network": "BOT Chain"
}`;
const sample = `import { createPublicClient, http, parseAbi } from "viem";

const client = createPublicClient({ transport: http("${shownRpcUrl}") });
const abi = parseAbi([
  "function credentialIdByHash(bytes32) view returns (bytes32)",
]);

const id = await client.readContract({
  address: "${shownRegistry ?? "0xRegistryAddress"}",
  abi,
  functionName: "credentialIdByHash",
  args: [sha256OfFile],
});`;
</script>

<template>
  <section class="mx-auto max-w-5xl px-6 py-14">
    <h1 class="text-6xl">{{ t("developers.title") }}</h1>
    <p class="mt-5 max-w-2xl text-xl text-ink-soft">{{ t("developers.sub") }}</p>
    <h2 class="mt-12 text-3xl">{{ t("developers.network") }}</h2>
    <dl class="mt-4 space-y-2">
      <div class="grid sm:grid-cols-[10rem_1fr]"><dt class="text-ink-soft">{{ t("developers.network") }}</dt><dd>{{ t("developers.networkValue", { network: networkName, id: shownChainId }) }}</dd></div>
      <div class="grid sm:grid-cols-[10rem_1fr]"><dt class="text-ink-soft">{{ t("developers.rpc") }}</dt><dd class="hash">{{ shownRpcUrl }}</dd></div>
      <div class="grid sm:grid-cols-[10rem_1fr]"><dt class="text-ink-soft">{{ t("developers.registry") }}</dt><dd class="hash">{{ shownRegistry ?? t("developers.notDeployed") }}</dd></div>
      <div class="grid sm:grid-cols-[10rem_1fr]"><dt class="text-ink-soft">{{ t("developers.explorer") }}</dt><dd><a class="link" :href="explorerUrl" rel="noopener">{{ explorerUrl }}</a></dd></div>
    </dl>
    <NetworkList class="mt-12" />
    <h2 class="mt-12 text-3xl">{{ t("developers.apiTitle") }}</h2>
    <p class="mt-3 max-w-2xl text-ink-soft">{{ t("developers.apiBody") }}</p>
    <pre class="mt-4 overflow-x-auto glass p-5 text-sm text-ink"><code>{{ apiSample }}</code></pre>
    <p class="mt-3 max-w-2xl text-ink-soft">{{ t("developers.apiStatuses") }}</p>
    <h2 class="mt-12 text-3xl">{{ t("developers.lookup") }}</h2>
    <p class="mt-3 text-ink-soft">{{ t("developers.lookupBefore") }}<code class="hash">verifyById</code>{{ t("developers.lookupAfter") }}</p>
    <pre class="mt-4 overflow-x-auto glass p-5 text-sm text-ink"><code>{{ sample }}</code></pre>
  </section>
</template>
