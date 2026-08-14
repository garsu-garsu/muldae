/**
 * 예보지점 표 굽기 (1회성 배치 — 지점이 늘거나 줄지 않는 한 다시 돌릴 일 없어요)
 *
 *   KHOA_KEY=발급키 node scripts/build-stations.mjs
 *
 * data/obs-codes.txt 에 적힌 예보지점 코드마다:
 *   1) 이름·좌표를 API 응답에서 그대로 가져오고
 *   2) 1년치를 표본으로 나눠 조차(만조-간조)를 모아 25/75 백분위을 구합니다.
 * 조석은 천문학적으로 결정돼요. 그래서 하루 걸러 다 부르지 않고 15일 간격
 * 표본(연 24~25개)만으로도 그 지점의 연중 조차 분포를 충분히 대표할 수 있습니다.
 * 결과는 src/lib/stations-index.ts 에 커밋되고, 앱은 그날의 만조·간조 시각만
 * 런타임에 API로 받습니다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CODES_PATH = resolve(HERE, "../data/obs-codes.txt");
const OUT_PATH = resolve(HERE, "../src/lib/stations-index.ts");
const BASE = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";

/** 15일 간격 표본. 365일 / 15 ≈ 24~25개. */
const SAMPLE_STEP_DAYS = 15;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`JSON이 아니에요: ${text.slice(0, 160)}`);
      }
    } catch (e) {
      if (i === 2) throw e;
      await sleep(400 * (i + 1));
    }
  }
}

/** 그날의 조차 = 최고 만조 - 최저 간조. */
function tidalRange(events) {
  const highs = events.filter((e) => e.hl === "H").map((e) => e.cm);
  const lows = events.filter((e) => e.hl === "L").map((e) => e.cm);
  if (highs.length === 0 || lows.length === 0) return 0;
  return Math.max(...highs) - Math.min(...lows);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

/** 하루치 만조·간조 + 그 응답에 실린 지점 이름·좌표. */
async function fetchDay(key, obsCode, ymd) {
  const url =
    `${BASE}?serviceKey=${key}&obsCode=${obsCode}&reqDate=${ymd}` +
    `&numOfRows=300&type=json`;
  const json = await getJson(url);
  const raw = json?.body?.items?.item;
  const items = raw == null ? [] : [].concat(raw);
  const events = items
    .map((it) => {
      const hhmm = String(it.predcDt ?? "").slice(11, 16).replace(":", "");
      return {
        t: hhmm,
        cm: Math.round(Number(it.predcTdlvVl)),
        hl: Number(it.extrSe) % 2 === 1 ? "H" : "L", // 1·3=고조, 2·4=저조
      };
    })
    .filter((e) => /^\d{4}$/.test(e.t) && Number.isFinite(e.cm));
  const first = items[0];
  const meta =
    first == null
      ? null
      : { name: String(first.obsvtrNm ?? ""), lat: Number(first.lat), lng: Number(first.lot) };
  return { events, meta };
}

function* sampleDates(year) {
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    yield d.toISOString().slice(0, 10).replaceAll("-", "");
    d.setUTCDate(d.getUTCDate() + SAMPLE_STEP_DAYS);
  }
}

async function main() {
  const key = process.env.KHOA_KEY;
  if (key == null) {
    console.error("KHOA_KEY 가 필요해요.");
    process.exit(1);
  }

  const codes = readFileSync(CODES_PATH, "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const dates = [...sampleDates(new Date().getFullYear())];
  console.log(`지점 ${codes.length}개 · 표본 ${dates.length}일 · 예상 호출 ${codes.length * dates.length}건`);

  let calls = 0;
  let skipped = 0;
  const rows = [];

  for (const code of codes) {
    let meta = null;
    const ranges = [];
    for (const ymd of dates) {
      calls++;
      try {
        const { events, meta: m } = await fetchDay(key, code, ymd);
        if (meta == null && m != null) meta = m;
        const range = tidalRange(events);
        if (range > 0) ranges.push(range);
      } catch (e) {
        console.warn(`  ${code} ${ymd}: ${e.message}`);
      }
      // 초당 호출 제한에 걸리지 않게 살살 부릅니다.
      await sleep(100);
    }

    if (meta == null || ranges.length === 0) {
      console.warn(`  ${code}: 데이터 없음 — 건너뜀`);
      skipped++;
      continue;
    }
    ranges.sort((a, b) => a - b);
    rows.push([code, meta.name, meta.lat, meta.lng, percentile(ranges, 25), percentile(ranges, 75)]);
    console.log(`  ${meta.name} (${code}) 표본 ${ranges.length}일`);
  }

  const body = JSON.stringify(rows);
  const source = `/**
 * 예보지점 표. scripts/build-stations.mjs 로 구웠어요 (1회성 배치, 자동 생성).
 *
 * 조석은 천문학적으로 결정돼요. 그래서 지점 이름·좌표와 사리/조금 판정 기준선
 * (연중 조차의 25/75 백분위)만 미리 구해뒀고, 그날그날의 만조·간조 시각은
 * 앱이 뜰 때마다 API로 직접 받습니다.
 *
 * 다시 구우려면: KHOA_KEY=발급키 node scripts/build-stations.mjs
 */

/** [지점코드, 이름, 위도, 경도, 조차 25백분위(cm), 조차 75백분위(cm)] */
export type StationRow = [string, string, number, number, number, number];

export const STATIONS: StationRow[] = ${body};
`;
  writeFileSync(OUT_PATH, source);
  console.log(`\n지점 ${rows.length}곳 저장 · 건너뜀 ${skipped}곳 · API 호출 ${calls}건`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
