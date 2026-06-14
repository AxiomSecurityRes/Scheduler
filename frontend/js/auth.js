// ============================================================================
//  인증 — 회원가입 / 로그인 / 세션 / 로그아웃 + 로그인 화면 렌더링
// ============================================================================
import { supabase } from "./supabaseClient.js";
import { getMyProfile } from "./store.js";
import { CONFIG } from "./config.js";
import { el, esc, toast, toggleTheme, getTheme } from "./ui.js";

// 현재 세션 상태 (메모리)
export const session = {
  user: null,       // supabase user
  profile: null,    // profiles 행
  get isAdmin() { return this.profile?.role === "admin"; },
};

export async function loadSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    session.user = data.session.user;
    try {
      session.profile = await getMyProfile(session.user.id);
    } catch (e) {
      session.profile = null;
    }
  }
  return session.user;
}

export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

export async function signOut() {
  await supabase.auth.signOut();
  session.user = null;
  session.profile = null;
}

// ---- 로그인/회원가입 화면 ----
export function renderAuth(onSuccess) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const node = el(`
    <div class="flex-1 flex items-center justify-center p-4 relative
                bg-gradient-to-br from-brand-50 via-slate-50 to-brand-100
                dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <button id="auth-theme" title="테마 전환"
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/70 dark:bg-slate-800/70 backdrop-blur
               shadow-soft grid place-items-center text-lg hover:scale-105 transition">🌓</button>

      <div class="w-full max-w-sm animate-fade-in">
        <div class="text-center mb-8">
          <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700
                      grid place-items-center text-3xl shadow-glow">📚</div>
          <h1 class="text-2xl font-bold tracking-tight">8반 스케줄러</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">${esc(CONFIG.CLASS_NAME)}</p>
        </div>

        <div class="bg-white/80 dark:bg-slate-900/80 backdrop-blur rounded-3xl shadow-soft p-6 sm:p-7">
          <div class="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 mb-6">
            <button data-tab="login" class="auth-tab flex-1 py-2 rounded-lg text-sm font-semibold transition">로그인</button>
            <button data-tab="signup" class="auth-tab flex-1 py-2 rounded-lg text-sm font-semibold transition">회원가입</button>
          </div>

          <form id="auth-form" class="space-y-4">
            <div data-signup-only class="hidden space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5">이름</label>
                <input name="name" type="text" autocomplete="name"
                  class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand-400 outline-none transition"
                  placeholder="홍길동" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1.5">학번</label>
                <input name="student_no" type="text" inputmode="numeric"
                  class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700
                         bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand-400 outline-none transition"
                  placeholder="10825" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5">이메일</label>
              <input name="email" type="email" autocomplete="email" required
                class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand-400 outline-none transition"
                placeholder="student@email.com" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1.5">비밀번호</label>
              <input name="password" type="password" autocomplete="current-password" required minlength="6"
                class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand-400 outline-none transition"
                placeholder="6자 이상" />
            </div>

            <button type="submit" id="auth-submit"
              class="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold
                     shadow-soft transition flex items-center justify-center gap-2 disabled:opacity-60">
              <span class="label">로그인</span>
            </button>
          </form>

          <p class="text-[11px] text-center text-slate-400 mt-5 leading-relaxed">
            개인정보는 이름 · 학번만 수집되며, 학급 운영 목적에만 사용됩니다.
          </p>
        </div>
      </div>
    </div>`);

  app.appendChild(node);

  let mode = "login";
  const form = node.querySelector("#auth-form");
  const signupOnly = node.querySelector("[data-signup-only]");
  const submitLabel = node.querySelector("#auth-submit .label");
  const tabs = node.querySelectorAll(".auth-tab");

  function setMode(next) {
    mode = next;
    tabs.forEach((t) => {
      const active = t.dataset.tab === mode;
      t.classList.toggle("bg-white", active);
      t.classList.toggle("dark:bg-slate-700", active);
      t.classList.toggle("shadow-soft", active);
      t.classList.toggle("text-brand-600", active);
      t.classList.toggle("text-slate-500", !active);
    });
    signupOnly.classList.toggle("hidden", mode !== "signup");
    submitLabel.textContent = mode === "signup" ? "회원가입" : "로그인";
    form.password.autocomplete = mode === "signup" ? "new-password" : "current-password";
  }
  tabs.forEach((t) => (t.onclick = () => setMode(t.dataset.tab)));
  setMode("login");

  node.querySelector("#auth-theme").onclick = () => {
    toggleTheme();
    node.querySelector("#auth-theme").textContent = getTheme() === "dark" ? "🌙" : "☀️";
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = node.querySelector("#auth-submit");
    btn.disabled = true;
    const fd = new FormData(form);
    const email = fd.get("email").trim();
    const password = fd.get("password");

    try {
      if (mode === "signup") {
        const name = (fd.get("name") || "").trim();
        const student_no = (fd.get("student_no") || "").trim();
        if (!name) { toast("이름을 입력해 주세요.", "warn"); btn.disabled = false; return; }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name, student_no, role: "student" } },
        });
        if (error) throw error;
        toast("회원가입 완료! 로그인되었습니다.", "success");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await loadSession();
      if (!session.user) {
        // 이메일 인증이 켜진 경우
        toast("이메일 인증이 필요할 수 있어요. 메일함을 확인하세요.", "warn", 4000);
        btn.disabled = false;
        return;
      }
      onSuccess();
    } catch (err) {
      toast(translateAuthError(err), "error", 3500);
      btn.disabled = false;
    }
  };
}

function translateAuthError(err) {
  const m = (err?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (m.includes("already registered") || m.includes("already been")) return "이미 가입된 이메일입니다.";
  if (m.includes("password")) return "비밀번호는 6자 이상이어야 합니다.";
  if (m.includes("email")) return "올바른 이메일 형식이 아닙니다.";
  return err?.message || "오류가 발생했습니다. 다시 시도해 주세요.";
}
