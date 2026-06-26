import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.abs.ppw',
  appName: 'PPW',
  webDir: 'dist',
  // Load the live web app from AWS instead of the bundled copy. This makes the
  // installed APK a thin shell: every deploy to admin.onlineppw.com is reflected
  // in the app on next launch, with no APK rebuild needed. Also fixes the old
  // hardcoded dev API URL — the app now runs the same code as the website, so
  // api.ts resolves to '/api' (same-origin) just like the browser.
  server: {
    url: 'https://admin.onlineppw.com',
    cleartext: false,
  },
};

export default config;
