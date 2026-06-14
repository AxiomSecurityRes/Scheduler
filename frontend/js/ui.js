// ============================================================================
//  UI 유틸리티 — DOM 헬퍼, 토스트, 모달, 테마, D-Day, 이스케이프 등
// ============================================================================

// ---- DOM ----
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---- HTML 이스케이프 (XSS 방지) ----
export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---- 토스트 ----
export function toast(message, type = "info", duration = 2800) {
  const colors = {
    info: "bg-slate-800 text-white",
    success: "bg-emerald-600 text-white",
    error: "bg-rose-600 text-white",
    warn: "bg-amber-500 text-white",
  };
  const icons = { info: "ℹ️", success: "✅", error: "⚠️", warn: "🔔" };
  const node = el(`
    <div class="toast ${colors[type] || colors.info} px-4 py-2.5 rounded-xl shadow-soft text-sm font-medium
                flex items-center gap-2 animate-fade-in max-w-[90vw]">
      <span>${icons[type] || ""}</span><span>${esc(message)}</span>
    </div>`);
  document.getElementById("toast-root").appendChild(node);
  setTimeout(() => {
    node.style.transition = "opacity .3s, transform .3s";
    node.style.opacity = "0";
    node.style.transform = "translateY(-8px)";
    setTimeout(() => node.remove(), 320);
  }, duration);
}

// ---- 모달 ----
export function openModal(contentNode, { onClose } = {}) {
  const root = document.getElementById("modal-root");
  const overlay = el(`
    <div class="fixed inset-0 z-[90] flex items-end sm:items-center justify-center
                bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-fade-in">
      <div class="modal-panel w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl
                  shadow-2xl max-h-[92vh] overflow-y-auto animate-slide-up sm:animate-scale-in"></div>
    </div>`);
  overlay.querySelector(".modal-panel").appendChild(contentNode);

  function close() {
    overlay.style.transition = "opacity .2s";
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener("keydown", onKey);
    if (onClose) onClose();
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", onKey);
  root.appendChild(overlay);
  return { close, overlay };
}

export function confirmDialog(message, { okText = "확인", danger = false } = {}) {
  return new Promise((resolve) => {
    const node = el(`
      <div class="p-6">
        <p class="text-base font-medium mb-6 leading-relaxed">${esc(message)}</p>
        <div class="flex gap-3 justify-end">
          <button data-cancel class="px-4 py-2 rounded-xl text-sm font-semibold
                  bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition">취소</button>
          <button data-ok class="px-4 py-2 rounded-xl text-sm font-semibold text-white transition
                  ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-600 hover:bg-brand-700"}">${esc(okText)}</button>
        </div>
      </div>`);
    const { close } = openModal(node, { onClose: () => resolve(false) });
    node.querySelector("[data-cancel]").onclick = () => { resolve(false); close(); };
    node.querySelector("[data-ok]").onclick = () => { resolve(true); close(); };
  });
}

// ---- 테마 ----
export function getTheme() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
export function toggleTheme() {
  const html = document.documentElement;
  html.classList.toggle("dark");
  const theme = getTheme();
  localStorage.setItem("theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0f172a" : "#6366f1");
  return theme;
}

// ---- 날짜 / D-Day ----
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

export function ddayLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return "기한 없음";
  if (d === 0) return "D-DAY";
  if (d > 0) return `D-${d}`;
  return `D+${-d}`;
}

// D-Day 기준 동적 색조
export function ddayStyle(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null)
    return { badge: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300", ring: "ring-slate-200 dark:ring-slate-700", bar: "bg-slate-400" };
  if (d < 0)
    return { badge: "bg-slate-300 text-slate-600 dark:bg-slate-700 dark:text-slate-400", ring: "ring-slate-200 dark:ring-slate-700", bar: "bg-slate-400" };
  if (d <= 3)
    return { badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300", ring: "ring-rose-200 dark:ring-rose-500/30", bar: "bg-rose-500" };
  if (d <= 7)
    return { badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", ring: "ring-amber-200 dark:ring-amber-500/30", bar: "bg-amber-500" };
  return { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", ring: "ring-emerald-200 dark:ring-emerald-500/30", bar: "bg-emerald-500" };
}

export function fmtDate(dateStr) {
  if (!dateStr) return "기한 없음";
  const d = new Date(dateStr + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 과목별 색상 점
export function subjectColor(subject) {
  const palette = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
  if (!subject) return "#94a3b8";
  let h = 0;
  for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) % palette.length;
  return palette[h];
}

// 파일 크기 포맷
export function fmtBytes(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)}${units[i]}`;
}

// 확장자/타입 기반 파일 아이콘
export function fileIcon(name = "", type = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (type.includes("pdf") || ext === "pdf") return "📕";
  if (["ppt", "pptx"].includes(ext)) return "📙";
  if (["doc", "docx"].includes(ext)) return "📘";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📗";
  if (["hwp", "hwpx"].includes(ext)) return "📄";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "🖼️";
  return "📎";
}

// 스피너
export function spinner(label = "불러오는 중...") {
  return el(`
    <div class="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <div class="spinner w-8 h-8"></div>
      <p class="text-sm">${esc(label)}</p>
    </div>`);
}
