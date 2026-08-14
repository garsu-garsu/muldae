// import.meta.env?. — check:activities 같은 순수 node 스크립트는 Vite 없이
// 이 파일을 그대로 import 하는데, 거기선 import.meta.env 자체가 없어요.
export const AD_GROUP_ID_BANNER = import.meta.env?.VITE_AD_GROUP_ID_BANNER ?? "";
export const AD_GROUP_ID_BANNER_IMAGE =
  import.meta.env?.VITE_AD_GROUP_ID_BANNER_IMAGE ?? "";

/**
 * 공공데이터포털 인증키. 서버 없이 브라우저에서 조석예보 API를 바로 부르기
 * 때문에 이 키는 번들에 그대로 들어가요 — 서버를 두지 않는 대가로 감수하는
 * 절충이에요(남용 방지는 공공데이터포털의 트래픽 제한에 맡깁니다).
 */
export const DATA_KEY = import.meta.env?.VITE_DATA_KEY ?? "";
