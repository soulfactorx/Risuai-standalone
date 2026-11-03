import { describe, expect, it } from 'vitest'
import { assertNotRisuServerUrl, isRisuServerUrl, RISU_SERVER_BLOCKED_MESSAGE } from './risuBlocklist'

describe('isRisuServerUrl', () => {
    it('Risu 운영 호스트와 하위 도메인을 차단한다', () => {
        expect(isRisuServerUrl('https://sv.risuai.xyz/proxy2')).toBe(true)
        expect(isRisuServerUrl('https://nightly.sv.risuai.xyz/hub/login')).toBe(true)
        expect(isRisuServerUrl('https://risuai.xyz/')).toBe(true)
        expect(isRisuServerUrl('https://realm.risuai.net/api/v1/download/dynamic/x')).toBe(true)
        expect(isRisuServerUrl('https://RISUAI.NET/')).toBe(true)
        expect(isRisuServerUrl('https://account.sionyw.com/oauthhelper')).toBe(true)
    })

    it('다른 호스트는 허용한다', () => {
        expect(isRisuServerUrl('https://api.openai.com/v1/chat/completions')).toBe(false)
        expect(isRisuServerUrl('https://notrisuai.xyz/')).toBe(false)
        expect(isRisuServerUrl('https://huggingface.co/Xenova/x')).toBe(false)
        expect(isRisuServerUrl('http://[::1')).toBe(false)
    })

    it('차단 대상이면 한국어 오류를 던진다', () => {
        expect(() => assertNotRisuServerUrl('https://sv.risuai.xyz/rs/x')).toThrow(RISU_SERVER_BLOCKED_MESSAGE)
        expect(() => assertNotRisuServerUrl('https://example.com/')).not.toThrow()
    })
})
