/**
 * 단독 HTML(standalone) 빌드용 Vite 플러그인 모음
 *
 * `vite build --mode standalone` 으로 빌드하면 결과물이 `risuai.html` 단일 파일로 만들어진다.
 * 이 파일은 웹 서버 없이 브라우저에서 바로 열어(file://) 사용할 수 있다.
 *
 * 처리 내용
 * 1. `virtual:standalone-assets` 가상 모듈: public 폴더의 작은 정적 파일을 data URL 로 내장
 * 2. 웹 워커 인라인화: `?worker` 임포트를 `?worker&inline` 으로 바꿔 별도 파일이 생기지 않게 함
 * 3. 번들 인라인화: 모든 JS 를 gzip 압축 후 base64 로 HTML 에 넣고, CSS 는 <style> 로 넣음
 */
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import type { Plugin, IndexHtmlTransformResult } from "vite"

const VIRTUAL_ASSETS_ID = "virtual:standalone-assets"
const RESOLVED_VIRTUAL_ASSETS_ID = "\0" + VIRTUAL_ASSETS_ID

/**
 * 단독 HTML 에 data URL 로 직접 포함할 public 폴더 내 파일 목록.
 * 크기가 작고 앱 실행에 자주 쓰이는 파일만 포함한다.
 * 여기에 없는 파일(토크나이저 등 대용량 파일)은 실행 중에 원격 CDN 에서 가져온다.
 * (src/ts/standalone.ts 참고)
 */
const EMBEDDED_PUBLIC_FILES = [
    "none.webp",
    "logo2.png",
    "logo_16.png",
    "logo_32.png",
    "logo_256.png",
    "logo_typo_trans.png",
    "plugin_start.7z",
    "icon/github-mark-white.svg",
    "lua/json.lua",
    "welcome/claude/*",
]

const MIME_TYPES: Record<string, string> = {
    ".webp": "image/webp",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".lua": "text/plain",
    ".7z": "application/x-7z-compressed",
}

function toDataURL(filePath: string): string {
    const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"
    return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`
}

/** EMBEDDED_PUBLIC_FILES 의 항목(와일드카드 `dir/*` 지원)을 실제 파일 목록으로 펼친다. */
function collectEmbeddedFiles(publicDir: string): string[] {
    const result: string[] = []
    for (const entry of EMBEDDED_PUBLIC_FILES) {
        if (entry.endsWith("/*")) {
            const dir = entry.slice(0, -2)
            const absDir = path.join(publicDir, dir)
            if (!fs.existsSync(absDir)) continue
            for (const name of fs.readdirSync(absDir).sort()) {
                if (fs.statSync(path.join(absDir, name)).isFile()) {
                    result.push(`${dir}/${name}`)
                }
            }
        } else if (fs.existsSync(path.join(publicDir, entry))) {
            result.push(entry)
        }
    }
    return result
}

/**
 * `virtual:standalone-assets` 가상 모듈을 제공한다.
 * 단독 빌드가 아니면 빈 객체를 내보내므로 일반 빌드 크기에는 영향이 없다.
 * (테스트 환경에서도 모듈을 찾을 수 있도록 vitest 설정에서도 사용한다.)
 */
export function standaloneAssetsPlugin(enabled: boolean, publicDir = path.resolve("public")): Plugin {
    return {
        name: "risu-standalone-assets",
        resolveId(id) {
            if (id === VIRTUAL_ASSETS_ID) {
                return RESOLVED_VIRTUAL_ASSETS_ID
            }
        },
        load(id) {
            if (id !== RESOLVED_VIRTUAL_ASSETS_ID) {
                return
            }
            const map: Record<string, string> = {}
            if (enabled) {
                for (const file of collectEmbeddedFiles(publicDir)) {
                    map["/" + file] = toDataURL(path.join(publicDir, file))
                }
            }
            return `export default ${JSON.stringify(map)};`
        },
    }
}

/**
 * 단독 빌드에서 웹 워커가 별도 파일로 분리되지 않도록 인라인 처리한다.
 *
 * - `import X from '...?worker'` → `'...?worker&inline'` (Vite 가 base64 로 번들에 포함)
 * - bergamot 번역기 라이브러리의 `new Worker(new URL('./worker/translator-worker.js', import.meta.url))`
 *   → 런타임에 준비한 Blob URL 을 사용하도록 교체 (src/ts/translator/bergamotTranslator.ts 참고)
 */
function standaloneWorkerPlugin(): Plugin {
    return {
        name: "risu-standalone-worker-inline",
        enforce: "pre",
        transform(code, id) {
            if (id.includes("@browsermt/bergamot-translator") && id.endsWith("translator.js")) {
                const target = "new Worker(new URL('./worker/translator-worker.js', import.meta.url))"
                if (!code.includes(target)) {
                    this.warn("bergamot 번역기 워커 생성 코드를 찾지 못했습니다. 라이브러리 버전을 확인하세요.")
                    return
                }
                return {
                    code: code.replace(target, "new Worker(globalThis.__risuStandaloneBergamotWorkerURL)"),
                    map: null,
                }
            }
            if (id.includes("monaco-editor") && id.endsWith("workerManager.js")) {
                // monaco 언어 서비스의 기본 워커 생성 경로(createWorker)는 MonacoEnvironment.getWorker 가
                // 정의되어 있으면 쓰이지 않는다. (src/lib/Others/MonacoEditor.svelte 에서 정의)
                // 그대로 두면 워커 파일이 별도로 생성되므로 단독 빌드에서는 제거한다.
                const replaced = code.replace(
                    /createWorker:\s*\(\)\s*=>\s*new Worker\(new URL\([^)]*\),\s*\{[^}]*\}\)/g,
                    "createWorker: undefined",
                )
                return replaced === code ? undefined : { code: replaced, map: null }
            }
            if (id.includes("node_modules") || !/\.(ts|js|svelte)(\?|$)/.test(id)) {
                return
            }
            if (!code.includes("?worker")) {
                return
            }
            const replaced = code.replace(/(['"][^'"\n]+)\?worker(['"])/g, "$1?worker&inline$2")
            if (replaced === code) {
                return
            }
            return { code: replaced, map: null }
        },
    }
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** `</tag` 형태의 문자열이 있으면 인라인 시 HTML 파서가 태그를 일찍 닫으므로 이스케이프한다. */
function escapeClosingTag(source: string, tag: string): string {
    return source.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1")
}

