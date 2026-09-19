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

  // true: 필수 동의 후 제출해야 결과가 보인다. false: 결과는 바로 보이고 제출은 선택.
  REQUIRE_CONSENT_TO_VIEW: true
};
