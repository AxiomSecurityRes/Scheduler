// ============================================================================
//  데이터 액세스 계층 — Supabase 테이블 / Storage CRUD
//  모든 권한 검증은 DB 의 RLS 정책이 최종 책임집니다.
// ============================================================================
import { supabase } from "./supabaseClient.js";
import { CONFIG } from "./config.js";

// ---------------- 프로필 ----------------
export async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,student_no,role")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

// ---------------- 수행평가 / 공지 (공통) ----------------
export async function listAssignments() {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function getAssignment(id) {
  const { data, error } = await supabase.from("assignments").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createAssignment(payload, userId) {
  const { data, error } = await supabase
    .from("assignments")
    .insert({ ...payload, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAssignment(id, payload) {
  const { data, error } = await supabase.from("assignments").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAssignment(id) {
  const { error } = await supabase.from("assignments").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- 개인 일정 ----------------
export async function listPersonalEvents(userId) {
  const { data, error } = await supabase
    .from("personal_events")
    .select("*")
    .eq("user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function createPersonalEvent(payload, userId) {
  const { data, error } = await supabase
    .from("personal_events")
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePersonalEvent(id, payload) {
  const { data, error } = await supabase.from("personal_events").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePersonalEvent(id) {
  const { error } = await supabase.from("personal_events").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- 완료 체크 ----------------
export async function listMyCompletions(userId) {
  const { data, error } = await supabase
    .from("completions")
    .select("assignment_id,completed")
    .eq("user_id", userId);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => { if (r.assignment_id) map[r.assignment_id] = r.completed; });
  return map;
}

export async function setCompletion(userId, assignmentId, completed) {
  const { error } = await supabase
    .from("completions")
    .upsert(
      { user_id: userId, assignment_id: assignmentId, completed, updated_at: new Date().toISOString() },
      { onConflict: "user_id,assignment_id" }
    );
  if (error) throw error;
}

// ---------------- Q&A 댓글 ----------------
export async function listComments(assignmentId) {
  // RLS 가 비밀글 가시성을 자동 필터링. 작성자 이름은 조인.
  const { data, error } = await supabase
    .from("comments")
    .select("id,body,is_private,created_at,user_id,profiles(name,role)")
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addComment(assignmentId, userId, body, isPrivate) {
  const { data, error } = await supabase
    .from("comments")
    .insert({ assignment_id: assignmentId, user_id: userId, body, is_private: isPrivate })
    .select("id,body,is_private,created_at,user_id,profiles(name,role)")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) throw error;
}

// ---------------- 알림 (인앱) ----------------
export async function listNotifications(userId) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId) {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
}

// 실시간 알림 구독
export function subscribeNotifications(userId, onInsert) {
  return supabase
    .channel("notif-" + userId)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
}

// ---------------- 이미지 업로드 (Storage) ----------------
export async function uploadImages(files, userId) {
  const urls = [];
  for (const file of files) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from(CONFIG.STORAGE_BUCKET)
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
