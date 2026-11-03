/**
 * 토큰 사용량 기록
 *
 * AI 서비스가 응답에 함께 보내 주는 실제 사용량(usage)을 읽어서 저장한다.
 * (앱이 미리 계산하는 추정치가 아니라, 공급자가 청구 기준으로 알려 주는 값)
 *
 * 지원 형식
 * - OpenAI / OpenRouter 등 OpenAI 호환: `usage.prompt_tokens`, `usage.completion_tokens` (+ 캐시/추론 세부값)
 * - OpenAI Responses API: `usage.input_tokens`, `usage.output_tokens`
 * - Anthropic: `usage.input_tokens`, `usage.output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`
 * - Google Gemini: `usageMetadata.promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `cachedContentTokenCount`
 * 스트리밍 응답은 이벤트마다 누적값이 오므로 항목별 최댓값을 사용한다.
 *
 * 저장 위치 (DB)
 * - `tokenUsageLog`: 최근 요청별 기록 (최대 MAX_LOG_ENTRIES 개)
 * - `tokenUsageDaily`: 날짜별·모델별·용도별 합계 (오래된 기록도 통계에 남도록)
 */
import { DBState } from "../stores.svelte"

/** 요청 한 번의 사용량 */
export interface TokenUsageNumbers {
    /** 입력(프롬프트) 토큰 합계 (캐시로 읽은 토큰 포함) */
    input: number
    /** 출력 토큰 합계 (추론/생각 토큰 포함) */
    output: number
    /** 입력 중 캐시에서 읽은 토큰 */
    cacheRead: number
    /** 입력 중 캐시에 새로 저장한 토큰 (Anthropic) */
    cacheWrite: number
    /** 출력 중 추론(생각) 토큰 */
    reasoning: number
}

/** 요청 용도 (requestChatData 의 모델 모드) */
export type UsagePurpose = "model" | "submodel" | "memory" | "emotion" | "otherAx" | "translate" | "other"

export interface TokenUsageEntry extends TokenUsageNumbers {
    /** 기록 시각 (ms) */
    time: number
    purpose: UsagePurpose
    /** 요청 본문의 모델 이름 (없으면 주소) */
    model: string
    /** 요청을 보낸 서버 주소 (호스트) */
    host: string
    /** 채팅 응답이면 해당 메시지의 generationId (턴별 표시용) */
    generationId?: string
    /** 채팅 응답이면 캐릭터 이름 */
    charName?: string
}

/** 날짜별 합계 한 칸 */
export interface TokenUsageDailyBucket extends TokenUsageNumbers {
    requests: number
}

/** 날짜(YYYY-MM-DD) → `모델\u0001용도` → 합계 */
export type TokenUsageDaily = Record<string, Record<string, TokenUsageDailyBucket>>

/** 요청별 기록은 저장 용량을 고려해 최근 것만 남긴다. (날짜별 합계는 계속 유지) */
export const MAX_LOG_ENTRIES = 1000

export const PURPOSE_LABELS: Record<UsagePurpose, string> = {
    model: "채팅",
    submodel: "보조 모델",
    memory: "기억 요약",
    emotion: "감정 인식",
    otherAx: "기타 보조",
    translate: "번역",
    other: "기타",
}

export function emptyUsage(): TokenUsageNumbers {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
}

export function addUsage<T extends TokenUsageNumbers>(target: T, add: TokenUsageNumbers): T {
    target.input += add.input
    target.output += add.output
    target.cacheRead += add.cacheRead
    target.cacheWrite += add.cacheWrite
    target.reasoning += add.reasoning
    return target
}

// ───────── 요청 맥락 (어떤 용도의 요청인지) ─────────

interface UsageContext {
    purpose: UsagePurpose
    generationId?: string
    charName?: string
}

let currentContext: UsageContext = { purpose: "other" }

/**
 * 지금부터 보내는 AI 요청의 용도를 지정한다. (requestChatData 시작 시 호출)
 * 요청을 보내는 순간의 값이 기록에 쓰인다.
 */
export function setUsagePurpose(purpose: string) {
    currentContext = { ...currentContext, purpose: (purpose in PURPOSE_LABELS ? purpose : "other") as UsagePurpose }
}

/**
 * 채팅 응답을 만드는 동안 메시지와 연결할 정보를 지정한다. (sendChat 에서 본 요청 직전/직후 호출)
 * `null` 을 넘기면 연결을 해제한다.
 */
