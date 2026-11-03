<script lang="ts">
    import { DBState } from 'src/ts/stores.svelte';
    import {
        changeColorSchemeType,
        exportColorScheme,
        importColorScheme,
        updateCustomColorScheme,
    } from 'src/ts/gui/colorscheme';
    import SelectInput from 'src/lib/UI/GUI/SelectInput.svelte';
    import OptionInput from 'src/lib/UI/GUI/OptionInput.svelte';
    import { DownloadIcon, HardDriveUploadIcon } from '@lucide/svelte';

    const colors = [
        ['bgcolor', '배경'],
        ['darkbg', '어두운 배경'],
        ['borderc', '색상 1'],
        ['selected', '색상 2'],
        ['draculared', '색상 3'],
        ['darkBorderc', '색상 4'],
        ['darkbutton', '색상 5'],
        ['textcolor', '글자 색상'],
        ['textcolor2', '글자 색상 2'],
    ] as const;
</script>

{#if DBState.db.colorSchemeName === 'custom'}
    <div class="border border-darkborderc p-2 m-2 rounded-md">
        <SelectInput
            className="mt-2"
            value={DBState.db.customColorScheme.type}
            onchange={(e) => {
                changeColorSchemeType((e.target as HTMLInputElement).value as 'light' | 'dark');
            }}
        >
            <OptionInput value="light">밝게</OptionInput>
            <OptionInput value="dark">어둡게</OptionInput>
        </SelectInput>

        {#each colors as color}
            <div class="flex items-center mt-2">
                <input
                    type="color"
                    class="native-color-input"
                    aria-label={color[1]}
                    bind:value={DBState.db.customColorScheme[color[0]]}
                    oninput={updateCustomColorScheme}
                />
                <span class="ml-2">{color[1]}</span>
            </div>
        {/each}

        <div class="grow flex justify-end">
            <button
                class="text-textcolor2 hover:text-green-500 mr-2 cursor-pointer"
                onclick={() => exportColorScheme()}
            >
                <DownloadIcon size={18} />
            </button>
            <button
                class="text-textcolor2 hover:text-green-500 cursor-pointer"
                onclick={() => importColorScheme()}
            >
                <HardDriveUploadIcon size={18} />
            </button>
        </div>
    </div>
{/if}

<style>
    .native-color-input {
        width: 1.8rem;
        height: 1.8rem;
        padding: 0;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
    }

    .native-color-input::-webkit-color-swatch-wrapper {
        padding: 0;
    }

    .native-color-input::-webkit-color-swatch {
        border: 1px solid var(--risu-theme-darkborderc);
        border-radius: 9999px;
    }

    .native-color-input::-moz-color-swatch {
        border: 1px solid var(--risu-theme-darkborderc);
        border-radius: 9999px;
    }
</style>
