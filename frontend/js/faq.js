// ============================================================================
//  FAQ — 자주 묻는 질문 (태그/검색 + 관리자 편집)
// ============================================================================
import { listFaqs, createFaq, updateFaq, deleteFaq } from "./store.js";
import { session } from "./auth.js";
import { $, el, esc, toast, openModal, confirmDialog, spinner } from "./ui.js";

let _faqs = [];
let _query = "";
let _navigate = null;

export async function renderFaq(navigate) {
  _navigate = navigate;
  const content = $("#main-content");
  content.replaceChildren(buildShell());
  const listBox = content.querySelector("#faq-list");
  listBox.replaceChildren(spinner());
  try {
    _faqs = await listFaqs();
    renderList();
  } catch (e) {
    listBox.replaceChildren(el(`<p class="text-center text-slate-400 py-16 text-sm">FAQ를 불러오지 못했습니다.</p>`));
  }
}

function buildShell() {
  const wrap = el(`
    <div class="max-w-2xl mx-auto px-4 pb-28 pt-4 animate-fade-in">
      <button id="faq-back" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 mb-3 transition">← 뒤로</button>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold flex items-center gap-2">❓ 자주 묻는 질문</h1>
        ${session.isAdmin ? `<button id="faq-add" class="px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition">+ 추가</button>` : ""}
      </div>
      <div class="relative mb-3">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <input id="faq-search" type="search" placeholder="질문·답변·#태그 검색"
          class="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900
                 focus:ring-2 focus:ring-brand-400 outline-none transition text-sm" />
      </div>
      <div id="faq-tags" class="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3"></div>
      <div id="faq-list" class="space-y-2.5"></div>
    </div>`);

  wrap.querySelector("#faq-back").onclick = () => _navigate("#/");
  wrap.querySelector("#faq-add")?.addEventListener("click", () => openFaqForm());
  wrap.querySelector("#faq-search").addEventListener("input", (e) => { _query = e.target.value.trim().toLowerCase(); renderList(); });
  return wrap;
}

function allTags() {
  const set = new Set();
  _faqs.forEach((f) => (f.tags || []).forEach((t) => set.add(t)));
  return [...set];
}

