import "./ts/polyfill";
import "core-js/actual"
import "./ts/storage/database.svelte"
import App from "./App.svelte";
import { loadData } from "./ts/bootstrap";
import { initHotkey } from "./ts/hotkey";
import { preLoadCheck } from "./preload";
import { mount } from "svelte";
import { registerStandalonePWA } from "./ts/standalone";

window.addEventListener('vite:preloadError', (event) => {
    console.error("Chunk load error detected:", event);
    alert("서버가 업데이트되었거나 네트워크 연결이 끊어졌습니다. 페이지를 새로고침하세요.");
});

preLoadCheck()
let app = mount(App, {
    target: document.getElementById("app"),
});
loadData()
initHotkey()
document.getElementById('preloading').remove()
// 웹앱 설치 지원 (GitHub Pages 등 http(s) 에서만)
registerStandalonePWA()

export default app;