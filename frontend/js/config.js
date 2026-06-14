// ============================================================================
//  공개 설정 (config.js)
//  ⚠️ 아래 값은 브라우저에 노출되어도 안전한 "공개 키" 입니다.
//     service_role 키나 VAPID 개인키는 절대 여기에 넣지 마세요.
//
//  Supabase 대시보드 > Settings > API 에서:
//    - SUPABASE_URL      : Project URL
//    - SUPABASE_ANON_KEY : anon public 키
//  VAPID_PUBLIC_KEY 는 `python -m backend.generate_vapid_keys` 결과의 PUBLIC 키.
// ============================================================================

export const CONFIG = {
  SUPABASE_URL: "https://your-project-ref.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-public-key",
  VAPID_PUBLIC_KEY: "your-vapid-public-key",

  // 백엔드 API 베이스. 프론트와 백엔드가 같은 도메인이면 "" 로 둡니다.
  API_BASE: "",

  // 첨부 이미지 Storage 버킷명
  STORAGE_BUCKET: "attachments",

  // 학급 표시명
  CLASS_NAME: "용인신촌중학교 1학년 8반",
};
