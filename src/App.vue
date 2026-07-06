<script setup lang="ts">
import { computed, ref } from "vue";

import { buildArchive } from "@/lib/archive";
import { createProxyFetcher } from "@/lib/fetcher";
import type { ArchiveProgress, ArchiveResult } from "@/lib/types";

const EXAMPLE = "https://factorio.com/galaxy/Sulfur%20II:%20Alpha7-6.G2T1";

type State = "idle" | "running" | "done" | "error";

const url = ref("");
const state = ref<State>("idle");
const progress = ref<ArchiveProgress | null>(null);
const result = ref<ArchiveResult | null>(null);
const errorMsg = ref("");

const fetcher = createProxyFetcher();
const buildSha = __BUILD_SHA__;

let viewerJsCache: Uint8Array | null = null;
async function loadViewerJs(): Promise<Uint8Array> {
  if (viewerJsCache) return viewerJsCache;
  const res = await fetch("/viewer.js");
  if (!res.ok) throw new Error(`Could not load the bundled map viewer (${res.status}).`);
  viewerJsCache = new Uint8Array(await res.arrayBuffer());
  return viewerJsCache;
}

const percent = computed(() => {
  const p = progress.value;
  return p && p.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0;
});

function formatSize(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

async function run(): Promise<void> {
  const input = url.value.trim();
  if (!input || state.value === "running") return;
  state.value = "running";
  progress.value = null;
  result.value = null;
  errorMsg.value = "";
  try {
    const viewerJs = await loadViewerJs();
    result.value = await buildArchive(input, fetcher, {
      viewerJs,
      onProgress: (p) => {
        progress.value = p;
      },
    });
    state.value = "done";
  } catch (err) {
    errorMsg.value = (err as Error).message || "Something went wrong while building the archive.";
    state.value = "error";
  }
}

function download(): void {
  if (!result.value) return;
  const blob = new Blob([result.value.bytes as BlobPart], { type: "application/zip" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = result.value.filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function reset(): void {
  state.value = "idle";
  result.value = null;
  progress.value = null;
  errorMsg.value = "";
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-10 sm:py-16">
    <!-- Hero -->
    <header class="text-center">
      <div class="border-accent-500/30 bg-accent-500/10 text-accent-300 mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium tracking-wide">
        <span class="bg-accent-400 size-1.5 rounded-full"></span>
        Factorio Galaxy of Fame backup
      </div>
      <h1 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">Galaxy Keeper</h1>
      <p class="text-ink-400 mx-auto mt-3 max-w-xl text-balance">
        The Galaxy of Fame keeps only <strong class="text-ink-200">one upload per player</strong>. Paste your galaxy link to download a complete, self-contained
        <strong class="text-ink-200">offline copy</strong> — every page, icon, font and the interactive factory map — before you re-upload.
      </p>
    </header>

    <!-- Input card -->
    <section class="mt-9 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-6">
      <label for="galaxy-url" class="text-ink-300 block text-sm font-medium">Galaxy link</label>
      <div class="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="galaxy-url"
          v-model="url"
          type="url"
          :placeholder="EXAMPLE"
          spellcheck="false"
          autocomplete="off"
          class="text-ink-100 placeholder:text-ink-600 focus:border-accent-400/60 focus:ring-accent-400/20 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm transition outline-none focus:ring-2"
          @keyup.enter="run"
        />
        <button
          type="button"
          :disabled="state === 'running' || !url.trim()"
          class="bg-accent-500 hover:bg-accent-400 shrink-0 rounded-xl px-5 py-3 font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-40"
          @click="run"
        >
          {{ state === "running" ? "Working…" : "Create offline archive" }}
        </button>
      </div>
      <button type="button" class="text-ink-500 hover:text-accent-300 mt-2 text-xs transition" @click="url = EXAMPLE">Use the example link</button>
    </section>

    <!-- Progress -->
    <section v-if="state === 'running'" class="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6" aria-live="polite">
      <div class="flex items-baseline justify-between">
        <span class="text-ink-200 font-medium">{{ progress?.step ?? "Starting…" }}</span>
        <span class="text-ink-400 font-mono text-sm">
          {{ progress ? `${progress.loaded} / ${progress.total}` : "" }}
        </span>
      </div>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-black/40">
        <div class="from-accent-500 to-accent-300 h-full rounded-full bg-gradient-to-r transition-all duration-300" :style="{ width: `${percent}%` }"></div>
      </div>
      <p class="text-ink-500 mt-3 text-xs">Collecting pages, icons, fonts and the rendered map bundle through the proxy. This usually takes a few seconds.</p>
    </section>

    <!-- Done -->
    <section v-else-if="state === 'done' && result" class="border-positive-500/20 bg-positive-500/[0.04] mt-6 rounded-2xl border p-5 sm:p-6">
      <div class="flex items-center gap-3">
        <div class="bg-positive-500/15 text-positive-300 flex size-9 items-center justify-center rounded-full">✓</div>
        <div>
          <h2 class="font-semibold text-white">Archive ready</h2>
          <p class="text-ink-400 text-sm">
            <span class="text-ink-200">{{ result.meta.title }}</span>
            · {{ result.iconCount }} icons · {{ result.fileCount }} files · {{ formatSize(result.bytes.length) }}
          </p>
        </div>
      </div>

      <div class="mt-5 flex flex-col gap-3 sm:flex-row">
        <button type="button" class="bg-accent-500 hover:bg-accent-400 rounded-xl px-5 py-3 font-semibold text-black transition" @click="download">
          ↓ Download {{ result.filename }}
        </button>
        <button type="button" class="text-ink-300 rounded-xl border border-white/10 px-5 py-3 font-medium transition hover:bg-white/5" @click="reset">Archive another save</button>
      </div>

      <p class="text-ink-500 mt-5 border-t border-white/10 pt-4 text-xs leading-relaxed">
        Unzip and open <code class="text-ink-300">index.html</code> in any browser. Everything — including the interactive
        <strong class="text-ink-300">Planets / Platforms maps</strong> — runs straight from disk, with no web server and no internet.
      </p>
    </section>

    <!-- Error -->
    <section v-else-if="state === 'error'" class="border-danger-500/30 bg-danger-500/[0.06] mt-6 rounded-2xl border p-5 sm:p-6">
      <h2 class="text-danger-200 font-semibold">Couldn't build the archive</h2>
      <p class="text-danger-300/90 mt-1 text-sm">{{ errorMsg }}</p>
      <button type="button" class="text-ink-300 mt-4 rounded-xl border border-white/10 px-4 py-2 text-sm transition hover:bg-white/5" @click="reset">Try again</button>
    </section>

    <div class="flex-1"></div>

    <footer class="text-ink-600 mt-12 text-center text-xs">
      Not affiliated with Wube Software. Fetches only public Galaxy of Fame data.
      <span class="mx-1 opacity-50">·</span>
      <a href="https://github.com/Flowm/GalaxyKeeper" target="_blank" rel="noopener" class="hover:text-ink-400 transition">GitHub</a>
      <span class="mx-1 opacity-50">·</span>
      <span class="text-ink-500">build {{ buildSha }}</span>
    </footer>
  </div>
</template>
