<!-- svelte-ignore a11y_click_events_have_key_events -->
<div  class="fixed top-0 left-0 h-full w-full bg-black/50 flex flex-col z-50 items-center justify-center" role="button" tabindex="0" onclick={close}>
    <div class="bg-darkbg rounded-md p-4 max-w-full flex flex-col w-2xl max-h-full overflow-y-auto" role="button" tabindex="0" onclick={(e)=>{
        e.stopPropagation()
        onclick?.(e)
    }}>
        
        {#if !DBState.db.account}
            <span class="font-bold text-2xl w-full">RisuRealm에 업로드하려면 Risu 계정에 로그인해야 합니다</span>
            <span class="text-textcolor2">앱 설정 🡲 계정에서 로그인할 수 있습니다</span>
            <button onclick={async () => {
                close()
            }} class="text-textcolor mt-2 text-lg bg-transparent border-solid border-1 border-borderc p-4 hover:bg-blue-800 transition-colors cursor-pointer">확인</button>
            
        {:else}
        <h1 class="font-bold text-2xl w-full">
            <span>
                {char.name}을(를) {language.hub}에 공유
            </span>
            <button class="float-right text-textcolor2 hover:text-green-500" onclick={close}>
                <XIcon />
            </button>
        </h1>
        {#if char.realmId}
        <span class="text-textcolor2 text-sm">{language.updateRealmDesc}</span>
        {/if}
        <div class="mb-2 mt-2 w-full border-t-2 border-t-bgcolor"></div>
        <span class="text-textcolor">{language.creatorNotes}</span>
        <span class="text-textcolor2 text-sm">검색할 때와 봇을 처음 열 때 표시되는 설명입니다.</span>
        <span class="text-textcolor2 text-sm">20자 이상 입력하세요.</span>
        <MultiLangInput bind:value={char.creatorNotes} />
        <span class="text-textcolor">{language.tags}</span>
        <span class="text-textcolor2 text-sm">캐릭터를 쉽게 검색할 수 있도록 하는 태그입니다. 영문 알파벳만 사용할 수 있으며 쉼표로 구분합니다.</span>
        <TextInput placeholder="" bind:value={tags} oninput={() => {
            tags = tags.replace(/[^a-zA-Z,\-]/g, '').toLocaleLowerCase().replace(/ /g, '')
        }} />

        <div class="peer-focus:block hidden hover:block flex-wrap">
            {#each searchTagList(tags) as tag}
                <button class="text-textcolor2 text-sm p-2 border border-bgcolor" onclick={() => {
                    const splited = tags.split(',').map(e => e.trim())
                    splited[splited.length - 1] = tag
                    tags = splited.join(',') + ','
                }}>{tag}</button>
            {/each}
        </div>

        {#if char.license !== 'CC BY-NC-SA 4.0' && char.license !== 'CC BY-SA 4.0'}

        <span class="text-textcolor mt-4">라이선스</span>
        <span class="text-textcolor2 text-sm">다운로드한 사람이 카드의 프롬프트를 사용하는 범위를 제한할 라이선스를 선택할 수 있습니다.</span>
        <SelectInput bind:value={license}>
            <OptionInput value="">없음</OptionInput>
            {#each Object.keys(CCLicenseData) as ccl}
                <OptionInput value={ccl}>{CCLicenseData[ccl][2]} ({CCLicenseData[ccl][1]})</OptionInput>
            {/each}
        </SelectInput>

        {/if}
        {#if !char.realmId}
            <div class="flex items-center flex-wrap mt-4">
                <button class="bg-bgcolor p-2 rounded-lg" class:ring-1={!privateMode} onclick={() => {privateMode = false}}>🌏 작성자 ID 공개</button>
                <button class="bg-bgcolor p-2 rounded-lg ml-2" class:ring-1={privateMode} onclick={() => {privateMode = true}}>🔒 익명</button>
            </div>
            <div class="flex items-center flex-wrap mt-2">
                <button class="bg-bgcolor p-2 rounded-lg" class:ring-1={!nsfwMode} onclick={() => {nsfwMode = false}}>🎖️ 전체 이용가</button>
                <button class="bg-bgcolor p-2 rounded-lg ml-2" class:ring-1={nsfwMode} onclick={() => {nsfwMode = true}}>🔞 NSFW</button>
            </div>
        {:else}
            <div class="flex items-center flex-wrap mt-2">
                <button class="bg-bgcolor p-2 rounded-lg" class:ring-1={!update} onclick={() => {nsfwMode = false}}>🚀 업데이트</button>
                <button class="bg-bgcolor p-2 rounded-lg ml-2" class:ring-1={update} onclick={() => {nsfwMode = true}}>⭐ 새로 업로드</button>
            </div>
        {/if}
        {#if nsfwMode}
            <span class="text-textcolor2 text-sm">그로테스크한 콘텐츠나 미성년 캐릭터가 포함된 NSFW 콘텐츠는 차단됩니다.</span>
        {/if}
        <Button onclick={async () => {
            await sleep(1) // wait for the input to be updated
            const enNotes = creatorNotes.en
            const latin1 = /^[\x00-\xFF]*$/
            if(enNotes.length < 10){
                alertError("제작자 노트의 영어 버전은 10자보다 길어야 합니다")
            }
            if(!latin1.test(enNotes)){
                alertError("제작자 노트의 영어 버전에는 Latin-1 문자만 사용할 수 있습니다")
            }
            shareRisuHub2($state.snapshot(char) as character, {
                anon: privateMode,
                nsfw: nsfwMode,
                tag: tags,
                license: license,
                update
            })
            close()
        }} className="mt-2" size="lg">
            {#if char.realmId}
                {language.updateRealm}
            {:else}
                {language.shareCloud}
            {/if}
        </Button>
        {/if}

    </div>
</div>


<script lang="ts">
    import { XIcon } from "@lucide/svelte";
    import { language } from "src/lang";
    import { alertError } from "src/ts/alert";
    import { shareRisuHub2 } from "src/ts/characterCards";
    import { type character } from "src/ts/storage/database.svelte";
    import { DBState } from 'src/ts/stores.svelte';
    import TextInput from "../GUI/TextInput.svelte";
    import Button from "../GUI/Button.svelte";
    import SelectInput from "../GUI/SelectInput.svelte";
    import { CCLicenseData } from "src/ts/licenses";
    import OptionInput from "../GUI/OptionInput.svelte";
    import { parseMultilangString, searchTagList, sleep } from "src/ts/util";
    import MultiLangInput from "../GUI/MultiLangInput.svelte";
    interface Props {
        close?: any;
        char: character;
        onclick?: (event: MouseEvent & {
            currentTarget: EventTarget & HTMLDivElement;
        }) => any
    }

    let { close = () => {}, char = $bindable(), onclick }: Props = $props();
    let tags=$state("")
    let privateMode = $state(false)
    let nsfwMode = $state(false)
    let license = $state("")
    let creatorNotes: {[code:string]:string} = parseMultilangString(char.creatorNotes)
    let update = false

</script>