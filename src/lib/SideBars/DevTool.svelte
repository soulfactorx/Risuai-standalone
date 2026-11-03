<script lang="ts">
    import { selectedCharID } from "src/ts/stores.svelte";
    import TextInput from "../UI/GUI/TextInput.svelte";
    import NumberInput from "../UI/GUI/NumberInput.svelte";
    import Button from "../UI/GUI/Button.svelte";
    import { getRequestLog } from "src/ts/globalApi.svelte";
    import { alertMd, alertWait } from "src/ts/alert";
    import Accordion from "../UI/Accordion.svelte";
    import { getCharToken, getChatToken } from "src/ts/tokenizer";
    import { tokenizePreset } from "src/ts/process/prompt";
    
    import { DBState } from 'src/ts/stores.svelte';
    import TextAreaInput from "../UI/GUI/TextAreaInput.svelte";
    import { HardDriveUploadIcon, PlusIcon, TrashIcon } from "@lucide/svelte";
    import { selectSingleFile } from "src/ts/util";
    import { doingChat, previewFormated, previewBody, sendChat } from "src/ts/process/index.svelte";
    import SelectInput from "../UI/GUI/SelectInput.svelte";
    import { applyChatTemplate, chatTemplates } from "src/ts/process/templates/chatTemplate";
    import OptionInput from "../UI/GUI/OptionInput.svelte";
  import { loadLoreBookV3Prompt } from "src/ts/process/lorebook.svelte";
  import { getModules } from "src/ts/process/modules";

    let previewMode = $state('chat')
    let previewJoin = $state('yes')
    let instructType = $state('chatml')
    let instructCustom = $state('')

    const preview = async () => {
        if($doingChat){
            return false
        }
        alertWait("불러오는 중...")
        await sendChat(-1, {
            preview: previewJoin !== 'prompt',
            previewPrompt: previewJoin === 'prompt'
        })

        let md = ''
        const styledRole = {
            "function": "📐 Function",
            "user": "😐 User",
            "system": "⚙️ System",
            "assistant": "✨ Assistant",
        }

        if(previewJoin === 'prompt'){
            md += '### Prompt\n'
            md += '```json\n' + JSON.stringify(JSON.parse(previewBody), null, 2).replaceAll('```', '\\`\\`\\`') + '\n```\n'
            $doingChat = false
            alertMd(md)
            return
        }

        let formated = safeStructuredClone(previewFormated)

        if(previewJoin === 'yes'){
            let newFormated = []
            let latestRole = ''

            for(let i=0;i<formated.length;i++){
                if(formated[i].role === latestRole){
                    newFormated[newFormated.length - 1].content += '\n' + formated[i].content
                }else{
                    newFormated.push(formated[i])
                    latestRole = formated[i].role
                }
            }

            formated = newFormated
        }

        if(previewMode === 'instruct'){
            const instructed = applyChatTemplate(formated, {
                type: instructType,
                custom: instructCustom
            })

            md += '### Instruction\n'
            md += '```\n' + instructed.replaceAll('```', '\\`\\`\\`') + '\n```\n'
            $doingChat = false
            alertMd(md)
            return
        }

        for(let i=0;i<formated.length;i++){
            
            md += '### ' + (styledRole[formated[i].role] ?? '🤔 알 수 없는 역할') + '\n'
            const modals = formated[i].multimodals

            if(modals && modals.length > 0){
                md += `> ${modals.length} 개의 텍스트 외 콘텐츠 포함\n` 
            }

            if(formated[i].thoughts && formated[i].thoughts.length > 0){
                md += `> ${formated[i].thoughts.length} 개의 생각 포함\n`
            }

            if(formated[i].cachePoint){
                md += `> 캐시 지점\n`
            }

            md += '```\n' + formated[i].content.replaceAll('```', '\\`\\`\\`') + '\n```\n'
        }
        $doingChat = false
        alertMd(md)
    }
    
    let autopilot = $state([])
</script>

<Accordion styled name={"변수"}>
    <div class="rounded-md border border-darkborderc grid grid-cols-2 gap-2 p-2">
        {#if DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage].scriptstate &&  Object.keys(DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage].scriptstate).length > 0}
            {#each Object.keys(DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage].scriptstate) as key}
                <span>{key}</span>
                {#if typeof DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage].scriptstate[key] === "object"}
                    <div class="p-2 text-center">객체</div>
                {:else if typeof DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage].scriptstate[key] === "string"}
                    <TextInput bind:value={DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage].scriptstate[key] as string} />
                {:else if typeof DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage].scriptstate[key] === "number"}
                    <NumberInput bind:value={DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage].scriptstate[key] as number} />
                {/if}
            {/each}
        {:else}
            <div class="p-2 text-center">변수 없음</div>
        {/if}
    </div>
</Accordion>

