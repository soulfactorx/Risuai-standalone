import { getDatabase } from "./database.svelte";
import { alertNormal } from "../alert";
import { language } from "src/lang";
import { isTauri, isNodeServer, isFirefox } from "src/ts/platform"

async function requestPersistantStorageMain() {
    
    if(navigator.storage && navigator.storage.persist) {

        if(await navigator.storage.persisted()) {
            return true;
        }

        //if is chromium
        //@ts-expect-error window.chrome is Chromium-specific property, not defined in Window interface
        const isChromium = window.chrome;
        if (isChromium) {
            //chromium requires notification to persist
            alertNormal("Chromium 기반 브라우저에서는 데이터를 영구 보존하려면 알림을 허용해야 합니다")
            const status = await Notification.requestPermission()
            
            if(status === 'granted') {
                return navigator.storage.persist();
            }
        }

        if(isFirefox) {
            //firefox can just ask for persist
            return navigator.storage.persist();
        }

        return false;
    }
    return false
}

export async function persistantStorageRecommended() {
    const db = getDatabase()
    if(navigator.storage && navigator.storage.persist && (!isTauri) && (!isNodeServer)) {
        if(await navigator.storage.persisted()) {
            return false;
        }
        if(db.characters.length > 5){
            return true;
        }
    }
    return false;
}

export async function requestPersistantStorage() {
    const status = await requestPersistantStorageMain();
    if(status) {
        alertNormal(language.persistentStorageSuccess)
    } else {
        alertNormal(language.persistentStorageFail)
    }
    return status;
}
