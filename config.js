/* 공개 웹페이지 설정. 값만 바꾸면 화면과 동의문에 바로 반영된다. */
window.SITE_CONFIG = {
  // 구글 Apps Script 웹 앱 주소 (구글드라이브_연결방법.md 참고). 비어 있으면 제출 내용이 저장되지 않는 시험 모드로 동작한다.
  SUBMIT_URL: "https://script.google.com/macros/s/AKfycbydbuoK4GgBk54XaTuvtCIyqa_Z6RUX6KQtNkbgMvFk231I7dcR7Sgtm9jDtpOcuqP0QQ/exec",

  SITE_TITLE: "돌려받을 세금과 지원금, 한 번에 확인",
  FIRM_TEL: "062-710-4722",          // 첫 화면의 전화 걸기 단추. 비우면 단추가 안 나온다
  FIRM_NAME: "세무회계홍인",
  FIRM_CONTACT: "062-710-4722 / jsktax0509@naver.com",               // 예: "02-000-0000 / help@example.com" (개인정보 문의처로 동의문에 표시)

  // 동의문에 들어가는 값
  CONSENT_VERSION: "2026-09-19-3",   // 세금 환급 확인 항목, 사업자등록번호, 유입 경로, 세무·경정청구 서비스 안내를 추가한 판

  // 구글 시트에 '유입 경로, 상담 요청, 세금 환급 진단, 세금 환급 입력, 사업자등록번호' 칸이 있으면 true (2026-09-19 웹 앱 버전 3부터 있음).
  // false 로 두면 같은 내용이 시트의 '추가 정보' 칸에 함께 적힌다.
  SHEET_HAS_TAX_COLUMNS: true,
  RETENTION: "수집일로부터 1년",      // 필수 동의 항목의 보유·이용 기간
  MARKETING_RETENTION: "수신 동의 철회 시까지 (최대 수집일로부터 1년)",

  // 개인정보 처리방침(privacy.html)에 들어가는 값. 정식 공개 때 보관 위치와 시행일을 확정하고 POLICY_FINAL 을 true 로 바꾸면 '초안' 표시가 사라진다.
  STORAGE_NOTE: "수집한 정보는 세무회계홍인이 관리하는 Google Drive(Google LLC의 클라우드, 국외 서버 포함)에 보관됩니다. 정식 공개 때 사무소 내부 시스템으로 옮기면 이 내용을 고쳐 알립니다.",
  PRIVACY_OFFICER: "대표 세무사 조상권",
  POLICY_SINCE: "",
  POLICY_FINAL: false,

  // 거래처용 알림 수신 동의·설문 화면(survey.html). CONSENT_URL 이 비어 있으면 시안 모드라 아무 데도 보내지 않는다.
  // 대표님이 질문과 동의문을 승인하고 받는 곳이 준비된 뒤에만 채운다.
  CONSENT_URL: "",
  SURVEY_CONSENT_VERSION: "draft-2026-09-19",

  // true: 필수 동의 후 제출해야 결과가 보인다. false: 결과는 바로 보이고 제출은 선택.
  REQUIRE_CONSENT_TO_VIEW: true
};
