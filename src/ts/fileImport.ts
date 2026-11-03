/**
 * 파일 가져오기 (RisuRealm 대신 사용)
 *
 * 이 포크는 RisuRealm 서버에 접속할 수 없는 환경(GitHub Pages, file://)에서 쓰기 때문에,
 * RisuRealm 등에서 직접 내려받은 파일을 올려서 사용할 수 있게 한다.
 * 파일 종류를 확장자와 내용으로 판단해 캐릭터 / 모듈 / 프리셋 가져오기로 보낸다.
 *
 * | 확장자                     | 처리                                      |
 * |----------------------------|-------------------------------------------|
 * | .charx, .png, .jpg, .jpeg  | 캐릭터 (이름이 .module.charx 면 모듈)     |
 * | .risum                     | 모듈                                      |
 * | .json                      | 모듈 형식이면 모듈, 아니면 캐릭터 카드    |
 * | .risup, .risupreset        | 프롬프트 프리셋                           |
 */
import { importCharacterProcess } from "./characterCards"
import { checkCharOrder } from "./globalApi.svelte"
import { importModuleData, isModuleLikeJSON } from "./process/modules"
import { importPreset } from "./storage/database.svelte"
import { DBState } from "./stores.svelte"

export type ImportKind = "character" | "module" | "preset" | "unknown"

export interface FileImportResult {
    name: string
    kind: ImportKind
    ok: boolean
    message: string
}

/** 파일 선택 창에서 고를 수 있는 확장자 */
export const IMPORT_ACCEPT = ".charx,.risum,.json,.png,.jpg,.jpeg,.risup,.risupreset"

const KIND_LABELS: Record<ImportKind, string> = {
    character: "캐릭터",
    module: "모듈",
    preset: "프리셋",
    unknown: "알 수 없음",
}

export function importKindLabel(kind: ImportKind): string {
    return KIND_LABELS[kind]
}

/** 가져오기 결과를 알림 창(마크다운)에 보여 줄 문자열로 만든다. */
export function formatImportResultsMd(results: FileImportResult[]): string {
    return "### 파일 가져오기 결과\n\n" + results
        .map((v) => `- ${v.ok ? "✅" : "❌"} ${v.name} (${importKindLabel(v.kind)}): ${v.message}`)
        .join("\n")
}

function extensionOf(name: string): string {
    const dot = name.lastIndexOf(".")
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ""
}

/** 파일 이름(과 JSON 내용)으로 어떤 종류로 가져올지 정한다. */
export function detectImportKind(name: string, data?: Uint8Array): ImportKind {
    // 앱의 '모듈 내보내기'는 `이름.module.charx` 파일을 만든다. 이런 파일은 모듈로 가져온다.
    if (name.toLowerCase().endsWith(".module.charx")) {
        return "module"
    }
    const ext = extensionOf(name)
    switch (ext) {
        case "charx":
        case "png":
        case "jpg":
        case "jpeg":
            return "character"
        case "risum":
            return "module"
        case "risup":
        case "risupreset":
            return "preset"
        case "json": {
            if (!data) {
                return "character"
            }
            try {
                const parsed = JSON.parse(new TextDecoder().decode(data))
                return isModuleLikeJSON(parsed) ? "module" : "character"
            } catch {
                return "unknown"
            }
        }
        default:
            return "unknown"
    }
}

/** 파일 하나를 가져온다. 오류는 결과로 돌려주고 밖으로 던지지 않는다. */
async function importOne(file: File): Promise<FileImportResult> {
    const name = file.name
    try {
        const ext = extensionOf(name)
        // charx/이미지는 용량이 클 수 있으므로 JSON 일 때만 내용을 미리 읽는다.
        const data = ext === "json" ? new Uint8Array(await file.arrayBuffer()) : undefined
        const kind = detectImportKind(name, data)

        switch (kind) {
            case "character": {
                const before = DBState.db.characters.length
                // 캐릭터 가져오기는 자체적으로 진행 상황/오류 알림을 띄운다.
                await importCharacterProcess({
                    // 확장자 판별이 소문자 기준이므로 맞춰 준다.
                    name: name.replace(/\.[^.]+$/, (m) => m.toLowerCase()),
                    data: data ?? file,
                })
                checkCharOrder()
                const added = DBState.db.characters.length - before
                return added > 0
                    ? { name, kind, ok: true, message: "캐릭터를 추가했습니다." }
                    : { name, kind, ok: false, message: "캐릭터를 가져오지 못했습니다. 지원하지 않는 형식일 수 있습니다." }
            }
            case "module": {
                const result = await importModuleData(
                    name.replace(/\.[^.]+$/, (m) => m.toLowerCase()),
                    data ?? new Uint8Array(await file.arrayBuffer()),
                )
                if (result === "ok") {
                    return { name, kind, ok: true, message: "모듈을 추가했습니다. 설정 → 모듈에서 켜고 끌 수 있습니다." }
                }
                if (result === "cancelled") {
                    return { name, kind, ok: false, message: "가져오기를 취소했습니다." }
                }
                return { name, kind, ok: false, message: "모듈 형식이 아니거나 파일이 손상되었습니다." }
            }
            case "preset": {
                await importPreset({ name, data: new Uint8Array(await file.arrayBuffer()) })
                return { name, kind, ok: true, message: "프리셋을 추가했습니다. 프리셋 목록에서 고를 수 있습니다." }
            }
            default:
                return { name, kind, ok: false, message: "지원하지 않는 파일입니다. (charx, risum, json, png, risup)" }
        }
    } catch (error) {
        console.error(error)
        return {
            name,
            kind: "unknown",
            ok: false,
            message: "가져오는 중 오류가 발생했습니다: " + (error instanceof Error ? error.message : String(error)),
        }
    }
}

/** 여러 파일을 차례대로 가져온다. */
export async function importFiles(files: ArrayLike<File>): Promise<FileImportResult[]> {
    const results: FileImportResult[] = []
    for (const file of Array.from(files)) {
        results.push(await importOne(file))
    }
    return results
}

/** 파일 선택 창을 띄워 고른 파일들을 가져온다. 선택을 취소하면 빈 배열을 돌려준다. */
export function selectAndImportFiles(): Promise<FileImportResult[]> {
    return new Promise((resolve) => {
        const input = document.createElement("input")
        input.type = "file"
        input.multiple = true
        input.accept = IMPORT_ACCEPT
        input.style.display = "none"
        let settled = false
        input.addEventListener("change", async () => {
            settled = true
            const files = input.files
            input.remove()
            resolve(files && files.length > 0 ? await importFiles(files) : [])
        })
        // 일부 브라우저는 취소 시 change 대신 cancel 이벤트를 보낸다.
        input.addEventListener("cancel", () => {
            if (!settled) {
                input.remove()
                resolve([])
            }
        })
        document.body.appendChild(input)
        input.click()
    })
}
