<script lang="ts">
    import Check from "src/lib/UI/GUI/CheckInput.svelte";
    import { language } from "src/lang";
    import Help from "src/lib/Others/Help.svelte";
    import { selectSingleFile } from "src/ts/util";
    import { DBState, selectedCharID } from 'src/ts/stores.svelte';
    import { saveAsset, downloadFile, globalFetch } from "src/ts/globalApi.svelte";
    import { isTauri } from "src/ts/platform"
    import NumberInput from "src/lib/UI/GUI/NumberInput.svelte";
    import TextInput from "src/lib/UI/GUI/TextInput.svelte";
    import SelectInput from "src/lib/UI/GUI/SelectInput.svelte";
    import OptionInput from "src/lib/UI/GUI/OptionInput.svelte";
    import SliderInput from "src/lib/UI/GUI/SliderInput.svelte";
    import { getCharImage } from "src/ts/characters";
    import Accordion from "src/lib/UI/Accordion.svelte";
    import CheckInput from "src/lib/UI/GUI/CheckInput.svelte";
    import TextAreaInput from "src/lib/UI/GUI/TextAreaInput.svelte";
    import { untrack } from "svelte";
    import { tokenizePreset } from "src/ts/process/prompt";
    import { getCharToken } from "src/ts/tokenizer";
    import { PlusIcon, PencilIcon, TrashIcon, DownloadIcon, HardDriveUploadIcon } from "@lucide/svelte";
    import { alertError, alertInput, alertConfirm, alertNormal } from "src/ts/alert";
    import { createHypaV3Preset } from "src/ts/process/memory/hypav3";

    let submenu = $state(DBState.db.useLegacyGUI ? -1 : 0);

    // HypaV3
    $effect(() => {
        const settings = DBState.db.hypaV3Presets?.[DBState.db.hypaV3PresetId]?.settings;
        const currentValue = settings?.similarMemoryRatio;

        if (!currentValue) return;

        untrack(() => {
            const newValue = Math.min(currentValue, 1);

            settings.similarMemoryRatio = newValue;

            if (newValue + settings.recentMemoryRatio > 1) {
                settings.recentMemoryRatio = 1 - newValue;
            }
        })
    });

    $effect(() => {
        const settings = DBState.db.hypaV3Presets?.[DBState.db.hypaV3PresetId]?.settings;
        const currentValue = settings?.recentMemoryRatio;

        if (!currentValue) return;

        untrack(() => {
            const newValue = Math.min(currentValue, 1);

            settings.recentMemoryRatio = newValue;

            if (newValue + settings.similarMemoryRatio > 1) {
                settings.similarMemoryRatio = 1 - newValue;
            }
        })
    });

    async function getMaxMemoryRatio(): Promise<number> {
        const promptTemplateToken = await tokenizePreset(DBState.db.promptTemplate);
        const char = DBState.db.characters[$selectedCharID];
        const charToken = await getCharToken(char);
        const maxLoreToken = char.loreSettings?.tokenBudget ?? DBState.db.loreBookToken;
        const maxResponse = DBState.db.maxResponse;
        const requiredToken = promptTemplateToken + charToken.persistant + Math.min(charToken.dynamic, maxLoreToken) + maxResponse * 3;
        const maxContext = DBState.db.maxContext;

        if (maxContext === 0) {
            return 0;
        }

        const maxMemoryRatio = Math.max((maxContext - requiredToken) / maxContext, 0);

        return parseFloat(maxMemoryRatio.toFixed(2));
    }
    // End HypaV3

    // wavespeed
    interface WavespeedModel {
        model_id: string;
        name: string;
        base_price: number;
        supportsImageInput: boolean;
        supportsLoras: boolean;
    }
    interface LoraItem {
        path: string;
        scale: number;
    }
    let wavespeedModels = $state<WavespeedModel[]>([]);
    let isWavespeedLoading = $state(false);
    let wavespeedSearchQuery = $state("");
    let wavespeedLoras = $state<LoraItem[]>([
        { path: "", scale: 1.0 },
        { path: "", scale: 1.0 },
        { path: "", scale: 1.0 }
    ]);

    /**
     * Fetch models from WaveSpeed API dynamically
     * https://wavespeed.ai/docs/docs-common-api/models
     */
    async function fetchWavespeedModels() {
        if (!DBState.db.wavespeedImage.key || DBState.db.wavespeedImage.key.trim() === '') {
            alertError('WaveSpeed API 키가 설정되어 있지 않습니다');
            return [];
        }

        isWavespeedLoading = true;
        try {
            const result = await globalFetch('https://api.wavespeed.ai/api/v3/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${DBState.db.wavespeedImage.key}`
                },
            });

            if (!result.ok || !result.data) {
                alertError('WaveSpeed 모델 목록을 가져오지 못했습니다');
                return;
            }

            let responseData;
            try {
                responseData = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
            } catch (e) {
                alertError('WaveSpeed 응답을 해석하지 못했습니다');
                return;
            }

            if (responseData.code !== 200 || !Array.isArray(responseData.data)) {
                alertError('WaveSpeed API 응답이 올바르지 않습니다');
                return;
            }

            // Filter, transform, and sort models by name
            const filteredModels: WavespeedModel[] = responseData.data
              .filter((model: any) =>
                model.type === 'text-to-image' || model.type === 'image-to-image'
              )
              .map((model: any) => {
                  // Check if model supports LoRAs
                  const supportsLoras = model.api_schema?.api_schemas?.some((schema: any) =>
                    schema.request_schema?.properties?.loras !== undefined
                  ) ?? false;

                  return {
                      model_id: model.model_id,
                      name: model.name,
                      base_price: model.base_price,
                      type: model.type,
                      supportsImageInput: model.type === 'image-to-image',
                      supportsLoras: supportsLoras,
                  };
              })
              .sort((a, b) => a.name.localeCompare(b.model_id));

            wavespeedModels = filteredModels;
            alertNormal(`모델 ${filteredModels.length}개를 불러왔습니다`);
        } catch (error) {
            alertError(`모델 목록을 가져오지 못했습니다: ${error}`);
        } finally {
            isWavespeedLoading = false;
        }
    }

    /**
     * Handle model selection change
     */
    function handleModelChange() {
        const selectedModel = wavespeedModels.find(m => m.model_id === DBState.db.wavespeedImage.model);

        // Reset reference_mode for text-to-image models
        if (selectedModel?.supportsImageInput) {
            DBState.db.wavespeedImage.reference_mode = '';
            DBState.db.wavespeedImage.reference_image = undefined;
            DBState.db.wavespeedImage.reference_base64image = undefined;
        }

        // Reset loras if model doesn't support them
        if (!selectedModel?.supportsLoras) {
            DBState.db.wavespeedImage.loras = undefined;
        }
    }

    /**
     * Get display name for a WaveSpeed model
     * @param model - The model to get display name for
     */
    function getModelDisplayName(model: WavespeedModel): string {
        const imageInputIcon = model.supportsImageInput ? '✓' : '✗';
        const loraIcon = model.supportsLoras ? '✓' : '✗';
        return `${model.name} (price: ${model.base_price}) [${imageInputIcon} Image] [${loraIcon} LoRA]`;
    }

    /**
     * Filter and sort models based on search query
     */
    function getFilteredModels(): WavespeedModel[] {
        if (wavespeedSearchQuery === "") return wavespeedModels;

        const searchTerms = wavespeedSearchQuery.toLowerCase().trim().split(/\s+/);
        return wavespeedModels.filter(model => {
            const modelText = (model.name + " " + model.model_id).toLowerCase();
            return searchTerms.every(term => modelText.includes(term));
        });
    }

    $effect(() => {
        // Sync loras to DB, filtering out empty URLs
        if (DBState.db.wavespeedImage) {
            DBState.db.wavespeedImage.loras = wavespeedLoras
              .filter(item => item.path && item.path.trim() !== "")
              .map(item => ({
                  path: item.path,
                  scale: item.scale
              }));
        }
    });
    // End wavespeed
</script>
<h2 class="mb-2 text-2xl font-bold mt-2">{language.otherBots}</h2>


