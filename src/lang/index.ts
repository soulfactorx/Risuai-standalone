import { languageKorean } from "./ko";

/**
 * 화면 문구 (한국어 전용)
 *
 * 이 포크는 한국어로만 사용하므로 다른 언어 파일은 제거했다.
 * 기존 코드와의 호환을 위해 `language` 와 `changeLanguage` 이름은 그대로 둔다.
 */
export let language: typeof languageKorean = languageKorean

/** 언어 변경 (한국어 전용이므로 항상 한국어를 사용한다) */
export function changeLanguage(_lang?: string) {
    language = languageKorean
}
