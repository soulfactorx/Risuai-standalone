<script lang="ts">
    /**
     * 설정 → 토큰 사용량
     * AI 서비스가 응답과 함께 알려 준 실제 토큰 사용량을 기간·모델·용도·캐릭터별로 보여 준다.
     * (src/ts/usage/tokenUsage.ts 에서 기록, src/ts/usage/tokenUsageStats.ts 에서 집계)
     */
    import Button from "src/lib/UI/GUI/Button.svelte";
    import Check from "src/lib/UI/GUI/CheckInput.svelte";
    import { DBState } from "src/ts/stores.svelte";
    import { alertConfirm, alertNormal } from "src/ts/alert";
    import { downloadFile } from "src/ts/globalApi.svelte";
    import { formatTokens, PURPOSE_LABELS } from "src/ts/usage/tokenUsage";
    import {
        PERIOD_LABELS,
        summarizeByCharacter,
        summarizeDaily,
        usageLogToCSV,
        type UsagePeriod,
        type UsageTotals,
    } from "src/ts/usage/tokenUsageStats";

    let period = $state<UsagePeriod>("7d")
    const periods = Object.keys(PERIOD_LABELS) as UsagePeriod[]

    let summary = $derived(summarizeDaily(DBState.db.tokenUsageDaily, period))
    let byCharacter = $derived(summarizeByCharacter(DBState.db.tokenUsageLog, period))
    let recent = $derived((DBState.db.tokenUsageLog ?? []).slice(-50).reverse())
    let maxDay = $derived(Math.max(1, ...summary.byDay.map((d) => d.totals.input + d.totals.output)))

    async function resetAll() {
        if (!(await alertConfirm("토큰 사용량 기록을 모두 지울까요? 되돌릴 수 없습니다."))) {
            return
        }
        DBState.db.tokenUsageLog = []
        DBState.db.tokenUsageDaily = {}
        alertNormal("토큰 사용량 기록을 지웠습니다.")
    }

    async function exportCSV() {
        await downloadFile("토큰사용량.csv", new TextEncoder().encode(usageLogToCSV(DBState.db.tokenUsageLog)))
    }
</script>

