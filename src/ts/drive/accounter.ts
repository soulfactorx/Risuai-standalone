import { hubURL } from "../characterCards"
import { getDatabase, setDatabase } from "../storage/database.svelte"
import { alertConfirm, alertError, alertMd, alertNormal, alertSelect, alertWait } from "../alert"
import { AppendableBuffer } from "../globalApi.svelte"
import { decodeRisuSave } from "../storage/risuSave"
import { saveKV } from "../storage/saveKV"
import { language } from "src/lang"
import { fetchProtectedResource } from "../sionyw"

export function risuLogin() {
    const win = window.open(hubURL + '/hub/login')
    window.addEventListener("message", (ev) => {
        if(ev.source !== win.window){
            return
        }
        console.log(ev)
        const data = JSON.parse(ev.data)
        console.log(data)
        win.close()
    })
}

export async function saveRisuAccountData() {
    const db = getDatabase()
    if(!db.account){
        alertError("로그인되어 있지 않습니다")
        return
    }
    const s = await fetch(hubURL + '/hub/account/save', {
        method: "POST",
        body: JSON.stringify({
            token: db.account.token,
            save: db.account.data
        })
    })
    if(s.status !== 200){
        alertError(await s.text())
        return
    }
}

export async function loadRisuAccountData() {
    const db = getDatabase()
    if(!db.account){
        alertError("로그인되어 있지 않습니다")
        return
    }
    const s = await fetchProtectedResource('/hub/account/load', {
        method: "POST",
    })
    if(s.status !== 200){
        alertError(await s.text())
        return
    }
    db.account.data = await s.json()
}

export async function loadRisuAccountBackup() {
    const db = getDatabase()
    if(!db.account){
        alertError("로그인되어 있지 않습니다")
        return
    }
    const s = await fetchProtectedResource('/hub/backup/list', {
        method: "GET",
    })
    if(s.status !== 200){
        alertMd(await s.text())
        return
    }
    const backups = await s.json() as string[]
    if(!backups.length){
        alertError("백업을 찾을 수 없습니다")
        return
    }
    const backupIdStr = await alertSelect([...backups.map((v) => {
        const int = parseInt(v)

        if(!isNaN(int)){
            const intl = new Intl.DateTimeFormat([
                navigator.language,
                'en-US'
            ], {
                dateStyle: 'short',
                timeStyle: 'short'
            }).format(new Date(int))
            return intl
        }

        return v
    }), "Cancel"])
    const backupIdNum = parseInt(backupIdStr)
    if(backupIdNum === backups.length){
        return
    }
    if(isNaN(backupIdNum)){
        alertError("올바르지 않은 백업 ID입니다")
        return
    }
    if(!await alertConfirm(language.backupLoadConfirm)){
        return
    }
    if(!await alertConfirm(language.backupLoadConfirm2)){
        return
    }

    const backupId = backups[backupIdNum]

    const backup = await fetchProtectedResource('/hub/backup/get', {
        method: "GET",
        headers: {
            'x-risu-key': backupId
        }
    })

    if(backup.status !== 200){
        alertError(await backup.text())
        return
    }
    else{
        const buf = new AppendableBuffer()
        const reader = backup.body.getReader()

        while(true){
            const {done, value} = await reader.read()
            if(done){
                break
            }
            alertWait("백업 다운로드 중: " + buf.buffer.byteLength)
            buf.append(value)
        }

        alertWait("백업 불러오는 중")

        const decoded = await decodeRisuSave(buf.buffer)
        setDatabase(decoded.database)
        saveKV.load(decoded.kv)
    
        alertNormal('백업을 불러왔습니다')
    }

}