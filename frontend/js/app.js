// ============================================================================
//  앱 진입점 — 부트스트랩 / 헤더 / 해시 라우터 / 설정 메뉴
// ============================================================================
import { CONFIG } from "./config.js";
import { supabase } from "./supabaseClient.js";
import { session, loadSession, signOut, renderAuth, getAccessToken } from "./auth.js";
import { renderDashboard } from "./dashboard.js";
import { renderDetail } from "./detail.js";
import {
  initNotifications, teardownNotifications, openNotificationPanel, updateBadge,
  enablePush, disablePush, isPushEnabled,
} from "./notifications.js";
import { registerServiceWorker, setupInstallPrompt, triggerInstall } from "./pwa.js";
import { $, el, esc, toast, openModal, confirmDialog, toggleTheme, getTheme } from "./ui.js";

// PWA 초기화 (로그인 여부와 무관)
registerServiceWorker();
setupInstallPrompt();

// ---- 부트스트랩 ----
(async function boot() {
  if (CONFIG.SUPABASE_URL.includes("your-project")) {
    renderSetupNotice();
    return;
  }
  await loadSession();
  if (session.user) {
    await enterApp();
  } else {
    renderAuth(enterApp);
  }

  // 인증 상태 변화 감지 (다른 탭 로그아웃 등)
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      teardownNotifications();
      renderAuth(enterApp);
    }
  });
})();

async function enterApp() {
  await loadSession();
  renderAppShell();
  await initNotifications(navigate);
  handleRoute();
}

// ============================================================================
//  앱 셸 (헤더 + 메인 컨테이너)
// ============================================================================
function renderAppShell() {
  const app = $("#app");
  app.innerHTML = "";
  const shell = el(`
    <div class="flex-1 flex flex-col">
      <header class="sticky top-0 z-30 bg-white/85 dark:bg-slate-900/85 backdrop-blur
                     border-b border-slate-200/60 dark:border-slate-800/60 pt-safe">
        <div class="max-w-3xl mx-auto px-4 h-[60px] flex items-center gap-3">
          <button id="brand" class="flex items-center gap-2 mr-auto group">
            <span class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-lg shadow-soft">📚</span>
            <div class="text-left leading-tight">
              <p class="font-bold text-[15px] group-hover:text-brand-600 transition">8반 스케줄러</p>
              <p class="text-[10px] text-slate-400">${esc(CONFIG.CLASS_NAME)}</p>
            </div>
          </button>

          <button id="theme-btn" title="테마 전환"
            class="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 grid place-items-center transition">🌓</button>

          <button id="bell-btn" title="알림" class="relative w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 grid place-items-center transition">
            🔔
            <span id="notif-badge" class="hidden absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1
                  rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">0</span>
          </button>

          <button id="menu-btn" title="설정"
            class="w-9 h-9 rounded-full bg-brand-600 text-white grid place-items-center font-bold text-sm shadow-soft transition hover:bg-brand-700">
            ${esc((session.profile?.name || "U").slice(0, 1))}
          </button>
        </div>
      </header>

      <main id="main-content" class="flex-1"></main>
    </div>`);
  app.appendChild(shell);

  shell.querySelector("#brand").onclick = () => navigate("#/");
  shell.querySelector("#theme-btn").onclick = (e) => {
    toggleTheme();
    e.currentTarget.textContent = getTheme() === "dark" ? "🌙" : "☀️";
  };
  shell.querySelector("#theme-btn").textContent = getTheme() === "dark" ? "🌙" : "☀️";
  shell.querySelector("#bell-btn").onclick = openNotificationPanel;
  shell.querySelector("#menu-btn").onclick = openSettings;
  updateBadge();
}

