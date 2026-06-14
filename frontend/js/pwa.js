// ============================================================================
//  PWA — Service Worker 등록 + 설치 프롬프트(Add to Home Screen)
// ============================================================================
import { el, toast } from "./ui.js";

let deferredPrompt = null;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      // 새 버전 감지
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateToast(reg);
          }
        });
      });
    } catch (e) {
      console.warn("SW 등록 실패:", e);
    }
  });

  // SW → 페이지 내비게이션 메시지 (알림 클릭 시)
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "navigate" && event.data.url) {
      location.hash = event.data.url.startsWith("#") ? event.data.url : "#" + event.data.url;
    }
  });
}

function showUpdateToast(reg) {
  const node = el(`
    <div class="toast bg-brand-600 text-white px-4 py-2.5 rounded-xl shadow-soft text-sm font-medium flex items-center gap-3">
      <span>🔄 새 버전이 있어요</span>
      <button class="underline font-bold">업데이트</button>
    </div>`);
  node.querySelector("button").onclick = () => {
    reg.waiting?.postMessage("SKIP_WAITING");
    location.reload();
  };
  document.getElementById("toast-root").appendChild(node);
}

// 설치 프롬프트 캡처
export function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideInstallButton();
    toast("앱이 설치되었어요! 🎉", "success");
  });
}

function showInstallButton() {
  if (document.getElementById("install-btn")) return;
  const btn = el(`
    <button id="install-btn"
      class="fixed bottom-24 right-5 z-40 px-4 py-2.5 rounded-full bg-slate-900 dark:bg-white
             text-white dark:text-slate-900 text-sm font-semibold shadow-soft flex items-center gap-2
             animate-fade-in">📲 앱 설치</button>`);
  btn.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    hideInstallButton();
  };
  document.body.appendChild(btn);
}

function hideInstallButton() {
  document.getElementById("install-btn")?.remove();
}

export function canInstall() {
  return !!deferredPrompt;
}

export function triggerInstall() {
  if (!deferredPrompt) {
    toast("이미 설치되었거나 설치를 지원하지 않는 환경이에요.", "info");
    return;
  }
  deferredPrompt.prompt();
}