function filtered() {
  if (!_query) return _faqs;
  const q = _query.replace(/^#/, "");
  return _faqs.filter((f) =>
    f.question.toLowerCase().includes(q) ||
    f.answer.toLowerCase().includes(q) ||
    (f.tags || []).some((t) => t.toLowerCase().includes(q))
  );
}

function renderTags() {
  const box = $("#faq-tags");
  if (!box) return;
  const tags = allTags();
  if (!tags.length) { box.replaceChildren(); return; }
  box.replaceChildren(...tags.map((t) => {
    const active = _query.replace(/^#/, "") === t.toLowerCase();
    const chip = el(`<button class="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition border
      ${active ? "bg-brand-600 text-white border-brand-600" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"}">#${esc(t)}</button>`);
    chip.onclick = () => {
      _query = active ? "" : t.toLowerCase();
      const s = $("#faq-search"); if (s) s.value = active ? "" : "#" + t;
      renderList();
    };
    return chip;
  }));
}

function renderList() {
  renderTags();
  const box = $("#faq-list");
  if (!box) return;
  const list = filtered();
  if (!list.length) {
    box.replaceChildren(el(`
      <div class="text-center py-16 text-slate-400">
        <p class="text-5xl mb-3">🤔</p>
        <p class="text-sm">${_query ? "검색 결과가 없어요." : "등록된 FAQ가 없어요."}</p>
      </div>`));
    return;
  }
  box.replaceChildren(...list.map(buildItem));
}

function buildItem(f) {
  const node = el(`
    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-soft overflow-hidden">
      <button class="w-full flex items-center gap-3 p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <span class="text-brand-500 font-bold shrink-0">Q</span>
        <span class="flex-1 font-semibold text-sm">${esc(f.question)}</span>
        <span data-chev class="text-slate-300 transition-transform">▾</span>
      </button>
      <div data-body class="hidden px-4 pb-4 pl-11">
        <p class="text-sm leading-relaxed whitespace-pre-wrap text-slate-600 dark:text-slate-300">${esc(f.answer)}</p>
        ${(f.tags || []).length ? `<div class="flex flex-wrap gap-1.5 mt-3">${f.tags.map((t) => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">#${esc(t)}</span>`).join("")}</div>` : ""}
        ${session.isAdmin ? `<div class="flex gap-2 mt-3">
          <button data-edit class="text-xs font-semibold text-brand-600">수정</button>
          <button data-del class="text-xs font-semibold text-rose-500">삭제</button>
        </div>` : ""}
      </div>
    </div>`);

  const body = node.querySelector("[data-body]");
  const chev = node.querySelector("[data-chev]");
  node.querySelector("button").onclick = () => {
    const open = !body.classList.contains("hidden");
    body.classList.toggle("hidden", open);
    chev.style.transform = open ? "" : "rotate(180deg)";
  };
  node.querySelector("[data-edit]")?.addEventListener("click", (e) => { e.stopPropagation(); openFaqForm(f); });
  node.querySelector("[data-del]")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!(await confirmDialog("이 FAQ를 삭제할까요?", { okText: "삭제", danger: true }))) return;
    try {
      await deleteFaq(f.id);
      _faqs = _faqs.filter((x) => x.id !== f.id);
      renderList();
      toast("삭제되었습니다.", "success");
    } catch (err) { toast("삭제 실패: " + (err?.message || ""), "error"); }
  });
  return node;
}

function openFaqForm(existing = null) {
  const isEdit = !!existing;
  const node = el(`
    <div class="p-5">
      <h3 class="text-lg font-bold mb-4">${isEdit ? "FAQ 수정" : "FAQ 추가"}</h3>
      <form class="space-y-3.5">
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">질문 <span class="text-rose-500">*</span></label>
          <input name="question" type="text" required value="${esc(existing?.question || "")}" placeholder="예: 제출 기한을 넘기면 어떻게 되나요?"
            class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand-400 outline-none transition text-sm" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">답변 <span class="text-rose-500">*</span></label>
          <textarea name="answer" rows="4" required placeholder="답변 내용"
            class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand-400 outline-none transition text-sm resize-none">${esc(existing?.answer || "")}</textarea>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">태그 (쉼표로 구분)</label>
          <input name="tags" type="text" value="${esc((existing?.tags || []).join(", "))}" placeholder="제출기한, 지필평가"
            class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand-400 outline-none transition text-sm" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 mb-1.5">정렬 순서</label>
          <input name="sort_order" type="number" value="${esc(String(existing?.sort_order ?? 0))}"
            class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-brand-400 outline-none transition text-sm" />
        </div>
        <button type="submit" class="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition">${isEdit ? "저장" : "등록"}</button>
      </form>
    </div>`);
  const { close } = openModal(node);
  node.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      question: fd.get("question").trim(),
      answer: fd.get("answer").trim(),
      tags: parseTags(fd.get("tags")),
      sort_order: parseInt(fd.get("sort_order") || "0", 10) || 0,
    };
    if (!payload.question || !payload.answer) { toast("질문과 답변을 입력하세요.", "warn"); return; }
    try {
      if (isEdit) {
        const updated = await updateFaq(existing.id, payload);
        const idx = _faqs.findIndex((x) => x.id === existing.id);
        if (idx >= 0) _faqs[idx] = updated;
        toast("수정되었습니다.", "success");
      } else {
        const created = await createFaq(payload, session.user.id);
        _faqs.push(created);
        toast("등록되었습니다.", "success");
      }
      _faqs.sort((a, b) => (a.sort_order - b.sort_order) || (a.created_at < b.created_at ? -1 : 1));
      close();
      renderList();
    } catch (err) { toast("저장 실패: " + (err?.message || ""), "error"); }
  };
}

export function parseTags(raw) {
  return (raw || "")
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
}