/**
 * JS 번들을 불러오는 로더 스크립트.
 * gzip+base64 로 저장된 번들을 풀어서 인라인 모듈 스크립트로 실행한다.
 * (DOM 으로 textContent 를 설정하므로 코드 안의 `</script>`, `<!--` 등이 HTML 파싱에 영향을 주지 않는다.)
 */
const LOADER_SCRIPT = `
(async function () {
    // 단독 HTML 로더: 압축된 앱 코드를 풀어서 실행한다.
    var status = document.querySelector('#preloading .text-sm');
    try {
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('이 브라우저는 DecompressionStream 을 지원하지 않습니다. 최신 Chrome, Edge, Firefox, Safari 를 사용해 주세요.');
        }
        var payload = document.getElementById('risu-standalone-bundle').textContent.trim();
        var res = await fetch('data:application/octet-stream;base64,' + payload);
        var stream = res.body.pipeThrough(new DecompressionStream('gzip'));
        var code = await new Response(stream).text();
        var script = document.createElement('script');
        script.type = 'module';
        script.textContent = code;
        document.body.appendChild(script);
    } catch (e) {
        console.error(e);
        if (status) {
            status.textContent = '앱을 불러오지 못했습니다: ' + (e && e.message ? e.message : e);
        }
    }
})();
`

/**
 * 빌드 결과물을 단일 HTML 파일로 합친다.
 * 코드 분할을 끈 상태(번들 1개)를 전제로 하며, 인라인할 수 없는 파일이 남으면 경고한다.
 */
