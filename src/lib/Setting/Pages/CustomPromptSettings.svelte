<script lang="ts">
    /**
     * 설정 → 프롬프트 관리
     *
     * 1. 고정 프롬프트: 원래 코드에 고정되어 있던 프롬프트를 바꾼다. (src/ts/prompts/customPrompts.ts)
     * 2. 기존 설정 프롬프트: 원래부터 설정으로 바꿀 수 있던 프롬프트를 한곳에서 확인/수정한다.
     * 3. 전송 프롬프트 확인: 현재 채팅에서 만들어질 프롬프트와 최근 실제로 전송된 요청을 본다.
     */
    import { get } from "svelte/store";
    import Button from "src/lib/UI/GUI/Button.svelte";
    import TextAreaInput from "src/lib/UI/GUI/TextAreaInput.svelte";
    import CustomPromptItem from "./CustomPrompts/CustomPromptItem.svelte";
    import {
        PROMPT_DEFINITIONS,
        PROMPT_GROUP_LABELS,
        isPromptCustomized,
        resetCustomPrompt,
        type PromptGroup,
    } from "src/ts/prompts/customPrompts";
    import { inspectRequestBody, roleLabel, type InspectedMessage } from "src/ts/prompts/promptInspector";
    import { DBState, selectedCharID } from "src/ts/stores.svelte";
    import { alertConfirm, alertError } from "src/ts/alert";
    import { getFetchLogs } from "src/ts/globalApi.svelte";
    import { doingChat, previewFormated, sendChat } from "src/ts/process/index.svelte";

    type Tab = "fixed" | "existing" | "inspect"
    let tab = $state<Tab>("fixed")

    // 화면을 다시 그리기 위한 키 (전체 초기화 후 항목들의 입력값을 다시 읽음)
    let refreshKey = $state(0)

    const groups = Object.keys(PROMPT_GROUP_LABELS) as PromptGroup[]

    let customizedCount = $derived(
        DBState.db.customPrompts ? PROMPT_DEFINITIONS.filter((def) => isPromptCustomized(def.key)).length : 0
    )

    async function resetAll() {
        if (!(await alertConfirm("변경한 고정 프롬프트를 모두 기본값으로 되돌릴까요?"))) {
            return
        }
        for (const def of PROMPT_DEFINITIONS) {
            resetCustomPrompt(def.key)
        }
        refreshKey++
    }

    // ───────── 기존 설정 프롬프트 ─────────
    // 원래부터 설정에 있던 프롬프트. 비어 있을 때 코드에서 사용하는 기본 문구가 있으면 함께 표시한다.
    const existingPrompts: {
        field: "mainPrompt" | "jailbreak" | "globalNote" | "additionalPrompt" | "descriptionPrefix" | "supaMemoryPrompt" | "emotionPrompt2" | "autoSuggestPrompt" | "translatorPrompt" | "systemContentReplacement"
        label: string
        description: string
        fallback?: string
    }[] = [
        { field: "mainPrompt", label: "메인 프롬프트", description: "모든 채팅에 들어가는 기본 시스템 프롬프트입니다. (프롬프트 템플릿을 사용 중이면 템플릿이 우선합니다)" },
        { field: "jailbreak", label: "탈옥 프롬프트", description: "탈옥 프롬프트 켜기를 사용할 때 추가되는 프롬프트입니다." },
        { field: "globalNote", label: "글로벌 노트", description: "캐릭터에 상관없이 대화 뒤쪽에 들어가는 노트입니다. (캐릭터의 글로벌 노트 대체가 있으면 그것이 우선합니다)" },
        { field: "additionalPrompt", label: "추가 프롬프트", description: "'프롬프트 전처리'가 켜져 있을 때 메인 프롬프트 뒤에 붙습니다." },
        { field: "descriptionPrefix", label: "캐릭터 설명 머리말", description: "'프롬프트 전처리'가 켜져 있을 때 캐릭터 설명 앞에 붙습니다." },
        { field: "supaMemoryPrompt", label: "기억 요약 프롬프트 (SupaMemory / HypaMemory V2)", description: "장기 기억 요약에 사용됩니다. 비워 두면 기본 문구를 사용합니다.", fallback: "[Summarize the ongoing role story, It must also remove redundancy and unnecessary text and content from the output to reduce tokens for gpt3 and other sublanguage models]" },
        { field: "emotionPrompt2", label: "감정 인식 프롬프트", description: "감정 이미지 선택에 사용됩니다. 비워 두면 기본 문구를 사용합니다. (뒤에 '감정 목록 안내'가 붙습니다)", fallback: "From the list below, choose a word that best represents a character's outfit description, action, or emotion in their dialogue. Prioritize selecting words related to outfit first, then action, and lastly emotion. Print out the chosen word." },
        { field: "autoSuggestPrompt", label: "답변 추천 프롬프트", description: "답변 추천 기능에 사용됩니다. 결과의 각 줄이 '-' 로 시작해야 추천으로 표시됩니다." },
        { field: "translatorPrompt", label: "번역 프롬프트", description: "LLM 번역기에 사용됩니다. {{slot}} 은 번역할 언어로 바뀝니다." },
        { field: "systemContentReplacement", label: "시스템 메시지 대체 형식", description: "시스템 역할을 지원하지 않는 모델에서 시스템 메시지를 바꾸는 형식입니다. {{slot}} 은 원래 내용입니다." },
    ]

    // ───────── 전송 프롬프트 확인 ─────────
    let previewMessages = $state<InspectedMessage[] | null>(null)
    let previewLoading = $state(false)
    let logs = $state(getFetchLogs().slice())
    let openedLog = $state<number | null>(null)

    async function previewCurrentChat() {
        if (get(selectedCharID) < 0) {
            alertError("먼저 채팅할 캐릭터를 선택해 주세요.")
            return
        }
        if (get(doingChat) || previewLoading) {
            return
        }
        previewLoading = true
        try {
            // 실제로 전송하지 않고 프롬프트만 만든다. (개발자 도구의 미리보기와 같은 방식)
            await sendChat(-1, { preview: true })
            previewMessages = previewFormated.map((chat) => ({
                role: chat.role,
                content: chat.content
                    + (chat.multimodals?.length ? `\n\n[이미지 등 ${chat.multimodals.length}개 포함]` : ""),
            }))
        } catch (error) {
            alertError(error)
        } finally {
            doingChat.set(false)
            previewLoading = false
        }
    }

    function refreshLogs() {
        logs = getFetchLogs().slice()
        openedLog = null
    }

    function shortUrl(url: string) {
        try {
            const u = new URL(url)
            return u.host + u.pathname
        } catch {
            return url
        }
    }