{#if submenu !== -1}
    <div class="flex w-full rounded-md border border-darkborderc mb-4">
        <button onclick={() => {
            submenu = 0
        }} class="p-2 flex-1 border-r border-darkborderc" class:bg-darkbutton={submenu === 0}>
            <span>{language.longTermMemory}</span>
        </button>
        <button onclick={() => {
            submenu = 1
        }} class="p2 flex-1 border-r border-darkborderc" class:bg-darkbutton={submenu === 1}>
            <span>TTS</span>
        </button>
        <button onclick={() => {
            submenu = 2
        }} class="p-2 flex-1 border-r border-darkborderc" class:bg-darkbutton={submenu === 2}>
            <span>{language.emotionImage}</span>
        </button>
        <button onclick={() => {
            submenu = 3
        }} class="p-2 flex-1" class:bg-darkbutton={submenu === 3}>
            <span>{language.imageGeneration}</span>
        </button>
    </div>
{/if}

{#if submenu === 3 || submenu === -1}
    <Accordion name={language.imageGeneration} styled disabled={submenu !== -1}>
        <span class="text-textcolor mt-2">{language.imageGeneration} {language.provider} <Help key="sdProvider"/></span>
        <SelectInput className="mt-2 mb-4" bind:value={DBState.db.sdProvider}>
            <OptionInput value="" >없음</OptionInput>
            <OptionInput value="webui" >Stable Diffusion WebUI</OptionInput>
            <OptionInput value="novelai" >Novel AI</OptionInput>
            <OptionInput value="dalle" >Dall-E</OptionInput>
            <OptionInput value="stability" >Stability API</OptionInput>
            <OptionInput value="fal" >Fal.ai</OptionInput>
            <OptionInput value="comfyui" >ComfyUI</OptionInput>
            <OptionInput value="Imagen" >Imagen</OptionInput>
            <OptionInput value="openai-compat" >OpenAI Compatible</OptionInput>
            <OptionInput value="wavespeed" >WaveSpeedAI</OptionInput>

            <!-- Legacy -->
            {#if DBState.db.sdProvider === 'comfy'}
                <OptionInput value="comfy" >ComfyUI (레거시)</OptionInput>
            {/if}
        </SelectInput>

        {#if DBState.db.sdProvider === 'webui'}
        <span class="text-draculared text-xs mb-2">WebUI를 --api 옵션과 함께 실행해야 합니다</span>
            <span class="text-draculared text-xs mb-2">AGPL 라이선스 조건을 지키려면 AGPL 라이선스가 아닌 WebUI를 사용하거나, AGPL 라이선스 WebUI라면 수정하지 않은 버전을 사용해야 합니다.</span>
            {#if !isTauri}
                <span class="text-draculared text-xs mb-2">웹 버전을 사용 중입니다. 로컬 webui를 사용하려면 ngrok 같은 터널링 도구를 사용해야 합니다.</span>
            {/if}
            <span class="text-textcolor mt-2">WebUI {language.providerURL}</span>
            <TextInput size="sm" marginBottom placeholder="https://..." bind:value={DBState.db.webUiUrl}/>
            <span class="text-textcolor">스텝 수</span>
            <NumberInput size="sm" marginBottom min={0} max={100} bind:value={DBState.db.sdSteps}/>

            <span class="text-textcolor">CFG Scale</span>
            <NumberInput size="sm" marginBottom min={0} max={20} bind:value={DBState.db.sdCFG}/>

            <span class="text-textcolor">너비</span>
            <NumberInput size="sm" marginBottom min={0} max={2048} bind:value={DBState.db.sdConfig.width}/>
            <span class="text-textcolor">높이</span>
            <NumberInput size="sm" marginBottom min={0} max={2048} bind:value={DBState.db.sdConfig.height}/>
            <span class="text-textcolor">샘플러</span>
            <TextInput size="sm" marginBottom bind:value={DBState.db.sdConfig.sampler_name}/>

            <div class="flex items-center mt-2">
                <Check bind:check={DBState.db.sdConfig.enable_hr} name='Hires 사용'/>
            </div>
            {#if DBState.db.sdConfig.enable_hr === true}
                <span class="text-textcolor">denoising_strength</span>
                <NumberInput size="sm" marginBottom  min={0} max={10} bind:value={DBState.db.sdConfig.denoising_strength}/>
                <span class="text-textcolor">hr_scale</span>
                <NumberInput size="sm" marginBottom  min={0} max={10} bind:value={DBState.db.sdConfig.hr_scale}/>
                <span class="text-textcolor">업스케일러</span>
                <TextInput size="sm" marginBottom bind:value={DBState.db.sdConfig.hr_upscaler}/>
            {/if}
        {/if}

        {#if DBState.db.sdProvider === 'novelai'}
            <span class="text-textcolor mt-2">Novel AI {language.providerURL}</span>
            <TextInput size="sm" marginBottom placeholder="https://image.novelai.net" bind:value={DBState.db.NAIImgUrl}/>
            <span class="text-textcolor">API 키</span>
            <TextInput size="sm" marginBottom placeholder="pst-..." bind:value={DBState.db.NAIApiKey}/>

            <span class="text-textcolor">모델</span>
            <SelectInput className="mb-4" bind:value={DBState.db.NAIImgModel} >
                <OptionInput value="nai-diffusion-5-full" >nai-diffusion-5-full</OptionInput>
                <OptionInput value="nai-diffusion-5-curated" >nai-diffusion-5-curated</OptionInput>
                <OptionInput value="nai-diffusion-4-5-full" >nai-diffusion-4-5-full</OptionInput>
                <OptionInput value="nai-diffusion-4-5-curated" >nai-diffusion-4-5-curated</OptionInput>
                <OptionInput value="nai-diffusion-4-full" >nai-diffusion-4-full</OptionInput>
                <OptionInput value="nai-diffusion-4-curated-preview" >nai-diffusion-4-curated-preview</OptionInput>
                <OptionInput value="nai-diffusion-3" >nai-diffusion-3</OptionInput>
                <OptionInput value="nai-diffusion-furry-3" >nai-diffusion-furry-3</OptionInput>
                <OptionInput value="nai-diffusion-2" >nai-diffusion-2</OptionInput>

            </SelectInput>

            <span class="text-textcolor">너비</span>
            <NumberInput size="sm" marginBottom min={0} max={2048} bind:value={DBState.db.NAIImgConfig.width}/>
            <span class="text-textcolor">높이</span>
            <NumberInput size="sm" marginBottom min={0} max={2048} bind:value={DBState.db.NAIImgConfig.height}/>
            <span class="text-textcolor">샘플러</span>

            {#if DBState.db.NAIImgModel === 'nai-diffusion-4-full'
            || DBState.db.NAIImgModel === 'nai-diffusion-4-curated-preview'
            || DBState.db.NAIImgModel === 'nai-diffusion-4-5-full'
            || DBState.db.NAIImgModel === 'nai-diffusion-4-5-curated'}
                <SelectInput className="mb-4" bind:value={DBState.db.NAIImgConfig.sampler}>
                    <OptionInput value="k_euler_ancestral" >Euler Ancestral</OptionInput>
                    <OptionInput value="k_dpmpp_2s_ancestral" >DPM++ 2S Ancestral</OptionInput>
                    <OptionInput value="k_dpmpp_2m_sde" >DPM++ 2M SDE</OptionInput>
                    <OptionInput value="k_euler" >Euler</OptionInput>
                    <OptionInput value="k_dpmpp_2m" >DPM++ 2M</OptionInput>
                    <OptionInput value="k_dpmpp_sde" >DPM++ SDE</OptionInput>
                </SelectInput>
            {:else}
                <SelectInput className="mb-4" bind:value={DBState.db.NAIImgConfig.sampler}>
                    <OptionInput value="k_euler_ancestral" >Euler Ancestral</OptionInput>
                    <OptionInput value="k_dpmpp_2s_ancestral" >DPM++ 2S Ancestral</OptionInput>
                    <OptionInput value="k_dpmpp_sde" >DPM++ SDE</OptionInput>
                    <OptionInput value="k_euler" >Euler</OptionInput>
                    <OptionInput value="k_dpmpp_2m" >DPM++ 2M</OptionInput>
                    <OptionInput value="k_dpmpp_2s" >DPM++ 2S</OptionInput>
                    <OptionInput value="ddim_v3" >DDIM</OptionInput>
                </SelectInput>
            {/if}

            <span class="text-textcolor">노이즈 스케줄</span>
            <SelectInput className="mb-4" bind:value={DBState.db.NAIImgConfig.noise_schedule}>
                <OptionInput value="native" >native</OptionInput>
                <OptionInput value="karras" >karras</OptionInput>
                <OptionInput value="exponential" >exponential</OptionInput>
                <OptionInput value="polyexponential" >polyexponential</OptionInput>
            </SelectInput>

            <span class="text-textcolor">스텝 수</span>
            <NumberInput size="sm" marginBottom min={0} max={2048} bind:value={DBState.db.NAIImgConfig.steps}/>
            <span class="text-textcolor">CFG scale</span>
            <NumberInput size="sm" marginBottom min={0} max={2048} bind:value={DBState.db.NAIImgConfig.scale}/>
            <span class="text-textcolor">CFG rescale</span>
            <NumberInput size="sm" marginBottom min={0} max={1} bind:value={DBState.db.NAIImgConfig.cfg_rescale}/>

            <span class="text-textcolor">이미지 참조</span>
            <SelectInput className="mb-4" bind:value={DBState.db.NAIImgConfig.reference_mode}>
                <OptionInput value="" >없음</OptionInput>
                <OptionInput value="vibe" >바이브 트랜스퍼</OptionInput>
                {#if DBState.db.NAIImgModel === 'nai-diffusion-4-5-full' || DBState.db.NAIImgModel === 'nai-diffusion-4-5-curated'}
                    <OptionInput value="character" >캐릭터 참조</OptionInput>
                {/if}
            </SelectInput>

            {#if DBState.db.NAIImgConfig.reference_mode === 'vibe'}
                <div class="relative">
                <button class="mb-4" onclick={async () => {
                    const file = await selectSingleFile(['naiv4vibe'])
                    if(!file){
                        return null
                    }
                    try {
                        const vibeData = JSON.parse(new TextDecoder().decode(file.data))
                        if (vibeData.version !== 1 || vibeData.identifier !== "novelai-vibe-transfer") {
                            alertError("올바르지 않은 바이브 파일입니다. 버전이 1이어야 합니다.")
                            return
                        }

                        // Store the vibe data
                        DBState.db.NAIImgConfig.vibe_data = vibeData

                        // Set the thumbnail as preview image for display
                        if (vibeData.thumbnail) {
                            // Clear the array and add the thumbnail
                            DBState.db.NAIImgConfig.reference_image_multiple = [];

                            // Set default model selection based on current model
                            if (DBState.db.NAIImgModel.includes('nai-diffusion-4-full')) {
                                DBState.db.NAIImgConfig.vibe_model_selection = 'v4full';
                            } else if (DBState.db.NAIImgModel.includes('nai-diffusion-4-curated')) {
                                DBState.db.NAIImgConfig.vibe_model_selection = 'v4curated';
                            } else if (DBState.db.NAIImgModel.includes('nai-diffusion-4-5-full')) { 
                                DBState.db.NAIImgConfig.vibe_model_selection = 'v4-5full';
                            } else if (DBState.db.NAIImgModel.includes('nai-diffusion-4-5-curated')) {
                                DBState.db.NAIImgConfig.vibe_model_selection = 'v4-5curated';
                            }

                            // Set InfoExtracted to the first value for the selected model
                            const selectedModel = DBState.db.NAIImgConfig.vibe_model_selection;
                            if (selectedModel && vibeData.encodings[selectedModel]) {
                                const encodings = vibeData.encodings[selectedModel];
                                const firstKey = Object.keys(encodings)[0];
                                if (firstKey) {
                                    DBState.db.NAIImgConfig.InfoExtracted = Number(encodings[firstKey].params.information_extracted);
                                }
                            }
                        }

                        // Initialize reference_strength_multiple if not set
                        if (!DBState.db.NAIImgConfig.reference_strength_multiple || !Array.isArray(DBState.db.NAIImgConfig.reference_strength_multiple)) {
                            DBState.db.NAIImgConfig.reference_strength_multiple = [0.7];
                        }
                    } catch (error) {
                        alertError("바이브 파일 해석 중 오류: " + error)
                    }
                }}>
                    {#if !DBState.db.NAIImgConfig.vibe_data || !DBState.db.NAIImgConfig.vibe_data.thumbnail}
                        <div class="rounded-md h-20 w-20 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500 flex items-center justify-center">
                            <span class="text-sm">바이브<br />업로드</span>
                        </div>
                    {:else}
                        <img src={DBState.db.NAIImgConfig.vibe_data.thumbnail} alt="Vibe Preview" class="rounded-md h-40 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500" />
                    {/if}
                </button>

                {#if DBState.db.NAIImgConfig.vibe_data}
                    <button 
                        onclick={() => {
                            DBState.db.NAIImgConfig.vibe_data = undefined;
                            DBState.db.NAIImgConfig.vibe_model_selection = undefined;
                        }}
                        class="absolute top-2 right-2 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-sm"
                    >
                        삭제
                    </button>
                {/if}

                </div>

                {#if DBState.db.NAIImgConfig.vibe_data}

                    <span class="text-textcolor">바이브 모델</span>
                    <SelectInput className="mb-2" bind:value={DBState.db.NAIImgConfig.vibe_model_selection} onchange={(e) => {
                        // When vibe model changes, set InfoExtracted to the first value
                        if (DBState.db.NAIImgConfig.vibe_data?.encodings &&
                            DBState.db.NAIImgConfig.vibe_model_selection &&
                            DBState.db.NAIImgConfig.vibe_data.encodings[DBState.db.NAIImgConfig.vibe_model_selection]) {
                            const encodings = DBState.db.NAIImgConfig.vibe_data.encodings[DBState.db.NAIImgConfig.vibe_model_selection];
                            const firstKey = Object.keys(encodings)[0];
                            if (firstKey) {
                                DBState.db.NAIImgConfig.InfoExtracted = Number(encodings[firstKey].params.information_extracted);
                            }
                        }
                    }}>
                        {#if DBState.db.NAIImgConfig.vibe_data.encodings?.v4full}
                            <OptionInput value="v4full">nai-diffusion-4-full</OptionInput>
                        {/if}
                        {#if DBState.db.NAIImgConfig.vibe_data.encodings?.v4curated}
                            <OptionInput value="v4curated">nai-diffusion-4-curated</OptionInput>
                        {/if}
                        {#if DBState.db.NAIImgConfig.vibe_data.encodings?.['v4-5full']}
                            <OptionInput value="v4-5full">nai-diffusion-4-5-full</OptionInput>
                        {/if}
                        {#if DBState.db.NAIImgConfig.vibe_data.encodings?.['v4-5curated']}
                            <OptionInput value="v4-5curated">nai-diffusion-4-5-curated</OptionInput>
                        {/if}
                    </SelectInput>

                    <span class="text-textcolor">추출 정보량</span>
                    <SelectInput className="mb-2" bind:value={DBState.db.NAIImgConfig.InfoExtracted}>
                        {#if DBState.db.NAIImgConfig.vibe_model_selection && DBState.db.NAIImgConfig.vibe_data.encodings[DBState.db.NAIImgConfig.vibe_model_selection]}
                            {#each Object.entries(DBState.db.NAIImgConfig.vibe_data.encodings[DBState.db.NAIImgConfig.vibe_model_selection]) as [key, value]}
                                <OptionInput value={value.params.information_extracted}>{value.params.information_extracted}</OptionInput>
                            {/each}
                        {/if}
                    </SelectInput>

                    <span class="text-textcolor">참조 강도 배수</span>
                    <SliderInput marginBottom min={0} max={1} step={0.1} fixed={2} bind:value={DBState.db.NAIImgConfig.reference_strength_multiple[0]} />
                {/if}
            {/if}

            {#if DBState.db.NAIImgConfig.reference_mode === 'character' && 
                (DBState.db.NAIImgModel === 'nai-diffusion-4-5-full' || DBState.db.NAIImgModel === 'nai-diffusion-4-5-curated')}
                
                <div class="relative">
                    <button class="mb-2" onclick={async () => {
                        const img = await selectSingleFile([
                            'jpg',
                            'jpeg',
                            'png',
                            'webp'
                        ])
                        if(!img){
                            return null
                        }
                        
                        const imageData = img.data;
                        
                        DBState.db.NAIImgConfig.character_base64image = Buffer.from(imageData).toString('base64');
                        const saveId = await saveAsset(imageData)
                        DBState.db.NAIImgConfig.character_image = saveId
                        console.log('Character image set:', DBState.db.NAIImgConfig.character_image)
                    }}>
                        {#if !DBState.db.NAIImgConfig.character_image || DBState.db.NAIImgConfig.character_image === ''}
                            <div class="rounded-md h-20 w-20 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500 flex items-center justify-center">
                                <span class="text-sm">이미지<br />업로드</span>
                            </div>
                        {:else}
                            {#await getCharImage(DBState.db.NAIImgConfig.character_image, 'plain')}
                                <div class="rounded-md h-20 w-20 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500 flex items-center justify-center">
                                    <span class="text-sm">이미지<br />업로드 중..</span>
                                </div>
                            {:then im}
                                <img src={im} class="rounded-md h-40 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500" alt="Base Preview"/>
                            {/await}
                        {/if}
                    </button>

                    {#if DBState.db.NAIImgConfig.character_image && DBState.db.NAIImgConfig.character_image !== ''}
                        <button 
                            onclick={() => {
                                DBState.db.NAIImgConfig.character_image = undefined;
                                DBState.db.NAIImgConfig.character_base64image = undefined;
                            }}
                            class="absolute top-2 right-2 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-sm"
                        >
                            삭제
                        </button>
                    {/if}
                </div>
                
                <span class="text-textcolor2 text-xs mb-2 block">비워 두면 캐릭터의 기본 이미지를 사용합니다.</span>

                <Check className="mb-4" bind:check={DBState.db.NAIImgConfig.style_aware} name="스타일 인식"/>

            {/if}

            
            

            {#if (DBState.db.NAIImgModel === 'nai-diffusion-3' || DBState.db.NAIImgModel === 'nai-diffusion-furry-3' || DBState.db.NAIImgModel === 'nai-diffusion-2')
            && DBState.db.NAIImgConfig.sampler !== 'ddim_v3'}
                <Check bind:check={DBState.db.NAIImgConfig.sm} name="SMEA 사용"/>
            {/if}

            {#if DBState.db.NAIImgModel === 'nai-diffusion-3' && DBState.db.NAIImgConfig.sampler !== 'ddim_v3'}
                <Check bind:check={DBState.db.NAIImgConfig.sm_dyn} name='DYN 사용'/>
            {/if}

            {#if DBState.db.NAIImgModel === 'nai-diffusion-4-5-full' || DBState.db.NAIImgModel === 'nai-diffusion-4-5-curated' 
            || DBState.db.NAIImgModel === 'nai-diffusion-4-full' || DBState.db.NAIImgModel === 'nai-diffusion-4-curated-preview'
            || DBState.db.NAIImgModel === 'nai-diffusion-3' || DBState.db.NAIImgModel === 'nai-diffusion-furry-3'}
                <Check bind:check={DBState.db.NAIImgConfig.variety_plus} name="Variety+"/>
            {/if}

            {#if DBState.db.NAIImgModel === 'nai-diffusion-3' || DBState.db.NAIImgModel === 'nai-diffusion-furry-3' || DBState.db.NAIImgModel === 'nai-diffusion-2'}
                <Check bind:check={DBState.db.NAIImgConfig.decrisp} name="Decrisp"/>
            {/if}

            {#if DBState.db.NAIImgModel === 'nai-diffusion-4-full'
            || DBState.db.NAIImgModel === 'nai-diffusion-4-curated-preview'}
                <Check bind:check={DBState.db.NAIImgConfig.legacy_uc} name='레거시 UC 사용'/>
            {/if}
                
            <Check className="mt-4 mb-4" bind:check={DBState.db.NAII2I} name="I2I 사용"/>
            
            {#if DBState.db.NAII2I}
                <div class="relative">
                    <button class="mb-2" onclick={async () => {
                        const img = await selectSingleFile([
                            'jpg',
                            'jpeg',
                            'png',
                            'webp'
                        ])
                        if(!img){
                            return null
                        }
                        DBState.db.NAIImgConfig.base64image = Buffer.from(img.data).toString('base64');
                        const saveId = await saveAsset(img.data)
                        DBState.db.NAIImgConfig.image = saveId
                    }}>
                        {#if !DBState.db.NAIImgConfig.image || DBState.db.NAIImgConfig.image === ''}
                            <div class="rounded-md h-20 w-20 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500 flex items-center justify-center">
                                <span class="text-sm">이미지<br />업로드</span>
                            </div>
                        {:else}
                            {#await getCharImage(DBState.db.NAIImgConfig.image, 'plain')}
                                <div class="rounded-md h-20 w-20 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500 flex items-center justify-center">
                                    <span class="text-sm">이미지<br />업로드 중..</span>
                                </div>
                            {:then im}
                                <img src={im} class="rounded-md h-40 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500" alt="Base Preview"/>
                            {/await}
                        {/if}
                    </button>

                    {#if DBState.db.NAIImgConfig.image && DBState.db.NAIImgConfig.image !== ''}
                        <button 
                            onclick={() => {
                                DBState.db.NAIImgConfig.image = undefined;
                                DBState.db.NAIImgConfig.base64image = undefined;
                            }}
                            class="absolute top-2 right-2 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-sm"
                        >
                            삭제
                        </button>
                    {/if}
                </div>
                <span class="text-textcolor2 text-xs block">비워 두면 캐릭터의 기본 이미지를 사용합니다.</span>


                <span class="text-textcolor mt-2">강도</span>
                <SliderInput min={0} max={0.99} step={0.01} fixed={2} bind:value={DBState.db.NAIImgConfig.strength}/>
                <span class="text-textcolor mt-2">노이즈</span>
                <SliderInput min={0} max={0.99} step={0.01} fixed={2} bind:value={DBState.db.NAIImgConfig.noise}/>


            {/if}
        {/if}

         
        
        {#if DBState.db.sdProvider === 'dalle'}
            <span class="text-textcolor">OpenAI API 키</span>
            <TextInput size="sm" marginBottom placeholder="sk-..." bind:value={DBState.db.openAIKey}/>

            <span class="text-textcolor mt-4">Dall-E 품질</span>
            <SelectInput className="mt-2 mb-4" bind:value={DBState.db.dallEQuality}>
                <OptionInput value="standard" >표준</OptionInput>
                <OptionInput value="hd" >HD</OptionInput>
            </SelectInput>

        {/if}

        {#if DBState.db.sdProvider === 'stability'}
            <span class="text-textcolor">Stability API 키</span>
            <TextInput size="sm" marginBottom placeholder="..." bind:value={DBState.db.stabilityKey}/>

            <span class="text-textcolor">Stability 모델</span>
            <SelectInput className="mt-2 mb-4" bind:value={DBState.db.stabilityModel}>
                <OptionInput value="ultra" >SD Ultra</OptionInput>
                <OptionInput value="core" >SD Core</OptionInput>
                <OptionInput value="sd3-large" >SD3 Large</OptionInput>
                <OptionInput value="sd3-medium" >SD3 Medium</OptionInput>
            </SelectInput>

            {#if DBState.db.stabilityModel === 'core'}
                <span class="text-textcolor">SD Core 스타일</span>
                <SelectInput className="mt-2 mb-4" bind:value={DBState.db.stabllityStyle}>
                    <OptionInput value="" >지정 안 함</OptionInput>
                    <OptionInput value="3d-model" >3D 모델</OptionInput>
                    <OptionInput value="analog-film" >아날로그 필름</OptionInput>
                    <OptionInput value="anime" >애니메이션</OptionInput>
                    <OptionInput value="cinematic" >시네마틱</OptionInput>
                    <OptionInput value="comic-book" >만화책</OptionInput>
                    <OptionInput value="digital-art" >디지털 아트</OptionInput>
                    <OptionInput value="enhance" >강화</OptionInput>
                    <OptionInput value="fantasy-art" >판타지 아트</OptionInput>
                    <OptionInput value="isometric" >아이소메트릭</OptionInput>
                    <OptionInput value="line-art" >라인 아트</OptionInput>
                    <OptionInput value="low-poly" >로우 폴리</OptionInput>
                    <OptionInput value="modeling-compound" >점토 모델링</OptionInput>
                    <OptionInput value="neon-punk" >네온 펑크</OptionInput>
                    <OptionInput value="origami" >종이접기</OptionInput>
                    <OptionInput value="photographic" >사진</OptionInput>
                    <OptionInput value="pixel-art" >픽셀 아트</OptionInput>
                    <OptionInput value="tile-texture" >타일 텍스처</OptionInput>
                </SelectInput>
            {/if}
        {/if}

        {#if DBState.db.sdProvider === 'comfyui'}
            <span class="text-textcolor mt-2">ComfyUI {language.providerURL}</span>
            <TextInput size="sm" marginBottom placeholder="http://127.0.0.1:8188" bind:value={DBState.db.comfyUiUrl}/>

            <span class="text-textcolor">워크플로 <Help key="comfyWorkflow" /></span>
            <TextInput size="sm" marginBottom bind:value={DBState.db.comfyConfig.workflow}/>

            <span class="text-textcolor">타임아웃 (초)</span>
            <NumberInput size="sm" marginBottom bind:value={DBState.db.comfyConfig.timeout} min={1} max={120} />
        {/if}

        {#if DBState.db.sdProvider === 'comfy'}
            <span class="text-draculared text-xs mb-2">프롬프트로 생성된 첫 번째 이미지가 선택됩니다. </span>
            {#if !isTauri}
                <span class="text-draculared text-xs mb-2">"ComfyUI를 --enable-cors-header 옵션과 함께 실행하세요."</span>
            {/if}
            <span class="text-textcolor mt-2">ComfyUI {language.providerURL}</span>
            <TextInput size="sm" marginBottom placeholder="http://127.0.0.1:8188" bind:value={DBState.db.comfyUiUrl}/>
            <span class="text-textcolor">워크플로</span>
            <TextInput size="sm" marginBottom placeholder="유효한 ComfyUI API JSON (ComfyUI에서 개발자 모드 옵션을 켜세요)" bind:value={DBState.db.comfyConfig.workflow}/>

            <span class="text-textcolor">긍정 텍스트 노드: ID</span>
            <TextInput size="sm" marginBottom placeholder="예: 1, 3 등" bind:value={DBState.db.comfyConfig.posNodeID}/>
            <span class="text-textcolor">긍정 텍스트 노드: 입력 필드 이름</span>
            <TextInput size="sm" marginBottom placeholder="예: text" bind:value={DBState.db.comfyConfig.posInputName}/>
            <span class="text-textcolor">부정 텍스트 노드: ID</span>
            <TextInput size="sm" marginBottom placeholder="예: 1, 3 등" bind:value={DBState.db.comfyConfig.negNodeID}/>
            <span class="text-textcolor">긍정 텍스트 노드: 입력 필드 이름</span>
            <TextInput size="sm" marginBottom placeholder="예: text" bind:value={DBState.db.comfyConfig.negInputName}/>
            <span class="text-textcolor">타임아웃 (초)</span>
            <NumberInput size="sm" marginBottom bind:value={DBState.db.comfyConfig.timeout} min={1} max={120} />
        {/if}

        {#if DBState.db.sdProvider === 'fal'}
            <span class="text-textcolor">Fal.ai API 키</span>
            <TextInput size="sm" marginBottom placeholder="..." bind:value={DBState.db.falToken}/>

            <span class="text-textcolor mt-4">너비</span>
            <NumberInput size="sm" marginBottom min={0} max={2048} bind:value={DBState.db.sdConfig.width}/>
            <span class="text-textcolor mt-4">높이</span>
            <NumberInput size="sm" marginBottom min={0} max={2048} bind:value={DBState.db.sdConfig.height}/>

            <span class="text-textcolor mt-4">모델</span>
            <SelectInput className="mt-2" bind:value={DBState.db.falModel}>
                <OptionInput value="fal-ai/flux/dev" >Flux[Dev]</OptionInput>
                <OptionInput value="fal-ai/flux-lora" >Flux[Dev] (LoRA 포함)</OptionInput>
                <OptionInput value="fal-ai/flux-pro" >Flux[Pro]</OptionInput>
                <OptionInput value="fal-ai/flux/schnell" >Flux[Schnell]</OptionInput>
            </SelectInput>

            {#if DBState.db.falModel === 'fal-ai/flux-lora'}
                <span class="text-textcolor mt-4">LoRA 모델 URL <Help key="urllora" /></span>
                <TextInput size="sm" marginBottom bind:value={DBState.db.falLora}/>

                <span class="text-textcolor mt-4">LoRA 가중치</span>
                <SliderInput fixed={2} min={0}  max={2} step={0.01} bind:value={DBState.db.falLoraScale}/>
            {/if}


        {/if}

        {#if DBState.db.sdProvider === 'Imagen'}
            <span class="text-textcolor mt-2">GoogleAI API 키</span>
            <TextInput marginBottom={true} size={"sm"} placeholder="..." hideText={DBState.db.hideApiKey} bind:value={DBState.db.google.accessToken}/>
            
            <span class="text-textcolor">모델</span>
            <SelectInput className="mb-4" bind:value={DBState.db.ImagenModel}>
                <OptionInput value="imagen-4.0-generate-001" >Imagen 4</OptionInput>
                <OptionInput value="imagen-4.0-ultra-generate-001" >Imagen 4 Ultra</OptionInput>
                <OptionInput value="imagen-4.0-fast-generate-001" >Imagen 4 Fast</OptionInput>
                <OptionInput value="imagen-3.0-generate-002" >Imagen 3.0</OptionInput>
            </SelectInput>

            {#if DBState.db.ImagenModel === 'imagen-4.0-generate-001' || DBState.db.ImagenModel === 'imagen-4.0-ultra-generate-001'}
                <span class="text-textcolor">이미지 크기</span>
                <SelectInput className="mb-4" bind:value={DBState.db.ImagenImageSize}>
                    <OptionInput value="1K" >1K</OptionInput>
                    <OptionInput value="2K" >2K</OptionInput>
                </SelectInput>
            {/if}

            <span class="text-textcolor">화면 비율</span>
            <SelectInput className="mb-4" bind:value={DBState.db.ImagenAspectRatio}>
                <OptionInput value="1:1" >1:1</OptionInput>
                <OptionInput value="3:4" >3:4</OptionInput>
                <OptionInput value="4:3" >4:3</OptionInput>
                <OptionInput value="9:16" >9:16</OptionInput>
                <OptionInput value="16:9" >16:9</OptionInput>
            </SelectInput>

            <span class="text-textcolor">인물 생성</span>
            <SelectInput className="mb-4" bind:value={DBState.db.ImagenPersonGeneration}>
                <OptionInput value="allow_all" >모두 허용</OptionInput>
                <OptionInput value="allow_adult" >성인만 허용</OptionInput>
                <OptionInput value="dont_allow" >허용 안 함</OptionInput>
            </SelectInput>
        {/if}

        {#if DBState.db.sdProvider === 'openai-compat'}
            <span class="text-textcolor mt-2">API URL</span>
            <TextInput size="sm" marginBottom placeholder="https://api.example.com/v1/images/generations" bind:value={DBState.db.openaiCompatImage.url}/>

            <span class="text-textcolor">API 키</span>
            <TextInput size="sm" marginBottom placeholder="sk-..." hideText={DBState.db.hideApiKey} bind:value={DBState.db.openaiCompatImage.key}/>

            <span class="text-textcolor">모델</span>
            <TextInput size="sm" marginBottom placeholder="dall-e-3" bind:value={DBState.db.openaiCompatImage.model}/>

            <span class="text-textcolor">이미지 크기</span>
            <SelectInput className="mb-4" bind:value={DBState.db.openaiCompatImage.size}>
                <OptionInput value="1024x1024" >1024x1024</OptionInput>
                <OptionInput value="1536x1024" >1536x1024</OptionInput>
                <OptionInput value="1024x1536" >1024x1536</OptionInput>
                <OptionInput value="512x512" >512x512</OptionInput>
                <OptionInput value="256x256" >256x256</OptionInput>
            </SelectInput>

            <span class="text-textcolor">품질</span>
            <SelectInput className="mb-4" bind:value={DBState.db.openaiCompatImage.quality}>
                <OptionInput value="auto" >자동</OptionInput>
                <OptionInput value="low" >낮음</OptionInput>
                <OptionInput value="medium" >보통</OptionInput>
                <OptionInput value="high" >높음</OptionInput>
            </SelectInput>
        {/if}

        {#if DBState.db.sdProvider === 'wavespeed'}
            <span class="text-textcolor">API 키</span>
            <TextInput size="sm" marginBottom placeholder="sk-..." hideText={DBState.db.hideApiKey} bind:value={DBState.db.wavespeedImage.key}/>

            <span class="text-textcolor">모델</span>
            <button
              class="px-3 py-2 bg-darkbutton rounded-md hover:bg-textcolor2 transition-colors disabled:opacity-50"
              disabled={isWavespeedLoading}
              onclick={fetchWavespeedModels}
            >
                {isWavespeedLoading ? '불러오는 중...' : '모델 목록 새로고침'}
            </button>
            <TextInput
              bind:value={wavespeedSearchQuery}
              placeholder="모델 검색..."
              size="sm"
              marginBottom
            />
            <SelectInput className="mb-4" bind:value={DBState.db.wavespeedImage.model} onchange={handleModelChange}>
                <OptionInput value="" >모델을 선택하세요...</OptionInput>
                {#if wavespeedModels.length > 0}
                    {#each getFilteredModels() as model}
                        <OptionInput value={model.model_id}>
                            {getModelDisplayName(model)}
                        </OptionInput>
                    {/each}
                {:else if DBState.db.wavespeedImage.model}
                    <OptionInput value={DBState.db.wavespeedImage.model}> {DBState.db.wavespeedImage.model} </OptionInput>
                {/if}
            </SelectInput>

            <span class="text-textcolor mt-4">LoRAs</span>
            {#if wavespeedModels.find(m => m.model_id === DBState.db.wavespeedImage.model)?.supportsLoras}
                {#each wavespeedLoras as lora, index}
                    <TextInput
                      size="sm"
                      marginBottom
                      marginTop
                      placeholder={`LoRA ${index + 1} URL (optional)`}
                      bind:value={lora.path}
                    />
                    <SliderInput
                      marginBottom
                      min={0}
                      max={4}
                      step={0.1}
                      fixed={1}
                      bind:value={lora.scale}
                    />
                {/each}
                <span class="text-textcolor2 text-xs mb-2 block">
                    .safetensors 파일만 지원합니다. owner/model-name(Hugging Face) 형식이나 직접 URL(Civitai)을 사용하세요.
                </span>
            {:else}
                <span class="text-textcolor2 text-xs mb-2 block">
                    이 모델은 LoRA를 지원하지 않습니다. 또는 모델 목록을 새로고침해 모델 상태를 갱신하세요.
                </span>
            {/if}

            <span class="text-textcolor">이미지 참조</span>
            {#if wavespeedModels.find(m => m.model_id === DBState.db.wavespeedImage.model)?.supportsImageInput}
                <SelectInput className="mb-4" bind:value={DBState.db.wavespeedImage.reference_mode}>
                    <OptionInput value="" >없음</OptionInput>
                    <OptionInput value="image" >이미지 업로드</OptionInput>
                    <OptionInput value="character" >캐릭터 이미지 사용</OptionInput>
                </SelectInput>

                {#if DBState.db.wavespeedImage.reference_mode === 'image'}
                    <div class="relative">
                        <button class="mb-2" onclick={async () => {
                            const img = await selectSingleFile([
                                'jpg',
                                'jpeg',
                                'png',
                                'webp'
                            ])
                            if(!img){
                                return null
                            }

                            const imageData = img.data;

                            DBState.db.wavespeedImage.reference_base64image = Buffer.from(imageData).toString('base64');
                            const saveId = await saveAsset(imageData)
                            DBState.db.wavespeedImage.reference_image = saveId
                            console.log('Character image set:', DBState.db.wavespeedImage.reference_image)
                        }}>
                            {#if !DBState.db.wavespeedImage.reference_image || DBState.db.wavespeedImage.reference_image === ''}
                                <div class="rounded-md h-20 w-20 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500 flex items-center justify-center">
                                    <span class="text-sm">이미지<br />업로드</span>
                                </div>
                            {:else}
                                {#await getCharImage(DBState.db.wavespeedImage.reference_image, 'plain')}
                                    <div class="rounded-md h-20 w-20 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500 flex items-center justify-center">
                                        <span class="text-sm">이미지<br />업로드 중..</span>
                                    </div>
                                {:then im}
                                    <img src={im} class="rounded-md h-40 shadow-lg bg-textcolor2 cursor-pointer hover:text-green-500" alt="Base Preview"/>
                                {/await}
                            {/if}
                        </button>

                        {#if DBState.db.wavespeedImage.reference_image && DBState.db.wavespeedImage.reference_image !== ''}
                            <button
                              onclick={() => {
                                    DBState.db.wavespeedImage.reference_image = undefined;
                                    DBState.db.wavespeedImage.reference_base64image = undefined;
                                }}
                              class="absolute top-2 right-2 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-sm"
                            >
                                삭제
                            </button>
                        {/if}
                    </div>
                {/if}
                {#if DBState.db.wavespeedImage.reference_mode === 'character'}
                    <span class="text-textcolor2 text-xs mb-2 block">캐릭터의 기본 이미지를 사용합니다.</span>
                {/if}
            {:else}
                <span class="text-textcolor2 text-xs mb-2 block">
                    이 모델은 이미지 입력을 지원하지 않습니다. 또는 모델 목록을 새로고침해 모델 상태를 갱신하세요.
                </span>
            {/if}
        {/if}
    </Accordion>
{/if}

{#if submenu === 1 || submenu === -1}
<Accordion name="TTS" styled disabled={submenu !== -1}>
    <CheckInput bind:check={DBState.db.ttsAutoSpeech} name="자동 음성 재생" className="mt-2"/>

    <span class="text-textcolor mt-2">ElevenLabs API 키</span>
    <TextInput size="sm" marginBottom bind:value={DBState.db.elevenLabKey}/>

    <span class="text-textcolor mt-2">VOICEVOX URL</span>
    <TextInput size="sm" marginBottom bind:value={DBState.db.voicevoxUrl}/>

    <span class="text-textcolor">OpenAI 키</span>
    <TextInput size="sm" marginBottom bind:value={DBState.db.openAIKey}/>

    <span class="text-textcolor mt-2">NovelAI API 키</span>
    <TextInput size="sm" marginBottom placeholder="pst-..." bind:value={DBState.db.NAIApiKey}/>

    <span class="text-textcolor">Huggingface 키</span>
    <TextInput size="sm" marginBottom bind:value={DBState.db.huggingfaceKey} placeholder="hf_..."/>

    <span class="text-textcolor">fish-speech API 키</span>
    <TextInput size="sm" marginBottom bind:value={DBState.db.fishSpeechKey}/>

</Accordion>
{/if}

{#if submenu === 2 || submenu === -1}
<Accordion name={language.emotionImage} styled disabled={submenu !== -1}>
    <span class="text-textcolor mt-2">{language.emotionMethod}</span>

    <SelectInput className="mt-2 mb-4" bind:value={DBState.db.emotionProcesser}>
        <OptionInput value="submodel" >보조 모델</OptionInput>
        <OptionInput value="embedding" >MiniLM-L6-v2</OptionInput>
    </SelectInput>
</Accordion>
{/if}

{#if submenu === 0 || submenu === -1}
    <Accordion name={language.longTermMemory} styled disabled={submenu !== -1}>
        <span class="text-textcolor mt-4">{language.type}</span>

        <SelectInput className="mb-4" value={
            DBState.db.hypaV3 ? 'hypaV3' :
            DBState.db.hypav2 ? 'hypaV2' :
            DBState.db.supaModelType !== 'none' ? 'supaMemory' :
            DBState.db.hanuraiEnable ? 'hanuraiMemory' : 'none'
        } onchange={(v) => {
            //@ts-expect-error 'value' doesn't exist on EventTarget, but target is HTMLSelectElement here
            const value = v.target.value
            if (value === 'supaMemory'){
                DBState.db.supaModelType = 'distilbart'
                DBState.db.memoryAlgorithmType = 'supaMemory'
                DBState.db.hypav2 = false
                DBState.db.hanuraiEnable = false
                DBState.db.hypaV3 = false
            } else if (value === 'hanuraiMemory'){
                DBState.db.supaModelType = 'none'
                DBState.db.memoryAlgorithmType = 'hanuraiMemory'
                DBState.db.hypav2 = false
                DBState.db.hanuraiEnable = true
                DBState.db.hypaV3 = false
            } else if (value === 'hypaV2') {
                DBState.db.supaModelType = 'distilbart'
                DBState.db.memoryAlgorithmType = 'hypaMemoryV2'
                DBState.db.hypav2= true
                DBState.db.hanuraiEnable = false
                DBState.db.hypaV3 = false
            } else if (value === 'hypaV3') {
                DBState.db.memoryAlgorithmType = 'hypaMemoryV3'
                DBState.db.supaModelType = 'none'
                DBState.db.hanuraiEnable = false
                DBState.db.hypav2 = false
                DBState.db.hypaV3 = true
            } else {
                DBState.db.supaModelType = 'none'
                DBState.db.memoryAlgorithmType = 'none'
                DBState.db.hypav2 = false
                DBState.db.hanuraiEnable = false
                DBState.db.hypaV3 = false
            }
        }}>
            <OptionInput value="none" >없음</OptionInput>
            <OptionInput value="supaMemory" >{language.SuperMemory}</OptionInput>
            <OptionInput value="hypaV2" >{language.HypaMemory} V2</OptionInput>
            <OptionInput value="hanuraiMemory" >{language.hanuraiMemory}</OptionInput>
            <OptionInput value="hypaV3" >{language.HypaMemory} V3</OptionInput>
        </SelectInput>

        {#if DBState.db.hanuraiEnable}
            <span class="mb-2 text-textcolor2 text-sm text-wrap wrap-break-word max-w-full">{language.hanuraiDesc}</span>
            <span>청크 크기</span>
            <NumberInput size="sm" marginBottom bind:value={DBState.db.hanuraiTokens} min={100} />
            <div class="flex mb-4">
                <Check bind:check={DBState.db.hanuraiSplit} name="텍스트 분할"/>
            </div>
        {:else if DBState.db.hypav2}
            <span class="mb-2 text-textcolor2 text-sm text-wrap wrap-break-word max-w-full">{language.hypaV2Desc}</span>
            <span class="text-textcolor mt-4">{language.SuperMemory} {language.model}</span>
            <SelectInput className="mt-2 mb-2" bind:value={DBState.db.supaModelType}>
                <OptionInput value="distilbart">distilbart-cnn-6-6 (무료/로컬)</OptionInput>
                <OptionInput value="instruct35">OpenAI 3.5 Turbo Instruct</OptionInput>
                <OptionInput value="subModel">{language.submodel}</OptionInput>
            </SelectInput>
            {#if DBState.db.supaModelType === 'davinci' || DBState.db.supaModelType === 'curie' || DBState.db.supaModelType === 'instruct35'}
            <span class="text-textcolor">{language.SuperMemory} OpenAI 키</span>
            <TextInput size="sm" marginBottom bind:value={DBState.db.supaMemoryKey}/>
            {/if}
            <span class="text-textcolor">{language.summarizationPrompt} <Help key="summarizationPrompt" /></span>
            <TextAreaInput size="sm" bind:value={DBState.db.supaMemoryPrompt} placeholder="비워 두면 기본값을 사용합니다"/>
            <span class="text-textcolor">{language.hypaChunkSize}</span>
            <NumberInput size="sm" marginBottom bind:value={DBState.db.hypaChunkSize} min={100} />
            <span class="text-textcolor">{language.hypaAllocatedTokens}</span>
            <NumberInput size="sm" marginBottom bind:value={DBState.db.hypaAllocatedTokens} min={100} />
        {:else if DBState.db.hypaV3}
            <span class="max-w-full mb-6 text-sm text-wrap wrap-break-word text-textcolor2">{language.hypaV3Settings.descriptionLabel}</span>
            <span class="text-textcolor">프리셋</span>
            <select class={"risu-select border border-darkborderc focus:border-borderc rounded-md shadow-xs text-textcolor bg-transparent focus:ring-borderc focus:ring-2 focus:outline-hidden transition-colors duration-200 text-md px-4 py-2 mb-1"}
                bind:value={DBState.db.hypaV3PresetId}
            >
                {#each DBState.db.hypaV3Presets as preset, i}
                    <option class="bg-darkbg appearance-none" value={i}>{preset.name}</option>
                {/each}
            </select>

            <div class="flex items-center mb-8">
                <button class="mr-2 text-textcolor2 hover:text-green-500 cursor-pointer" onclick={() => {
                    const newPreset = createHypaV3Preset()
                    const presets = DBState.db.hypaV3Presets

                    presets.push(newPreset)
                    DBState.db.hypaV3Presets = presets
                    DBState.db.hypaV3PresetId = DBState.db.hypaV3Presets.length - 1
                }}>
                    <PlusIcon size={24}/>
                </button>

                <button class="mr-2 text-textcolor2 hover:text-green-500 cursor-pointer" onclick={async () => {
                    const presets = DBState.db.hypaV3Presets

                    if(presets.length === 0){
                        alertError("프리셋이 최소 하나는 있어야 합니다.")
                        return
                    }

                    const id = DBState.db.hypaV3PresetId
                    const preset = presets[id]
                    const newName = await alertInput(`${preset.name}의 새 이름을 입력하세요`, [], preset.name)

                    if (!newName || newName.trim().length === 0) return

                    preset.name = newName
                    DBState.db.hypaV3Presets = presets
                }}>
                    <PencilIcon size={24}/>
                </button>

                <button class="mr-2 text-textcolor2 hover:text-green-500 cursor-pointer" onclick={async (e) => {
                    const presets = DBState.db.hypaV3Presets

                    if(presets.length <= 1){
                        alertError("프리셋이 최소 하나는 있어야 합니다.")
                        return
                    }

                    const id = DBState.db.hypaV3PresetId
                    const preset = presets[id]
                    const confirmed = await alertConfirm(`${language.removeConfirm}${preset.name}`)

                    if (!confirmed) return

                    DBState.db.hypaV3PresetId = 0
                    presets.splice(id, 1)
                    DBState.db.hypaV3Presets = presets
                }}>
                    <TrashIcon size={24}/>
                </button>

                <div class="ml-2 mr-4 w-px h-full bg-darkborderc"></div>

                <button class="mr-2 text-textcolor2 hover:text-green-500 cursor-pointer" onclick={async() => {
                    try {
                        const presets = DBState.db.hypaV3Presets
                        
                        if(presets.length === 0){
                            alertError("프리셋이 최소 하나는 있어야 합니다.")
                            return
                        }

                        const id = DBState.db.hypaV3PresetId
                        const preset = presets[id]
                        const bytesExport = Buffer.from(JSON.stringify({
                            type: 'risu',
                            ver: 1,
                            data: preset
                        }), 'utf-8')
                        
                        await downloadFile(`hypaV3_export_${preset.name}.json`, bytesExport)
                        alertNormal(language.successExport)
                    } catch (error) {
                        alertError(`${error}`)
                    }
                }}>
                    <DownloadIcon size={24}/>
                </button>

                <button class="mr-2 text-textcolor2 hover:text-green-500 cursor-pointer" onclick={async() => {
                    try {
                        const bytesImport = (await selectSingleFile(['json'])).data

                        if(!bytesImport) return

                        const objImport = JSON.parse(Buffer.from(bytesImport).toString('utf-8'))

                        if(objImport.type !== 'risu' || !objImport.data) return

                        const newPreset = createHypaV3Preset(
                            objImport.data.name || "가져온 프리셋",
                            objImport.data.settings || {}
                        );
                        const presets = DBState.db.hypaV3Presets
                        
                        presets.push(newPreset)
                        DBState.db.hypaV3Presets = presets
                        DBState.db.hypaV3PresetId = DBState.db.hypaV3Presets.length - 1

                        alertNormal(language.successImport)
                    } catch (error) {
                        alertError(`${error}`)
                    }
                }}>
                    <HardDriveUploadIcon size={24}/>
                </button>
            </div>

            {#if DBState.db.hypaV3Presets?.[DBState.db.hypaV3PresetId]?.settings}
                {@const settings = DBState.db.hypaV3Presets[DBState.db.hypaV3PresetId].settings}

                <span class="text-textcolor">{language.SuperMemory} {language.model}</span>
                <SelectInput className="mb-4" bind:value={settings.summarizationModel}>
                    <OptionInput value="subModel">{language.submodel}</OptionInput>
                    {#if "gpu" in navigator}
                        <OptionInput value="Qwen3-1.7B-q4f32_1-MLC">Qwen3 1.7B (GPU)</OptionInput>
                        <OptionInput value="Qwen3-4B-q4f32_1-MLC">Qwen3 4B (GPU)</OptionInput>
                        <OptionInput value="Qwen3-8B-q4f32_1-MLC">Qwen3 8B (GPU)</OptionInput>
                    {/if}
                </SelectInput>
                <span class="text-textcolor">{language.summarizationPrompt} <Help key="summarizationPrompt"/></span>
                <div class="mb-4">
                    <TextAreaInput size="sm" placeholder={language.hypaV3Settings.supaMemoryPromptPlaceHolder} bind:value={settings.summarizationPrompt} />
                </div>
                <span class="text-textcolor">{language.reSummarizationPrompt} <Help key="reSummarizationPrompt"/></span>
                <div class="mb-4">
                    <TextAreaInput size="sm" placeholder={language.hypaV3Settings.supaMemoryPromptPlaceHolder} bind:value={settings.reSummarizationPrompt} />
                </div>
                {#await getMaxMemoryRatio() then maxMemoryRatio}
                <span class="text-textcolor">{language.hypaV3Settings.maxMemoryTokensRatioLabel}</span>
                <NumberInput marginBottom disabled size="sm" value={maxMemoryRatio} />
                {:catch error}
                <span class="mb-4 text-red-400">{language.hypaV3Settings.maxMemoryTokensRatioError}</span>
                {/await}
                <span class="text-textcolor">{language.hypaV3Settings.memoryTokensRatioLabel} <Help key="hypaV3MemoryTokensRatio"/></span>
                <SliderInput marginBottom min={0} max={1} step={0.01} fixed={2} bind:value={settings.memoryTokensRatio} />
                <span class="text-textcolor">{language.hypaV3Settings.extraSummarizationRatioLabel} <Help key="hypaV3ExtraSummarizationRatio"/></span>
                <SliderInput marginBottom min={0} max={1 - settings.memoryTokensRatio} step={0.01} fixed={2} bind:value={settings.extraSummarizationRatio} />
                <span class="text-textcolor">{language.hypaV3Settings.maxChatsPerSummaryLabel} <Help key="hypaV3MaxChatsPerSummary"/></span>
                <NumberInput marginBottom size="sm" min={1} bind:value={settings.maxChatsPerSummary} />
                <span class="text-textcolor">{language.hypaV3Settings.queryChatCountLabel} <Help key="hypaV3QueryChatCount"/></span>
                <NumberInput marginBottom size="sm" min={1} max={20} bind:value={settings.queryChatCount} />
                <span class="text-textcolor">{language.hypaV3Settings.summaryChunkSeparatorLabel} <Help key="hypaV3SummaryChunkSeparator"/></span>
                <TextInput marginBottom size="sm" bind:value={settings.summaryChunkSeparator} />
                <span class="text-textcolor">{language.hypaV3Settings.recentMemoryRatioLabel} <Help key="hypaV3RecentMemoryRatio"/></span>
                <SliderInput marginBottom min={0} max={1} step={0.01} fixed={2} bind:value={settings.recentMemoryRatio} />
                <span class="text-textcolor">{language.hypaV3Settings.similarMemoryRatioLabel} <Help key="hypaV3SimilarMemoryRatio"/></span>
                <SliderInput marginBottom min={0} max={1} step={0.01} fixed={2} bind:value={settings.similarMemoryRatio} />
                <span class="text-textcolor">{language.hypaV3Settings.randomMemoryRatioLabel} <Help key="hypaV3RandomMemoryRatio"/></span>
                <NumberInput marginBottom disabled size="sm" value={parseFloat((1 - settings.recentMemoryRatio - settings.similarMemoryRatio).toFixed(2))} />
                <div class="mb-2 flex items-center">
                    <Check name={language.hypaV3Settings.preserveOrphanedMemoryLabel} bind:check={settings.preserveOrphanedMemory} />
                    <Help key="hypaV3PreserveOrphanedMemory"/>
                </div>
                <div class="mb-2 flex items-center">
                    <Check name={language.hypaV3Settings.applyRegexScriptWhenRerollingLabel} bind:check={settings.processRegexScript} />
                    <Help key="hypaV3ProcessRegexScript"/>
                </div>
                <div class="mb-2 flex items-center">
                    <Check name={language.hypaV3Settings.doNotSummarizeUserMessageLabel} bind:check={settings.doNotSummarizeUserMessage} />
                    <Help key="hypaV3DoNotSummarizeUserMessage"/>
                </div>
                <Accordion name="고급 설정" styled>
                    <div class="mb-2 flex items-center">
                        <Check name="실험적 구현 사용" bind:check={settings.useExperimentalImpl} />
                        <Help key="hypaV3UseExperimentalImpl"/>
                    </div>
                    <div class="mb-2 flex items-center">
                        <Check name="항상 켜기" bind:check={settings.alwaysToggleOn} />
                        <Help key="hypaV3AlwaysToggleOn"/>
                    </div>
                    {#if settings.useExperimentalImpl}
                        <span class="text-textcolor">분당 요약 요청 수 <Help key="hypaV3SummarizationRequestsPerMinute"/></span>
                        <NumberInput marginBottom size="sm" min={1} bind:value={settings.summarizationRequestsPerMinute} />
                        <span class="text-textcolor">요약 최대 동시 요청 수 <Help key="hypaV3SummarizationMaxConcurrent"/></span>
                        <NumberInput marginBottom size="sm" min={1} max={10} bind:value={settings.summarizationMaxConcurrent} />
                        <span class="text-textcolor">분당 임베딩 요청 수 <Help key="hypaV3EmbeddingRequestsPerMinute"/></span>
                        <NumberInput marginBottom size="sm" min={1} bind:value={settings.embeddingRequestsPerMinute} />
                        <span class="text-textcolor">임베딩 최대 동시 요청 수 <Help key="hypaV3EmbeddingMaxConcurrent"/></span>
                        <NumberInput marginBottom size="sm" min={1} max={10} bind:value={settings.embeddingMaxConcurrent} />
                    {:else}
                        <div class="mb-2 flex items-center">
                            <Check name={language.hypaV3Settings.enableSimilarityCorrectionLabel} bind:check={settings.enableSimilarityCorrection} />
                            <Help key="hypaV3EnableSimilarityCorrection"/>
                        </div>
                    {/if}
                </Accordion>
            {/if}

            <div class="mb-8"></div>
        {:else if (DBState.db.supaModelType !== 'none' && DBState.db.hypav2 === false && DBState.db.hypaV3 === false)}
            <span class="mb-2 text-textcolor2 text-sm text-wrap wrap-break-word max-w-full">{language.supaDesc}</span>
            <span class="text-textcolor mt-4">{language.SuperMemory} {language.model}</span>
            <SelectInput className="mt-2 mb-2" bind:value={DBState.db.supaModelType}>
                <OptionInput value="distilbart" >distilbart-cnn-6-6 (무료/로컬)</OptionInput>
                <OptionInput value="instruct35" >OpenAI 3.5 Turbo Instruct</OptionInput>
                <OptionInput value="subModel" >{language.submodel}</OptionInput>
            </SelectInput>
            <span class="text-textcolor">{language.maxSupaChunkSize}</span>
            <NumberInput size="sm" marginBottom bind:value={DBState.db.maxSupaChunkSize} min={100} />
            {#if DBState.db.supaModelType === 'davinci' || DBState.db.supaModelType === 'curie' || DBState.db.supaModelType === 'instruct35'}
                <span class="text-textcolor">{language.SuperMemory} OpenAI 키</span>
                <TextInput size="sm" marginBottom bind:value={DBState.db.supaMemoryKey}/>
            {/if}
            {#if DBState.db.supaModelType !== 'none'}
                <span class="text-textcolor">{language.SuperMemory} 프롬프트</span>
                <TextInput size="sm" marginBottom bind:value={DBState.db.supaMemoryPrompt} placeholder="비워 두면 기본값을 사용합니다"/>
            {/if}
            <div class="flex mb-4">
                <Check bind:check={DBState.db.hypaMemory} name={language.enable + ' ' + language.HypaMemory}/>
            </div>
        {/if}

        <span class="text-textcolor">{language.embedding} <Help key="embedding"/></span>
        <SelectInput className="mb-4" bind:value={DBState.db.hypaModel}>
            {#if 'gpu' in navigator}
                <OptionInput value="MiniLMGPU">MiniLM L6 v2 (GPU)</OptionInput>
                <OptionInput value="nomicGPU">Nomic Embed Text v1.5 (GPU)</OptionInput>
                <OptionInput value="bgeSmallEnGPU">BGE Small English (GPU)</OptionInput>
                <OptionInput value="bgem3GPU">BGE Medium 3 (GPU)</OptionInput>
                <OptionInput value="multiMiniLMGPU">Multilingual MiniLM L12 v2 (GPU)</OptionInput>
                <OptionInput value="bgeM3KoGPU">BGE Medium 3 Korean (GPU)</OptionInput>
            {/if}
            <OptionInput value="MiniLM">MiniLM L6 v2 (CPU)</OptionInput>
            <OptionInput value="nomic">Nomic Embed Text v1.5 (CPU)</OptionInput>
            <OptionInput value="bgeSmallEn">BGE Small English (CPU)</OptionInput>
            <OptionInput value="bgem3">BGE Medium 3 (CPU)</OptionInput>
            <OptionInput value="multiMiniLM">Multilingual MiniLM L12 v2 (CPU)</OptionInput>
            <OptionInput value="bgeM3Ko">BGE Medium 3 Korean (CPU)</OptionInput>
            <OptionInput value="openai3small">OpenAI text-embedding-3-small</OptionInput>
            <OptionInput value="openai3large">OpenAI text-embedding-3-large</OptionInput>
            <OptionInput value="ada">OpenAI Ada</OptionInput>
            <OptionInput value="voyageContext3">Voyage Context 3</OptionInput>
            <OptionInput value="custom">사용자 지정 (OpenAI 호환)</OptionInput>
        </SelectInput>

        {#if DBState.db.hypaModel === 'openai3small' || DBState.db.hypaModel === 'openai3large' || DBState.db.hypaModel === 'ada'}
            <span class="text-textcolor">OpenAI API 키</span>
            <TextInput size="sm" marginBottom bind:value={DBState.db.supaMemoryKey}/>
        {/if}

        {#if DBState.db.hypaModel === 'custom'}
            <span class="text-textcolor">URL</span>
            <TextInput size="sm" marginBottom bind:value={DBState.db.hypaCustomSettings.url}/>
            <span class="text-textcolor">키/비밀번호</span>
            <TextInput size="sm" marginBottom bind:value={DBState.db.hypaCustomSettings.key}/>
            <span class="text-textcolor">요청 모델</span>
            <TextInput size="sm" marginBottom bind:value={DBState.db.hypaCustomSettings.model}/>
        {/if}

        {#if DBState.db.hypaModel === 'voyageContext3'}
            <span class="text-textcolor">Voyage API 키</span>
            <TextInput size="sm" marginBottom hideText={DBState.db.hideApiKey} bind:value={DBState.db.voyageApiKey}/>
        {/if}

    </Accordion>
{/if}
