import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.boothbook.app',
  appName: 'BoothBook',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#fef9ec',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