{#snippet totalsCells(t: UsageTotals)}
    <span class="text-right">{formatTokens(t.requests)}</span>
    <span class="text-right text-blue-400">{formatTokens(t.input)}</span>
    <span class="text-right text-green-400">{formatTokens(t.output)}</span>
    <span class="text-right text-textcolor2">{formatTokens(t.cacheRead)}</span>
{/snippet}

{#snippet tableHeader(first: string)}
    <span class="text-textcolor2">{first}</span>
    <span class="text-right text-textcolor2">요청</span>
    <span class="text-right text-textcolor2">입력</span>
    <span class="text-right text-textcolor2">출력</span>
    <span class="text-right text-textcolor2">캐시 읽기</span>
{/snippet}

<h2 class="text-2xl font-bold mt-2">토큰 사용량</h2>
<span class="text-textcolor2 text-sm mt-1">
    AI 서비스가 응답과 함께 알려 준 <b>실제 사용량</b>입니다. 사용량을 알려 주지 않는 서비스(일부 OpenAI 호환 서버 등)는 기록되지 않습니다.
    기록은 이 브라우저의 저장 데이터에만 저장됩니다.
</span>

<div class="mt-3">
    <Check bind:check={DBState.db.showTokenUsageInChat} name="채팅 메시지 아래에 턴별 토큰 사용량 표시" />
</div>

<div class="flex gap-2 mt-4 flex-wrap">
    {#each periods as p}
        <Button size="sm" styled={period === p ? "primary" : "outlined"} selected={period === p} onclick={() => { period = p }}>{PERIOD_LABELS[p]}</Button>
    {/each}
</div>

<!-- 합계 -->
<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
    <div class="rounded-md bg-darkbg p-3 flex flex-col">
        <span class="text-xs text-textcolor2">요청 수</span>
        <span class="text-xl font-bold">{formatTokens(summary.total.requests)}</span>
    </div>
    <div class="rounded-md bg-darkbg p-3 flex flex-col">
        <span class="text-xs text-textcolor2">입력 토큰</span>
        <span class="text-xl font-bold text-blue-400">{formatTokens(summary.total.input)}</span>
    </div>
    <div class="rounded-md bg-darkbg p-3 flex flex-col">
        <span class="text-xs text-textcolor2">출력 토큰</span>
        <span class="text-xl font-bold text-green-400">{formatTokens(summary.total.output)}</span>
    </div>
    <div class="rounded-md bg-darkbg p-3 flex flex-col">
        <span class="text-xs text-textcolor2">합계</span>
        <span class="text-xl font-bold">{formatTokens(summary.total.input + summary.total.output)}</span>
    </div>
</div>
<div class="text-xs text-textcolor2 mt-2">
    입력 중 캐시 읽기 {formatTokens(summary.total.cacheRead)} · 캐시 쓰기 {formatTokens(summary.total.cacheWrite)} / 출력 중 추론(생각) {formatTokens(summary.total.reasoning)}
</div>

{#if summary.total.requests === 0}
    <div class="mt-6 text-textcolor2">이 기간에는 기록된 사용량이 없습니다.</div>
{:else}
    <!-- 날짜별 -->
    {#if period !== "today"}
        <h3 class="text-xl font-bold mt-6">날짜별</h3>
        <div class="flex flex-col gap-1 mt-2">
            {#each summary.byDay as d (d.day)}
                {@const total = d.totals.input + d.totals.output}
                <div class="flex items-center gap-2 text-sm">
                    <span class="w-24 shrink-0 text-textcolor2">{d.day.slice(5)}</span>
                    <div class="grow h-4 bg-darkbg rounded-sm overflow-hidden flex" title={`입력 ${formatTokens(d.totals.input)} / 출력 ${formatTokens(d.totals.output)}`}>
                        <div class="h-full bg-blue-500/70" style={`width: ${(d.totals.input / maxDay) * 100}%`}></div>
                        <div class="h-full bg-green-500/70" style={`width: ${(d.totals.output / maxDay) * 100}%`}></div>
                    </div>
                    <span class="w-24 shrink-0 text-right">{formatTokens(total)}</span>
                </div>
            {/each}
        </div>
        <div class="flex gap-4 text-xs text-textcolor2 mt-1">
            <span><span class="inline-block w-3 h-3 bg-blue-500/70 align-middle"></span> 입력</span>
            <span><span class="inline-block w-3 h-3 bg-green-500/70 align-middle"></span> 출력</span>
        </div>
    {/if}

    <!-- 모델별 -->
    <h3 class="text-xl font-bold mt-6">모델별</h3>
    <div class="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-x-3 gap-y-1 mt-2 text-sm">
        {@render tableHeader("모델")}
        {#each summary.byModel as m (m.model)}
            <span class="break-all">{m.model}</span>
            {@render totalsCells(m.totals)}
        {/each}
    </div>

    <!-- 용도별 -->
    <h3 class="text-xl font-bold mt-6">용도별</h3>
    <div class="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-x-3 gap-y-1 mt-2 text-sm">
        {@render tableHeader("용도")}
        {#each summary.byPurpose as p (p.purpose)}
            <span>{p.label}</span>
            {@render totalsCells(p.totals)}
        {/each}
    </div>

    <!-- 캐릭터별 -->
    {#if byCharacter.length > 0}
        <h3 class="text-xl font-bold mt-6">캐릭터별 (채팅)</h3>
        <span class="text-xs text-textcolor2">최근 요청 기록(최대 1,000개)을 기준으로 합니다.</span>
        <div class="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-x-3 gap-y-1 mt-2 text-sm">
            {@render tableHeader("캐릭터")}
            {#each byCharacter as c (c.name)}
                <span class="break-all">{c.name}</span>
                {@render totalsCells(c.totals)}
            {/each}
        </div>
    {/if}
{/if}

<!-- 최근 요청 -->
<h3 class="text-xl font-bold mt-8">최근 요청</h3>
{#if recent.length === 0}
    <span class="text-sm text-textcolor2 mt-2">아직 기록된 요청이 없습니다.</span>
{:else}
    <div class="flex flex-col gap-1 mt-2">
        {#each recent as e, i (i)}
            <div class="rounded-md bg-darkbg px-3 py-2 text-sm flex flex-wrap gap-x-3 gap-y-1">
                <span class="text-textcolor2">{new Date(e.time).toLocaleString("ko-KR")}</span>
                <span>{PURPOSE_LABELS[e.purpose] ?? e.purpose}</span>
                <span class="text-textcolor2 break-all">{e.model}</span>
                {#if e.charName}<span class="text-textcolor2">· {e.charName}</span>{/if}
                <span class="ml-auto">
                    <span class="text-blue-400">입력 {formatTokens(e.input)}</span>
                    · <span class="text-green-400">출력 {formatTokens(e.output)}</span>
                    {#if e.cacheRead > 0}· <span class="text-textcolor2">캐시 {formatTokens(e.cacheRead)}</span>{/if}
                </span>
            </div>
        {/each}
    </div>
{/if}

<div class="flex gap-2 mt-6 flex-wrap">
    <Button size="sm" styled="outlined" onclick={exportCSV}>CSV 로 내보내기</Button>
    <Button size="sm" onclick={resetAll}>기록 모두 지우기</Button>
</div>
