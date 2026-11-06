import { createApp } from "vue";

import App from "./App.vue";

import "./style.css";
import { usePWAUpdate } from "./composables/usePWAUpdate";

createApp(App).mount("#app");

// Register the service worker; the update prompt is rendered by PWAUpdateBar.
usePWAUpdate();
