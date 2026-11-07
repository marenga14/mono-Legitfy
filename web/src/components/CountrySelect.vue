<script setup lang="ts">
import { computed } from "vue";
import { currentLocale, t } from "../lib/i18n";
import { countriesFor } from "../lib/places";

const country = defineModel<string>({ required: true });
const countries = computed(() => countriesFor(currentLocale()));
</script>

<template>
  <select v-model="country" class="field mt-1" required autocomplete="country-name">
    <option value="" disabled>{{ t("apply.chooseCountry") }}</option>
    <option v-for="c in countries" :key="c.value" :value="c.value">{{ c.label }}</option>
  </select>
</template>
