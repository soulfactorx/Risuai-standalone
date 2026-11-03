<script lang="ts">
    /**
     * 사용자 지정 프롬프트 한 개를 편집하는 항목
     * - 입력하면 바로 DBState.db.customPrompts 에 저장된다.
     * - '기본값으로 되돌리기'를 누르면 저장된 값을 지우고 원래 문구를 사용한다.
     */
    import { RotateCcwIcon, TriangleAlertIcon } from "@lucide/svelte";
    import TextAreaInput from "src/lib/UI/GUI/TextAreaInput.svelte";
    import Button from "src/lib/UI/GUI/Button.svelte";
    import {
        getPrompt,
        isPromptCustomized,
        resetCustomPrompt,
        setCustomPrompt,
        type PromptDefinition,
    } from "src/ts/prompts/customPrompts";
    import { DBState } from "src/ts/stores.svelte";

    interface Props {
        def: PromptDefinition;
    }

    let { def }: Props = $props();

    // 항목은 키별로 고정되어 다시 만들어지므로 초기값만 읽으면 된다.
    // svelte-ignore state_referenced_locally
    let value = $state(getPrompt(def.key));
    let showDefault = $state(false);

    // '변경됨' 표시는 저장된 DB 값을 기준으로 계산한다.
    let customized = $derived(DBState.db.customPrompts && isPromptCustomized(def.key));

    function onInput() {
        setCustomPrompt(def.key, value);
    }

    function reset() {
        resetCustomPrompt(def.key);
        value = getPrompt(def.key);
    }
</script>

<div class="flex flex-col gap-1 border border-darkborderc rounded-md p-3 mt-3">
    <div class="flex items-center gap-2 flex-wrap">
        <span class="text-textcolor font-semibold">{def.label}</span>
        {#if customized}
            <span class="text-xs px-2 py-0.5 rounded-full bg-selected text-textcolor">변경됨</span>
        {:else}
            <span class="text-xs px-2 py-0.5 rounded-full border border-darkborderc text-textcolor2">기본값</span>
        {/if}
        <span class="text-xs text-textcolor2/70 font-mono">{def.key}</span>
    </div>
    <span class="text-sm text-textcolor2">{def.description}</span>
    {#if def.variables}
        <span class="text-xs text-textcolor2">사용 가능한 변수: {def.variables}</span>
    {/if}
    {#if def.formatWarning}
        <div class="flex items-start gap-1 text-xs text-draculared">
            <TriangleAlertIcon size={14} class="shrink-0 mt-0.5" />
            <span>{def.formatWarning}</span>
        </div>
    {/if}

    <TextAreaInput bind:value={value} onInput={onInput} height={def.default.length > 600 ? 'default' : '24'} margin="top" />

    <div class="flex gap-2 mt-2 flex-wrap">
        <Button size="sm" styled="outlined" onclick={reset} disabled={!customized}>
            <span class="flex items-center gap-1"><RotateCcwIcon size={14} />기본값으로 되돌리기</span>
        </Button>
        <Button size="sm" styled="outlined" onclick={() => { showDefault = !showDefault }}>
            {showDefault ? '기본값 숨기기' : '기본값 보기'}
        </Button>
    </div>
    {#if showDefault}
        <pre class="mt-2 p-2 text-xs whitespace-pre-wrap break-all bg-darkbg rounded-md text-textcolor2 max-h-72 overflow-y-auto">{def.default}</pre>
    {/if}
</div>
