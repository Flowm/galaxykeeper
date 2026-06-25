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
      <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium tracking-wide text-amber-300">
        <span class="size-1.5 rounded-full bg-amber-400"></span>
        Factorio Galaxy of Fame backup
      </div>
      <h1 class="text-3xl font-bold tracking-tight text-white sm:text-4xl">Galaxy Keeper</h1>
      <p class="mx-auto mt-3 max-w-xl text-balance text-zinc-400">
        The Galaxy of Fame keeps only <strong class="text-zinc-200">one upload per player</strong>. Paste your galaxy link to download a complete, self-contained
        <strong class="text-zinc-200">offline copy</strong> — every page, icon, font and the interactive factory map — before you re-upload.
      </p>
    </header>

    <!-- Input card -->
    <section class="mt-9 rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-6">
      <label for="galaxy-url" class="block text-sm font-medium text-zinc-300">Galaxy link</label>
      <div class="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="galaxy-url"
          v-model="url"
          type="url"
          :placeholder="EXAMPLE"
          spellcheck="false"
          autocomplete="off"
          class="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-zinc-100 transition outline-none placeholder:text-zinc-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20"
          @keyup.enter="run"
        />
        <button
          type="button"
          :disabled="state === 'running' || !url.trim()"
          class="shrink-0 rounded-xl bg-amber-500 px-5 py-3 font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          @click="run"
        >
          {{ state === "running" ? "Working…" : "Create offline archive" }}
        </button>
      </div>
      <button type="button" class="mt-2 text-xs text-zinc-500 transition hover:text-amber-300" @click="url = EXAMPLE">Use the example link</button>
    </section>

    <!-- Progress -->
    <section v-if="state === 'running'" class="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6" aria-live="polite">
      <div class="flex items-baseline justify-between">
        <span class="font-medium text-zinc-200">{{ progress?.step ?? "Starting…" }}</span>
        <span class="font-mono text-sm text-zinc-400">
          {{ progress ? `${progress.loaded} / ${progress.total}` : "" }}
        </span>
      </div>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-black/40">
        <div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300" :style="{ width: `${percent}%` }"></div>
      </div>
      <p class="mt-3 text-xs text-zinc-500">Collecting pages, icons, fonts and the rendered map bundle through the proxy. This usually takes a few seconds.</p>
    </section>

    <!-- Done -->
    <section v-else-if="state === 'done' && result" class="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 sm:p-6">
      <div class="flex items-center gap-3">
        <div class="flex size-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">✓</div>
        <div>
          <h2 class="font-semibold text-white">Archive ready</h2>
          <p class="text-sm text-zinc-400">
            <span class="text-zinc-200">{{ result.meta.title }}</span>
            · {{ result.iconCount }} icons · {{ result.fileCount }} files · {{ formatSize(result.bytes.length) }}
          </p>
        </div>
      </div>

      <div class="mt-5 flex flex-col gap-3 sm:flex-row">
        <button type="button" class="rounded-xl bg-amber-500 px-5 py-3 font-semibold text-black transition hover:bg-amber-400" @click="download">
          ↓ Download {{ result.filename }}
        </button>
        <button type="button" class="rounded-xl border border-white/10 px-5 py-3 font-medium text-zinc-300 transition hover:bg-white/5" @click="reset">Archive another save</button>
      </div>

      <p class="mt-5 border-t border-white/10 pt-4 text-xs leading-relaxed text-zinc-500">
        Unzip and open <code class="text-zinc-300">index.html</code> in any browser. Everything — including the interactive
        <strong class="text-zinc-300">Planets / Platforms maps</strong> — runs straight from disk, with no web server and no internet.
      </p>
    </section>

    <!-- Error -->
    <section v-else-if="state === 'error'" class="mt-6 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5 sm:p-6">
      <h2 class="font-semibold text-red-200">Couldn't build the archive</h2>
      <p class="mt-1 text-sm text-red-300/90">{{ errorMsg }}</p>
      <button type="button" class="mt-4 rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5" @click="reset">Try again</button>
    </section>

    <div class="flex-1"></div>

    <footer class="mt-12 text-center text-xs text-zinc-600">
      Not affiliated with Wube Software. Fetches only public Galaxy of Fame data.
      <span class="mx-1 opacity-50">·</span>
      <a href="https://github.com/Flowm/GalaxyKeeper" target="_blank" rel="noopener" class="transition hover:text-zinc-400">GitHub</a>
      <span class="mx-1 opacity-50">·</span>
      <span class="text-zinc-500">build {{ buildSha }}</span>
    </footer>
  </div>
</template>
