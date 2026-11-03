
<script lang="ts">
    import { language } from "src/lang";
    import TextAreaInput from "../UI/GUI/TextAreaInput.svelte";
    import { LLMCacheStorage, runTranslator } from "src/ts/translator/translator";
    import Button from "../UI/GUI/Button.svelte";
    import SelectInput from "../UI/GUI/SelectInput.svelte";
    import { getLanguageCodes } from "src/ts/globalApi.svelte";
    import OptionInput from "../UI/GUI/OptionInput.svelte";
    import CheckInput from "../UI/GUI/CheckInput.svelte";
    import { tokenize } from "src/ts/tokenizer";
    import { fillPrompt } from "src/ts/prompts/customPrompts";


    const userPreferedLang = navigator.language.split('-')[0]

    let r = $state('')
    let sourceLang = $state('en')
    let output = $state('')
    let outputLang = $state(userPreferedLang)
    let loading = $state(false)
    let bulk = $state(false)
    let keepContext = $state(false)
    let bulkProgressText = $state('')
</script>



<span>{language.sourceLanguage}</span>
<SelectInput bind:value={sourceLang}>
    {#each getLanguageCodes() as lang}
        <OptionInput value={lang.code}>{lang.name}</OptionInput>
    {/each}
</SelectInput>
<TextAreaInput bind:value={r} />

<span>{language.translatorLanguage}</span>
<SelectInput bind:value={outputLang}>
    {#each getLanguageCodes() as lang}
        <OptionInput value={lang.code}>{lang.name}</OptionInput>
    {/each}
</SelectInput>
<TextAreaInput value={output} />

<CheckInput bind:check={bulk}>
    일괄 번역
</CheckInput>
{#if bulk}
    <CheckInput bind:check={keepContext}>
        문맥 유지
    </CheckInput>
{/if}

<Button className="mt-4" onclick={async () => {
    bulkProgressText = ''
    if(bulk){

        const format = () => {
            if(jsonMode){
                const d = JSON.parse(r)
                for(let i = 0; i < d.length; i++){
                    if(translatedChunks[i]){
                        d[i].text = translatedChunks[i]
                    }
                }
                output = JSON.stringify(d, null, 2)
                return
            }

            output = translatedChunks.join('\n\n')
            console.log(output)
        }
        let preChunks = []
        let prContexts:string[] = []
        let translatedChunks: string[] = []
        let jsonMode = false
        if(loading){
            return
        }
        loading = true
        try {
            const d = JSON.parse(r.trim())
            if(Array.isArray(d)){
                preChunks = d.map((x: { text: string }) => (x?.text ?? ""))
            }
            jsonMode = true
        } catch (error) {
            preChunks = r.split('\n\n')
            jsonMode = false
        }

        console.log(preChunks, jsonMode)

        for(let i = 0; i < preChunks.length; i++){
            try {
                if(preChunks[i].trim().length === 0){
                    translatedChunks.push(preChunks[i])
                    continue
                }

                bulkProgressText = `(${i + 1} of ${preChunks.length})`

                if(prContexts.length > 10){
                    prContexts.shift()
                }


                const prContext = prContexts.length > 0 ? prContexts.join('\n\n') : ''

                if(prContext){
                    bulkProgressText += ` (previous ${await tokenize(prContext)} tokens)`
                }

                const translatedChunk = await runTranslator(preChunks[i], false, sourceLang, outputLang, {
                    // 사용자 지정 가능: 설정 → 프롬프트 관리 (playgroundTranslationContext)
                    translatorNote: prContext ? fillPrompt('playgroundTranslationContext', { '{{slot}}': prContext.trim() }) : ""
                })
                if(keepContext){
                    prContexts.push(`<Original>${preChunks[i]}</Original><Translated>${translatedChunk}</Translated>`)
                }
                translatedChunks.push(translatedChunk)
            } catch (error) {
                console.error(error)
                translatedChunks.push(preChunks[i])
            }

            try {
                format()
            } catch (error) {
                
            }
        }

        format()
        loading = false
        return
    }
    try {
        if(loading){
            return
        }
        loading = true
        output = await runTranslator(r, false, sourceLang, outputLang)   
        loading = false
    } catch (error) {
        console.error(error)
        loading = false
    }
}}>
    {#if loading}
        불러오는 중... {bulkProgressText}
    {:else}
        번역
    {/if}
</Button>
<Button className="mt-4" onclick={() => {
    LLMCacheStorage.clear()
}}>
    캐시 비우기
</Button>