/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Release tag or branch of this build, set by the Jenkins build (see src/version.ts) */
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_COMMIT?: string;
}
