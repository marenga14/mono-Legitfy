<script setup lang="ts">
import DocSheet from "./DocSheet.vue";
import PrintMark from "./PrintMark.vue";

export type Art = "scatter" | "forgery" | "waiting" | "leak" | "fingerprint" | "check" | "desk" | "shield" | "mandate" | "share" | "ledger" | "chain" | "person";
defineProps<{ name: Art }>();
</script>

<template>
  <svg viewBox="0 0 480 360" aria-hidden="true" class="art">
    <circle cx="240" cy="180" r="158" class="halo" />
    <circle cx="240" cy="180" r="158" class="orbit" />

    <template v-if="name === 'scatter'">
      <DocSheet :x="62" :y="92" :w="104" :h="136" :rotate="-13" />
      <DocSheet :x="312" :y="58" :w="104" :h="136" :rotate="11" />
      <DocSheet :x="296" :y="190" :w="96" :h="124" :rotate="-6" :lines="3" />
      <g transform="translate(150 212) rotate(6)"><rect width="128" height="84" rx="8" class="sheet" /><path d="M4 8l60 44 60-44" class="line" /></g>
      <g transform="translate(182 60)"><rect width="74" height="126" rx="12" class="sheet" /><rect x="10" y="16" width="54" height="86" rx="3" class="tint" /><circle cx="37" cy="114" r="4" class="line" /></g>
      <g class="warn"><circle cx="118" cy="58" r="22" /><path d="M111 52a7 7 0 1 1 10 6c-2 1-3 3-3 5M118 71v.5" /></g>
      <g class="warn"><circle cx="404" cy="288" r="16" /><path d="M399 283a5 5 0 1 1 7 5c-1 1-2 2-2 4M404 299v.5" /></g>
    </template>

    <template v-else-if="name === 'forgery'">
      <DocSheet :x="70" :y="74" :w="150" :h="206" :lines="6"><circle cx="118" cy="168" r="20" class="stampOk" /><path d="M110 168l6 6 11-12" class="good" /></DocSheet>
      <DocSheet :x="256" :y="74" :w="150" :h="206" :lines="6"><circle cx="118" cy="168" r="20" class="stampBad" /><path d="M110 168l6 6 11-12" class="badLine" /></DocSheet>
      <g transform="translate(330 196)"><circle r="46" class="lens" /><path d="M33 33l44 44" class="handle" /><path d="M-16-10l32 20M16-10L-16 10" class="badLine" /></g>
    </template>

    <template v-else-if="name === 'waiting'">
      <DocSheet :x="84" :y="96" :w="130" :h="172" :lines="5" />
      <g transform="translate(290 176)"><circle r="74" class="sheet" /><circle r="74" class="line" /><path d="M0-48V0l32 20" class="accent" /><path v-for="a in [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]" :key="a" :transform="`rotate(${a})`" d="M0-66v6" class="line" /></g>
      <path d="M216 180h22" class="dash" />
      <g class="warn"><circle cx="372" cy="94" r="20" /><path d="M372 84v12M372 104v.5" /></g>
    </template>

    <template v-else-if="name === 'leak'">
      <g transform="translate(70 190)"><rect width="150" height="100" rx="8" class="sheet" /><path d="M5 9l70 50 70-50" class="line" /></g>
      <path d="M210 196c50-70 90-60 118-100" class="dash" /><path d="M200 262c80 10 110-20 150-16" class="dash" />
      <DocSheet :x="318" :y="46" :w="86" :h="112" :rotate="9" :lines="3" />
      <DocSheet :x="344" :y="200" :w="86" :h="112" :rotate="-7" :lines="3" />
      <g class="warn"><path d="M82 96c22-30 66-30 88 0-22 30-66 30-88 0z" /><circle cx="126" cy="96" r="12" /></g>
    </template>

    <template v-else-if="name === 'fingerprint'">
      <DocSheet :x="58" :y="70" :w="150" :h="212" :lines="7" />
      <path d="M208 176h44" class="dash" />
      <g class="printInk"><circle cx="312" cy="170" r="74" class="sheet" /><PrintMark :x="244" :y="100" :size="136" seed="7a41c9e2" /></g>
      <g transform="translate(262 276)"><rect width="30" height="30" rx="6" class="tintSolid" /><rect x="40" width="30" height="30" rx="6" class="tintSolid" /><rect x="80" width="30" height="30" rx="6" class="accentSolid" /><path d="M30 15h10M70 15h10" class="accent" /></g>
    </template>

    <template v-else-if="name === 'check'">
      <g transform="translate(70 66)"><rect width="340" height="214" rx="14" class="sheet" /><rect x="14" y="14" width="312" height="186" rx="6" class="tint" /><path d="M-30 228h400l-24 18H-6z" class="sheet" /></g>
      <DocSheet :x="104" :y="104" :w="100" :h="140" :lines="4" />
      <g class="printInk"><PrintMark :x="230" :y="96" :size="130" seed="b3d25f18" /></g>
      <g transform="translate(346 214)"><circle r="30" class="okBadge" /><path d="M-13 0l9 9 18-20" class="okMark" /></g>
    </template>

    <template v-else-if="name === 'desk'">
      <path d="M92 282h296v-30H292v-58h-96v-58H92z" class="sheet" />
      <path d="M92 252h200M92 194h104" class="line" />
      <g transform="translate(112 92)"><circle cx="24" cy="14" r="14" class="tintSolid" /><path d="M0 44c6-24 42-24 48 0" class="line" /></g>
      <g transform="translate(214 150)"><circle cx="24" cy="14" r="14" class="tintSolid" /><path d="M0 44c6-24 42-24 48 0" class="line" /></g>
      <g transform="translate(310 208)"><circle cx="24" cy="14" r="14" class="accentSolid" /><path d="M0 44c6-24 42-24 48 0" class="line" /></g>
      <path d="M368 188C366 120 320 92 262 88" class="dash" /><path d="M274 80l-13 8 12 10" class="accent" />
      <DocSheet :x="356" :y="108" :w="62" :h="80" :lines="2" :rotate="7" />
    </template>

    <template v-else-if="name === 'shield'">
      <DocSheet :x="96" :y="86" :w="122" :h="164" :rotate="-10" :lines="5" />
      <path d="M268 58l92 34v78c0 62-40 104-92 126-52-22-92-64-92-126V92z" class="sheet" />
      <path d="M268 58l92 34v78c0 62-40 104-92 126-52-22-92-64-92-126V92z" class="accent" />
      <rect x="232" y="158" width="72" height="58" rx="10" class="accentSolid" />
      <path d="M246 158v-18a22 22 0 0 1 44 0v18" class="accent" /><circle cx="268" cy="184" r="7" class="punch" />
    </template>

    <template v-else-if="name === 'mandate'">
      <DocSheet :x="110" :y="42" :w="210" :h="280" :lines="9">
        <path d="M18 216c14-22 24-22 22-6s12-14 20-4 14-4 34-2" class="accent" />
        <path d="M16 236h86" class="line" />
      </DocSheet>
      <g transform="translate(352 244)"><circle r="46" class="stampOk" /><circle r="35" class="stampOk" /><path d="M-13 0l9 9 18-20" class="good" /></g>
      <g transform="translate(330 88)"><rect width="104" height="66" rx="10" class="sheet" /><rect x="66" y="24" width="38" height="20" rx="6" class="tintSolid" /><circle cx="78" cy="34" r="4" class="accentSolid" /></g>
    </template>

    <template v-else-if="name === 'share'">
      <DocSheet :x="72" :y="84" :w="130" :h="182" :lines="5" />
      <g transform="translate(232 148)" class="accent"><rect width="56" height="30" rx="15" /><rect x="40" width="56" height="30" rx="15" /></g>
      <DocSheet :x="344" :y="96" :w="84" :h="112" :lines="3" />
      <g transform="translate(386 256)"><circle r="32" class="sheet" /><circle r="32" class="line" /><path d="M0-20V0l14 8" class="accent" /></g>
      <path d="M204 164h26M330 164h14" class="dash" />
    </template>

    <template v-else-if="name === 'ledger'">
      <g v-for="(row, r) in [0, 1, 2]" :key="r" :transform="`translate(84 ${88 + row * 62})`">
        <rect width="312" height="50" rx="8" class="sheet" />
        <g class="printInk"><PrintMark :x="10" :y="4" :size="42" :seed="['1f8a3c7e', 'c94e21b6', '5ad07f39'][r]!" /></g>
        <rect x="66" y="14" width="150" height="6" rx="3" class="ink" /><rect x="66" y="28" width="94" height="4" rx="2" class="soft" />
        <circle cx="284" cy="25" r="11" class="okBadge" /><path d="M278 25l4 4 8-9" class="okMark thin" />
      </g>
      <g transform="translate(404 72)"><circle r="30" class="noBadge" /><circle cy="-8" r="8" class="punchLine" /><path d="M-14 16c3-16 25-16 28 0" class="punchLine" /><path d="M-20-20L20 20" class="punchLine" /></g>
    </template>

    <template v-else-if="name === 'chain'">
      <g v-for="(x, i) in [66, 176, 286]" :key="x" :transform="`translate(${x} 132)`">
        <rect width="92" height="96" rx="10" class="sheet" />
        <rect x="14" y="16" width="64" height="6" rx="3" class="ink" /><rect x="14" y="32" width="48" height="4" rx="2" class="soft" /><rect x="14" y="44" width="56" height="4" rx="2" class="soft" />
        <rect x="14" y="64" width="64" height="16" rx="4" :class="i === 2 ? 'accentSolid' : 'tintSolid'" />
      </g>
      <path d="M158 180h18M268 180h18" class="accent" />
      <path d="M378 180h18" class="dash" />
      <g transform="translate(416 180)"><rect x="-20" y="-20" width="40" height="40" rx="8" class="accentSolid" /><path d="M-8 0l6 6 11-13" class="punchLine" /></g>
    </template>

    <template v-else>
      <g transform="translate(92 70)"><circle cx="66" cy="58" r="46" class="tintSolid" /><path d="M0 214c10-92 122-92 132 0" class="sheet" /><path d="M0 214c10-92 122-92 132 0" class="line" /></g>
      <DocSheet :x="238" :y="72" :w="152" :h="208" :lines="6" />
      <g transform="translate(350 236)"><circle r="40" class="okBadge" /><path d="M-18 0l13 13 25-28" class="okMark" /></g>
    </template>
  </svg>
