import { alertNormal, alertSelect } from "../alert"
import { keiServerURL } from "./kei"
import { getDatabase, setDatabase } from "../storage/database.svelte"
import { requiresFullEncoderReload } from "../globalApi.svelte"

export async function autoServerBackup(){
    const db = getDatabase()
    const res = await fetch(keiServerURL() + '/autobackup/list', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            token: db.account.token
        })
    })
    if(res.status === 200){
        const json = await res.json()
        if(json.activated){
            alertNormal("계정에서 자동 백업이 활성화되었습니다. 이제 자동으로 백업되며, 백업 서버에서 데이터를 복원할 수 있습니다.")
            db.account.kei = true
            return
        }
        const backups:[string,string][] = json.backups
        let pointer = 0
        while(true){
            const slices = backups.slice(pointer, pointer + 5)
            const menu = slices.map((backup) => backup[0])
            menu.push("Next")
            menu.push("Previous")
            menu.push("Cancel")
            const selectIndex = parseInt(await alertSelect(menu))
            const selected = menu[selectIndex]
            if(selected === "Cancel"){
                break
            }
            else if(selected === "Next"){
                pointer += 5
                if(pointer >= backups.length){
                    pointer = 0
                }
            }
            else if(selected === "Previous"){
                pointer -= 5
                if(pointer < 0){
                    pointer = Math.floor(backups.length / 5) * 5
                }
            }
            else{
                const backup = backups.find((backup) => backup[0] === selected)
                if(backup){
                    const res = await fetch(keiServerURL() + '/autobackup/restore', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            token: db.account.token,
                            backup: backup[1]
                        })
                    })
                    if(res.status === 200){
                        setDatabase(await res.json())
                        requiresFullEncoderReload.state = true
                        alertNormal("복원했습니다!")
                    }
                    else{
                        alertNormal("오류: " + res.text())
                    }
                }
            }
        }
    }
    else if(res.status === 401){
        alertNormal("이 기능을 사용하려면 계정에서 Risu-Kei를 활성화하거나 GitHub에서 Risu-Kei 서버를 직접 호스팅해야 합니다.")
    }
    else{
        alertNormal("오류: " + res.text())
    }
}

let lastKeiSave = 0
export function saveDbKei() {
    try{
        let db = getDatabase()
        if(db.account.kei){
            if(Date.now() - lastKeiSave < 60000 * 5){
                return
            }
            lastKeiSave = Date.now()
            fetch(keiServerURL() + '/autobackup/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: db.account.token,
                    database: db
                })
            })
        }   
    }
    catch(e){}
}