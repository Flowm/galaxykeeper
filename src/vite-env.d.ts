/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

declare const __BUILD_DATE__: string;
declare const __BUILD_SHA__: string;
