// ============================================================================
//  메인 대시보드 (스케줄러) — 듀얼 뷰 / D-Day / 필터 / 완료 체크 / 추가
// ============================================================================
import {
  listAssignments, listPersonalEvents, listMyCompletions, setCompletion,
  createPersonalEvent, updatePersonalEvent, deletePersonalEvent,
  createAssignment, updateAssignment, deleteAssignment, uploadImages, uploadFiles,
} from "./store.js";
import { session } from "./auth.js";
import {
  $, el, esc, toast, openModal, confirmDialog, ddayLabel, ddayStyle,
  fmtDate, subjectColor, spinner, daysUntil, fileIcon, fmtBytes,
} from "./ui.js";
import { buildCalendar } from "./calendar.js";
import { buildNeisWidget } from "./neis.js";
import { parseTags } from "./faq.js";

// 대시보드 화면 상태
const state = {
  view: "all",        // all | class | personal
  mode: "list",       // list | calendar
  subject: "전체",
  tag: null,          // 선택된 태그 필터
  showCompleted: true,
  assignments: [],
  personal: [],
  completions: {},
};

let _navigate = null;

export async function renderDashboard(navigate) {
  _navigate = navigate;
  const app = $("#app");
  const list = $("#dash-list");
  if (list) {
    // 이미 렌더된 경우 데이터만 갱신
    await refresh();
    return;
  }
  app.querySelector("#main-content")?.replaceChildren(buildShell());
  await refresh();
}

function buildShell() {
  const wrap = el(`
    <div class="max-w-3xl mx-auto px-4 pb-28 pt-4 animate-fade-in">
      <!-- NEIS 위젯 (급식 · 시간표) -->
      <div id="neis-slot"></div>

      <!-- 필터 바 -->
      <div class="sticky top-[60px] z-20 -mx-4 px-4 py-3 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur
                  border-b border-slate-200/60 dark:border-slate-800/60">
        <div class="flex items-center gap-2 mb-3">
          <div class="flex rounded-xl bg-slate-200/70 dark:bg-slate-800 p-1 text-xs font-semibold flex-1">
            <button data-view="all" class="view-btn flex-1 py-1.5 rounded-lg transition">전체</button>
            <button data-view="class" class="view-btn flex-1 py-1.5 rounded-lg transition">학급 공통</button>
            <button data-view="personal" class="view-btn flex-1 py-1.5 rounded-lg transition">개인</button>
          </div>
          <button id="toggle-mode" title="리스트 / 캘린더 전환"
            class="w-9 h-9 rounded-xl bg-slate-200/70 dark:bg-slate-800 grid place-items-center text-sm transition">🗓️</button>
          <button id="toggle-completed" title="완료 항목 표시"
            class="w-9 h-9 rounded-xl bg-slate-200/70 dark:bg-slate-800 grid place-items-center text-sm transition">👁️</button>
        </div>
        <div id="subject-chips" class="flex gap-2 overflow-x-auto no-scrollbar pb-1"></div>
        <div id="tag-chips" class="flex gap-2 overflow-x-auto no-scrollbar pb-1 mt-2 empty:hidden"></div>
      </div>

      <!-- 요약 -->
      <div id="dash-summary" class="grid grid-cols-3 gap-3 my-4"></div>

      <!-- 목록 / 캘린더 -->
      <div id="dash-list" class="space-y-3"></div>
    </div>

    `);

  // NEIS 위젯 마운트
  wrap.querySelector("#neis-slot").appendChild(buildNeisWidget());

  // FAB 는 별도로 body 레벨에 추가
  wrap.appendChild(buildFab());

  // 이벤트 바인딩
  wrap.querySelectorAll(".view-btn").forEach((b) => {
    b.onclick = () => { state.view = b.dataset.view; syncViewButtons(wrap); renderList(); renderSummary(); };
  });
  wrap.querySelector("#toggle-mode").onclick = (e) => {
    state.mode = state.mode === "list" ? "calendar" : "list";
    e.currentTarget.textContent = state.mode === "calendar" ? "📋" : "🗓️";
    e.currentTarget.title = state.mode === "calendar" ? "리스트로 보기" : "캘린더로 보기";
    renderList();
  };
  wrap.querySelector("#toggle-completed").onclick = (e) => {
    state.showCompleted = !state.showCompleted;
    e.currentTarget.style.opacity = state.showCompleted ? "1" : "0.4";
    renderList();
  };
  syncViewButtons(wrap);
  return wrap;
}

