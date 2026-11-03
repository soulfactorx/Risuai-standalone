import { defineConfig } from "vite";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import wasm from "vite-plugin-wasm";
import strip from '@rollup/plugin-strip';
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { standaloneAssetsPlugin, standalonePlugins, standaloneAssetsInlineLimit } from './util/viteStandalone'
// https://vitejs.dev/config/
export default defineConfig(({command, mode}) => {
  // 단독 HTML 빌드 여부 (`pnpm build:standalone` → `vite build --mode standalone`)
  const isStandalone = mode === 'standalone'
  const publicDir = fileURLToPath(new URL('./public', import.meta.url))
  return {
    // 단독 빌드는 file:// 로 열기 때문에 상대 경로를 사용하고, public 폴더는 복사하지 않는다.
    base: isStandalone ? './' : '/',
    publicDir: isStandalone ? false : 'public',
    plugins: [
      standaloneAssetsPlugin(isStandalone, publicDir),
      ...(isStandalone ? standalonePlugins(publicDir) : []),
      svelte({
        preprocess: vitePreprocess(),
        onwarn: (warning, handler) => {
          // disable a11y warnings
          if (warning.code.startsWith("a11y-")) return;
          handler(warning);
        },
      }),
      tailwindcss(),
      wasm(),
      command === 'build' ? strip({
        include: '**/*.(mjs|js|svelte|ts)'
      }) : null
    ],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    // prevent vite from obscuring rust errors
    clearScreen: false,
    // tauri expects a fixed port, fail if that port is not available
    server: {
      host: '0.0.0.0', // listen on all addresses
      port: 5174,
      strictPort: true,
      // hmr: false,
    },
    // to make use of `TAURI_ENV_DEBUG` and other env variables
    // https://v2.tauri.app/reference/environment-variables/
    envPrefix: ["VITE_", "TAURI_"],
    build: {
      target:'baseline-widely-available',
      // don't minify for debug builds
      minify: process.env.TAURI_ENV_DEBUG === 'true' ? false : 'oxc',
      // produce sourcemaps for debug builds
      sourcemap: process.env.TAURI_ENV_DEBUG === 'true',
      chunkSizeWarningLimit: isStandalone ? 100000 : 2000,
      // 단독 빌드: 모든 에셋을 data URL 로 인라인하고, 코드 분할 없이 번들 1개로 만든다.
      ...(isStandalone ? {
        assetsInlineLimit: standaloneAssetsInlineLimit,
        cssCodeSplit: false,
        modulePreload: false,
        rolldownOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      } : {}),
    },
    
    optimizeDeps:{
      exclude: [
        "@browsermt/bergamot-translator"
      ],
      needsInterop:[
        "@mlc-ai/web-tokenizers"
      ]
    },

    resolve:{
      alias:{
        'src':'/src',
      }
    },
    worker: {
      format: 'es',
      // 단독 빌드: 인라인 워커 안의 동적 임포트도 별도 파일로 분리하지 않는다.
      ...(isStandalone ? {
        rolldownOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      } : {}),
    }
}
});
