<script lang="ts">

    interface Props {
        check?: boolean;
        onChange?: (check:boolean) => any,
        margin?: boolean;
        name?: string;
        hiddenName?: boolean;
        reverse?: boolean;
        className?: string;
        grayText?: boolean;
        children?: import('svelte').Snippet;
    }

    let {
        check = $bindable(),
        onChange = (check:boolean) => {},
        margin = true,
        name = '',
        hiddenName = false,
        reverse = false,
        className = "",
        grayText = false,
        children
    }: Props = $props();
</script>

<label 
    class={"flex items-center gap-2 cursor-pointer" + (className ? " " + className : "") + (grayText ? " text-textcolor2" : " text-textcolor")}
    class:mr-2={margin}
    aria-describedby="{name} {check ? 'abled' : 'disabled'}"
    aria-labelledby="{name} {check ? 'abled' : 'disabled'}"
>
    {#if reverse}
        <span>{name} {@render children?.()}</span>
    {/if}
    <input 
        class="hidden" 
        type="checkbox" 
        alt={name}
        bind:checked={check}
        onchange={() => {
            onChange(check)
        }}
        aria-describedby="{name} {check ? 'abled' : 'disabled'}"
        aria-labelledby="{name} {check ? 'abled' : 'disabled'}"
    />
    <!-- 체크 여부가 어떤 테마에서도 잘 보이도록, 켜짐은 글자색으로 채우고 꺼짐은 빈 칸(테두리만)으로 표시한다. -->
    <span 
        class="w-5 h-5 min-w-5 min-h-5 rounded-md border-2 flex justify-center items-center {check ? 'bg-textcolor border-textcolor' : 'bg-transparent border-textcolor2/60'} transition-colors duration-200"
        aria-hidden="true"
        aria-describedby="{name} {check ? 'abled' : 'disabled'}"
        aria-labelledby="{name} {check ? 'abled' : 'disabled'}"
    >
        {#if check}
            <!-- 체크 표시는 배경색으로 그려서 글자색 칸 위에서 항상 대비가 나도록 한다. -->
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="var(--risu-theme-bgcolor)" class="w-3.5 h-3.5" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
            </svg>
        {/if}
    </span>
    {#if !hiddenName && !reverse}
        <span>{name} {@render children?.()}</span>
    {/if}
</label>