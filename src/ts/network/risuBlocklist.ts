/**
 * Risu 운영 서버 차단 목록
 *
 * 이 버전은 원작자(Risu)가 운영하는 서버로 어떤 요청(채팅 내용, API 키, 백업 등)도
 * 보내지 않는 것을 목표로 한다. 기능 코드에서는 Risu 서버를 쓰는 부분을 모두 제거했지만,
 * 혹시 남아 있거나 플러그인/스크립트가 요청하는 경우를 막기 위한 이중 안전장치이다.
 *
 * 차단 대상 호스트는 이 파일 한 곳에서만 관리한다.
 * (새 탭으로 링크를 여는 것은 요청이 아니므로 막지 않는다.)
 */

/** 요청을 차단할 Risu 운영 호스트 목록. 하위 도메인도 함께 차단한다. */
export const RISU_BLOCKED_HOSTS: readonly string[] = [
    "sv.risuai.xyz",
    "nightly.sv.risuai.xyz",
    "risuai.xyz",
    "realm.risuai.net",
    "risuai.net",
    "account.sionyw.com",
    "sionyw.com",
]

/** 차단 시 보여줄 오류 메시지 */
export const RISU_SERVER_BLOCKED_MESSAGE = "Risu 서버로의 요청은 이 버전에서 차단되어 있습니다."

function toHostname(url: string | URL): string | null {
    try {
        const base = typeof location !== "undefined" ? location.href : undefined
        return new URL(url, base).hostname.toLowerCase().replace(/\.$/, "")
    } catch {
        return null
    }
}

/** 주어진 호스트 이름이 Risu 운영 호스트(또는 그 하위 도메인)인지 확인한다. */
export function isRisuServerHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, "")
    return RISU_BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith("." + blocked))
}

/** 주어진 URL 이 Risu 운영 서버를 가리키는지 확인한다. */
export function isRisuServerUrl(url: string | URL): boolean {
    const host = toHostname(url)
    return host !== null && isRisuServerHost(host)
}

/** Risu 운영 서버를 가리키는 URL 이면 오류를 던진다. */
export function assertNotRisuServerUrl(url: string | URL): void {
    if (isRisuServerUrl(url)) {
        throw new Error(RISU_SERVER_BLOCKED_MESSAGE)
    }
}

function requestUrlOf(input: RequestInfo | URL): string {
    if (typeof input === "string") {
        return input
    }
    if (input instanceof URL) {
        return input.href
    }
    return input.url
}

let fetchGuardInstalled = false

/**
 * 전역 fetch 를 감싸서 Risu 운영 서버로의 요청을 거부한다.
 * 앱 시작 시 한 번만 호출하면 되며, 여러 번 호출해도 한 번만 적용된다.
 */
export function installRisuFetchGuard(target: typeof globalThis = globalThis): void {
    if (fetchGuardInstalled || typeof target.fetch !== "function") {
        return
    }
    fetchGuardInstalled = true
    const originalFetch = target.fetch.bind(target)
    target.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        if (isRisuServerUrl(requestUrlOf(input))) {
            return Promise.reject(new TypeError(RISU_SERVER_BLOCKED_MESSAGE))
        }
        return originalFetch(input, init)
    }) as typeof fetch
}
