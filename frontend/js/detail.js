// ============================================================================
//  상세 페이지 — 평가 안내 / 다중 이미지 슬라이더 / 완료 체크 / Q&A
// ============================================================================
import {
  getAssignment, listComments, addComment, deleteComment,
  setCompletion, listMyCompletions,
} from "./store.js";
import { session } from "./auth.js";
import { openAssignmentForm } from "./dashboard.js";
import {
  $, el, esc, toast, openModal, confirmDialog, ddayLabel, ddayStyle,
  fmtDate, fmtDateTime, subjectColor, spinner, fileIcon, fmtBytes,
} from "./ui.js";

let _navigate = null;

export async function renderDetail(id, navigate) {
  _navigate = navigate;
  const content = $("#main-content");
  content.replaceChildren(spinner());
  try {
    const [assignment, comments, completions] = await Promise.all([
      getAssignment(id),
      listComments(id),
      listMyCompletions(session.user.id),
    ]);
    content.replaceChildren(build(assignment, comments, !!completions[id]));
  } catch (e) {
    content.replaceChildren(el(`
      <div class="max-w-2xl mx-auto px-4 py-20 text-center text-slate-500">
        <p class="text-5xl mb-3">🔍</p>
        <p class="text-sm">게시물을 찾을 수 없습니다.</p>
        <button class="mt-4 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold" onclick="location.hash='#/'">대시보드로</button>
      </div>`));
  }
}