function buildFab() {
  const fab = el(`
    <button id="fab-add" title="일정 추가"
      class="fixed bottom-6 right-5 z-40 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700
             text-white text-3xl shadow-soft grid place-items-center transition active:scale-90
             animate-scale-in">+</button>`);
  fab.onclick = openAddMenu;
  return fab;
}

function syncViewButtons(root) {
  root.querySelectorAll(".view-btn").forEach((b) => {
    const active = b.dataset.view === state.view;
    b.classList.toggle("bg-white", active);
    b.classList.toggle("dark:bg-slate-700", active);
    b.classList.toggle("shadow-soft", active);
    b.classList.toggle("text-brand-600", active);
    b.classList.toggle("text-slate-500", !active);
  });
}

async function refresh() {
  const listEl = $("#dash-list");
  if (listEl) listEl.replaceChildren(spinner());
  try {
    const [assignments, personal, completions] = await Promise.all([
      listAssignments(),
      listPersonalEvents(session.user.id),
      listMyCompletions(session.user.id),
    ]);
    state.assignments = assignments;
    state.personal = personal;
    state.completions = completions;
    renderSubjectChips();
    renderTagChips();
    renderSummary();
    renderList();
  } catch (e) {
    if (listEl) listEl.replaceChildren(errorBox(e));
  }
}

function errorBox(e) {
  return el(`
    <div class="text-center py-16 text-slate-500">
      <p class="text-4xl mb-3">😕</p>
      <p class="text-sm">데이터를 불러오지 못했습니다.</p>
      <p class="text-xs mt-1 text-slate-400">${esc(e?.message || "")}</p>
    </div>`);
}

// ---- 통합 아이템 목록 만들기 ----
function combinedItems() {
  const items = [];
  if (state.view !== "personal") {
    for (const a of state.assignments) {
      items.push({
        kind: "class",
        type: a.type,
        id: a.id,
        subject: a.subject,
        title: a.title,
        description: a.description,
        due_date: a.due_date,
        images: a.images || [],
        files: a.files || [],
        tags: a.tags || [],
        completed: !!state.completions[a.id],
        raw: a,
      });
    }
  }
  if (state.view !== "class") {
    for (const p of state.personal) {
      items.push({
        kind: "personal",
        type: "personal",
        id: p.id,
        subject: p.subject,
        title: p.title,
        description: p.description,
        due_date: p.due_date,
        images: [],
        files: [],
        tags: [],
        completed: !!p.completed,
        raw: p,
      });
    }
  }
  // 과목 필터
  let filtered = state.subject === "전체"
    ? items
    : items.filter((i) => (i.subject || "기타") === state.subject);
  // 태그 필터
  if (state.tag) filtered = filtered.filter((i) => (i.tags || []).includes(state.tag));
  if (!state.showCompleted) filtered = filtered.filter((i) => !i.completed);

  // 정렬: 마감 임박순 (기한 없는 항목은 맨 뒤), 완료는 더 뒤로
  filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const da = daysUntil(a.due_date);
    const db = daysUntil(b.due_date);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  return filtered;
}

function renderSubjectChips() {
  const box = $("#subject-chips");
  if (!box) return;
  const subjects = new Set(["전체"]);
  state.assignments.forEach((a) => a.subject && subjects.add(a.subject));
  state.personal.forEach((p) => p.subject && subjects.add(p.subject));

  box.replaceChildren(
    ...[...subjects].map((s) => {
      const active = s === state.subject;
      const chip = el(`
        <button class="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition border
          ${active
            ? "bg-brand-600 text-white border-brand-600"
            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"}">
          ${esc(s)}</button>`);
      chip.onclick = () => { state.subject = s; renderSubjectChips(); renderList(); };
      return chip;
    })
  );
}

