// ============================================================================
//  알림 — 인앱 종소리 배지 + 실시간 구독 + Web Push 구독 관리
// ============================================================================
import {
  listNotifications, markNotificationRead, markAllNotificationsRead, subscribeNotifications,
} from "./store.js";
import { session, getAccessToken } from "./auth.js";
import { CONFIG } from "./config.js";
import { $, el, esc, toast, openModal, fmtDateTime } from "./ui.js";

let _items = [];
let _channel = null;
let _navigate = null;

export async function initNotifications(navigate) {
  _navigate = navigate;
  await reload();
  // 실시간 신규 알림 구독
  if (_channel) return;
  _channel = subscribeNotifications(session.user.id, (row) => {
    _items.unshift(row);
    updateBadge();
    toast("🔔 " + (row.title || "새 알림"), "warn", 3500);
  });
}

export function teardownNotifications() {
  if (_channel) { try { _channel.unsubscribe(); } catch (e) {} _channel = null; }
  _items = [];
}

async function reload() {
  try { _items = await listNotifications(session.user.id); } catch (e) { _items = []; }
  updateBadge();
}

function unreadCount() { return _items.filter((n) => !n.is_read).length; }

export function updateBadge() {
  const badge = $("#notif-badge");
  if (!badge) return;
  const n = unreadCount();
  badge.textContent = n > 9 ? "9+" : String(n);
  badge.classList.toggle("hidden", n === 0);
}

// 종소리 클릭 → 알림 패널
export function openNotificationPanel() {
  const node = el(`
    <div class="p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold">🔔 알림</h3>
        <button id="mark-all" class="text-xs font-semibold text-brand-600 hover:underline">모두 읽음</button>
      </div>
      <div id="notif-items" class="space-y-2 max-h-[60vh] overflow-y-auto"></div>
    </div>`);
  const { close } = openModal(node);
  const box = node.querySelector("#notif-items");

  function render() {
    if (!_items.length) {
      box.replaceChildren(el(`<p class="text-sm text-slate-400 text-center py-10">알림이 없습니다.</p>`));
      return;
    }
    box.replaceChildren(..._items.map((n) => {
      const item = el(`
        <button class="w-full text-left p-3 rounded-2xl transition flex gap-3 items-start
          ${n.is_read ? "bg-slate-50 dark:bg-slate-800/50" : "bg-brand-50 dark:bg-brand-500/10"}">
          <span class="text-lg mt-0.5">${n.is_read ? "📭" : "📬"}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold ${n.is_read ? "text-slate-500" : ""}">${esc(n.title)}</p>
            ${n.body ? `<p class="text-xs text-slate-500 mt-0.5 clamp-2">${esc(n.body)}</p>` : ""}
            <p class="text-[11px] text-slate-400 mt-1">${esc(fmtDateTime(n.created_at))}</p>
          </div>
          ${n.is_read ? "" : `<span class="w-2 h-2 rounded-full bg-brand-500 mt-1.5"></span>`}
        </button>`);
      item.onclick = async () => {
        if (!n.is_read) { try { await markNotificationRead(n.id); n.is_read = true; updateBadge(); } catch (e) {} }
        close();
        if (n.link) _navigate(n.link);
      };
      return item;
    }));
  }
  render();

  node.querySelector("#mark-all").onclick = async () => {
    try {
      await markAllNotificationsRead(session.user.id);
      _items.forEach((n) => (n.is_read = true));
      updateBadge(); render();
      toast("모두 읽음 처리했어요.", "success");
    } catch (e) { toast("처리 실패", "error"); }
  };
}

// ============================================================================
//  Web Push 구독
// ============================================================================
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    toast("이 브라우저는 푸시 알림을 지원하지 않아요.", "warn");
    return false;
  }
  if (!CONFIG.VAPID_PUBLIC_KEY || CONFIG.VAPID_PUBLIC_KEY.startsWith("your-")) {
    toast("푸시 설정(VAPID)이 아직 구성되지 않았어요.", "warn");
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { toast("알림 권한이 거부되었어요.", "warn"); return false; }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY),
      });
    }
    const token = await getAccessToken();
    const res = await fetch(`${CONFIG.API_BASE}/api/notifications/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(sub.toJSON ? sub.toJSON() : sub),
    });
    if (!res.ok) throw new Error("구독 저장 실패");
    localStorage.setItem("push-enabled", "1");
    toast("푸시 알림이 켜졌어요 🔔", "success");
    return true;
  } catch (err) {
    toast("푸시 설정 실패: " + (err?.message || ""), "error");
    return false;
  }
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const token = await getAccessToken();
      await fetch(`${CONFIG.API_BASE}/api/notifications/unsubscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await sub.unsubscribe();
    }
    localStorage.removeItem("push-enabled");
    toast("푸시 알림을 껐어요.", "success");
  } catch (e) { toast("해제 실패", "error"); }
}

export function isPushEnabled() {
  return localStorage.getItem("push-enabled") === "1";
}
