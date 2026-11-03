/**
 * 실제로 AI 에 전송된 프롬프트를 사람이 읽기 쉬운 형태로 정리하는 도구
 * (설정 → 프롬프트 관리 → 전송 프롬프트 확인 화면에서 사용)
 *
 * 요청 기록(fetch log)의 본문(JSON)에서 공급자별 메시지 형식을 찾아
 * `{ role, content }` 목록으로 바꾼다. API 키가 들어 있는 헤더는 다루지 않는다.
 */

export interface InspectedMessage {
    role: string
    content: string
}

export interface InspectedRequest {
    /** 정리된 메시지 목록. 형식을 알 수 없으면 null */
    messages: InspectedMessage[] | null
    /** 모델 이름 (있으면) */
    model?: string
}

/** 텍스트/이미지 등이 섞인 content 를 문자열로 바꾼다. */
function contentToText(content: unknown): string {
    if (content === null || content === undefined) {
        return ""
    }
    if (typeof content === "string") {
        return content
    }
    if (Array.isArray(content)) {
        return content.map((part) => contentToText(part)).filter((v) => v !== "").join("\n")
    }
    if (typeof content === "object") {
        const part = content as Record<string, unknown>
        if (typeof part.text === "string") {
            return part.text
        }
        if (part.type === "image_url" || part.type === "image" || part.inlineData || part.inline_data || part.type === "input_image") {
            return "[이미지]"
        }
        if (part.type === "input_audio" || part.type === "audio") {
            return "[오디오]"
        }
        if (part.type === "thinking" && typeof part.thinking === "string") {
            return `[생각]\n${part.thinking}`
        }
        if (part.type === "tool_use" || part.functionCall || part.function_call) {
            return `[도구 호출] ${JSON.stringify(part.input ?? part.functionCall ?? part.function_call)}`
        }
        if (part.type === "tool_result" || part.functionResponse) {
            return `[도구 결과] ${contentToText(part.content ?? part.functionResponse)}`
        }
        if (Array.isArray(part.parts)) {
            return contentToText(part.parts)
        }
        if (part.content !== undefined) {
            return contentToText(part.content)
        }
        return JSON.stringify(part)
    }
    return String(content)
}

/**
 * 요청 본문에서 메시지 목록을 뽑아낸다.
 * OpenAI(Chat/Responses), Anthropic, Google Gemini, 텍스트 완성(prompt) 형식을 지원한다.
 */
export function inspectRequestBody(rawBody: string): InspectedRequest {
    let body: Record<string, unknown>
    try {
        body = JSON.parse(rawBody)
    } catch {
        return { messages: null }
    }
    if (!body || typeof body !== "object") {
        return { messages: null }
    }

    const model = typeof body.model === "string" ? body.model : undefined
    const messages: InspectedMessage[] = []

    // Anthropic: 최상위 system
    if (body.system !== undefined) {
        messages.push({ role: "system", content: contentToText(body.system) })
    }
    // Gemini: systemInstruction / system_instruction
    const geminiSystem = body.systemInstruction ?? body.system_instruction
    if (geminiSystem !== undefined) {
        messages.push({ role: "system", content: contentToText(geminiSystem) })
    }
    // OpenAI Responses API: instructions
    if (typeof body.instructions === "string") {
        messages.push({ role: "system", content: body.instructions })
    }

    const list = body.messages ?? body.contents ?? body.input
    if (Array.isArray(list)) {
        for (const item of list) {
            if (!item || typeof item !== "object") {
                messages.push({ role: "unknown", content: contentToText(item) })
                continue
            }
            const msg = item as Record<string, unknown>
            const role = typeof msg.role === "string" ? msg.role : (typeof msg.type === "string" ? msg.type : "unknown")
            const content = msg.content !== undefined ? msg.content : (msg.parts ?? msg)
            messages.push({ role, content: contentToText(content) })
        }
    } else if (typeof body.input === "string") {
        messages.push({ role: "user", content: body.input })
    } else if (typeof body.prompt === "string") {
        // 텍스트 완성 형식 (Ooba, Kobold, NovelAI 등)
        messages.push({ role: "prompt", content: body.prompt })
    }

    return { messages: messages.length > 0 ? messages : null, model }
}

/** 역할 이름을 한국어로 표시한다. */
export function roleLabel(role: string): string {
    switch (role) {
        case "system":
        case "developer":
            return "⚙️ 시스템"
        case "user":
            return "😐 사용자"
        case "assistant":
        case "model":
            return "✨ AI"
        case "function":
        case "tool":
            return "📐 도구"
        case "prompt":
            return "📝 프롬프트"
        default:
            return "🤔 " + role
    }
}
