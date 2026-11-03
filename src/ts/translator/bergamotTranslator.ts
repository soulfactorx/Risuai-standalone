import { LatencyOptimisedTranslator, TranslatorBacking } from "@browsermt/bergamot-translator";
import { gunzipSync } from 'fflate';
import { asBuffer } from "../util";

/** bergamot 번역기 wasm 을 받아올 CDN 주소 (단독 HTML 빌드에서만 사용) */
const BERGAMOT_VERSION = "0.4.9"
const BERGAMOT_WASM_URL = `https://cdn.jsdelivr.net/npm/@browsermt/bergamot-translator@${BERGAMOT_VERSION}/worker/bergamot-translator-worker.wasm`

/**
 * 단독 HTML 빌드용 bergamot 워커 준비.
 *
 * 원래 라이브러리는 `translator-worker.js` 파일 옆의 `bergamot-translator-worker.js/.wasm` 을
 * 상대 경로로 불러오는데, file:// 로 연 단독 HTML 에서는 이런 파일이 없다.
 * 그래서 워커 코드를 문자열로 번들에 포함한 뒤 경로 부분만 바꿔 Blob URL 로 만든다.
 * (vite 플러그인이 라이브러리의 `new Worker(...)` 를 `globalThis.__risuStandaloneBergamotWorkerURL` 로 교체함)
 */
async function prepareStandaloneBergamotWorker() {
    const g = globalThis as typeof globalThis & { __risuStandaloneBergamotWorkerURL?: string }
    if (g.__risuStandaloneBergamotWorkerURL) {
        return
    }
    const [{ default: workerSource }, { default: glueSource }] = await Promise.all([
        import("@browsermt/bergamot-translator/worker/translator-worker.js?raw"),
        import("@browsermt/bergamot-translator/worker/bergamot-translator-worker.js?raw"),
    ])
    const glueURL = URL.createObjectURL(new Blob([glueSource], { type: "text/javascript" }))
    const wasmTarget = "new URL('./bergamot-translator-worker.wasm', self.location)"
    const glueTarget = "self.importScripts('bergamot-translator-worker.js')"
    if (!workerSource.includes(wasmTarget) || !workerSource.includes(glueTarget)) {
        throw new Error("bergamot 워커 코드 형식이 예상과 다릅니다. 라이브러리 버전을 확인하세요.")
    }
    const patched = workerSource
        .replace(wasmTarget, JSON.stringify(BERGAMOT_WASM_URL))
        .replace(glueTarget, `self.importScripts(${JSON.stringify(glueURL)})`)
    g.__risuStandaloneBergamotWorkerURL = URL.createObjectURL(new Blob([patched], { type: "text/javascript" }))
}

// Cache Translations Models
class CacheDB {
    private readonly dbName: string;
    private readonly storeName: string = "cache";

    constructor(dbName: string = "cache") {
        this.dbName = dbName;
    }

    private async getDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: "url" });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async load(url: string, checksum: string): Promise<ArrayBuffer | null> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, "readonly");
            const store = transaction.objectStore(this.storeName);
            const request = store.get(url);

            request.onsuccess = () => {
                const result = request.result;
                if (result && result.checksum === checksum) {
                    resolve(result.buffer);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    async save(url: string, checksum: string, buffer: ArrayBuffer): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.put({ url, checksum, buffer });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(): Promise<void> {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// Mozilla Firefox Translations Models
class FirefoxBacking extends TranslatorBacking {
    private cache: CacheDB;
    downloadTimeout: number;

    constructor(options?) {
        const registryUrl = 'https://raw.githubusercontent.com/mozilla/firefox-translations-models/refs/heads/main/registry.json';
        options = options || {};
        options.registryUrl = options.registryUrl || registryUrl;
        super(options);
        this.cache = new CacheDB("firefox-translations-models");
    }

    async loadWorker() {
        // 빌드 상수를 직접 비교해야 일반 빌드에서 아래 코드(워커 소스 ?raw 임포트)가 제거된다.
        if (import.meta.env.MODE === "standalone") {
            await prepareStandaloneBergamotWorker();
        }
        return super.loadWorker();
    }

    async loadModelRegistery() {
        const modelUrl = 'https://media.githubusercontent.com/media/mozilla/firefox-translations-models/refs/heads/main/models';
        const registry = await super.loadModelRegistery();
        for (const entry of registry) {
            for(const name in entry.files) {
                const file = entry.files[name];
                file.name = `${modelUrl}/${file.modelType}/${entry.from}${entry.to}/${file.name}.gz`;
            }
        }
        return registry;
    }

    async fetch(url, checksum, extra) {
        const cacheBuffer = await this.cache.load(url, checksum);
        if (cacheBuffer) { return cacheBuffer; }
        const res = await fetch(url, {
            credentials: 'omit',
        });
        // Decompress GZip
        const buffer = await res.arrayBuffer();
        const decomp = await decompressGZip(buffer);
        await this.cache.save(url, checksum, asBuffer(decomp));
        return decomp;
    }
}

async function decompressGZip(buffer:ArrayBuffer) {
    if (typeof DecompressionStream !== "undefined") {
        const decompressor = new DecompressionStream('gzip');
        const stream = new Response(buffer).body.pipeThrough(decompressor);
        return await new Response(stream).arrayBuffer();
    } else {    // GZip decompression fallback
        return gunzipSync(new Uint8Array(buffer)).buffer;
    }
}

let translator = null;
let translateTask = null;

// Translate
export async function bergamotTranslate(text:string, from:string, to:string, html:boolean|null) {
    translator ??= new LatencyOptimisedTranslator({}, new FirefoxBacking())
    const result = await (translateTask = translate());
    return result.target.text;

    // Wait for previous tasks...
    async function translate() {
        await translateTask;
        return translator.translate({
            from: from, to: to,
            text: text, html: html,
        });
    }
}

// Clear Cache
export async function clearCache() {
    await new CacheDB("firefox-translations-models").clear();
}