function renderTagChips() {
  const box = $("#tag-chips");
  if (!box) return;
  const tags = new Set();
  state.assignments.forEach((a) => (a.tags || []).forEach((t) => tags.add(t)));
  if (!tags.size) { box.replaceChildren(); return; }
  box.replaceChildren(
    ...[...tags].map((t) => {
      const active = state.tag === t;
      const chip = el(`
        <button class="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition border
          ${active
            ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200"
            : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"}">#${esc(t)}</button>`);
      chip.onclick = () => { state.tag = active ? null : t; renderTagChips(); renderList(); };
      return chip;
    })
  );
}

function renderSummary() {
  const box = $("#dash-summary");
  if (!box) return;
  const items = combinedItems();
  const upcoming = items.filter((i) => { const d = daysUntil(i.due_date); return d !== null && d >= 0 && d <= 3 && !i.completed; }).length;
  const done = items.filter((i) => i.completed).length;
  const total = items.length;
  const cards = [
    { label: "전체 일정", value: total, color: "text-brand-600" },
    { label: "임박(D-3)", value: upcoming, color: "text-rose-500" },
    { label: "완료", value: done, color: "text-emerald-500" },
  ];
  box.replaceChildren(
    ...cards.map((c) => el(`
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-3.5 text-center shadow-soft">
        <p class="text-2xl font-bold ${c.color}">${c.value}</p>
        <p class="text-[11px] text-slate-500 mt-0.5">${c.label}</p>
      </div>`))
  );
}

function renderList() {
  const box = $("#dash-list");
  if (!box) return;
  const items = combinedItems();

  // 캘린더 뷰
  if (state.mode === "calendar") {
    box.classList.remove("space-y-3");
    box.replaceChildren(buildCalendar(items, {
      onItemClick: (it) => {
        if (it.kind === "class") _navigate(`#/detail/${it.id}`);
        else openEventForm("personal", it.raw);
      },
    }));
    return;
  }
  box.classList.add("space-y-3");

  if (!items.length) {
    box.replaceChildren(el(`
      <div class="text-center py-16 text-slate-400 animate-fade-in">
        <p class="text-5xl mb-3">🗓️</p>
        <p class="text-sm">표시할 일정이 없습니다.</p>
        <p class="text-xs mt-1">우측 하단 + 버튼으로 일정을 추가해 보세요.</p>
      </div>`));
    return;
  }
  box.replaceChildren(...items.map(buildCard));
}

function buildCard(item) {
  const style = ddayStyle(item.due_date);
  const isNotice = item.type === "notice";
  const card = el(`
    <article class="card-hover ${item.completed ? "is-completed" : ""}
        bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-soft ring-1 ${style.ring}
        flex gap-3 cursor-pointer animate-fade-in">
      <div class="self-stretch w-1.5 rounded-full ${style.bar}"></div>
      <button class="check-box mt-0.5 shrink-0 w-6 h-6 rounded-lg border-2 grid place-items-center
              ${item.completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-600"}"
              aria-label="완료 체크">
        ${item.completed ? "✓" : ""}
      </button>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1 flex-wrap">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}">${esc(ddayLabel(item.due_date))}</span>
          ${item.kind === "class"
            ? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">${isNotice ? "공지" : "학급 공통"}</span>`
            : `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">개인</span>`}
          ${item.subject ? `<span class="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <span class="w-2 h-2 rounded-full" style="background:${subjectColor(item.subject)}"></span>${esc(item.subject)}</span>` : ""}
          ${item.images?.length ? `<span class="text-[11px] text-slate-400">🖼️${item.images.length}</span>` : ""}
          ${item.files?.length ? `<span class="text-[11px] text-slate-400">📎${item.files.length}</span>` : ""}
        </div>
        <h3 class="completable-title font-bold text-[15px] leading-snug clamp-2">${esc(item.title)}</h3>
        ${item.description ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1 clamp-2">${esc(item.description)}</p>` : ""}
        <p class="text-[11px] text-slate-400 mt-1.5">📅 ${esc(fmtDate(item.due_date))}</p>
        ${(item.tags || []).length ? `<div class="flex flex-wrap gap-1 mt-1.5">${item.tags.map((t) => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">#${esc(t)}</span>`).join("")}</div>` : ""}
      </div>
    </article>`);

  // 완료 체크 토글
  card.querySelector(".check-box").addEventListener("click", async (e) => {
    e.stopPropagation();
    const next = !item.completed;
    try {
      if (item.kind === "class") {
        await setCompletion(session.user.id, item.id, next);
        state.completions[item.id] = next;
      } else {
        await updatePersonalEvent(item.id, { completed: next });
        const p = state.personal.find((x) => x.id === item.id);
        if (p) p.completed = next;
      }
      renderSummary();
      renderList();
    } catch (err) {
      toast("저장 실패: " + (err?.message || ""), "error");
    }
  });

  // 카드 클릭 → 상세 (학급 공통/공지) / 개인일정은 편집
  card.addEventListener("click", () => {
    if (item.kind === "class") _navigate(`#/detail/${item.id}`);
    else openEventForm("personal", item.raw);
  });
  return card;
}

