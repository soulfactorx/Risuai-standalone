<script lang="ts">
    import { DBState } from 'src/ts/stores.svelte';
    import { FolderCodeIcon, GlobeIcon, MailIcon, Send } from "@lucide/svelte";
    import { getVersionString, openURL } from "src/ts/globalApi.svelte";
    import { language } from "src/lang";
    import FileImportPanel from "./FileImportPanel.svelte";
    import InstallAppButton from "./InstallAppButton.svelte";
    import Title from "./Title.svelte";

    type RelatedLink = {
      title: string;
      description: string;
      href: string;
      logoIcon: "source" | "globe" | "mail" | "paper-airplane";
    };

    const relatedLinkIconClass =
      "h-40 w-40 md:h-44 md:w-44 origin-right -rotate-12 opacity-[0.12] transition-all duration-500 group-hover:scale-105 group-hover:opacity-[0.22]";

    const relatedLinks: RelatedLink[] = [
      {
        title: "Discord",
        description: "Discord 서버에 참여해 다른 사용자, 개발자와 이야기를 나눠 보세요.",
        href: "https://discord.gg/Exy3NrqkGm",
        logoIcon: "paper-airplane"
      },
      {
        title: "웹사이트",
        description: "프로젝트 공식 웹사이트를 확인하세요.",
        href: "https://risuai.net",
        logoIcon: "globe"
      },
      {
        title: "GitHub",
        description: "소스 코드를 확인하고 프로젝트에 기여하세요.",
        href: "https://github.com/kwaroran/RisuAI",
        logoIcon: "source"
      },
      {
        title: "이메일",
        description: "개발자에게 직접 연락하세요.",
        href: "mailto:support@risuai.net",
        logoIcon: "mail"
      }
    ];
</script>
<div class="h-full w-full flex flex-col overflow-y-auto items-center">
    <Title />
    <h3 class="text-textcolor2 mt-1">버전 {getVersionString()}</h3>
    <!-- 웹앱(PWA) 설치 안내 (GitHub Pages 등 http(s) 에서만 표시) -->
    <InstallAppButton />
    <div class="w-full flex p-4 flex-col text-textcolor max-w-4xl">
      <!-- RisuRealm 서버에 접속할 수 없는 환경이라, 내려받은 파일을 직접 가져오는 기능으로 대체함 -->
      <div class="mt-4 mb-4 w-full border-t border-t-selected"></div>
      <h1 class="text-2xl font-bold mb-4">파일 가져오기</h1>
      <FileImportPanel />
      <div class="mt-4 mb-4 w-full border-t border-t-selected"></div>
      <h1 class="text-2xl font-bold mb-4">
        관련 링크
      </h1>
        <div class="grid w-full grid-cols-1 gap-4 p-2 md:grid-cols-2">
          {#each relatedLinks as relatedLink}
            <button class="group relative flex min-h-[140px] flex-col justify-center overflow-hidden rounded-2xl border border-borderc/10 bg-darkbg p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-borderc/30 hover:bg-selected/50 hover:shadow-xl hover:shadow-darkbg/50" onclick={() => {
              openURL(relatedLink.href)
            }}>
              <div class="relative z-10 w-[68%] sm:w-[70%]">
                  <h2 class="text-2xl font-bold tracking-tight text-textcolor">{relatedLink.title}</h2>
                  <span class="mt-2 block text-base leading-relaxed text-textcolor2">
                    {relatedLink.description}
                  </span>
              </div>
              
              <div aria-hidden="true" class="pointer-events-none absolute -right-12 top-1/2 -translate-y-1/2 text-textcolor">
                  {#if relatedLink.logoIcon === "globe"}
                    <GlobeIcon class={relatedLinkIconClass} strokeWidth={1} />
                  {:else if relatedLink.logoIcon === "mail"}
                    <MailIcon class={relatedLinkIconClass} strokeWidth={1} />
                  {:else if relatedLink.logoIcon === "paper-airplane"}
                    <Send class={relatedLinkIconClass} strokeWidth={1} />
                  {:else if relatedLink.logoIcon === "source"}
                    <FolderCodeIcon class={relatedLinkIconClass} strokeWidth={1} />
                  {/if}
              </div>
            </button>
          {/each}
      </div>

  </div>
</div>
