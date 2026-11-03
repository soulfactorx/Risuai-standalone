/**
 * 토큰 사용량 통계 계산 (설정 → 토큰 사용량 화면에서 사용)
 */
import {
    addUsage,
    emptyUsage,
    PURPOSE_LABELS,
    type TokenUsageDaily,
    type TokenUsageEntry,
    type TokenUsageNumbers,
    type UsagePurpose,
} from "./tokenUsage"

export type UsageTotals = TokenUsageNumbers & { requests: number }

export type UsagePeriod = "today" | "7d" | "30d" | "all"

export const PERIOD_LABELS: Record<UsagePeriod, string> = {
    today: "오늘",
    "7d": "최근 7일",
    "30d": "최근 30일",
    all: "전체",
}

function emptyTotals(): UsageTotals {
    return { ...emptyUsage(), requests: 0 }
}

function dateKey(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 기간의 시작 날짜 키 (이 날짜 이상만 포함). 전체면 빈 문자열 */
export function periodStartKey(period: UsagePeriod, now = new Date()): string {
    if (period === "all") {
        return ""
    }
    const days = period === "today" ? 0 : period === "7d" ? 6 : 29
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
    return dateKey(start)
}

/** 기간의 시작 시각(ms). 전체면 0 */
export function periodStartTime(period: UsagePeriod, now = new Date()): number {
    if (period === "all") {
        return 0
    }
    const days = period === "today" ? 0 : period === "7d" ? 6 : 29
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime()
}

export interface UsageSummary {
    total: UsageTotals
    byModel: { model: string; totals: UsageTotals }[]
    byPurpose: { purpose: UsagePurpose; label: string; totals: UsageTotals }[]
    byDay: { day: string; totals: UsageTotals }[]
}

/** 날짜별 합계로 기간 통계를 만든다. */
export function summarizeDaily(daily: TokenUsageDaily | undefined, period: UsagePeriod, now = new Date()): UsageSummary {
    const start = periodStartKey(period, now)
    const total = emptyTotals()
    const byModel = new Map<string, UsageTotals>()
    const byPurpose = new Map<UsagePurpose, UsageTotals>()
    const byDay = new Map<string, UsageTotals>()

    for (const [day, buckets] of Object.entries(daily ?? {})) {
        if (start && day < start) {
            continue
        }
        for (const [key, bucket] of Object.entries(buckets)) {
            const [model, purposeRaw] = key.split("\u0001")
            const purpose = (purposeRaw in PURPOSE_LABELS ? purposeRaw : "other") as UsagePurpose
            for (const [map, k] of [[byModel, model || "알 수 없음"], [byPurpose, purpose], [byDay, day]] as [Map<string, UsageTotals>, string][]) {
                const t = map.get(k) ?? emptyTotals()
                addUsage(t, bucket)
                t.requests += bucket.requests
                map.set(k, t)
            }
            addUsage(total, bucket)
            total.requests += bucket.requests
        }
    }

    const sortByTokens = (a: UsageTotals, b: UsageTotals) => (b.input + b.output) - (a.input + a.output)
    return {
        total,
        byModel: [...byModel.entries()].map(([model, totals]) => ({ model, totals })).sort((a, b) => sortByTokens(a.totals, b.totals)),
        byPurpose: [...byPurpose.entries()].map(([purpose, totals]) => ({ purpose, label: PURPOSE_LABELS[purpose], totals })).sort((a, b) => sortByTokens(a.totals, b.totals)),
        byDay: [...byDay.entries()].map(([day, totals]) => ({ day, totals })).sort((a, b) => a.day.localeCompare(b.day)),
    }
}

/** 요청별 기록에서 캐릭터별 합계 (기록이 남아 있는 최근 요청만 대상) */
export function summarizeByCharacter(log: TokenUsageEntry[] | undefined, period: UsagePeriod, now = new Date()) {
    const start = periodStartTime(period, now)
    const map = new Map<string, UsageTotals>()
    for (const e of log ?? []) {
        if (e.time < start || !e.charName) {
            continue
        }
        const t = map.get(e.charName) ?? emptyTotals()
        addUsage(t, e)
        t.requests += 1
        map.set(e.charName, t)
    }
    return [...map.entries()]
        .map(([name, totals]) => ({ name, totals }))
        .sort((a, b) => (b.totals.input + b.totals.output) - (a.totals.input + a.totals.output))
}

/** 요청별 기록을 CSV 문자열로 만든다. */
export function usageLogToCSV(log: TokenUsageEntry[] | undefined): string {
    const header = ["시각", "용도", "모델", "서버", "캐릭터", "입력", "출력", "캐시 읽기", "캐시 쓰기", "추론"]
    const escape = (v: string | number) => {
        const s = String(v ?? "")
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = (log ?? []).map((e) => [
        new Date(e.time).toLocaleString("ko-KR"),
        PURPOSE_LABELS[e.purpose] ?? e.purpose,
        e.model,
        e.host,
        e.charName ?? "",
        e.input,
        e.output,
        e.cacheRead,
        e.cacheWrite,
        e.reasoning,
    ].map(escape).join(","))
    // 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인다.
    return "﻿" + [header.join(","), ...rows].join("\n")
}