export function setUsageGeneration(info: { generationId: string; charName?: string } | null) {
    currentContext = {
        purpose: currentContext.purpose,
        generationId: info?.generationId,
        charName: info?.charName,
    }
}

function snapshotContext(): UsageContext {
    // 채팅 메시지와의 연결은 본 채팅 요청에만 적용한다.
    if (currentContext.purpose !== "model") {
        return { purpose: currentContext.purpose }
    }
    return { ...currentContext }
}

// ───────── 사용량 해석 ─────────

function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0
}

/** usage 형태의 객체 하나를 공통 형식으로 바꾼다. 해당 없으면 null */
export function normalizeUsage(raw: unknown): TokenUsageNumbers | null {
    if (!raw || typeof raw !== "object") {
        return null
    }
    const u = raw as Record<string, any>

    // Google Gemini
    if ("promptTokenCount" in u || "candidatesTokenCount" in u || "totalTokenCount" in u) {
        const thoughts = num(u.thoughtsTokenCount)
        return {
            input: num(u.promptTokenCount),
            output: num(u.candidatesTokenCount) + thoughts,
            cacheRead: num(u.cachedContentTokenCount),
            cacheWrite: 0,
            reasoning: thoughts,
        }
    }
    // OpenAI Chat Completions 형식
    if ("prompt_tokens" in u || "completion_tokens" in u) {
        return {
            input: num(u.prompt_tokens),
            output: num(u.completion_tokens),
            cacheRead: num(u.prompt_tokens_details?.cached_tokens) + num(u.prompt_cache_hit_tokens),
            cacheWrite: 0,
            reasoning: num(u.completion_tokens_details?.reasoning_tokens),
        }
    }
    // Anthropic / OpenAI Responses 형식
    if ("input_tokens" in u || "output_tokens" in u) {
        const cacheRead = num(u.cache_read_input_tokens)
        const cacheWrite = num(u.cache_creation_input_tokens)
        const isAnthropicStyle = "cache_read_input_tokens" in u || "cache_creation_input_tokens" in u
        return {
            // Anthropic 의 input_tokens 는 캐시 토큰을 제외한 값이라 더해 준다.
            input: num(u.input_tokens) + (isAnthropicStyle ? cacheRead + cacheWrite : 0),
            output: num(u.output_tokens),
            cacheRead: isAnthropicStyle ? cacheRead : num(u.input_tokens_details?.cached_tokens),
            cacheWrite,
            reasoning: num(u.output_tokens_details?.reasoning_tokens),
        }
    }
    return null
}

/** 응답 JSON(또는 스트리밍 이벤트 하나)에서 usage 객체를 찾는다. */
export function extractUsageObject(data: unknown): TokenUsageNumbers | null {
    if (!data || typeof data !== "object") {
        return null
    }
    const d = data as Record<string, any>
    const candidates = [d.usage, d.usageMetadata, d.message?.usage, d.response?.usage]
    for (const c of candidates) {
        const n = normalizeUsage(c)
        if (n) {
            return n
        }
    }
    return null
}

/** 누적값을 보내는 스트리밍 이벤트를 합칠 때 항목별 최댓값을 사용한다. */
function mergeMax(a: TokenUsageNumbers | null, b: TokenUsageNumbers | null): TokenUsageNumbers | null {
    if (!a) return b
    if (!b) return a
    return {
        input: Math.max(a.input, b.input),
        output: Math.max(a.output, b.output),
        cacheRead: Math.max(a.cacheRead, b.cacheRead),
        cacheWrite: Math.max(a.cacheWrite, b.cacheWrite),
        reasoning: Math.max(a.reasoning, b.reasoning),
    }
}

/**
 * 응답 본문 텍스트 전체에서 사용량을 찾는다.
 * SSE(`data: {...}`) 스트림, JSON 한 덩어리, JSON 배열 스트림을 모두 지원한다.
 */
export function extractUsageFromText(text: string): TokenUsageNumbers | null {
    let result: TokenUsageNumbers | null = null
    let sawSSE = false
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) {
            continue
        }
        sawSSE = true
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === "[DONE]") {
            continue
        }
        try {
            result = mergeMax(result, extractUsageObject(JSON.parse(payload)))
        } catch {
            // JSON 이 아닌 줄은 무시
        }
    }
    if (sawSSE) {
        return result
    }
    try {
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) {
            for (const item of parsed) {
                result = mergeMax(result, extractUsageObject(item))
            }
            return result
        }
        return extractUsageObject(parsed)
    } catch {
        return null
    }
}

