<script setup lang="ts">
import { usePWAUpdate } from "@/composables/usePWAUpdate";

const { needRefresh, updateApp } = usePWAUpdate();

const dismiss = () => {
  needRefresh.value = false;
};
</script>

<template>
  <Transition name="pwa-bar">
    <div v-if="needRefresh" class="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3">
      <div class="flex items-center gap-4 rounded-xl border border-white/10 bg-black/60 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur" role="status">
        <span class="bg-accent-400 h-2 w-2 shrink-0 animate-pulse rounded-full" aria-hidden="true" />
        <div class="min-w-0">
          <p class="text-ink-100 text-sm font-medium">New version available</p>
          <p class="text-ink-400 text-xs">Reload to get the latest Galaxy Keeper.</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button type="button" class="text-ink-400 hover:text-ink-100 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors" @click="dismiss">Later</button>
          <button type="button" class="bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 text-xs font-semibold text-black transition-colors" @click="updateApp()">
            Reload
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pwa-bar-enter-active,
.pwa-bar-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}
.pwa-bar-enter-from,
.pwa-bar-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
