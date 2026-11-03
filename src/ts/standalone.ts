/**
 * 단독 HTML(standalone) 빌드 지원 모듈
 *
 * `pnpm build:standalone` 으로 만들어지는 단일 HTML 파일은 웹 서버 없이
 * `file://` 로 바로 열어서 사용한다. 이 경우 `/token/...`, `/none.webp` 처럼
 * 서버 루트 기준의 절대 경로로 정적 파일을 가져올 수 없으므로,
 * 이 모듈을 통해 경로를 변환한다.
 *
 * - 작은 파일(아이콘, 플레이스홀더 이미지, lua 라이브러리 등)은 빌드 시점에
 *   data URL 로 HTML 안에 포함된다. (`virtual:standalone-assets` 모듈)
 * - 큰 파일(토크나이저 등)은 원격 CDN 에서 필요할 때 내려받는다.
 *
 * 일반 빌드(웹/Tauri/노드 서버)에서는 경로를 그대로 돌려주므로 기존 동작에 영향이 없다.
 */
import embeddedAssets from "virtual:standalone-assets"
import { writable } from "svelte/store"

/** 현재 실행 중인 번들이 단독 HTML 빌드인지 여부 (빌드 시점에 상수로 치환됨) */
export const isStandalone: boolean = import.meta.env.MODE === "standalone"

/** 원격 정적 파일 기본 주소를 덮어쓸 때 사용하는 localStorage 키 */
const ASSET_BASE_OVERRIDE_KEY = "risu_standalone_asset_base"

/**
 * 내장되지 않은 정적 파일을 가져올 원격 주소 후보 목록.
 * 앞에서부터 순서대로 시도하며, 모두 CORS 를 허용하는 곳이어야 한다.
 */
const DEFAULT_REMOTE_BASES = [
    "https://cdn.jsdelivr.net/gh/kwaroran/Risuai@main/public",
    "https://raw.githubusercontent.com/kwaroran/Risuai/main/public",
]

function getRemoteBases(): string[] {
    let override: string | null = null
    try {
        override = localStorage.getItem(ASSET_BASE_OVERRIDE_KEY)
    } catch {
        // localStorage 접근이 막힌 환경이면 기본값만 사용
    }
    const bases = override ? [override, ...DEFAULT_REMOTE_BASES] : DEFAULT_REMOTE_BASES
    return bases.map((base) => base.replace(/\/+$/, ""))
}

function normalizePath(path: string): string {
    return path.startsWith("/") ? path : "/" + path
}

/**
 * 공개 정적 파일(public 폴더) 경로를 실제로 사용할 수 있는 URL 로 바꾼다.
 * 이미지 `src`, 링크 `href` 등 동기적으로 URL 이 필요한 곳에서 사용한다.
 *
 * @param path `/none.webp` 처럼 루트 기준 경로
 */
export function publicAssetURL(path: string): string {
    if (!isStandalone) {
        return path
    }
    const normalized = normalizePath(path)
    return embeddedAssets[normalized] ?? getRemoteBases()[0] + normalized
}

/**
 * 공개 정적 파일을 fetch 한다.
 * 단독 HTML 빌드에서는 내장된 data URL 을 우선 사용하고,
 * 없으면 원격 후보 주소를 차례대로 시도한다.
 *
 * @param path `/token/claude/claude.json` 처럼 루트 기준 경로
 */
export async function fetchPublicAsset(path: string, init?: RequestInit): Promise<Response> {
    if (!isStandalone) {
        return fetch(path, init)
    }
    const normalized = normalizePath(path)
    const embedded = embeddedAssets[normalized]
    if (embedded) {
        return fetch(embedded, init)
    }

    let lastError: unknown = null
    for (const base of getRemoteBases()) {
        try {
            const res = await fetch(base + normalized, init)
            if (res.ok) {
                return res
            }
            lastError = new Error(`정적 파일을 가져오지 못했습니다: ${base + normalized} (${res.status})`)
        } catch (error) {
            lastError = error
        }
    }
    throw lastError ?? new Error(`정적 파일을 가져오지 못했습니다: ${normalized}`)
}

/**
 * AI 요청을 프록시 서버를 거치지 않고 브라우저에서 직접 보낼지 여부.
 *
 * 이 버전은 Risu 운영 서버(프록시 등)를 전혀 사용하지 않으므로,
 * 웹 빌드(단독 HTML 포함, Tauri/노드 서버가 아닌 경우)에서는 항상 직접 요청한다.
 * (OpenAI, Anthropic, Google Gemini, OpenRouter 등 브라우저 직접 호출(CORS)을 허용하는 서비스는 정상 동작)
 * 노드 셀프호스트 서버에서는 사용자 본인 서버의 /proxy2 를 쓰되, 설정으로 직접 요청을 강제할 수 있다.
 */
export function shouldUsePlainFetch(db: { usePlainFetch?: boolean } | null | undefined): boolean {
    return isStandalone || isWebRuntime() || !!db?.usePlainFetch
}

/**
 * Tauri 데스크톱 앱도, 노드 셀프호스트 서버도 아닌 일반 웹 환경인지 여부.
 * (src/ts/platform.ts 와 같은 판정이지만, 이 모듈은 window 가 없는 테스트 환경에서도
 * 불러와지므로 platform.ts 를 가져오지 않고 실행 시점에 직접 확인한다.)
 */
function isWebRuntime(): boolean {
    const g = globalThis as typeof globalThis & { __NODE__?: boolean; __TAURI_INTERNALS__?: unknown }
    return !g.__TAURI_INTERNALS__ && !g.__NODE__
}

/**
 * 웹앱(PWA) 설치를 위한 서비스 워커를 등록한다.
 * 단독 빌드를 GitHub Pages 등 http(s) 주소로 열었을 때만 동작한다. (file:// 에서는 서비스 워커를 쓸 수 없음)
 * 서비스 워커 파일(pwa-sw.js)은 util/viteStandalone.ts 가 함께 만든다.
 */
export function registerStandalonePWA() {
    if (!isStandalone || !("serviceWorker" in navigator)) {
        return
    }
    if (location.protocol !== "http:" && location.protocol !== "https:") {
        return
    }
    navigator.serviceWorker.register("./pwa-sw.js", { scope: "./" }).catch((error) => {
        console.warn("[PWA] 서비스 워커 등록 실패", error)
    })
}

/** 브라우저가 알려 준 '앱 설치' 요청 (설치 버튼에서 사용) */
export interface InstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

/** 설치 가능할 때 브라우저가 보내 주는 요청을 보관한다. (없으면 null) */
export const installPromptStore = writable<InstallPromptEvent | null>(null)

// 이 이벤트는 페이지를 연 직후 한 번 오므로, 화면이 그려지기 전에 미리 받아 둔다.
if (isStandalone && typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault()
        installPromptStore.set(event as InstallPromptEvent)
    })
    window.addEventListener("appinstalled", () => {
        installPromptStore.set(null)
    })
}
