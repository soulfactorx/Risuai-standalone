/**
 * 사용자 지정 프롬프트 레지스트리
 *
 * 원래 소스 코드에 고정(하드코딩)되어 있던 프롬프트를 한곳에 모아 두고,
 * 설정 → 프롬프트 관리 화면에서 사용자가 덮어쓸 수 있게 한다.
 *
 * 저장 방식
 * - 사용자가 바꾼 값만 `DBState.db.customPrompts[키]` 에 저장한다.
 * - 키가 없으면 아래 `default` 값을 그대로 사용한다. (빈 문자열로 저장하면 "비워서 사용"으로 취급)
 * - 원본 앱의 데이터 구조는 건드리지 않으므로 백업/복원에도 그대로 포함된다.
 *
 * 새 프롬프트를 추가할 때
 * 1. 아래 PROMPT_DEFINITIONS 에 항목을 추가한다.
 * 2. 사용하는 곳에서 `getPrompt(키)` 또는 `fillPrompt(키, 치환값)` 으로 읽는다.
 */
import { DBState } from "../stores.svelte"
import { defaultIrisSystemPrompt } from "./irisDefault"

/** 프롬프트 화면에서의 분류 */
export type PromptGroup = "chat" | "memory" | "emotion" | "image" | "iris" | "playground"

export const PROMPT_GROUP_LABELS: Record<PromptGroup, string> = {
    chat: "채팅 프롬프트 조립",
    memory: "장기 기억",
    emotion: "감정 인식",
    image: "이미지 생성",
    iris: "Iris 도우미",
    playground: "플레이그라운드",
}

export interface PromptDefinition {
    /** 저장 키 (변경 금지: 저장된 사용자 값과 연결됨) */
    key: string
    group: PromptGroup
    /** 화면에 표시할 이름 */
    label: string
    /** 어디에 쓰이는지 설명 */
    description: string
    /** 원래 코드에 있던 기본값 */
    default: string
    /** 사용할 수 있는 치환 변수 설명 */
    variables?: string
    /** 형식을 바꾸면 기능이 깨질 수 있는 경우의 경고 문구 */
    formatWarning?: string
}

/** CBS(`{{char}}`, `{{user}}` 등)를 사용할 수 있는 프롬프트임을 나타내는 공통 문구 */
const CBS_NOTE = "{{char}}, {{user}} 등 일반 프롬프트와 같은 변수(CBS)를 사용할 수 있습니다."

