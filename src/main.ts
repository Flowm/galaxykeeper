import { createApp } from "vue";

import { usePWAUpdate } from "@/composables/usePWAUpdate";

import "./style.css";
import App from "./App.vue";

createApp(App).mount("#app");

// Register the service worker; the update prompt is rendered by PWAUpdateBar.
usePWAUpdate();
