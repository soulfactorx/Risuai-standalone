import { beforeEach, describe, expect, it, vi } from "vitest"

const fakeDB = vi.hoisted(() => ({ db: {} as Record<string, any> }))
vi.mock("../stores.svelte", () => ({ DBState: fakeDB }))

import {
    extractUsageFromText,
    getUsageForGeneration,
    normalizeUsage,
    recordUsage,
    setUsageGeneration,
    setUsagePurpose,
    trackUsageFromData,
    trackUsageFromResponse,
} from "./tokenUsage"
import { summarizeDaily, usageLogToCSV } from "./tokenUsageStats"

describe("사용량 해석", () => {
    it("OpenAI 형식 (캐시·추론 포함)", () => {
        expect(normalizeUsage({
            prompt_tokens: 100, completion_tokens: 50,
            prompt_tokens_details: { cached_tokens: 30 },
            completion_tokens_details: { reasoning_tokens: 10 },
        })).toEqual({ input: 100, output: 50, cacheRead: 30, cacheWrite: 0, reasoning: 10 })
    })

    it("Anthropic 형식: 캐시 토큰을 입력에 더한다", () => {
        expect(normalizeUsage({
            input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 100, cache_creation_input_tokens: 5,
        })).toEqual({ input: 115, output: 20, cacheRead: 100, cacheWrite: 5, reasoning: 0 })
    })

    it("Gemini 형식: 생각 토큰을 출력에 더한다", () => {
        expect(normalizeUsage({
            promptTokenCount: 40, candidatesTokenCount: 8, thoughtsTokenCount: 12, cachedContentTokenCount: 4,
        })).toEqual({ input: 40, output: 20, cacheRead: 4, cacheWrite: 0, reasoning: 12 })
    })

    it("Anthropic 스트리밍: message_start 와 message_delta 를 합친다", () => {
        const sse = [
            'event: message_start',
            'data: {"type":"message_start","message":{"usage":{"input_tokens":25,"output_tokens":1}}}',
            'data: {"type":"content_block_delta","delta":{"text":"안녕"}}',
            'data: {"type":"message_delta","usage":{"output_tokens":42}}',
        ].join("\n")
        expect(extractUsageFromText(sse)).toEqual({ input: 25, output: 42, cacheRead: 0, cacheWrite: 0, reasoning: 0 })
    })

    it("OpenAI 스트리밍: 마지막 usage 청크와 [DONE]", () => {
        const sse = [
            'data: {"choices":[{"delta":{"content":"a"}}]}',
            'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3}}',
            "data: [DONE]",
        ].join("\n")
        expect(extractUsageFromText(sse)).toMatchObject({ input: 7, output: 3 })
    })

    it("사용량이 없으면 null", () => {
        expect(extractUsageFromText('data: {"choices":[]}')).toBeNull()
        expect(extractUsageFromText("not json")).toBeNull()
    })
})

describe("기록과 집계", () => {
    beforeEach(() => {
        fakeDB.db = { tokenUsageLog: [], tokenUsageDaily: {} }
        setUsageGeneration(null)
    })

    it("채팅 요청은 메시지(generationId)와 연결되고, 다른 용도는 연결되지 않는다", () => {
        setUsagePurpose("model")
        setUsageGeneration({ generationId: "g1", charName: "철수" })
        trackUsageFromData({ url: "https://api.openai.com/v1/chat/completions", body: { model: "gpt-x" } }, { usage: { prompt_tokens: 10, completion_tokens: 5 } })
        setUsagePurpose("memory")
        trackUsageFromData({ url: "https://api.openai.com/v1/chat/completions", body: { model: "gpt-x" } }, { usage: { prompt_tokens: 3, completion_tokens: 1 } })

        const log = fakeDB.db.tokenUsageLog
        expect(log).toHaveLength(2)
        expect(log[0]).toMatchObject({ purpose: "model", generationId: "g1", charName: "철수", model: "gpt-x", input: 10 })
        expect(log[1].generationId).toBeUndefined()
        expect(getUsageForGeneration("g1", log)).toMatchObject({ input: 10, output: 5, requests: 1 })
    })

    it("스트리밍 응답을 감싸도 원래 본문은 그대로 전달되고, 다 읽은 뒤 기록된다", async () => {
        setUsagePurpose("model")
        const body = 'data: {"type":"message_delta","usage":{"input_tokens":2,"output_tokens":9}}\n'
        const wrapped = trackUsageFromResponse({ url: "https://api.anthropic.com/v1/messages", body: '{"model":"claude-x"}' }, new Response(body, { status: 200 }))
        expect(await wrapped.text()).toBe(body)
        await new Promise((r) => setTimeout(r, 10))
        expect(fakeDB.db.tokenUsageLog[0]).toMatchObject({ model: "claude-x", input: 2, output: 9 })
    })

    it("날짜별 합계로 기간·모델·용도 통계를 만든다", () => {
        const now = new Date(2026, 10, 3, 12)
        recordUsage({ time: new Date(2026, 10, 3, 9).getTime(), purpose: "model", model: "A", host: "h", input: 10, output: 1, cacheRead: 0, cacheWrite: 0, reasoning: 0 })
        recordUsage({ time: new Date(2026, 10, 1, 9).getTime(), purpose: "translate", model: "B", host: "h", input: 5, output: 5, cacheRead: 0, cacheWrite: 0, reasoning: 0 })
        recordUsage({ time: new Date(2026, 8, 1, 9).getTime(), purpose: "model", model: "A", host: "h", input: 100, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 })

        expect(summarizeDaily(fakeDB.db.tokenUsageDaily, "today", now).total).toMatchObject({ input: 10, requests: 1 })
        const week = summarizeDaily(fakeDB.db.tokenUsageDaily, "7d", now)
        expect(week.total).toMatchObject({ input: 15, output: 6, requests: 2 })
        expect(week.byPurpose.map((p) => p.label).sort()).toEqual(["번역", "채팅"])
        expect(summarizeDaily(fakeDB.db.tokenUsageDaily, "all", now).byModel[0]).toMatchObject({ model: "A" })
    })

    it("CSV 에 BOM 과 머리글이 들어간다", () => {
        const csv = usageLogToCSV([{ time: 0, purpose: "model", model: 'a,"b"', host: "h", input: 1, output: 2, cacheRead: 0, cacheWrite: 0, reasoning: 0 }])
        expect(csv.startsWith("﻿시각,")).toBe(true)
        expect(csv).toContain('"a,""b"""')
    })
})