<Accordion styled name={"토큰"}>
    <div class="rounded-md border border-darkborderc grid grid-cols-2 gap-2 p-2">
        {#await getCharToken(DBState.db.characters[$selectedCharID])}
            <span>캐릭터 고정</span>
            <div class="p-2 text-center">불러오는 중...</div>
            <span>캐릭터 동적</span>
            <div class="p-2 text-center">불러오는 중...</div>
        {:then token}
            <span>캐릭터 고정</span>
            <div class="p-2 text-center">{token.persistant} 토큰</div>
            <span>캐릭터 동적</span>
            <div class="p-2 text-center">{token.dynamic} 토큰</div>
        {/await}
        {#await getChatToken(DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage])}
            <span>현재 채팅</span>
            <div class="p-2 text-center">불러오는 중...</div>
        {:then token}
            <span>현재 채팅</span>
            <div class="p-2 text-center">{token} 토큰</div>
        {/await}
        {#if DBState.db.promptTemplate}
            {#await tokenizePreset(DBState.db.promptTemplate)}
                <span>프롬프트 템플릿</span>
                <div class="p-2 text-center">불러오는 중...</div>
            {:then token}
                <span>프롬프트 템플릿</span>
                <div class="p-2 text-center">{token} 토큰</div>
            {/await}
        {/if}
    </div>
    <span class="text-sm text-textcolor2">추정치입니다. 실제 토큰 수와 다를 수 있습니다.</span>
</Accordion>

<Accordion styled name={"자동 진행"}>
    <div class="flex flex-col p-2 border border-darkborderc rounded-md">
        {#each autopilot as text, i}
            <TextAreaInput bind:value={autopilot[i]} />
        {/each}
    </div>
    <div class="flex justify-end">
        <button class="text-textcolor2 hover:text-textcolor" onclick={() => {
            autopilot.pop()
            autopilot = autopilot
        }}>
            <TrashIcon />
        </button>

        <button class="text-textcolor2 hover:text-textcolor" onclick={() => {
            autopilot.push('')
            autopilot = autopilot
        }}>
            <PlusIcon />
        </button>

        <button class="text-textcolor2 hover:text-textcolor" onclick={async () => {
            const selected = await selectSingleFile([
                'txt', 'csv', 'json'
            ])
            if(!selected){
                return
            }
            const file = new TextDecoder().decode(selected.data)
            if(selected.name.endsWith('.json')){
                const parsed = JSON.parse(file)
                if(Array.isArray(parsed)){
                    autopilot = parsed
                }
            }
            if(selected.name.endsWith('.csv')){
                autopilot = file.split('\n').map(x => {
                    return x.replace(/\r/g, '')
                        .replace(/\\n/g, '\n')
                        .replace(/\\t/g, '\t')
                        .replace(/\\r/g, '\r')
                })
            }
            if(selected.name.endsWith('.txt')){
                autopilot = file.split('\n')
            }
        }}>
            <HardDriveUploadIcon />
        </button>
    </div>
    <Button className="mt-2" onclick={async () => {
        if($doingChat){
            return
        }
        for(let i=0;i<autopilot.length;i++){
            const db = (DBState.db)
            let currentChar = db.characters[$selectedCharID]
            let currentChat = currentChar.chats[currentChar.chatPage]
            currentChat.message.push({
                role: 'user',
                data: autopilot[i]
            })
            currentChar.chats[currentChar.chatPage] = currentChat
            db.characters[$selectedCharID] = currentChar
            if($doingChat){
                return
            }
            currentChar.chats[currentChar.chatPage] = currentChat
            db.characters[$selectedCharID] = currentChar
            doingChat.set(false)
            await sendChat(i);
            currentChar = db.characters[$selectedCharID]
            currentChat = currentChar.chats[currentChar.chatPage]
        }
        doingChat.set(false)
    }}>실행</Button>
</Accordion>


<Accordion styled name={"프롬프트 미리보기"}>
    <span>유형</span>
    <SelectInput bind:value={previewMode}>
        <OptionInput value="chat">채팅</OptionInput>
        <OptionInput value="instruct">인스트럭트</OptionInput>
    </SelectInput>
    {#if previewMode === 'instruct'}
        <span>인스트럭트 형식</span>
        <SelectInput bind:value={instructType}>
            {#each Object.keys(chatTemplates) as template}
                <OptionInput value={template}>{template}</OptionInput>
            {/each}
            <OptionInput value="jinja">사용자 지정 Jinja</OptionInput>
        </SelectInput>
        {#if instructType === 'jinja'}
            <span>사용자 지정 Jinja</span>
            <TextAreaInput bind:value={instructCustom} />
        {/if}
    {/if}
    <span>합치기</span>
    <SelectInput bind:value={previewJoin}>
        <OptionInput value="yes">합쳐서 보기</OptionInput>
        <OptionInput value="no">합치지 않고 보기</OptionInput>
        <OptionInput value="prompt">요청 본문으로 보기</OptionInput>
    </SelectInput>
    <Button className="mt-2" onclick={() => {preview()}}>실행</Button>
</Accordion>

<Accordion styled name={"로어북 미리보기"}>
    <Button className="mt-2" onclick={async () => {
        const lorebookResult = await loadLoreBookV3Prompt()
        const html = `
        ${lorebookResult.actives.map((v) => {
            return `## ${v.source}\n\n\`\`\`\n${v.prompt}\n\`\`\`\n`
        }).join('\n')}
        `.trim()
        alertMd(html)
    }}>로어 테스트</Button>
    <Button className="mt-2" onclick={async () => {
        const lorebookResult = await loadLoreBookV3Prompt()
        const html = `
        <table>
            <thead>
                <tr>
                    <th>키</th>
                    <th>출처</th>
                </tr>
            </thead>
            <tbody>
                ${lorebookResult.matchLog.map((v) => {
                    return `<tr>
                        <td><pre>${v.activated.trim()}</pre></td>
                        <td><pre>${v.source.trim()}</pre></td>
                    </tr>`
                }).join('\n')}
            </tbody>
        </table>
        `.trim()
        alertMd(html)
    }}>매칭 출처</Button>
</Accordion>

<Button className="mt-2" onclick={() => {
    const modules = getModules()
    const html = `
    ${modules.map((v) => {
        return `## ${v.name}\n\n\`\`\`\n${v.description}\n\`\`\`\n`
    }).join('\n')}
    `.trim()
    alertMd(html)
}}>모듈 미리보기</Button>

<Button className="mt-2" onclick={() => {
    alertMd(getRequestLog())
}}>요청 로그</Button>