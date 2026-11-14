import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android wrapper for the live site.
 *
 * The WebView loads the deployed URL (not bundled files) so that the app keeps
 * the portal's origin: login cookies, the shared AI config in localStorage and
 * every /comfyforge/api/* call behave exactly like in a browser.
 */
const config: CapacitorConfig = {
  appId: 'online.devhorizon.comfyforge',
  appName: 'ComfyForge AI IDE',
  webDir: 'dist',
  backgroundColor: '#0B0D14',
  server: {
    url: 'https://aistudio.devhorizon.online/comfyforge/',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: ['aistudio.devhorizon.online', 'ai.devhorizon.online'],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
