/**
 * 일출·일몰 데이터를 어디서 받을 수 있는지 실측.
 *
 *   node --env-file=.env scripts/probe-sun.mjs
 *
 * 1) 지금 쓰는 조석예보(data.go.kr 1192136)에 일출·일몰 항목이 끼어 있는지
 * 2) KHOA 자체 API(oceangrid)의 조석예보표에 있는지
 * 3) 한국천문연구원 출몰시각 API(B090041)를 지금 키로 부를 수 있는지
 */
const DATA_KEY = process.env.VITE_DATA_KEY;
const KHOA_KEY = process.env.KHOA_KEY;
const today = "20260817";

const show = (label, text) => {
  console.log(`\n===== ${label} =====`);
  console.log(text.length > 1200 ? `${text.slice(0, 1200)}\n…(생략)` : text);
};

async function get(label, url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    show(`${label} [HTTP ${res.status}]`, text);
    return text;
  } catch (err) {
    show(label, `요청 실패: ${String(err)}`);
    return "";
  }
}

// 1) 지금 쓰는 조석예보 — 한 지점 하루치. 응답에 뜨는 필드 이름을 그대로 본다.
await get(
  "1. data.go.kr 조석예보 tideFcstHghLw (인천 DT_0001)",
  `https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService?serviceKey=${DATA_KEY}&type=json&numOfRows=20&pageNo=1&obsPostId=DT_0001&reqDate=${today}`,
);

// 2) KHOA 자체 API 조석예보표(tideObsPreTab) — 물때표 화면과 같은 표.
await get(
  "2. KHOA oceangrid tideObsPreTab",
  `http://www.khoa.go.kr/api/oceangrid/tideObsPreTab/search.do?ServiceKey=${KHOA_KEY}&ObsCode=DT_0001&Date=${today}&ResultType=json`,
);

// 3) 한국천문연구원 출몰시각 정보 (지역명 기준).
await get(
  "3. KASI 출몰시각 getAreaRiseSetInfo (인천)",
  `https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getAreaRiseSetInfo?serviceKey=${DATA_KEY}&locdate=${today}&location=${encodeURIComponent("인천")}`,
);

// 3-2) 같은 API 의 좌표 기준 오퍼레이션. 항 좌표를 그대로 넣을 수 있으면 이게 더 맞다.
await get(
  "3-2. KASI 출몰시각 getLCRiseSetInfo (좌표 126.6,37.45)",
  `https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getLCRiseSetInfo?serviceKey=${DATA_KEY}&locdate=${today}&longitude=126.6&latitude=37.45&dnYn=Y`,
);
