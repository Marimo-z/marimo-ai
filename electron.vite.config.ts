import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ include: ['sherpa-onnx-node'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve('electron/main/index.ts'),
          'local-voice-worker': resolve('electron/main/services/local-voice/worker.ts')
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve('electron/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: { pet: resolve('pet.html'), settings: resolve('settings.html') }
      }
    },
    plugins: [vue()]
  }
})
