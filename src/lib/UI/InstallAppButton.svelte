<script lang="ts">
    /**
     * 웹앱(PWA) 설치 안내/버튼 (홈 화면)
     * - 브라우저가 설치를 지원하면 '앱으로 설치' 버튼을 보여 준다.
     * - 설치 요청을 받지 못한 브라우저(iOS Safari 등)에는 메뉴에서 설치하는 방법을 안내한다.
     * - file:// 로 열었거나 이미 앱으로 실행 중이면 아무것도 보여 주지 않는다.
     */
    import { DownloadIcon } from "@lucide/svelte";
    import { installPromptStore, isStandalone } from "src/ts/standalone";

    const isHttp = location.protocol === "http:" || location.protocol === "https:"
    const runningAsApp = window.matchMedia("(display-mode: standalone)").matches
        || !!(navigator as Navigator & { standalone?: boolean }).standalone

    let hidden = $state(false)

    async function install() {
        const prompt = $installPromptStore
        if (!prompt) {
            return
        }
        await prompt.prompt()
        const choice = await prompt.userChoice
        if (choice.outcome === "accepted") {
            installPromptStore.set(null)
        }
    }
</script>

{#if isStandalone && isHttp && !runningAsApp && !hidden}
    <div class="mt-3 flex flex-col items-center gap-1 text-center">
        {#if $installPromptStore}
            <button class="flex items-center gap-2 rounded-md bg-darkbutton px-4 py-2 text-textcolor hover:bg-selected" onclick={install}>
                <DownloadIcon size={18} />
                <span>앱으로 설치</span>
            </button>
        {:else}
            <span class="text-xs text-textcolor2 max-w-md">
                앱처럼 쓰려면 브라우저 메뉴에서 <b>'앱 설치'</b> 또는 <b>'홈 화면에 추가'</b>를 누르세요.
                <button class="ml-1 underline" onclick={() => { hidden = true }}>닫기</button>
            </span>
        {/if}
    </div>
{/if}