// ============================================================================
//  설정 메뉴
// ============================================================================
function openSettings() {
  const pushOn = isPushEnabled();
  const node = el(`
    <div class="p-5">
      <div class="flex items-center gap-3 mb-5">
        <div class="w-12 h-12 rounded-2xl bg-brand-600 text-white grid place-items-center text-xl font-bold">
          ${esc((session.profile?.name || "U").slice(0, 1))}</div>
        <div>
          <p class="font-bold text-base">${esc(session.profile?.name || "사용자")}
            ${session.isAdmin ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300 align-middle">관리자</span>` : ""}
          </p>
          <p class="text-xs text-slate-400">${esc(session.profile?.student_no ? "학번 " + session.profile.student_no : session.user?.email || "")}</p>
        </div>
      </div>

      <div class="space-y-1.5">
        <button data-act="push" class="setting-row">
          <span>🔔 푸시 알림</span>
          <span class="text-xs px-2 py-1 rounded-full ${pushOn ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}">${pushOn ? "켜짐" : "꺼짐"}</span>
        </button>
        <button data-act="install" class="setting-row"><span>📲 홈 화면에 앱 설치</span><span class="text-slate-300">›</span></button>
        <button data-act="theme" class="setting-row"><span>🌓 테마 전환</span><span class="text-xs text-slate-400">${getTheme() === "dark" ? "다크" : "라이트"}</span></button>
        ${session.isAdmin ? `<button data-act="remind" class="setting-row"><span>📣 마감 알림 지금 보내기</span><span class="text-slate-300">›</span></button>` : ""}
        <div class="h-px bg-slate-100 dark:bg-slate-800 my-2"></div>
        <button data-act="logout" class="setting-row text-rose-600"><span>🚪 로그아웃</span><span></span></button>
      </div>
      <p class="text-[11px] text-center text-slate-400 mt-5">8반 스케줄러 · v1.0.0</p>
    </div>`);

  // setting-row 스타일을 인라인 클래스로 적용
  node.querySelectorAll(".setting-row").forEach((b) =>
    b.classList.add("w-full","flex","items-center","justify-between","px-4","py-3","rounded-xl",
      "hover:bg-slate-50","dark:hover:bg-slate-800","transition","text-sm","font-medium","text-left"));

  const { close } = openModal(node);

  node.querySelector('[data-act="push"]').onclick = async () => {
    close();
    if (isPushEnabled()) await disablePush(); else await enablePush();
  };
  node.querySelector('[data-act="install"]').onclick = () => { close(); triggerInstall(); };
  node.querySelector('[data-act="theme"]').onclick = () => {
    toggleTheme();
    $("#theme-btn").textContent = getTheme() === "dark" ? "🌙" : "☀️";
    close();
  };
  node.querySelector('[data-act="remind"]')?.addEventListener("click", async () => {
    close();
    try {
      const token = await getAccessToken();
      const res = await fetch(`${CONFIG.API_BASE}/api/notifications/run-reminders`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "실패");
      toast(`알림 ${data.created || 0}건 생성, 푸시 ${data.pushed || 0}건 전송`, "success");
    } catch (e) { toast("알림 전송 실패: " + (e?.message || ""), "error"); }
  });
  node.querySelector('[data-act="logout"]').onclick = async () => {
    if (!(await confirmDialog("로그아웃 할까요?", { okText: "로그아웃" }))) return;
    teardownNotifications();
    await signOut();
    close();
    renderAuth(enterApp);
  };
}

// ============================================================================
//  해시 라우터
// ============================================================================
function navigate(hash) {
  if (location.hash === hash) handleRoute();
  else location.hash = hash;
}

function handleRoute() {
  if (!session.user) return;
  const hash = location.hash || "#/";
  const detailMatch = hash.match(/^#\/detail\/(.+)$/);
  if (detailMatch) {
    renderDetail(detailMatch[1], navigate);
  } else {
    // 대시보드: main-content 안에 렌더 (이미 렌더된 경우 데이터만 갱신)
    renderDashboard(navigate);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.addEventListener("hashchange", handleRoute);

// ============================================================================
//  설정 미완료 안내 (config.js 미설정 시)
// ============================================================================
function renderSetupNotice() {
  $("#app").innerHTML = `
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-soft p-7 text-center animate-fade-in">
        <div class="text-5xl mb-4">🛠️</div>
        <h1 class="text-xl font-bold mb-2">설정이 필요합니다</h1>
        <p class="text-sm text-slate-500 leading-relaxed mb-4">
          <code class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">frontend/js/config.js</code> 에서
          Supabase URL / anon 키 / VAPID 공개키를 입력한 뒤 새로고침하세요.
        </p>
        <p class="text-xs text-slate-400">자세한 설정은 <code>docs/DEPLOYMENT.md</code> 를 참고하세요.</p>
      </div>
    </div>`;
}
