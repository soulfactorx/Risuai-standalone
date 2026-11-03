# 단독 HTML 버전 (Standalone)

웹 서버나 설치 없이 **HTML 파일 하나만 브라우저로 열어서** Risuai 를 사용할 수 있는 빌드입니다.

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

### GitHub Actions 로 빌드하기

`.github/workflows/standalone-build.yml` 워크플로가 포함되어 있습니다.
Actions 탭에서 **Standalone HTML Build** 를 수동 실행하면 `risuai-standalone` 아티팩트로 HTML 파일을 받을 수 있습니다.
약관 안내를 끄려면 저장소 Settings → Secrets and variables → Actions → **Variables** 에
`VITE_RISU_LEGAL_CONFIGURED` 변수를 `TRUE` 로 직접 추가하세요.

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
- 원본 웹 버전과 마찬가지로 CORS 를 허용하지 않는 API 는 Risuai 프록시(`sv.risuai.xyz`)를 거쳐 호출됩니다.

## 관련 파일

- `util/viteStandalone.ts` : 단일 HTML 로 묶는 Vite 플러그인
- `vite.config.ts` : `--mode standalone` 일 때의 빌드 설정
- `src/ts/standalone.ts` : 정적 파일 경로 변환 (`publicAssetURL`, `fetchPublicAsset`)
- `src/ts/process/dynamicutils/pdfWorker.ts` : 인라인 가능한 pdf.js 워커 설정
- `src/ts/translator/bergamotTranslator.ts` : 단독 빌드용 번역기 워커 준비