// ============================================================================
//  추가 메뉴 & 폼
// ============================================================================
function openAddMenu() {
  if (!session.isAdmin) { openEventForm("personal"); return; }
  const node = el(`
    <div class="p-5">
      <h3 class="text-lg font-bold mb-4">무엇을 추가할까요?</h3>
      <div class="space-y-2.5">
        <button data-pick="assignment" class="w-full flex items-center gap-3 p-4 rounded-2xl text-left
            bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20 transition">
          <span class="text-2xl">📝</span>
          <div><p class="font-semibold">학급 공통 수행평가 · 공지</p>
          <p class="text-xs text-slate-500">전체 학급에게 공유됩니다 (관리자)</p></div>
        </button>
        <button data-pick="personal" class="w-full flex items-center gap-3 p-4 rounded-2xl text-left
            bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition">
          <span class="text-2xl">📌</span>
          <div><p class="font-semibold">개인 일정</p>
          <p class="text-xs text-slate-500">나에게만 보이는 학원·공부 일정</p></div>
        </button>
      </div>
    </div>`);
  const { close } = openModal(node);
  node.querySelector('[data-pick="assignment"]').onclick = () => { close(); openAssignmentForm(); };
  node.querySelector('[data-pick="personal"]').onclick = () => { close(); openEventForm("personal"); };
}

// ---- 개인 일정 폼 ----
function openEventForm(kind, existing = null) {
  const isEdit = !!existing;
  const node = el(`
    <div class="p-5">
      <h3 class="text-lg font-bold mb-4">${isEdit ? "개인 일정 수정" : "개인 일정 추가"}</h3>
      <form class="space-y-3.5">
        ${fieldText("title", "제목", existing?.title, "예: 영어 단어시험 대비", true)}
        ${fieldText("subject", "과목 / 분류", existing?.subject, "예: 영어, 수학학원")}
        ${fieldDate("due_date", "날짜", existing?.due_date)}
        ${fieldArea("description", "메모", existing?.description, "상세 내용 (선택)")}
        <div class="flex gap-2 pt-2">
          ${isEdit ? `<button type="button" data-del class="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 font-semibold text-sm">삭제</button>` : ""}
          <button type="submit" class="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition">
            ${isEdit ? "저장" : "추가"}</button>
        </div>
      </form>
    </div>`);
  const { close } = openModal(node);
  const form = node.querySelector("form");

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      title: fd.get("title").trim(),
      subject: (fd.get("subject") || "").trim() || null,
      due_date: fd.get("due_date") || null,
      description: (fd.get("description") || "").trim() || null,
    };
    if (!payload.title) { toast("제목을 입력하세요.", "warn"); return; }
    try {
      if (isEdit) {
        const updated = await updatePersonalEvent(existing.id, payload);
        Object.assign(existing, updated);
        toast("수정되었습니다.", "success");
      } else {
        const created = await createPersonalEvent(payload, session.user.id);
        state.personal.push(created);
        toast("추가되었습니다.", "success");
      }
      close();
      renderSubjectChips(); renderTagChips(); renderSummary(); renderList();
    } catch (err) { toast("저장 실패: " + (err?.message || ""), "error"); }
  };

  node.querySelector("[data-del]")?.addEventListener("click", async () => {
    if (!(await confirmDialog("이 개인 일정을 삭제할까요?", { okText: "삭제", danger: true }))) return;
    try {
      await deletePersonalEvent(existing.id);
      state.personal = state.personal.filter((x) => x.id !== existing.id);
      toast("삭제되었습니다.", "success");
      close(); renderSummary(); renderList();
    } catch (err) { toast("삭제 실패: " + (err?.message || ""), "error"); }
  });
}