// ───────── 기록 ─────────

function hostOf(url: string): string {
    try {
        return new URL(url).host
    } catch {
        return ""
    }
}

function modelFromBody(body: unknown, url: string): string {
    try {
        const obj = typeof body === "string" ? JSON.parse(body) : body
        if (obj && typeof obj === "object" && typeof (obj as any).model === "string") {
            return (obj as any).model
        }
    } catch {
        // 무시
    }
    // Gemini 는 모델 이름이 주소에 들어 있다. (.../models/<모델>:generateContent)
    const m = url.match(/models\/([^/:?]+)[:?]/)
    return m ? m[1] : hostOf(url)
}

function localDateKey(time: number): string {
    const d = new Date(time)
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 사용량 하나를 DB 에 기록한다. */
export function recordUsage(entry: TokenUsageEntry) {
    const db = DBState.db
    if (!db) {
        return
    }
    db.tokenUsageLog ??= []
    db.tokenUsageLog.push(entry)
    if (db.tokenUsageLog.length > MAX_LOG_ENTRIES) {
        db.tokenUsageLog.splice(0, db.tokenUsageLog.length - MAX_LOG_ENTRIES)
    }

    db.tokenUsageDaily ??= {}
    const day = localDateKey(entry.time)
    db.tokenUsageDaily[day] ??= {}
    const key = `${entry.model}\u0001${entry.purpose}`
    const bucket = db.tokenUsageDaily[day][key] ?? { ...emptyUsage(), requests: 0 }
    addUsage(bucket, entry)
    bucket.requests += 1
    db.tokenUsageDaily[day][key] = bucket
}

/** 요청 본문 등 기록에 필요한 정보 */
interface RequestInfo {
    url: string
    body: unknown
}

function record(info: RequestInfo, usage: TokenUsageNumbers, ctx: UsageContext) {
    if (usage.input === 0 && usage.output === 0) {
        return
    }
    recordUsage({
        ...usage,
        time: Date.now(),
        purpose: ctx.purpose,
        model: modelFromBody(info.body, info.url),
        host: hostOf(info.url),
        generationId: ctx.generationId,
        charName: ctx.charName,
    })
}

/**
 * 스트리밍/일반 응답(Response)을 감싸서, 응답을 다 읽은 뒤 사용량을 기록한다.
 * 원래 응답 본문은 그대로 호출한 쪽에 전달된다. (본문을 둘로 나눠 한쪽만 읽음)
 */
export function trackUsageFromResponse(info: RequestInfo, response: Response): Response {
    try {
        if (!response.ok || !response.body) {
            return response
        }
        const ctx = snapshotContext()
        const [forCaller, forUsage] = response.body.tee()
        // 응답을 다 받은 뒤 사용량을 계산한다. (실패해도 채팅에는 영향 없음)
        new Response(forUsage).text().then((text) => {
            const usage = extractUsageFromText(text)
            if (usage) {
                record(info, usage, ctx)
            }
        }).catch(() => {})
        return new Response(forCaller, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        })
    } catch {
        return response
    }
}

/** 이미 해석된 응답 데이터(JSON 객체)에서 사용량을 기록한다. */
export function trackUsageFromData(info: RequestInfo, data: unknown) {
    try {
        const usage = typeof data === "string" ? extractUsageFromText(data) : extractUsageObject(data)
        if (usage) {
            record(info, usage, snapshotContext())
        }
    } catch {
        // 사용량 기록 실패는 무시
    }
}

// ───────── 조회 ─────────

/** 특정 채팅 응답(generationId)의 실제 사용량 합계. 기록이 없으면 null */
export function getUsageForGeneration(generationId: string | undefined, log: TokenUsageEntry[] | undefined): (TokenUsageNumbers & { requests: number }) | null {
    if (!generationId || !log) {
        return null
    }
    let found: (TokenUsageNumbers & { requests: number }) | null = null
    for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i]
        if (e.generationId === generationId) {
            found ??= { ...emptyUsage(), requests: 0 }
            addUsage(found, e)
            found.requests += 1
        }
    }
    return found
}

/** 숫자를 1,234 형태로 표시 */
export function formatTokens(n: number): string {
    return Math.round(n).toLocaleString("ko-KR")
}