export const PROMPT_DEFINITIONS: PromptDefinition[] = [
    // ───────── 채팅 프롬프트 조립 ─────────
    {
        key: "chainOfThought",
        group: "chat",
        label: "사고 과정(CoT) 지시문",
        description: "고급 설정의 '사고 과정(Chain of Thought)'을 켰을 때 프롬프트 맨 끝에 추가되는 지시문입니다.",
        default: `<instruction> - before respond everything, Think step by step as a ai assistant how would you respond inside <Thoughts> xml tag. this must be less than 5 paragraphs.</instruction>`,
        variables: CBS_NOTE,
        formatWarning: "<Thoughts> 태그 안의 내용은 화면 표시·이미지 생성·기억 요약 등에서 자동으로 제거됩니다. 태그 이름을 바꾸면 생각 내용이 그대로 남을 수 있습니다.",
    },
    {
        key: "personalityLabel",
        group: "chat",
        label: "캐릭터 성격 머리말",
        description: "캐릭터의 '성격(personality)' 항목 앞에 붙는 문구입니다. 캐릭터 설명 뒤에 줄바꿈 두 번 후 이어집니다.",
        default: "Description of {{char}}: ",
        variables: CBS_NOTE,
    },
    {
        key: "scenarioLabel",
        group: "chat",
        label: "캐릭터 시나리오 머리말",
        description: "캐릭터의 '시나리오(scenario)' 항목 앞에 붙는 문구입니다. 캐릭터 설명 뒤에 줄바꿈 두 번 후 이어집니다.",
        default: "Circumstances and context of the dialogue: ",
        variables: CBS_NOTE,
    },
    {
        key: "groupReplyOnly",
        group: "chat",
        label: "그룹 채팅 응답자 지정",
        description: "그룹 채팅에서 이번에 응답할 캐릭터를 지정하기 위해 프롬프트 맨 끝에 추가되는 문구입니다.",
        default: "[Write the next reply only as {{slot}}]",
        variables: "{{slot}} : 이번에 응답할 캐릭터 이름. " + CBS_NOTE,
    },
    {
        key: "startNewChat",
        group: "chat",
        label: "새 채팅 시작 표시",
        description: "예시 대화와 실제 대화 사이에 들어가는 구분 문구입니다. 프롬프트 설정의 '새 채팅 시작 메시지 제거'를 켜면 실제 대화 앞에는 들어가지 않습니다.",
        default: "[Start a new chat]",
        formatWarning: "텍스트 완성(Ooba 등) 형식에서는 이 위치가 <START> 로 바뀌어 전송됩니다.",
    },
    {
        key: "previousConversation",
        group: "chat",
        label: "이전 대화 요약 감싸기",
        description: "장기 기억(SupaMemory/HypaMemory) 요약을 '메모리 카드' 없이 대화에 넣을 때 요약을 감싸는 형식입니다.",
        default: "<Previous Conversation>{{slot}}</Previous Conversation>",
        variables: "{{slot}} : 요약 내용",
    },
    {
        key: "continueResponse",
        group: "chat",
        label: "이어서 쓰기 지시문",
        description: "'이어서 쓰기(계속)' 기능을 사용할 때 Claude/GPT/OpenRouter/리버스 프록시 모델에 추가되는 지시문입니다.",
        default: "[Continue the last response]",
        variables: CBS_NOTE,
    },
    {
        key: "saysNothing",
        group: "chat",
        label: "빈 입력 전송 문구",
        description: "입력창이 빈 상태로 전송했을 때 사용자 메시지로 들어가는 문구입니다. (설정의 '아무 말 안 함' 옵션이 켜져 있을 때)",
        default: "*says nothing*",
    },

    // ───────── 장기 기억 ─────────
    {
        key: "supaHypaResultPrefix",
        group: "memory",
        label: "SupaMemory 관련 기억 머리말",
        description: "SupaMemory 에서 HypaMemory 검색 결과를 넣을 때 앞에 붙는 문구입니다.",
        default: "past events: ",
    },
    {
        key: "hypaV2Wrapper",
        group: "memory",
        label: "HypaMemory V2 결과 형식",
        description: "HypaMemory V2 가 요약과 관련 기억을 프롬프트에 넣는 형식입니다.",
        default: "<Past Events Summary>{{summary}}</Past Events Summary>\n<Past Events Details>{{details}}</Past Events Details>",
        variables: "{{summary}} : 전체 요약, {{details}} : 검색된 관련 기억",
    },
    {
        key: "hypaV3MemoryTag",
        group: "memory",
        label: "HypaMemory V3 기억 태그 이름",
        description: "HypaMemory V3 가 기억을 감싸는 XML 태그 이름입니다. <태그이름>...</태그이름> 형태로 사용됩니다.",
        default: "Past Events Summary",
        formatWarning: "태그 이름만 입력하세요. (< > 없이)",
    },

    // ───────── 감정 인식 ─────────
    {
        key: "emotionListSuffix",
        group: "emotion",
        label: "감정 목록 안내",
        description: "감정 이미지 선택 시 시스템 프롬프트(고급 설정의 감정 프롬프트) 뒤에 줄바꿈 두 번 후 붙는 감정 목록 안내입니다.",
        default: " list: {{slot}} \noutput only one word.",
        variables: "{{slot}} : 쉼표로 구분된 감정 이름 목록",
        formatWarning: "AI 의 답이 목록에 있는 단어 하나여야 감정 이미지가 선택됩니다. '한 단어만 출력' 같은 지시를 유지하세요.",
    },
    {
        key: "emotionExampleUser",
        group: "emotion",
        label: "감정 인식 예시 (입력)",
        description: "AI 에게 답 형식을 보여 주기 위한 예시 대화의 입력 문장입니다. 비워 두면 예시 대화를 보내지 않습니다.",
        default: `"Good morning, Master! Is there anything I can do for you today?"`,
    },
    {
        key: "emotionExampleAssistant",
        group: "emotion",
        label: "감정 인식 예시 (답)",
        description: "위 예시 입력에 대한 모범 답입니다. 실제 감정 목록에 없는 단어여도 동작에는 문제없습니다.",
        default: "happy",
    },

    // ───────── 이미지 생성 ─────────
    {
        key: "imagePromptChat",
        group: "image",
        label: "이미지 프롬프트 생성 입력 형식",
        description: "채팅 내용으로 이미지 프롬프트를 만들 때, 보조 모델에 사용자 메시지로 전달되는 형식입니다. (시스템 지시문은 캐릭터 설정의 이미지 생성 지시문을 사용)",
        default: "Chat:\n{{slot}}",
        variables: "{{slot}} : 최근 채팅 내용",
    },

    // ───────── Iris 도우미 ─────────
    {
        key: "irisSystem",
        group: "iris",
        label: "Iris 시스템 프롬프트",
        description: "Iris 도우미 대화창에서 사용하는 시스템 프롬프트 전체입니다.",
        default: defaultIrisSystemPrompt,
        variables: "{{mcp_instructions}} : Risuai Access 도구 안내문, {{tool_list}} : 사용 가능한 도구 목록(JSON)",
        formatWarning: "{{mcp_instructions}}, {{tool_list}} 를 지우면 Iris 가 앱 기능(도구)을 사용하는 방법을 알 수 없게 됩니다.",
    },

    // ───────── 플레이그라운드 ─────────
    {
        key: "playgroundSubtitleLLM",
        group: "playground",
        label: "자막 생성 (LLM 모드)",
        description: "플레이그라운드 → 자막에서 LLM 모드의 기본 프롬프트입니다.",
        default: "Transcribe and create a caption and timestamp of it, according to the user's audio or video input. inside a markdown code block. (prefix ```webvtt / postfix ```)\n\nFormat\n```\n[TIME] CONTENT\n```\n\nExample\n```\n[00:00] Hildy!\n[00:01] How are you?\n[00:03] Tell me, is the lord of the universe in?\n[00:07] Somebody must've stolen the crown jewels\n```\n\nStep 2. Generate another subtitle, this time, as a translation to {{slot}}, with same format with Step 1., using step 1 as ref.\n\n The translation must be in natural {{slot}}.\n\n Now, start (Hint: media length is {{slot::time}})",
        variables: "{{slot}} : 번역할 언어, {{slot::time}} : 미디어 길이",
        formatWarning: "결과에서 ```webvtt 코드 블록을 찾아 자막으로 사용합니다. 코드 블록 출력 지시를 유지하세요.",
    },
    {
        key: "playgroundSubtitleWhisper",
        group: "playground",
        label: "자막 번역 (Whisper 모드)",
        description: "플레이그라운드 → 자막에서 Whisper 모드로 받아쓴 자막을 번역할 때의 기본 프롬프트입니다.",
        default: "```\n{{slot::data}}\n``` Translate the following WEBVTT to natural {{slot}}, with keeping the timestamp and header, inside a markdown code block. (prefix ``` / postfix ```)",
        variables: "{{slot::data}} : 받아쓴 WEBVTT 자막, {{slot}} : 번역할 언어",
        formatWarning: "결과에서 코드 블록을 찾아 자막으로 사용합니다. 코드 블록 출력 지시를 유지하세요.",
    },
    {
        key: "playgroundImageTransAuto",
        group: "playground",
        label: "이미지 번역 (자동 모드)",
        description: "플레이그라운드 → 이미지 번역의 자동 모드 기본 프롬프트입니다.",
        default: 'extract text chunk from the image, with all the positions and background color, and translate them to {{slot}} in a JSON format.Format of: \n\n [\n  {\n    "bg_hex_color": string\n    "content": string\n    "text_hex_color": string,\n    "x_max": number,\n    "x_min": number,\n    "y_max": number,\n    "y_min": number\n    "translation": string,\n  }\n]\n\n each properties is:\n - x_min, y_min, x_max, y_max: range of 0 (most left/top point of the image) to 1 (most bottom/right point of the image), it is the bounding boxes of the original text chunk.\n - bg_hex_color is the color of the background.\n - text_hex_color is the color of the text.\n - translation is the translated text.\n - content is the original text chunk.',
        variables: "{{slot}} : 번역할 언어",
        formatWarning: "결과를 JSON 으로 해석합니다. JSON 형식과 속성 이름을 유지하세요.",
    },
    {
        key: "playgroundImageTransManual",
        group: "playground",
        label: "이미지 번역 (수동 모드)",
        description: "플레이그라운드 → 이미지 번역의 수동 모드 기본 프롬프트입니다.",
        default: `extract text from the image, and translate it to {{slot}} in a JSON format. Format of: \n\n{\n  "content": string,\n  "translation": string\n}\n\n each properties is:\n - content: the original text chunk.\n - translation: the translated text.`,
        variables: "{{slot}} : 번역할 언어",
        formatWarning: "결과를 JSON 으로 해석합니다. JSON 형식과 속성 이름을 유지하세요.",
    },
    {
        key: "playgroundTranslationContext",
        group: "playground",
        label: "긴 글 번역 문맥 안내",
        description: "플레이그라운드 → 번역에서 '문맥 유지'를 켰을 때, 앞서 번역한 내용을 번역기 노트로 전달하는 형식입니다.",
        default: "<Previous Content>{{slot}}</Previous Content>\nPrevious Content is the content that was translated before the current content. This is used to keep the context of the translation. do not retranslate or return it.",
        variables: "{{slot}} : 앞서 번역한 원문/번역문",
    },
]