function build(a, comments, completed) {
  const style = ddayStyle(a.due_date);
  const isNotice = a.type === "notice";
  const wrap = el(`
    <div class="max-w-2xl mx-auto px-4 pb-28 pt-4 animate-fade-in">
      <button id="back-btn" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 mb-3 transition">
        ← 뒤로
      </button>

      <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-soft overflow-hidden ring-1 ${style.ring}">
        <div class="h-1.5 ${style.bar}"></div>
        <div class="p-5 sm:p-6">
          <div class="flex items-center gap-2 mb-3 flex-wrap">
            <span class="text-xs font-bold px-2.5 py-1 rounded-full ${style.badge}">${esc(ddayLabel(a.due_date))}</span>
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
              ${isNotice ? "공지" : "학급 공통 수행평가"}</span>
            ${a.subject ? `<span class="inline-flex items-center gap-1 text-xs text-slate-500">
              <span class="w-2 h-2 rounded-full" style="background:${subjectColor(a.subject)}"></span>${esc(a.subject)}</span>` : ""}
          </div>

          <h1 class="text-xl sm:text-2xl font-bold leading-snug ${completed ? "line-through opacity-60" : ""}" id="detail-title">${esc(a.title)}</h1>
          <p class="text-sm text-slate-400 mt-2">📅 마감 ${esc(fmtDate(a.due_date))}</p>

          <div id="image-slot" class="mt-4"></div>

          ${a.description ? `
            <div class="mt-5">
              <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">평가 범위 · 상세 안내</h2>
              <p class="text-sm leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-200">${esc(a.description)}</p>
            </div>` : ""}

          ${(a.files || []).length ? `
            <div class="mt-5">
              <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">첨부 파일</h2>
              <div class="space-y-2">
                ${a.files.map((f) => `
                  <a href="${esc(f.url)}" target="_blank" rel="noopener" download="${esc(f.name)}"
                     class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition group">
                    <span class="text-xl">${fileIcon(f.name, f.type)}</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">${esc(f.name)}</p>
                      ${f.size ? `<p class="text-[11px] text-slate-400">${esc(fmtBytes(f.size))}</p>` : ""}
                    </div>
                    <span class="text-slate-400 group-hover:text-brand-600 transition text-lg">⬇️</span>
                  </a>`).join("")}
              </div>
            </div>` : ""}

          ${(a.tags || []).length ? `
            <div class="mt-4 flex flex-wrap gap-1.5">
              ${a.tags.map((t) => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">#${esc(t)}</span>`).join("")}
            </div>` : ""}

          <div class="mt-6 flex items-center gap-2">
            <button id="complete-btn" class="flex-1 py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2
              ${completed ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}">
              <span class="check-ico">${completed ? "✓" : "○"}</span>
              <span class="check-label">${completed ? "완료함" : "완료로 표시"}</span>
            </button>
            ${session.isAdmin ? `<button id="edit-btn" class="px-4 py-3 rounded-xl bg-brand-50 dark:bg-brand-500/10 text-brand-600 font-semibold text-sm transition">수정</button>` : ""}
          </div>
        </div>
      </div>

      <!-- Q&A -->
      <section class="mt-6">
        <h2 class="text-base font-bold mb-3 flex items-center gap-2">💬 Q&amp;A <span id="qna-count" class="text-xs font-normal text-slate-400"></span></h2>
        <div id="qna-list" class="space-y-3 mb-4"></div>

        <form id="qna-form" class="bg-white dark:bg-slate-900 rounded-2xl p-3 shadow-soft">
          <textarea name="body" rows="2" placeholder="질문이나 의견을 남겨보세요..."
            class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-brand-400 text-sm resize-none"></textarea>
          <div class="flex items-center justify-between mt-2">
            <label class="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
              <input type="checkbox" name="is_private" class="accent-brand-600 w-4 h-4" />
              🔒 비밀글 (관리자만 보기)
            </label>
            <button type="submit" class="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition">등록</button>
          </div>
        </form>
      </section>
    </div>`);

  // 뒤로
  wrap.querySelector("#back-btn").onclick = () => _navigate("#/");

  // 이미지 슬라이더
  if (a.images?.length) wrap.querySelector("#image-slot").appendChild(buildSlider(a.images));

  // 완료 토글
  const completeBtn = wrap.querySelector("#complete-btn");
  let isDone = completed;
  completeBtn.onclick = async () => {
    isDone = !isDone;
    try {
      await setCompletion(session.user.id, a.id, isDone);
      completeBtn.classList.toggle("bg-emerald-500", isDone);
      completeBtn.classList.toggle("text-white", isDone);
      completeBtn.classList.toggle("bg-slate-100", !isDone);
      completeBtn.classList.toggle("dark:bg-slate-800", !isDone);
      wrap.querySelector(".check-ico").textContent = isDone ? "✓" : "○";
      wrap.querySelector(".check-label").textContent = isDone ? "완료함" : "완료로 표시";
      wrap.querySelector("#detail-title").classList.toggle("line-through", isDone);
      wrap.querySelector("#detail-title").classList.toggle("opacity-60", isDone);
      toast(isDone ? "완료로 표시했어요 🎉" : "완료를 취소했어요", "success");
    } catch (err) { toast("저장 실패: " + (err?.message || ""), "error"); isDone = !isDone; }
  };

  // 관리자 수정
  wrap.querySelector("#edit-btn")?.addEventListener("click", () => openAssignmentForm(a));

  // Q&A
  const qnaList = wrap.querySelector("#qna-list");
  const qnaCount = wrap.querySelector("#qna-count");
  function renderComments(list) {
    qnaCount.textContent = list.length ? `${list.length}개` : "";
    if (!list.length) {
      qnaList.replaceChildren(el(`<p class="text-sm text-slate-400 text-center py-6">아직 질문이 없어요. 첫 질문을 남겨보세요!</p>`));
      return;
    }
    qnaList.replaceChildren(...list.map((c) => buildComment(c, list, renderComments)));
  }
  renderComments(comments);

  // 댓글 등록
  wrap.querySelector("#qna-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = form.body.value.trim();
    if (!body) { toast("내용을 입력하세요.", "warn"); return; }
    const isPrivate = form.is_private.checked;
    try {
      const created = await addComment(a.id, session.user.id, body, isPrivate);
      comments.push(created);
      renderComments(comments);
      form.reset();
      toast("등록되었습니다.", "success");
    } catch (err) { toast("등록 실패: " + (err?.message || ""), "error"); }
  };

  return wrap;
}

function buildComment(c, list, rerender) {
  const author = c.profiles?.name || "익명";
  const isAdminAuthor = c.profiles?.role === "admin";
  const mine = c.user_id === session.user.id;
  const canDelete = mine || session.isAdmin;
  const node = el(`
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-3.5 shadow-soft animate-fade-in">
      <div class="flex items-center gap-2 mb-1.5">
        <div class="w-7 h-7 rounded-full grid place-items-center text-xs font-bold text-white shrink-0"
             style="background:${isAdminAuthor ? "#4f46e5" : subjectColor(author)}">${esc(author.slice(0, 1))}</div>
        <span class="text-sm font-semibold">${esc(author)}</span>
        ${isAdminAuthor ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">관리자</span>` : ""}
        ${c.is_private ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">🔒 비밀</span>` : ""}
        <span class="text-[11px] text-slate-400 ml-auto">${esc(fmtDateTime(c.created_at))}</span>
      </div>
      <p class="text-sm leading-relaxed whitespace-pre-wrap pl-9 text-slate-700 dark:text-slate-200">${esc(c.body)}</p>
      ${canDelete ? `<div class="pl-9 mt-1.5"><button data-del class="text-[11px] text-slate-400 hover:text-rose-500 transition">삭제</button></div>` : ""}
    </div>`);

  node.querySelector("[data-del]")?.addEventListener("click", async () => {
    if (!(await confirmDialog("이 댓글을 삭제할까요?", { okText: "삭제", danger: true }))) return;
    try {
      await deleteComment(c.id);
      const idx = list.indexOf(c);
      if (idx >= 0) list.splice(idx, 1);
      rerender(list);
      toast("삭제되었습니다.", "success");
    } catch (err) { toast("삭제 실패: " + (err?.message || ""), "error"); }
  });
  return node;
}

// ---- 다중 이미지 슬라이더 뷰어 ----
function buildSlider(images) {
  const slider = el(`
    <div class="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 group">
      <div class="slider-track flex overflow-x-auto snap-x snap-mandatory aspect-video"></div>
      <button data-prev class="hidden sm:grid absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white place-items-center opacity-0 group-hover:opacity-100 transition">‹</button>
      <button data-next class="hidden sm:grid absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white place-items-center opacity-0 group-hover:opacity-100 transition">›</button>
      <div data-dots class="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5"></div>
      <span data-counter class="absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/50 text-white"></span>
    </div>`);
  const track = slider.querySelector(".slider-track");
  const dots = slider.querySelector("[data-dots]");
  const counter = slider.querySelector("[data-counter]");

  images.forEach((url, i) => {
    const img = el(`<img src="${esc(url)}" loading="lazy" class="snap-center shrink-0 w-full h-full object-contain cursor-zoom-in" />`);
    img.onclick = () => openLightbox(images, i);
    track.appendChild(img);
    const dot = el(`<span class="w-1.5 h-1.5 rounded-full bg-white/60 transition-all"></span>`);
    dots.appendChild(dot);
  });

  function update() {
    const idx = Math.round(track.scrollLeft / track.clientWidth);
    counter.textContent = `${idx + 1} / ${images.length}`;
    [...dots.children].forEach((d, i) => {
      d.classList.toggle("w-4", i === idx);
      d.classList.toggle("bg-white", i === idx);
      d.classList.toggle("bg-white/60", i !== idx);
    });
  }
  track.addEventListener("scroll", update);
  slider.querySelector("[data-prev]").onclick = () => track.scrollBy({ left: -track.clientWidth, behavior: "smooth" });
  slider.querySelector("[data-next]").onclick = () => track.scrollBy({ left: track.clientWidth, behavior: "smooth" });
  setTimeout(update, 50);
  return slider;
}

// 전체화면 라이트박스
function openLightbox(images, startIdx) {
  const node = el(`
    <div class="relative">
      <div class="slider-track flex overflow-x-auto snap-x snap-mandatory bg-black rounded-2xl" style="height:70vh"></div>
      <div data-dots class="flex justify-center gap-1.5 mt-3"></div>
    </div>`);
  const track = node.querySelector(".slider-track");
  const dots = node.querySelector("[data-dots]");
  images.forEach((url) => {
    track.appendChild(el(`<img src="${esc(url)}" class="snap-center shrink-0 w-full h-full object-contain" />`));
    dots.appendChild(el(`<span class="w-2 h-2 rounded-full bg-white/40"></span>`));
  });
  openModal(node);
  setTimeout(() => {
    track.scrollLeft = startIdx * track.clientWidth;
    const upd = () => {
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      [...dots.children].forEach((d, i) => d.classList.toggle("bg-white", i === idx));
    };
    track.addEventListener("scroll", upd); upd();
  }, 60);
}
