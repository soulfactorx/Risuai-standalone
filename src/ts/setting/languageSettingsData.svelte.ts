/**
 * Language Settings Data
 * 
 * Data-driven definition for LanguageSettings page.
 * Uses `.svelte.ts` extension to support reactive `langState` via Svelte 5 runes.
 */

import type { SettingItem } from './types';
import { isTauri } from '../platform';
import { language } from 'src/lang';
import { sleep } from '../util';
import { alertNormal, alertSelect, alertConfirm, alertError, alertWait } from '../alert';
import { downloadFile } from '../globalApi.svelte';
import { selectFileByDom } from '../util';
import { exportLLMCacheAsJSON, importLLMCacheFromJSON, clearLLMCache } from '../translator/translator';

export const langState = $state({ changed: false });

export const languageSettingsItems: SettingItem[] = [
    {
        id: 'lang.header',
        type: 'header',
        labelKey: 'language',
        options: { level: 'h2' },
    },

    // 화면 언어 선택은 제거함 (이 포크는 한국어 전용)

    // Translator Base
    {
        id: 'lang.translatorLang',
        type: 'select',
        labelKey: 'translatorLanguage',
        bindKey: 'translator',
        classes: 'mt-4',
        options: {
            selectOptions: [
                { value: '', labelKey: 'disabled' },
                { value: 'ko', label: '한국어' },
                { value: 'ru', label: '러시아어' },
                { value: 'zh', label: '중국어' },
                { value: 'zh-TW', label: '중국어 (번체)', condition: (ctx) => ctx.db.translatorType === 'google' },
                { value: 'fa', label: '페르시아어', condition: (ctx) => ctx.db.translatorType === 'google' },
                { value: 'ja', label: '일본어' },
                { value: 'fr', label: '프랑스어' },
                { value: 'es', label: '스페인어' },
                { value: 'pt', label: '포르투갈어' },
                { value: 'de', label: '독일어' },
                { value: 'id', label: '인도네시아어' },
                { value: 'ms', label: '말레이어' },
                { value: 'uk', label: '우크라이나어' },
            ],
        },
    },

    {
        id: 'lang.translatorType',
        type: 'select',
        labelKey: 'translatorType',
        bindKey: 'translatorType',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator,
        options: {
            selectOptions: [
                { value: 'google', label: 'Google' },
                { value: 'deepl', label: 'DeepL' },
                { value: 'llm', label: '보조 모델(LLM)' },
                { value: 'deeplX', label: 'DeepL X' },
                { value: 'bergamot', label: 'Firefox' },
            ],
        },
    },

    // Translator Specific Configurations
    {
        id: 'lang.deeplWebWarn',
        type: 'header',
        labelKey: 'webdeeplwarn',
        options: { level: 'warning' },
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'deepl' && !isTauri,
    },

    {
        id: 'lang.deeplKey',
        type: 'text',
        labelKey: 'deeplKey',
        bindPath: 'deeplOptions.key',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'deepl',
    },

    {
        id: 'lang.deeplFree',
        type: 'check',
        labelKey: 'deeplFreeKey',
        bindPath: 'deeplOptions.freeApi',
        classes: 'mt-2',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'deepl',
    },

    {
        id: 'lang.deeplXUrl',
        type: 'text',
        labelKey: 'deeplXUrl',
        bindPath: 'deeplXOptions.url',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'deeplX',
    },

    {
        id: 'lang.deeplXToken',
        type: 'text',
        labelKey: 'deeplXToken',
        bindPath: 'deeplXOptions.token',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'deeplX',
    },

    {
        id: 'lang.llmPresets',
        type: 'custom',
        componentId: 'TranslatorPresetSettings',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'llm',
    },

    {
        id: 'lang.googleSourceLang',
        type: 'select',
        labelKey: 'sourceLanguage',
        bindKey: 'translatorInputLanguage',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'google',
        options: {
            selectOptions: [
                { value: 'auto', label: '자동 감지' },
                { value: 'en', label: '영어' },
                { value: 'zh', label: '중국어' },
                { value: 'ja', label: '일본어' },
                { value: 'ko', label: '한국어' },
                { value: 'fr', label: '프랑스어' },
                { value: 'es', label: '스페인어' },
                { value: 'de', label: '독일어' },
                { value: 'ru', label: '러시아어' },
            ],
        },
    },

    {
        id: 'lang.bergamotHtml',
        type: 'check',
        labelKey: 'htmlTranslation',
        bindKey: 'htmlTranslation',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'bergamot',
    },

    // General Translation Options
    {
        id: 'lang.autoTranslate',
        type: 'check',
        labelKey: 'autoTranslation',
        bindKey: 'autoTranslate',
        classes: 'mt-2',
        condition: (ctx) => !!ctx.db.translator,
    },

    {
        id: 'lang.combineTranslation',
        type: 'check',
        labelKey: 'combineTranslation',
        bindKey: 'combineTranslation',
        helpKey: 'combineTranslation',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator,
    },

    {
        id: 'lang.legacyTranslation',
        type: 'check',
        labelKey: 'legacyTranslation',
        bindKey: 'legacyTranslation',
        helpKey: 'legacyTranslation',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator,
    },

    {
        id: 'lang.translateBeforeHTML',
        type: 'check',
        labelKey: 'translateBeforeHTMLFormatting',
        bindKey: 'translateBeforeHTMLFormatting',
        helpKey: 'translateBeforeHTMLFormatting',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'llm',
    },

    {
        id: 'lang.autoTranslateCachedOnly',
        type: 'check',
        labelKey: 'autoTranslateCachedOnly',
        bindKey: 'autoTranslateCachedOnly',
        helpKey: 'autoTranslateCachedOnly',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'llm',
    },

    // Translation Cache
    {
        id: 'lang.exportCache',
        type: 'button',
        labelKey: 'exportTranslationCache',
        classes: 'mt-4',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'llm',
        options: {
            onClick: async () => {
                alertWait(language.loading);
                try {
                    const cache = await exportLLMCacheAsJSON();
                    const entries = Object.keys(cache).length;
                    if (entries === 0) {
                        alertNormal(language.exportTranslationCacheEmpty);
                        return;
                    }
                    const json = JSON.stringify(cache, null, 2);
                    await downloadFile('translation_cache.json', new TextEncoder().encode(json));
                    alertNormal(language.exportTranslationCacheSuccess);
                } catch (e: any) {
                    alertError(e.message);
                }
            },
        },
    },

    {
        id: 'lang.importCache',
        type: 'button',
        labelKey: 'importTranslationCache',
        classes: 'mt-2',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'llm',
        options: {
            onClick: async () => {
                try {
                    const files = await selectFileByDom(['.json']);
                    if (!files || files.length === 0) return;
                    if (!files[0].name.endsWith('.json')) {
                        alertError('Invalid file type. Please select a .json file.');
                        return;
                    }
                    const text = await files[0].text();
                    const data = JSON.parse(text);
                    if (typeof data !== 'object' || Array.isArray(data)) {
                        alertError('Invalid JSON format');
                        return;
                    }
                    for (const [key, value] of Object.entries(data)) {
                        if (typeof key !== 'string' || typeof value !== 'string') {
                            alertError('Invalid JSON format');
                            return;
                        }
                    }
                    const confirmed = await alertConfirm(language.importTranslationCacheConfirm);
                    if (!confirmed) return;
                    alertWait(language.loading);
                    const { count, failed } = await importLLMCacheFromJSON(
                        data as Record<string, string>,
                    );
                    if (failed > 0) {
                        alertError(
                            language.importTranslationCacheFailed
                                .replace('{0}', String(count))
                                .replace('{1}', String(failed)),
                        );
                    } else {
                        alertNormal(
                            language.importTranslationCacheSuccess.replace('{0}', String(count)),
                        );
                    }
                } catch (e: any) {
                    alertError(e.message);
                }
            },
        },
    },

    {
        id: 'lang.clearCache',
        type: 'button',
        labelKey: 'clearTranslationCache',
        classes: 'mt-2',
        condition: (ctx) => !!ctx.db.translator && ctx.db.translatorType === 'llm',
        options: {
            onClick: async () => {
                try {
                    const confirmed = await alertConfirm(language.clearTranslationCacheConfirm);
                    if (!confirmed) return;
                    alertWait(language.loading);
                    await clearLLMCache();
                    alertNormal(language.clearTranslationCacheSuccess);
                } catch (e: any) {
                    alertError(e.message);
                }
            },
        },
    },
];
