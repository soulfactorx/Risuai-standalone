import { beforeEach, describe, expect, it, vi } from "vitest"

// DBState 대신 간단한 가짜 저장소를 사용한다.
const fakeDB = vi.hoisted(() => ({ db: { customPrompts: {} as Record<string, string> } }))
vi.mock("../stores.svelte", () => ({ DBState: fakeDB }))

import {
    PROMPT_DEFINITIONS,
    fillPrompt,
    fillPromptWithParser,
    getDefaultPrompt,
    getPrompt,
    isPromptCustomized,
    resetCustomPrompt,
    setCustomPrompt,
} from "./customPrompts"
import { inspectRequestBody } from "./promptInspector"

describe("사용자 지정 프롬프트", () => {
    beforeEach(() => {
        fakeDB.db.customPrompts = {}
    })

    it("키가 중복되지 않는다", () => {
        const keys = PROMPT_DEFINITIONS.map((def) => def.key)
        expect(new Set(keys).size).toBe(keys.length)
    })

    it("바꾼 값이 없으면 기본값을 사용한다", () => {
        expect(getPrompt("continueResponse")).toBe("[Continue the last response]")
        expect(isPromptCustomized("continueResponse")).toBe(false)
    })

    it("바꾼 값(빈 문자열 포함)을 우선 사용하고, 초기화하면 기본값으로 돌아간다", () => {
        setCustomPrompt("continueResponse", "")
        expect(isPromptCustomized("continueResponse")).toBe(true)
        expect(getPrompt("continueResponse")).toBe("")
        setCustomPrompt("continueResponse", "[계속 써 줘]")
        expect(getPrompt("continueResponse")).toBe("[계속 써 줘]")
        resetCustomPrompt("continueResponse")
        expect(getPrompt("continueResponse")).toBe(getDefaultPrompt("continueResponse"))
    })

    it("치환 변수를 값으로 바꾼다 ($ 같은 특수 문자도 그대로)", () => {
        expect(fillPrompt("previousConversation", { "{{slot}}": "요약 $1 내용" }))
            .toBe("<Previous Conversation>요약 $1 내용</Previous Conversation>")
        expect(fillPrompt("hypaV2Wrapper", { "{{summary}}": "A", "{{details}}": "B" }))
            .toBe("<Past Events Summary>A</Past Events Summary>\n<Past Events Details>B</Past Events Details>")
    })

    it("CBS 처리 중에는 치환 변수가 보호된다", () => {
        setCustomPrompt("groupReplyOnly", "[{{user}} 말고 {{slot}} 만]")
        const result = fillPromptWithParser("groupReplyOnly", { "{{slot}}": "{{위험한 이름}}" }, (text) => text.replace("{{user}}", "철수"))
        expect(result).toBe("[철수 말고 {{위험한 이름}} 만]")
    })

    it("등록되지 않은 키는 오류를 낸다", () => {
        expect(() => getPrompt("없는키")).toThrow()
    })
})

describe("전송 프롬프트 정리", () => {
    it("OpenAI 형식", () => {
        const r = inspectRequestBody(JSON.stringify({
            model: "gpt-test",
            messages: [
                { role: "system", content: "시스템" },
                { role: "user", content: [{ type: "text", text: "안녕" }, { type: "image_url", image_url: { url: "data:" } }] },
            ],
        }))
        expect(r.model).toBe("gpt-test")
        expect(r.messages).toEqual([
            { role: "system", content: "시스템" },
            { role: "user", content: "안녕\n[이미지]" },
        ])
    })

    it("Anthropic 형식 (최상위 system)", () => {
        const r = inspectRequestBody(JSON.stringify({
            system: [{ type: "text", text: "규칙" }],
            messages: [{ role: "user", content: "질문" }],
        }))
        expect(r.messages).toEqual([
            { role: "system", content: "규칙" },
            { role: "user", content: "질문" },
        ])
    })

    it("Gemini 형식", () => {
        const r = inspectRequestBody(JSON.stringify({
            systemInstruction: { parts: [{ text: "규칙" }] },
            contents: [{ role: "model", parts: [{ text: "답" }] }],
        }))
        expect(r.messages).toEqual([
            { role: "system", content: "규칙" },
            { role: "model", content: "답" },
        ])
    })

    it("알 수 없는 형식이면 null", () => {
        expect(inspectRequestBody("not json").messages).toBeNull()
        expect(inspectRequestBody(JSON.stringify({ foo: 1 })).messages).toBeNull()
    })
})
