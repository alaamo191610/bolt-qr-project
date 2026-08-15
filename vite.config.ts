import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

const sentrySourceMapsEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN
  && process.env.SENTRY_ORG
  && process.env.SENTRY_PROJECT
  && process.env.SENTRY_RELEASE,
);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(sentrySourceMapsEnabled ? [sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      release: { name: process.env.SENTRY_RELEASE },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      telemetry: false,
    })] : []),
  ],
  build: {
    sourcemap: sentrySourceMapsEnabled ? 'hidden' : false,
  },
  optimizeDeps: {
    include: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0',  // This exposes the Vite server to your local network
    port: 5173,        // Optional: specify a custom port if necessary
  },
});
