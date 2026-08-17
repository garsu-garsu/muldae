// 조사 전용: 9종 지수 API에서 지점 좌표를 모으고 조석관측소 166곳과의 거리를 계산한다.
// 앱 코드는 건드리지 않는다.
import { readFileSync, writeFileSync } from "node:fs";
import { STATIONS } from "../src/lib/stations-index.ts";

const key = readFileSync(".env", "utf8").match(/VITE_DATA_KEY=(.*)/)[1].trim();

const DATASETS = [
  { name: "바다낚시", path: "fcstFishingv2", op: "GetFcstFishingApiServicev2", nameKey: "seafsPstnNm", extra: [[["gubun", "갯바위"]], [["gubun", "선상"]]] },
  { name: "갯벌체험", path: "fcstMudflatv2", op: "GetFcstMudflatApiServicev2", nameKey: "mdftExpcnVlgNm", extra: [[]] },
  { name: "해수욕장", path: "fcstBeachv2", op: "GetFcstBeachApiServicev2", nameKey: "bbchNm", extra: [[]] },
  { name: "스킨스쿠버", path: "fcstSkinScubav2", op: "GetFcstSkinScubaApiServicev2", nameKey: "skscExpcnRgnNm", extra: [[]] },
  { name: "서핑", path: "fcstSurfingv2", op: "GetFcstSurfingApiServicev2", nameKey: "surfPlcNm", extra: [[]] },
  { name: "바다여행", path: "fcstSeaTripv2", op: "GetFcstSeaTripApiServicev2", nameKey: "sareaDtlNm", extra: [[]] },
  { name: "뱃멀미", path: "fcstSicknessv2", op: "GetFcstSicknessApiServicev2", nameKey: "nvgtNm", extra: [[]] },
  { name: "바다갈라짐", path: "fcstSeaSplitv2", op: "GetFcstSeaSplitApiServicev2", nameKey: "splocPstnNm", extra: [[]] },
];

let totalCalls = 0;

async function fetchAll(ds, extraParams) {
  const extraQs = extraParams.map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("");
  const url1 = `https://apis.data.go.kr/1192136/${ds.path}/${ds.op}?serviceKey=${key}&type=json&numOfRows=300&pageNo=1${extraQs}`;
  const r1 = await fetch(url1);
  totalCalls++;
  const j1 = await r1.json();
  if (!j1.body) return { points: [], error: JSON.stringify(j1).slice(0, 200) };
  const total = j1.body.totalCount;
  const pages = Math.ceil(total / 300);
  const items = [...(j1.body.items?.item ?? [])];
  for (let p = 2; p <= pages; p++) {
    const url = `https://apis.data.go.kr/1192136/${ds.path}/${ds.op}?serviceKey=${key}&type=json&numOfRows=300&pageNo=${p}${extraQs}`;
    const r = await fetch(url);
    totalCalls++;
    const j = await r.json();
    items.push(...(j.body?.items?.item ?? []));
  }
  return { points: items, total };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  const summary = {};
  for (const ds of DATASETS) {
    const byName = new Map();
    for (const extra of ds.extra) {
      const { points, error } = await fetchAll(ds, extra);
      if (error) {
        console.log(`${ds.name}: 에러 ${error}`);
        continue;
      }
      for (const it of points) {
        const nm = it[ds.nameKey];
        if (nm == null) continue;
        byName.set(nm, { lat: Number(it.lat), lon: Number(it.lot) });
      }
    }
    const pts = [...byName.entries()].map(([name, c]) => ({ name, ...c }));
    summary[ds.name] = pts;
    console.log(`${ds.name}: 지점 ${pts.length}곳`);
  }

  writeFileSync("data/khoa-points-live.json", JSON.stringify(summary, null, 2), "utf8");

  // 관측소 166곳과의 반경 겹침 계산
  const overlap = {};
  for (const [dsName, pts] of Object.entries(summary)) {
    const counts = { r5: 0, r10: 0, r20: 0 };
    for (const [, , slat, slon] of STATIONS) {
      let minDist = Infinity;
      for (const p of pts) {
        const d = haversineKm(slat, slon, p.lat, p.lon);
        if (d < minDist) minDist = d;
      }
      if (minDist <= 5) counts.r5++;
      if (minDist <= 10) counts.r10++;
      if (minDist <= 20) counts.r20++;
    }
    overlap[dsName] = counts;
  }

  console.log("\n=== 관측소 166곳 대비 반경 겹침 ===");
  for (const [name, c] of Object.entries(overlap)) {
    console.log(`${name}: 5km=${c.r5} 10km=${c.r10} 20km=${c.r20}`);
  }
  writeFileSync("data/khoa-overlap.json", JSON.stringify(overlap, null, 2), "utf8");
  console.log(`\n총 API 호출 ${totalCalls}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