function standaloneInlinePlugin(publicDir: string, outFileName: string): Plugin {
    return {
        name: "risu-standalone-inline",
        enforce: "post",
        transformIndexHtml: {
            order: "pre",
            handler(html): IndexHtmlTransformResult {
                // 파비콘을 data URL 로 바꾸고, file:// 에서 쓸 수 없는 PWA manifest 는 제거한다.
                return html
                    .replace(/<link rel="manifest"[^>]*>\s*/g, "")
                    .replace(/href="\/(logo_\d+\.png)"/g, (_, file: string) => {
                        const filePath = path.join(publicDir, file)
                        return fs.existsSync(filePath) ? `href="${toDataURL(filePath)}"` : `href="${file}"`
                    })
            },
        },
        generateBundle(_, bundle) {
            // rolldown 의 bundle 객체는 delete 후에도 키 목록이 바로 갱신되지 않을 수 있어 미리 복사해 둔다.
            const files = Object.values(bundle)
            const handled = new Set<string>()

            const htmlAsset = files.find((file) => file.type === "asset" && file.fileName.endsWith(".html"))
            if (!htmlAsset || htmlAsset.type !== "asset") {
                this.error("index.html 결과물을 찾지 못했습니다.")
                return
            }
            let html = String(htmlAsset.source)
            handled.add(htmlAsset.fileName)

            const chunks = files.filter((file) => file.type === "chunk")
            const entry = chunks.find((chunk) => chunk.type === "chunk" && chunk.isEntry)
            if (!entry || entry.type !== "chunk") {
                this.error("엔트리 JS 청크를 찾지 못했습니다.")
                return
            }
            if (chunks.length > 1) {
                this.error(
                    `단독 빌드는 JS 번들이 1개여야 합니다. 분리된 청크: ${chunks.map((c) => c.fileName).join(", ")}`,
                )
                return
            }

            // CSS 는 <style> 로 직접 삽입
            for (const css of files) {
                if (css.type !== "asset" || !css.fileName.endsWith(".css")) continue
                const linkPattern = new RegExp(
                    `<link[^>]*href="[^"]*${escapeRegExp(css.fileName)}"[^>]*>`,
                )
                const style = `<style>${escapeClosingTag(String(css.source), "style")}</style>`
                html = linkPattern.test(html)
                    ? html.replace(linkPattern, () => style)
                    : html.replace("</head>", () => style + "</head>")
                handled.add(css.fileName)
            }

            // JS 는 gzip 압축 후 base64 로 넣고, 로더 스크립트로 실행
            const compressed = zlib.gzipSync(Buffer.from(entry.code, "utf-8"), { level: 9 }).toString("base64")
            const entryPattern = new RegExp(
                `<script[^>]*src="[^"]*${escapeRegExp(entry.fileName)}"[^>]*></script>\\s*`,
            )
            html = html.replace(entryPattern, "")
            html = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, "")
            const bodyScripts =
                `<script type="application/octet-stream" id="risu-standalone-bundle">${compressed}</script>\n` +
                `<script>${LOADER_SCRIPT}</script>\n`
            html = html.replace("</body>", () => bodyScripts + "</body>")
            handled.add(entry.fileName)

            // 인라인되지 않고 남은 파일 확인 후 모두 제거 (결과물은 HTML 1개만 남긴다)
            for (const file of files) {
                // onnxruntime wasm 은 transformers.js 가 CDN 에서 직접 받으므로 포함하지 않는다.
                if (!handled.has(file.fileName) && !/ort-wasm/.test(file.fileName) && !file.fileName.endsWith(".map")) {
                    this.warn(`인라인되지 않은 파일이 있습니다 (단독 HTML 에서는 사용할 수 없음): ${file.fileName}`)
                }
                delete bundle[file.fileName]
            }

            this.emitFile({
                type: "asset",
                fileName: outFileName,
                source: html,
            })
        },
    }
}

/**
 * 단독 HTML 빌드에 필요한 플러그인 전체.
 * vite.config.ts 에서 `mode === 'standalone'` 일 때 사용한다.
 */
export function standalonePlugins(publicDir = path.resolve("public"), outFileName = "risuai.html"): Plugin[] {
    return [standaloneWorkerPlugin(), standaloneInlinePlugin(publicDir, outFileName)]
}

/**
 * 단독 빌드 시 assets 인라인 여부 판단.
 * onnxruntime wasm(약 21MB)은 transformers.js 가 CDN 에서 직접 받으므로 제외하고 나머지는 모두 data URL 로 인라인한다.
 */
export function standaloneAssetsInlineLimit(filePath: string): boolean {
    return !/ort-wasm/.test(filePath)
}
