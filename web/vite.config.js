import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Multi-page build:
//   index.html — the KINESIS study site (unchanged)
//   pitch.html — the investor deck shell (src/pitch/*)
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main:  fileURLToPath(new URL('./index.html', import.meta.url)),
        pitch: fileURLToPath(new URL('./pitch.html', import.meta.url)),
      },
    },
  },
});
