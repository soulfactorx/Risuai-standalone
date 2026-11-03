<script lang="ts">
    /**
     * 파일 가져오기 패널 (홈 화면의 RisuRealm 자리를 대신함)
     * - 버튼으로 파일을 고르거나, 이 영역에 파일을 끌어다 놓으면 가져온다.
     * - 여러 파일을 한 번에 가져올 수 있고, 파일별 결과를 아래에 보여 준다.
     */
    import { FileUpIcon, CircleCheckIcon, CircleXIcon } from "@lucide/svelte";
    import Button from "./GUI/Button.svelte";
    import {
        importFiles,
        importKindLabel,
        selectAndImportFiles,
        type FileImportResult,
    } from "src/ts/fileImport";
    import { alertClear } from "src/ts/alert";

    let results = $state<FileImportResult[]>([])
    let busy = $state(false)
    let dragOver = $state(false)

    async function run(task: () => Promise<FileImportResult[]>) {
        if (busy) {
            return
        }
        busy = true
        try {
            const r = await task()
            if (r.length > 0) {
                results = r
                // 캐릭터 가져오기가 띄운 '불러오는 중' 알림이 남아 있으면 닫는다.
                alertClear()
            }
        } finally {
            busy = false
        }
    }

    function onDrop(e: DragEvent) {
        // 앱 전체의 드롭 처리(App.svelte)와 중복되지 않도록 여기서 멈춘다.
        e.preventDefault()
        e.stopPropagation()
        dragOver = false
        const files = e.dataTransfer?.files
        if (files && files.length > 0) {
            run(() => importFiles(files))
        }
    }
</script>

<div
    role="region"
    aria-label="파일 가져오기"
    class="w-full rounded-2xl border-2 border-dashed p-6 flex flex-col items-center gap-3 text-center transition-colors"
    class:border-borderc={dragOver}
    class:bg-selected={dragOver}
    class:border-darkborderc={!dragOver}
    ondragover={(e) => { e.preventDefault(); e.stopPropagation(); dragOver = true }}
    ondragleave={() => { dragOver = false }}
    ondrop={onDrop}
>
    <FileUpIcon size={40} class="text-textcolor2" />
    <div class="flex flex-col gap-1">
        <span class="text-lg font-semibold text-textcolor">파일을 여기에 끌어다 놓거나 선택하세요</span>
        <span class="text-sm text-textcolor2">
            RisuRealm 등에서 내려받은 캐릭터(.charx · .png · .json), 모듈(.risum · .json), 프리셋(.risup) 파일을 가져옵니다.
            여러 파일을 한 번에 올릴 수 있습니다.
        </span>
    </div>
    <Button onclick={() => run(selectAndImportFiles)} disabled={busy}>
        {busy ? "가져오는 중..." : "파일 선택"}
    </Button>
</div>

{#if results.length > 0}
    <div class="w-full flex flex-col gap-2 mt-3">
        {#each results as r, i (i)}
            <div class="flex items-start gap-2 rounded-md bg-darkbg px-3 py-2 text-sm">
                {#if r.ok}
                    <CircleCheckIcon size={18} class="shrink-0 mt-0.5 text-green-500" />
                {:else}
                    <CircleXIcon size={18} class="shrink-0 mt-0.5 text-draculared" />
                {/if}
                <div class="flex flex-col min-w-0">
                    <span class="text-textcolor break-all">{r.name} <span class="text-textcolor2">({importKindLabel(r.kind)})</span></span>
                    <span class="text-textcolor2">{r.message}</span>
                </div>
            </div>
        {/each}
    </div>
{/if}
