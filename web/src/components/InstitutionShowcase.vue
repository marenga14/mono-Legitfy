<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../lib/api";
import { apiUrl } from "../lib/config";
import { t } from "../lib/i18n";

interface Listed { id: number; name: string; location: string }
/** Below this, a moving strip would just repeat the same few logos. */
const MIN_TO_SCROLL = 5;
const items = ref<Listed[]>([]);
onMounted(async () => {
  items.value = await api<Listed[]>("/institutions/showcase").catch(() => []);
});
const scrolls = computed(() => items.value.length >= MIN_TO_SCROLL);
</script>

<template>
  <section v-if="items.length" class="mx-auto mt-16 max-w-7xl px-6" :aria-label="t('showcase.title')">
    <h2 class="text-3xl">{{ t("showcase.title") }}</h2>
    <p class="mt-2 max-w-xl text-ink-soft">{{ t("showcase.sub") }}</p>
    <div :class="['mt-7', scrolls && 'strip']" tabindex="0" role="region" :aria-label="t('showcase.title')">
      <ul :class="['flex gap-4', scrolls ? 'track' : 'flex-wrap']">
        <li v-for="i in items" :key="i.id" class="item">
          <span class="plate"><img :src="`${apiUrl}/institutions/${i.id}/logo`" :alt="i.name" loading="lazy" /></span>
          <span class="mt-2 block text-sm font-semibold">{{ i.name }}</span>
          <span v-if="i.location" class="block text-sm text-ink-soft">{{ i.location }}</span>
        </li>
        <template v-if="scrolls">
          <!-- The second copy closes the loop, so it's hidden from screen readers. -->
          <li v-for="i in items" :key="`again-${i.id}`" class="item" aria-hidden="true">
            <span class="plate"><img :src="`${apiUrl}/institutions/${i.id}/logo`" alt="" loading="lazy" /></span>
            <span class="mt-2 block text-sm font-semibold">{{ i.name }}</span>
            <span v-if="i.location" class="block text-sm text-ink-soft">{{ i.location }}</span>
          </li>
        </template>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.item { flex: none; width: 11.5rem; }
/* Logos are drawn for white paper, so they keep one in both themes. */
.plate { display: grid; place-items: center; height: 6.5rem; padding: 1rem; background: #fff; border-radius: 10px; }
.plate img { max-width: 100%; max-height: 100%; object-fit: contain; }
.strip { overflow: hidden; mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent); }
.track { width: max-content; animation: slide 45s linear infinite; }
.strip:hover .track, .strip:focus-within .track, .strip:focus .track { animation-play-state: paused; }
@keyframes slide { to { transform: translateX(calc(-50% - 0.5rem)); } }
@media (prefers-reduced-motion: reduce) {
  .strip { overflow-x: auto; mask-image: none; }
  .track { animation: none; }
}
</style>
