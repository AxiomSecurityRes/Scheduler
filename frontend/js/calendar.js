// ============================================================================
//  경량 월간 캘린더 뷰 — 마감일을 점/바로 표시, 날짜 클릭 시 해당일 일정
// ============================================================================
import { el, esc, ddayStyle, subjectColor } from "./ui.js";

const WD = ["일", "월", "화", "수", "목", "금", "토"];

// items: [{ kind, type, id, subject, title, due_date, completed, raw }]
// opts: { onItemClick(item) }
export function buildCalendar(items, opts = {}) {
  let cursor = new Date();
  cursor.setDate(1);
  let selected = todayKey();

  const root = el(`
    <div class="animate-fade-in">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-soft p-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <button data-prev class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 grid place-items-center transition">‹</button>
          <h3 data-title class="font-bold text-base"></h3>
          <div class="flex items-center gap-1">
            <button data-today class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition">오늘</button>
            <button data-next class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 grid place-items-center transition">›</button>
          </div>
        </div>
        <div class="grid grid-cols-7 gap-1 mb-1">
          ${WD.map((d, i) => `<div class="text-center text-[11px] font-bold py-1 ${i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-slate-400"}">${d}</div>`).join("")}
        </div>
        <div data-grid class="grid grid-cols-7 gap-1"></div>
      </div>
      <div data-day class="space-y-2"></div>
    </div>`);

  const titleEl = root.querySelector("[data-title]");
  const grid = root.querySelector("[data-grid]");
  const dayBox = root.querySelector("[data-day]");

  function byDate() {
    const map = {};
    for (const it of items) {
      if (!it.due_date) continue;
      (map[it.due_date] ||= []).push(it);
    }
    return map;
  }

  function render() {
    const map = byDate();
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    titleEl.textContent = `${year}년 ${month + 1}월`;

    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    grid.replaceChildren(...cells.map((d) => {
      if (d === null) return el(`<div></div>`);
      const key = dateKey(year, month, d);
      const dayItems = map[key] || [];
      const isToday = key === todayKey();
      const isSel = key === selected;
      const dow = new Date(year, month, d).getDay();
      const cell = el(`
        <button class="cal-cell rounded-xl border p-1 flex flex-col items-center gap-1 transition text-center
          ${isSel ? "border-brand-400 ring-1 ring-brand-300 bg-brand-50/60 dark:bg-brand-500/10" : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"}">
          <span class="text-[12px] font-semibold ${isToday ? "w-5 h-5 rounded-full bg-brand-600 text-white grid place-items-center" : dow === 0 ? "text-rose-500" : dow === 6 ? "text-blue-500" : ""}">${d}</span>
          <span class="flex flex-wrap justify-center gap-0.5 min-h-[6px]">
            ${dayItems.slice(0, 4).map((it) => {
              const c = it.kind === "personal" ? "#a855f7" : dotColor(it.due_date);
              return `<span class="w-1.5 h-1.5 rounded-full ${it.completed ? "opacity-40" : ""}" style="background:${c}"></span>`;
            }).join("")}
            ${dayItems.length > 4 ? `<span class="text-[8px] text-slate-400 leading-none">+${dayItems.length - 4}</span>` : ""}
          </span>
        </button>`);
      cell.onclick = () => { selected = key; render(); };
      return cell;
    }));

    renderDay(map[selected] || []);
  }

  function renderDay(list) {
    const label = humanDate(selected);
    if (!list.length) {
      dayBox.replaceChildren(el(`
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-soft">
          <p class="text-xs font-bold text-slate-400 mb-1">${esc(label)}</p>
          <p class="text-sm text-slate-400">이 날에는 일정이 없어요.</p>
        </div>`));
      return;
    }
    dayBox.replaceChildren(el(`<p class="text-xs font-bold text-slate-400 px-1">${esc(label)} · ${list.length}개</p>`),
      ...list.map((it) => {
        const style = ddayStyle(it.due_date);
        const row = el(`
          <button class="w-full text-left bg-white dark:bg-slate-900 rounded-2xl p-3.5 shadow-soft ring-1 ${style.ring}
                  flex items-center gap-3 transition hover:-translate-y-0.5 ${it.completed ? "opacity-55" : ""}">
            <span class="w-1.5 self-stretch rounded-full ${it.kind === "personal" ? "bg-purple-400" : style.bar}"></span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 mb-0.5">
                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full ${it.kind === "personal" ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" : "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"}">${it.kind === "personal" ? "개인" : it.type === "notice" ? "공지" : "공통"}</span>
                ${it.subject ? `<span class="inline-flex items-center gap-1 text-[11px] text-slate-500"><span class="w-1.5 h-1.5 rounded-full" style="background:${subjectColor(it.subject)}"></span>${esc(it.subject)}</span>` : ""}
              </div>
              <p class="text-sm font-semibold truncate ${it.completed ? "line-through" : ""}">${esc(it.title)}</p>
            </div>
            <span class="text-slate-300 text-sm">›</span>
          </button>`);
        row.onclick = () => opts.onItemClick && opts.onItemClick(it);
        return row;
      }));
  }

  root.querySelector("[data-prev]").onclick = () => { cursor.setMonth(cursor.getMonth() - 1); render(); };
  root.querySelector("[data-next]").onclick = () => { cursor.setMonth(cursor.getMonth() + 1); render(); };
  root.querySelector("[data-today]").onclick = () => { cursor = new Date(); cursor.setDate(1); selected = todayKey(); render(); };

  render();
  return root;
}

// ---- 날짜 유틸 ----
function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayKey() {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}
function humanDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dow = WD[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${dow})`;
}
function dotColor(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  const d = Math.round((due - today) / 86400000);
  if (d < 0) return "#94a3b8";
  if (d <= 3) return "#ef4444";
  if (d <= 7) return "#f59e0b";
  return "#10b981";
}
