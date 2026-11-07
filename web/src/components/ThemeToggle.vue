<script setup lang="ts">
import { Moon, Sun } from "lucide-vue-next";
import { t } from "../lib/i18n";
import { theme, toggleTheme } from "../lib/theme";
</script>

<template>
  <button type="button" class="btn-icon" :aria-label="t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')" :title="t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')" @click="toggleTheme">
    <Sun v-if="theme === 'dark'" class="size-5" aria-hidden="true" />
    <Moon v-else class="size-5" aria-hidden="true" />
  </button>
</template>
