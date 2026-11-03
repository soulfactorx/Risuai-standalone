/// <reference types="svelte" />
/// <reference types="vite/client" />


declare var Buffer: BufferConstructor
declare var safeStructuredClone: <T>(data: T) => T
declare var userScriptFetch: (url: string,arg:RequestInit) => Promise<Response>
// 단독 HTML 빌드에서 내장되는 정적 파일 목록 (util/viteStandalone.ts 에서 생성)
declare module "virtual:standalone-assets" {
    const assets: Record<string, string>
    export default assets
}
