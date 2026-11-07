<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { t } from "../lib/i18n";
import { regionsOf } from "../lib/places";

const props = defineProps<{ country: string }>();
const district = defineModel<string>({ required: true });
const NOT_LISTED = "__not_listed__";
const options = computed(() => regionsOf(props.country));
const typing = ref(false);
const choice = computed({
  get: () => (typing.value ? NOT_LISTED : district.value),
  set: (value) => {
    typing.value = value === NOT_LISTED;
    district.value = typing.value ? "" : value;
  },
});
watch(() => props.country, () => {
  typing.value = false;
  district.value = "";
});
</script>

<template>
  <select v-if="options.length" v-model="choice" class="field mt-1" required>
    <option value="" disabled>{{ t(country ? "apply.chooseDistrict" : "apply.chooseCountryFirst") }}</option>
    <option v-for="name in options" :key="name" :value="name">{{ name }}</option>
    <option :value="NOT_LISTED">{{ t("apply.districtNotListed") }}</option>
  </select>
  <input v-if="typing || !options.length" v-model="district" class="field mt-1" required minlength="2" maxlength="100" :aria-label="t('apply.city')" :placeholder="t('apply.districtPlaceholder')" />
</template>
