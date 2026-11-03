<script lang="ts">
    import { DBState } from 'src/ts/stores.svelte';
    import { updateTextThemeAndCSS } from 'src/ts/gui/colorscheme';
    import ColorInput from 'src/lib/UI/GUI/ColorInput.svelte';

    const colors = [
        ['FontColorStandard', '일반 텍스트', false],
        ['FontColorItalic', '기울임 텍스트', false],
        ['FontColorBold', '굵은 텍스트', false],
        ['FontColorItalicBold', '굵은 기울임 텍스트', false],
        ['FontColorQuote1', '작은따옴표 텍스트', true],
        ['FontColorQuote2', '큰따옴표 텍스트', true],
    ] as const;
</script>

{#if DBState.db.textTheme === 'custom'}
    {#each colors as color}
        <div class="flex items-center mt-2">
            <ColorInput
                nullable={color[2]}
                bind:value={DBState.db.customTextTheme[color[0]]}
                oninput={updateTextThemeAndCSS}
            />
            <span class="ml-2">{color[1]}</span>
        </div>
    {/each}
{/if}