// ---- 학급 공통(수행평가/공지) 폼 (관리자) ----
export function openAssignmentForm(existing = null) {
  const isEdit = !!existing;
  let images = existing?.images ? [...existing.images] : [];
  let docs = existing?.files ? [...existing.files] : [];

  const node = el(`
    <div class="p-5">
      <h3 class="text-lg font-bold mb-4">${isEdit ? "수행평가 · 공지 수정" : "수행평가 · 공지 추가"}</h3>
      <form class="space-y-3.5">
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">유형</label>
          <div class="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-sm font-semibold">
            <label class="flex-1"><input type="radio" name="type" value="exam" class="peer hidden" ${(!existing || existing.type === "exam") ? "checked" : ""}/>
              <span class="block text-center py-2 rounded-lg cursor-pointer peer-checked:bg-white dark:peer-checked:bg-slate-700 peer-checked:text-brand-600 transition">수행평가</span></label>
            <label class="flex-1"><input type="radio" name="type" value="notice" class="peer hidden" ${existing?.type === "notice" ? "checked" : ""}/>
              <span class="block text-center py-2 rounded-lg cursor-pointer peer-checked:bg-white dark:peer-checked:bg-slate-700 peer-checked:text-brand-600 transition">공지</span></label>
          </div>
        </div>
        ${fieldText("title", "제목", existing?.title, "예: 국어 수행평가 - 시 창작", true)}
        ${fieldText("subject", "과목", existing?.subject, "예: 국어")}
        ${fieldDate("due_date", "마감일", existing?.due_date)}
        ${fieldArea("description", "평가 범위 / 상세 안내", existing?.description, "교과서 1~3단원, A4 1장 분량 ...")}
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">참고 이미지 (여러 장)</label>
          <div data-thumbs class="flex gap-2 flex-wrap mb-2"></div>
          <label class="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600
                  text-sm text-slate-500 cursor-pointer hover:border-brand-400 transition">
            <span>📷 이미지 추가</span>
            <input type="file" accept="image/*" multiple class="hidden" data-file />
          </label>
          <span data-uploading class="text-xs text-brand-500 ml-2 hidden">업로드 중...</span>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">첨부 문서 (PDF · HWPX · PPTX 등)</label>
          <div data-docs class="space-y-1.5 mb-2"></div>
          <label class="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600
                  text-sm text-slate-500 cursor-pointer hover:border-brand-400 transition">
            <span>📎 파일 추가</span>
            <input type="file" accept=".pdf,.hwp,.hwpx,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.zip,.txt" multiple class="hidden" data-docfile />
          </label>
          <span data-docuploading class="text-xs text-brand-500 ml-2 hidden">업로드 중...</span>
        </div>
        ${fieldText("tags", "태그 (쉼표로 구분)", (existing?.tags || []).join(", "), "수행평가양식, 제출기한")}
        <div class="flex gap-2 pt-2">
          ${isEdit ? `<button type="button" data-del class="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 font-semibold text-sm">삭제</button>` : ""}
          <button type="submit" class="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition">
            ${isEdit ? "저장" : "등록"}</button>
        </div>
      </form>
    </div>`);
  const { close } = openModal(node);
  const form = node.querySelector("form");
  const thumbs = node.querySelector("[data-thumbs]");
  const uploading = node.querySelector("[data-uploading]");

  function renderThumbs() {
    thumbs.replaceChildren(...images.map((url, i) => {
      const t = el(`
        <div class="relative w-16 h-16 rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
          <img src="${esc(url)}" class="w-full h-full object-cover" />
          <button type="button" class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-xs grid place-items-center">×</button>
        </div>`);
      t.querySelector("button").onclick = () => { images.splice(i, 1); renderThumbs(); };
      return t;
    }));
  }
  renderThumbs();

  node.querySelector("[data-file]").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    uploading.classList.remove("hidden");
    try {
      const urls = await uploadImages(files, session.user.id);
      images.push(...urls);
      renderThumbs();
    } catch (err) { toast("이미지 업로드 실패: " + (err?.message || ""), "error"); }
    finally { uploading.classList.add("hidden"); e.target.value = ""; }
  });

  // 문서 첨부
  const docsBox = node.querySelector("[data-docs]");
  const docUploading = node.querySelector("[data-docuploading]");
  function renderDocs() {
    docsBox.replaceChildren(...docs.map((f, i) => {
      const row = el(`
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm">
          <span>${fileIcon(f.name, f.type)}</span>
          <span class="flex-1 min-w-0 truncate">${esc(f.name)}</span>
          <span class="text-[11px] text-slate-400 shrink-0">${esc(fmtBytes(f.size))}</span>
          <button type="button" class="w-5 h-5 rounded-full bg-slate-300/60 dark:bg-slate-600 text-xs grid place-items-center shrink-0">×</button>
        </div>`);
      row.querySelector("button").onclick = () => { docs.splice(i, 1); renderDocs(); };
      return row;
    }));
  }
  renderDocs();

  node.querySelector("[data-docfile]").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    docUploading.classList.remove("hidden");
    try {
      const metas = await uploadFiles(files, session.user.id);
      docs.push(...metas);
      renderDocs();
    } catch (err) { toast("파일 업로드 실패: " + (err?.message || ""), "error"); }
    finally { docUploading.classList.add("hidden"); e.target.value = ""; }
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      type: fd.get("type"),
      title: fd.get("title").trim(),
      subject: (fd.get("subject") || "").trim() || null,
      due_date: fd.get("due_date") || null,
      description: (fd.get("description") || "").trim() || null,
      images,
      files: docs,
      tags: parseTags(fd.get("tags")),
    };
    if (!payload.title) { toast("제목을 입력하세요.", "warn"); return; }
    try {
      if (isEdit) {
        const updated = await updateAssignment(existing.id, payload);
        const idx = state.assignments.findIndex((a) => a.id === existing.id);
        if (idx >= 0) state.assignments[idx] = updated;
        toast("수정되었습니다.", "success");
      } else {
        const created = await createAssignment(payload, session.user.id);
        state.assignments.push(created);
        toast("등록되었습니다.", "success");
      }
      close();
      renderSubjectChips(); renderTagChips(); renderSummary(); renderList();
    } catch (err) { toast("저장 실패: " + (err?.message || ""), "error"); }
  };

  node.querySelector("[data-del]")?.addEventListener("click", async () => {
    if (!(await confirmDialog("이 수행평가/공지를 삭제할까요? 관련 댓글도 삭제됩니다.", { okText: "삭제", danger: true }))) return;
    try {
      await deleteAssignment(existing.id);
      state.assignments = state.assignments.filter((a) => a.id !== existing.id);
      toast("삭제되었습니다.", "success");
      close(); renderSubjectChips(); renderTagChips(); renderSummary(); renderList();
    } catch (err) { toast("삭제 실패: " + (err?.message || ""), "error"); }
  });
}

// 폼 필드 헬퍼
function fieldText(name, label, value, ph, required = false) {
  return `<div>
    <label class="block text-xs font-semibold text-slate-500 mb-1.5">${label}${required ? ' <span class="text-rose-500">*</span>' : ""}</label>
    <input name="${name}" type="text" value="${esc(value || "")}" placeholder="${esc(ph || "")}" ${required ? "required" : ""}
      class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800
             focus:ring-2 focus:ring-brand-400 outline-none transition text-sm" />
  </div>`;
}
function fieldDate(name, label, value) {
  return `<div>
    <label class="block text-xs font-semibold text-slate-500 mb-1.5">${label}</label>
    <input name="${name}" type="date" value="${esc(value || "")}"
      class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800
             focus:ring-2 focus:ring-brand-400 outline-none transition text-sm" />
  </div>`;
}
function fieldArea(name, label, value, ph) {
  return `<div>
    <label class="block text-xs font-semibold text-slate-500 mb-1.5">${label}</label>
    <textarea name="${name}" rows="3" placeholder="${esc(ph || "")}"
      class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800
             focus:ring-2 focus:ring-brand-400 outline-none transition text-sm resize-none">${esc(value || "")}</textarea>
  </div>`;
}
