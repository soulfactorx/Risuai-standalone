# 단독 HTML 버전 (Standalone)

웹 서버나 설치 없이 **HTML 파일 하나만 브라우저로 열어서** Risuai 를 사용할 수 있는 빌드입니다.

## 바로 사용하기

- **GitHub Pages**: https://soulfactorx.github.io/Risuai-standalone/ 에 접속하면 설치 없이 바로 사용할 수 있습니다.
- **HTML 파일**: [Releases](https://github.com/soulfactorx/Risuai-standalone/releases) 에서 최신 `risuai.html` 을 내려받아 더블클릭하세요.

main 브랜치에 변경이 머지되면 GitHub Actions 가 자동으로 빌드해서 Pages 배포와 릴리스까지 진행합니다.

> Pages 주소와 HTML 파일(file://)은 브라우저 입장에서 서로 다른 사이트라 **저장 데이터가 공유되지 않습니다.**
> 옮길 때는 설정의 백업 저장/불러오기를 사용하세요.

## 빌드 방법

```bash
pnpm install
pnpm build:standalone
```

결과물: `dist-standalone/risuai.html` (약 20MB, 파일 1개)

이 파일을 원하는 위치에 복사한 뒤 더블클릭하거나 브라우저로 드래그해서 열면 됩니다.

### 약관 안내 화면

포크 빌드에서는 처음 실행할 때 "Legal documents not configured" 안내가 나옵니다.
원본 저장소를 **개인 용도로 사용**하는 경우라면, 안내 내용대로 빌드할 때 환경 변수를 직접 지정해 주세요.

```bash
VITE_RISU_LEGAL_CONFIGURED=TRUE pnpm build:standalone
```

> 원본 프로젝트의 요청에 따라 이 값은 자동으로 설정하지 않습니다.
> 공개 배포하는 경우에는 안내 화면에 적힌 대로 약관/개인정보 처리방침을 직접 준비해야 합니다.

### GitHub Actions 로 빌드·배포하기

`.github/workflows/standalone-build.yml` 워크플로가 다음을 자동으로 합니다.

1. main 브랜치에 푸시(PR 머지)되면 단독 HTML 을 빌드
2. GitHub Pages 에 배포 (`index.html` 로 사용)
3. 릴리스(`standalone-<버전>-<실행번호>` 태그)를 만들고 `risuai.html` 첨부

Actions 탭에서 **Standalone HTML Build** 를 수동 실행할 수도 있습니다. (`release` 옵션으로 릴리스 생성 여부 선택)

처음 설정할 때 필요한 것
- 약관 안내를 끄려면 Settings → Secrets and variables → Actions → **Variables** 에 `VITE_RISU_LEGAL_CONFIGURED` = `TRUE`
- Pages 배포가 실패하면 Settings → **Pages** → Build and deployment 의 Source 를 **GitHub Actions** 로 지정한 뒤 다시 실행

## 동작 방식

| 항목 | 처리 방법 |
|------|-----------|
| JS 코드 | 전부 하나로 묶은 뒤 gzip + base64 로 HTML 안에 포함, 실행 시 브라우저의 `DecompressionStream` 으로 풀어서 실행 |
| CSS | `<style>` 태그로 포함 |
| 웹 워커 (Monaco, pdf.js, Pyodide 등) | Blob URL 방식의 인라인 워커로 포함 |
| WASM, 이미지 등 에셋 | data URL 로 포함 |
| 작은 정적 파일 (`none.webp`, 로고, `json.lua` 등) | data URL 로 포함 (`util/viteStandalone.ts` 의 `EMBEDDED_PUBLIC_FILES`) |
| 큰 정적 파일 (토크나이저 등) | 필요할 때 원격 CDN 에서 다운로드 (`src/ts/standalone.ts`) |
| 데이터 저장 | 브라우저 IndexedDB (일반 웹 버전과 동일) |
| 서비스 워커 | `file://` 에서는 사용할 수 없으므로 비활성화 |

### AI 요청은 직접 보냅니다

원본 웹 버전은 AI 요청을 Risu 프록시 서버를 거쳐 보내지만, 이 포크는 개인정보 보호를 위해 Risu 서버를 전혀 사용하지 않습니다.
그래서 웹 빌드(GitHub Pages / HTML 파일 포함)는 **항상 브라우저에서 AI 서비스로 직접 요청**합니다. (고급 설정의 '직접 요청 보내기'가 항상 켜진 것과 같음)

- OpenAI, Anthropic(Claude), Google Gemini, OpenRouter 처럼 브라우저 직접 호출(CORS)을 허용하는 서비스는 정상 동작합니다.
- 직접 호출을 허용하지 않는 서비스는 이 버전에서 사용할 수 없습니다.
- 토큰 수 계산용 토크나이저 파일을 받지 못하면, 앱에 내장된 토크나이저로 근사 계산하고 채팅은 그대로 진행합니다.

### 인터넷 연결이 필요한 기능

단독 HTML 파일 자체는 오프라인에서도 열리지만, 아래 기능은 인터넷 연결이 필요합니다.

- AI API 호출 (당연히 필요)
- 토크나이저 파일: `https://cdn.jsdelivr.net/gh/kwaroran/Risuai@main/public` 에서 받고, 실패하면 `raw.githubusercontent.com` 을 시도
- Lua 스크립트 엔진(wasmoon), Pyodide, transformers.js 모델, Firefox 번역기(bergamot) wasm, KaTeX CSS, 웹 폰트 등 원래부터 CDN 을 사용하던 리소스

토크나이저 등 정적 파일을 다른 곳에서 받고 싶다면, 브라우저 개발자 도구 콘솔에서 다음과 같이 주소를 지정할 수 있습니다.
(해당 주소 아래에 원본 `public` 폴더와 같은 구조로 파일이 있어야 하며, CORS 를 허용해야 합니다.)

```js
localStorage.setItem('risu_standalone_asset_base', 'https://example.com/risu-public')
```

## 주의 사항

- **데이터는 브라우저에 저장됩니다.** 브라우저/파일 위치에 따라 저장소가 분리될 수 있으므로,
  HTML 파일을 옮기거나 다른 브라우저로 열면 데이터가 보이지 않을 수 있습니다. 설정의 백업 기능을 활용하세요.
  - Chrome/Edge: 모든 `file://` 페이지가 같은 저장소를 공유합니다.
  - Firefox: 파일 경로에 따라 저장소가 분리될 수 있습니다.
- `DecompressionStream` 을 지원하는 최신 브라우저가 필요합니다. (Chrome/Edge 80+, Firefox 113+, Safari 16.4+)
- `file://` 에서 열기 때문에 서비스 워커 기반 기능(공유 대상 등록, 에셋 캐시)은 동작하지 않습니다.
- CORS 를 허용하지 않는 API 는 Risu 프록시를 거치지 않으므로 사용할 수 없습니다.

### Risu 서버 관련 기능 제거

채팅 내용, API 키, 백업 등 어떤 데이터도 원작자가 운영하는 Risu 서버로 보내지 않도록 다음 기능을 제거했습니다.

- RisuRealm (검색·다운로드·업로드/공유, realm 링크)
- Risu 계정 로그인, 계정 동기화 저장소, 서버 자동 백업(Kei), 서버 콜드 스토리지
- 구글 드라이브 백업 (Risu 서버를 거쳐 토큰을 교환하므로) — 로컬 파일 백업/복원은 그대로 사용 가능
- 후원자 목록 페이지
- Risu 프록시(`/proxy2`)를 통한 요청 — 웹에서는 항상 직접 요청
- transformers.js 모델은 Risu 서버 대신 Hugging Face(huggingface.co)에서 직접 받습니다.

원본 사이트(risuai.xyz)에서 만든 **암호화된 백업**은 Risu 서버의 키가 있어야 풀 수 있으므로 불러올 수 없습니다.
또한 혹시 남은 코드나 플러그인이 Risu 서버로 요청하더라도 막히도록 차단 목록(`src/ts/network/risuBlocklist.ts`)을 두었습니다.

## 이 포크에서 추가한 기능

### 프롬프트 관리 (설정 → 프롬프트 관리)

- **고정 프롬프트**: 원래 코드에 고정되어 있던 프롬프트(사고 과정 지시문, 이어서 쓰기 지시문, 그룹 채팅 응답자 지정,
  기억 요약 형식, 감정 인식, 이미지 프롬프트, Iris 시스템 프롬프트, 플레이그라운드 프롬프트 등)를 바꿀 수 있습니다.
  바꾼 값만 저장되고, '기본값으로 되돌리기'로 언제든 원래대로 돌릴 수 있습니다.
- **기존 설정 프롬프트**: 메인 프롬프트, 탈옥, 글로벌 노트, 기억 요약, 번역, 답변 추천 프롬프트 등을 한곳에서 확인·수정합니다.
- **전송 프롬프트 확인**: 현재 채팅에서 AI 에게 보낼 프롬프트(시스템 프롬프트 포함)를 미리 보고,
  최근에 실제로 전송된 요청(채팅, 기억 요약, 감정 인식, 번역 등)의 메시지를 확인합니다.

새 프롬프트를 추가하려면 `src/ts/prompts/customPrompts.ts` 의 `PROMPT_DEFINITIONS` 에 항목을 추가하고,
사용하는 곳에서 `getPrompt(키)` / `fillPrompt(키, 치환값)` 으로 읽으면 화면에 자동으로 나타납니다.

### 파일 가져오기 (RisuRealm 대체)

GitHub Pages 와 HTML 파일 버전은 RisuRealm 서버에 접속할 수 없으므로(원본 사이트 주소에서만 허용),
홈 화면의 RisuRealm 자리를 **파일 가져오기**로 바꿨습니다.

- RisuRealm 등에서 직접 내려받은 파일을 **파일 선택** 버튼으로 고르거나 화면에 끌어다 놓으면 가져옵니다. 여러 파일을 한 번에 올릴 수 있습니다.
- 캐릭터 추가(+) 메뉴의 **파일에서 가져오기**로도 사용할 수 있습니다.

| 파일 | 가져오는 방식 |
|------|---------------|
| `.charx`, `.png`, `.jpg` | 캐릭터 (`이름.module.charx` 는 모듈) |
| `.risum` | 모듈 |
| `.json` | 모듈 형식(risuModule, 로어북, 정규식)이면 모듈, 아니면 캐릭터 카드 |
| `.risup` | 프롬프트 프리셋 |

구현: `src/ts/fileImport.ts`, `src/lib/UI/FileImportPanel.svelte`

### 한국어 전용

한국어 외 언어 파일을 제거했고, 화면 언어는 항상 한국어입니다. (`src/lang/ko.ts`)

## 관련 파일

- `util/viteStandalone.ts` : 단일 HTML 로 묶는 Vite 플러그인
- `vite.config.ts` : `--mode standalone` 일 때의 빌드 설정
- `src/ts/standalone.ts` : 정적 파일 경로 변환 (`publicAssetURL`, `fetchPublicAsset`)
- `src/ts/process/dynamicutils/pdfWorker.ts` : 인라인 가능한 pdf.js 워커 설정
- `src/ts/translator/bergamotTranslator.ts` : 단독 빌드용 번역기 워커 준비
- `src/ts/prompts/customPrompts.ts` : 사용자 지정 프롬프트 레지스트리
- `src/lib/Setting/Pages/CustomPromptSettings.svelte` : 프롬프트 관리 화면
- `.github/workflows/standalone-build.yml` : 빌드 · Pages 배포 · 릴리스