</script>

<h2 class="text-2xl font-bold mt-2">프롬프트 관리</h2>
<span class="text-textcolor2 text-sm mt-1">
    앱이 AI 에게 보내는 프롬프트를 확인하고 바꿀 수 있습니다. 바꾼 값은 저장 데이터에 함께 저장되어 백업에도 포함됩니다.
</span>

<div class="flex gap-2 mt-4 flex-wrap">
    <Button size="sm" styled={tab === "fixed" ? "primary" : "outlined"} selected={tab === "fixed"} onclick={() => { tab = "fixed" }}>고정 프롬프트</Button>
    <Button size="sm" styled={tab === "existing" ? "primary" : "outlined"} selected={tab === "existing"} onclick={() => { tab = "existing" }}>기존 설정 프롬프트</Button>
    <Button size="sm" styled={tab === "inspect" ? "primary" : "outlined"} selected={tab === "inspect"} onclick={() => { tab = "inspect"; refreshLogs() }}>전송 프롬프트 확인</Button>
</div>

{#if tab === "fixed"}
    <div class="mt-4 p-3 rounded-md bg-darkbg text-sm text-textcolor2 flex flex-col gap-1">
        <span>원래 코드에 고정되어 있던 프롬프트입니다. 입력하면 바로 적용됩니다.</span>
        <span>내용을 모두 지우면 그 문구 없이(빈 값으로) 전송됩니다. 원래대로 하려면 '기본값으로 되돌리기'를 누르세요.</span>
        <span>현재 {customizedCount}개 변경됨 / 전체 {PROMPT_DEFINITIONS.length}개</span>
    </div>
    <div class="mt-2">
        <Button size="sm" onclick={resetAll} disabled={customizedCount === 0}>모두 기본값으로 되돌리기</Button>
    </div>
    {#key refreshKey}
        {#each groups as group}
            <h3 class="text-xl font-bold mt-6">{PROMPT_GROUP_LABELS[group]}</h3>
            {#each PROMPT_DEFINITIONS.filter((def) => def.group === group) as def (def.key)}
                <CustomPromptItem {def} />
            {/each}
        {/each}
    {/key}
{:else if tab === "existing"}
    <div class="mt-4 p-3 rounded-md bg-darkbg text-sm text-textcolor2">
        원래부터 설정에서 바꿀 수 있던 프롬프트를 모아 둔 곳입니다. 각 설정 화면에서 바꾼 것과 같은 값입니다.
        프롬프트 템플릿, HypaMemory V3 요약 프롬프트, 캐릭터별 이미지 생성 지시문은 각 설정 화면에서 바꿀 수 있습니다.
    </div>
    {#each existingPrompts as item (item.field)}
        <div class="flex flex-col gap-1 border border-darkborderc rounded-md p-3 mt-3">
            <span class="text-textcolor font-semibold">{item.label}</span>
            <span class="text-sm text-textcolor2">{item.description}</span>
            <TextAreaInput bind:value={DBState.db[item.field]} highlight margin="top" height="24" placeholder={item.fallback ?? ""} />
            {#if item.fallback && !DBState.db[item.field]}
                <span class="text-xs text-textcolor2">비어 있음 → 기본 문구(입력창의 흐린 글자)를 사용합니다.</span>
            {/if}
        </div>
    {/each}
{:else}
    <h3 class="text-xl font-bold mt-6">현재 채팅의 프롬프트 미리보기</h3>
    <span class="text-sm text-textcolor2 mt-1">
        지금 선택된 캐릭터/채팅에서 메시지를 보낸다면 AI 에게 전달될 프롬프트(시스템 프롬프트 포함)를 실제 전송 없이 만들어 보여 줍니다.
    </span>
    <div class="mt-2">
        <Button size="sm" onclick={previewCurrentChat} disabled={previewLoading}>
            {previewLoading ? "만드는 중..." : "미리보기 만들기"}
        </Button>
    </div>
    {#if previewMessages}
        <div class="flex flex-col gap-2 mt-3">
            {#each previewMessages as msg, i (i)}
                <div class="border border-darkborderc rounded-md">
                    <div class="px-3 py-1 text-sm font-semibold bg-darkbg rounded-t-md">{roleLabel(msg.role)}</div>
                    <pre class="p-3 text-xs whitespace-pre-wrap break-all text-textcolor max-h-96 overflow-y-auto">{msg.content}</pre>
                </div>
            {/each}
        </div>
    {/if}

    <h3 class="text-xl font-bold mt-8">최근 전송된 요청</h3>
    <span class="text-sm text-textcolor2 mt-1">
        채팅, 기억 요약, 감정 인식, 번역 등 앱이 실제로 보낸 최근 요청(최대 20개, 앱을 새로 열면 초기화)입니다. API 키가 들어 있는 헤더는 표시하지 않습니다.
    </span>
    <div class="mt-2">
        <Button size="sm" styled="outlined" onclick={refreshLogs}>새로고침</Button>
    </div>
    {#if logs.length === 0}
        <span class="text-sm text-textcolor2 mt-3">아직 기록된 요청이 없습니다.</span>
    {/if}
    {#each logs as log, i (i)}
        {@const inspected = inspectRequestBody(log.body)}
        <div class="border border-darkborderc rounded-md mt-3">
            <button class="w-full text-left px-3 py-2 flex flex-wrap gap-2 items-center hover:bg-selected rounded-md" onclick={() => { openedLog = openedLog === i ? null : i }}>
                <span class="text-sm" class:text-draculared={!log.success}>{log.success ? "성공" : "실패"}</span>
                <span class="text-sm text-textcolor2">{log.date}</span>
                <span class="text-sm text-textcolor break-all">{shortUrl(log.url)}</span>
                {#if inspected.model}
                    <span class="text-xs text-textcolor2">({inspected.model})</span>
                {/if}
            </button>
            {#if openedLog === i}
                <div class="flex flex-col gap-2 p-3">
                    {#if inspected.messages}
                        {#each inspected.messages as msg, j (j)}
                            <div class="border border-darkborderc rounded-md">
                                <div class="px-3 py-1 text-sm font-semibold bg-darkbg rounded-t-md">{roleLabel(msg.role)}</div>
                                <pre class="p-3 text-xs whitespace-pre-wrap break-all text-textcolor max-h-96 overflow-y-auto">{msg.content}</pre>
                            </div>
                        {/each}
                    {:else}
                        <span class="text-xs text-textcolor2">메시지 형식을 알 수 없어 요청 본문을 그대로 표시합니다.</span>
                        <pre class="p-3 text-xs whitespace-pre-wrap break-all text-textcolor bg-darkbg rounded-md max-h-96 overflow-y-auto">{log.body}</pre>
                    {/if}
                    <details>
                        <summary class="text-sm text-textcolor2 cursor-pointer">AI 응답 보기</summary>
                        <pre class="p-3 mt-1 text-xs whitespace-pre-wrap break-all text-textcolor bg-darkbg rounded-md max-h-96 overflow-y-auto">{log.response}</pre>
                    </details>
                </div>
            {/if}
        </div>
    {/each}
{/if}
