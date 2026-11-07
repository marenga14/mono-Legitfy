<script setup lang="ts">
import { RouterLink } from "vue-router";
import { t } from "../lib/i18n";
</script>

<template>
  <section class="mx-auto max-w-2xl px-5 py-20">
    <h1 class="text-5xl">{{ t("notFound.title") }}</h1>
    <p class="mt-4"><RouterLink to="/" class="link">{{ t("notFound.home") }}</RouterLink></p>
  </section>
</template>