const definitionMap = new Map(PROMPT_DEFINITIONS.map((def) => [def.key, def]))

/** 등록된 프롬프트의 기본값을 돌려준다. */
export function getDefaultPrompt(key: string): string {
    const def = definitionMap.get(key)
    if (!def) {
        throw new Error(`등록되지 않은 프롬프트 키입니다: ${key}`)
    }
    return def.default
}

/** 사용자가 이 프롬프트를 바꿨는지 여부 */
export function isPromptCustomized(key: string): boolean {
    const custom = DBState.db?.customPrompts
    // `in` 연산자는 Svelte 상태 프록시에서 변경 추적이 되므로 화면이 자동으로 갱신된다.
    return !!custom && key in custom
}

/**
 * 실제로 사용할 프롬프트를 돌려준다.
 * 사용자가 바꾼 값이 있으면 그 값을, 없으면 기본값을 사용한다.
 */
export function getPrompt(key: string): string {
    if (isPromptCustomized(key)) {
        return DBState.db.customPrompts[key] ?? ""
    }
    return getDefaultPrompt(key)
}

/**
 * 프롬프트의 치환 변수를 실제 값으로 바꿔서 돌려준다.
 *
 * @param key 프롬프트 키
 * @param slots `{ "{{slot}}": "값" }` 처럼 치환할 문자열과 값
 */
