import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from 'vitest/config'
import { standaloneAssetsPlugin } from './util/viteStandalone'

export default defineConfig({
  plugins: [
    svelte(),
    // src/ts/standalone.ts 가 사용하는 가상 모듈 (테스트에서는 빈 객체)
    standaloneAssetsPlugin(false),
  ],
  resolve: {
    alias: {
      src: '/src',
    },
    conditions: ['browser'],
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['vitest.setup.ts'],
  },
})