</template>

<style scoped>
.art { width: 100%; height: auto; overflow: visible; }
.art :deep(.halo), .halo { fill: color-mix(in srgb, var(--color-periwinkle) 11%, transparent); }
.orbit { fill: none; stroke: color-mix(in srgb, var(--color-periwinkle) 34%, transparent); stroke-dasharray: 2 9; stroke-linecap: round; }
.art :deep(.sheet) { fill: var(--color-sheet); stroke: color-mix(in srgb, var(--color-ink) 42%, transparent); stroke-width: 1.5; }
.art :deep(.ink) { fill: color-mix(in srgb, var(--color-ink) 70%, transparent); stroke: none; }
.art :deep(.soft) { fill: color-mix(in srgb, var(--color-ink-soft) 42%, transparent); stroke: none; }
.line { fill: none; stroke: color-mix(in srgb, var(--color-ink) 42%, transparent); stroke-width: 1.5; stroke-linecap: round; }
.art :deep(.line) { fill: none; stroke: color-mix(in srgb, var(--color-ink) 42%, transparent); stroke-width: 1.5; stroke-linecap: round; }
.dash { fill: none; stroke: var(--color-periwinkle); stroke-width: 2; stroke-dasharray: 3 8; stroke-linecap: round; }
.art :deep(.accent), .accent, .accent rect { fill: none; stroke: var(--color-periwinkle); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.tint { fill: color-mix(in srgb, var(--color-periwinkle) 16%, transparent); }
.tintSolid { fill: color-mix(in srgb, var(--color-periwinkle) 34%, var(--color-sheet)); }
.accentSolid { fill: var(--color-stamp); }
.punch { fill: var(--color-sheet); }
.punchLine { fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.warn { fill: var(--color-sheet); stroke: var(--color-caution); stroke-width: 2.5; stroke-linecap: round; }
.art :deep(.stampOk) { fill: color-mix(in srgb, var(--color-approve) 12%, transparent); stroke: var(--color-approve); stroke-width: 2; }
.art :deep(.stampBad) { fill: color-mix(in srgb, var(--color-seal) 10%, transparent); stroke: var(--color-seal); stroke-width: 2; stroke-dasharray: 4 3; }
.art :deep(.good) { fill: none; stroke: var(--color-approve); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.art :deep(.badLine), .badLine { fill: none; stroke: var(--color-seal); stroke-width: 3; stroke-linecap: round; }
.lens { fill: color-mix(in srgb, var(--color-sheet) 80%, transparent); stroke: var(--color-periwinkle); stroke-width: 4; }
.handle { fill: none; stroke: var(--color-periwinkle); stroke-width: 9; stroke-linecap: round; }
.okBadge { fill: var(--color-approve); }
.noBadge { fill: var(--color-seal); }
.okMark { fill: none; stroke: var(--color-paper); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
.okMark.thin { stroke-width: 2.5; }
.printInk { stroke: var(--color-periwinkle); }
</style>