export function fillPrompt(key: string, slots: Record<string, string>): string {
    let result = getPrompt(key)
    for (const [token, value] of Object.entries(slots)) {
        // 값 안의 `$` 가 치환 패턴으로 해석되지 않도록 split/join 으로 치환
        result = result.split(token).join(value)
    }
    return result
}

/**
 * CBS 처리(risuChatParser 등)와 치환 변수를 함께 적용한다.
 * 치환 변수는 CBS 처리 중에 다른 의미로 해석되지 않도록 임시 표식으로 바꿔 두었다가 마지막에 값을 넣는다.
 *
 * @param key 프롬프트 키
 * @param slots 치환할 문자열과 값
 * @param parse CBS 처리 함수 (예: `(text) => risuChatParser(text, { chara })`)
 */
export function fillPromptWithParser(key: string, slots: Record<string, string>, parse: (text: string) => string): string {
    let template = getPrompt(key)
    const entries = Object.entries(slots)
    entries.forEach(([token], i) => {
        template = template.split(token).join(`\uE000risu-slot-${i}\uE000`)
    })
    let result = parse(template)
    entries.forEach(([, value], i) => {
        result = result.split(`\uE000risu-slot-${i}\uE000`).join(value)
    })
    return result
}

/** 사용자 값을 저장한다. */
export function setCustomPrompt(key: string, value: string) {
    DBState.db.customPrompts ??= {}
    DBState.db.customPrompts[key] = value
}

/** 사용자 값을 지우고 기본값으로 되돌린다. */
export function resetCustomPrompt(key: string) {
    if (DBState.db.customPrompts) {
        delete DBState.db.customPrompts[key]
    }
}
