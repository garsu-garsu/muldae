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

/**
 * 배경지도 타일 주소. OpenStreetMap — 인증키도 도메인 등록도 필요 없어요.
 * ⚠️ OSM 공식 타일 서버는 대량 트래픽을 허용하지 않아요.
 *    ponytail: 출시하고 트래픽이 붙으면 자체 타일 제공자로 옮기세요.
 */
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = "© OpenStreetMap 기여자";
