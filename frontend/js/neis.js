// ============================================================================
//  NEIS 위젯 — 오늘의 급식 + 우리 반 시간표 (대시보드 상단)
// ============================================================================
import { fetchMeal, fetchTimetable } from "./store.js";
import { el, esc } from "./ui.js";

// 위젯 컨테이너 (즉시 반환, 데이터는 비동기 채움)
export function buildNeisWidget() {
  const wrap = el(`
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      <div id="meal-card" class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-soft">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">🍱</span>
          <h3 class="font-bold text-sm">오늘의 급식</h3>
        </div>
        <div data-meal class="text-sm text-slate-500">불러오는 중...</div>
      </div>
      <div id="tt-card" class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-soft">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">📅</span>
          <h3 class="font-bold text-sm">우리 반 시간표</h3>
        </div>
        <div data-tt class="text-sm text-slate-500">불러오는 중...</div>
      </div>
    </div>`);

  loadMeal(wrap.querySelector("[data-meal]"));
  loadTimetable(wrap.querySelector("[data-tt]"));
  return wrap;
}

async function loadMeal(slot) {
  try {
    const data = await fetchMeal();
    if (!data.meals?.length) {
      slot.innerHTML = `<p class="text-slate-400">오늘은 급식 정보가 없어요.</p>`;
      return;
    }
    slot.replaceChildren(...data.meals.map((m) => el(`
      <div class="mb-2 last:mb-0">
        <p class="text-[11px] font-bold text-brand-600 mb-0.5">${esc(m.type)}</p>
        <div class="flex flex-wrap gap-1">
          ${m.dishes.map((d) => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${esc(d)}</span>`).join("")}
        </div>
        ${m.calorie ? `<p class="text-[10px] text-slate-400 mt-1">${esc(m.calorie)}</p>` : ""}
      </div>`)));
  } catch (e) {
    slot.innerHTML = `<p class="text-slate-400">급식 정보를 불러올 수 없어요.</p>`;
  }
}

async function loadTimetable(slot) {
  try {
    const data = await fetchTimetable();
    if (!data.periods?.length) {
      slot.innerHTML = `<p class="text-slate-400">시간표 정보가 없어요.</p>`;
      return;
    }
    const dlabel = data.date
      ? `${data.date.slice(4, 6)}/${data.date.slice(6, 8)}`
      : "";
    slot.replaceChildren(el(`
      <div>
        <p class="text-[10px] text-slate-400 mb-1.5">${esc(dlabel)} · ${esc(data.grade)}학년 ${esc(data.class)}반</p>
        <div class="flex flex-col gap-1">
          ${data.periods.map((p) => `
            <div class="flex items-center gap-2 text-[12px]">
              <span class="w-5 h-5 shrink-0 rounded-md bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-300 grid place-items-center text-[10px] font-bold">${esc(p.period)}</span>
              <span class="text-slate-700 dark:text-slate-200">${esc(p.subject || "-")}</span>
            </div>`).join("")}
        </div>
      </div>`));
  } catch (e) {
    slot.innerHTML = `<p class="text-slate-400">시간표를 불러올 수 없어요.</p>`;
  }
}
