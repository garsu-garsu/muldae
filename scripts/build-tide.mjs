/**
 * 물때 데이터 굽기 (1회성 배치 — 1년에 한 번만 돌리면 돼요)
 *
 *   KHOA_KEY=발급키 node scripts/build-tide.mjs 2026
 *
 * 조석은 천문학적으로 결정돼요. 그래서 1년치를 통째로 미리 받아 정적 파일로 굽고,
 * 앱은 런타임에 아무 API도 부르지 않습니다. → 서버 없음, 키 노출 없음, CORS 없음.
 *
 * 키 발급: 바다누리 해양정보 서비스 http://www.khoa.go.kr/oceangrid (무료)
 *
 * ⚠️ 먼저 --probe 로 응답을 눈으로 확인하세요.
 *
 *   KHOA_KEY=발급키 node scripts/build-tide.mjs --probe
 *
 * 이 스크립트는 바다누리 오픈API의 필드명을 아래 FIELD 로 가정합니다.
 * --probe 출력과 다르면 FIELD 만 고치면 돼요. 파싱은 전부 이 표를 거칩니다.
 */
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../public/data/tide");
const BASE = "http://www.khoa.go.kr/api/oceangrid";

/** 응답 필드 이름. --probe 결과와 다르면 여기만 고치세요. */
const FIELD = {
  obsCode: "obs_post_id",
  obsName: "obs_post_name",
  obsLat: "obs_lat",
  obsLng: "obs_lon",
  eventTime: "tph_time", // "YYYY-MM-DD HH:MM:SS"
  eventLevel: "tph_level", // cm
  eventKind: "hl_code", // 고조/저조
};

const HIGH = new Set(["고조", "H", "HIGH", "만조"]);

/* --------------------------------- 유틸 ---------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        // 키가 틀리면 JSON 대신 HTML 오류 페이지가 와요.
        throw new Error(`JSON이 아니에요: ${text.slice(0, 160)}`);
      }
    } catch (e) {
      if (i === 2) throw e;
      await sleep(400 * (i + 1));
    }
  }
}

/** 응답 안 어디에 배열이 들어 있든 찾아내요. 래핑 형태가 오퍼레이션마다 달라요. */
function firstArray(obj) {
  if (Array.isArray(obj)) return obj;
  if (obj == null || typeof obj !== "object") return null;
  for (const v of Object.values(obj)) {
    const found = firstArray(v);
    if (found != null) return found;
  }
  return null;
}

/** 백분위 (0~100). 정렬된 배열 기준. */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

/* --------------------------------- 수집 ---------------------------------- */

/** 조위관측소 목록. 코드를 손으로 박지 않아요 — 틀리면 조용히 빈 데이터가 나와요. */
async function fetchStations(key) {
  const url = `${BASE}/ObsServiceObj/search.do?ServiceKey=${key}&Type=json&DataType=tideObsPreTab`;
  const rows = firstArray(await getJson(url)) ?? [];
  return rows
    .map((r) => ({
      id: String(r[FIELD.obsCode] ?? ""),
      name: String(r[FIELD.obsName] ?? ""),
      lat: Number(r[FIELD.obsLat]),
      lng: Number(r[FIELD.obsLng]),
    }))
    .filter((s) => s.id !== "" && Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

/** 관측소 한 곳의 하루치 만조·간조. */
async function fetchDay(key, obsCode, ymd) {
  const url =
    `${BASE}/tideObsPreTab/search.do?ServiceKey=${key}` +
    `&ObsCode=${obsCode}&Date=${ymd}&ResultType=json`;
  const rows = firstArray(await getJson(url)) ?? [];
  return rows
    .map((r) => {
      const raw = String(r[FIELD.eventTime] ?? "");
      const hhmm = raw.slice(11, 16).replace(":", "");
      return {
        t: hhmm,
        cm: Math.round(Number(r[FIELD.eventLevel])),
        hl: HIGH.has(String(r[FIELD.eventKind]).trim()) ? "H" : "L",
      };
    })
    .filter((e) => /^\d{4}$/.test(e.t) && Number.isFinite(e.cm))
    .sort((a, b) => a.t.localeCompare(b.t));
}

function* daysOf(year) {
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/* --------------------------------- main ---------------------------------- */

async function main() {
  const key = process.env.KHOA_KEY;
  if (key == null) {
    console.error("KHOA_KEY 가 필요해요. http://www.khoa.go.kr/oceangrid 에서 발급받으세요.");
    process.exit(1);
  }

  if (process.argv[2] === "--probe") {
    const stations = await fetchStations(key);
    console.log(`관측소 ${stations.length}곳`);
    console.log(JSON.stringify(stations.slice(0, 3), null, 2));
    if (stations.length > 0) {
      const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      const url =
        `${BASE}/tideObsPreTab/search.do?ServiceKey=${key}` +
        `&ObsCode=${stations[0].id}&Date=${today}&ResultType=json`;
      console.log("\n원본 응답 한 건:");
      console.log(JSON.stringify(await getJson(url), null, 2).slice(0, 1500));
    }
    return;
  }

  const year = Number(process.argv[2] ?? new Date().getFullYear());
  const stations = await fetchStations(key);
  if (stations.length === 0) {
    console.error("관측소를 못 받았어요. --probe 로 응답을 확인하고 FIELD 를 맞춰주세요.");
    process.exit(1);
  }
  console.log(`${year}년 · 관측소 ${stations.length}곳`);

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const index = [];
  for (const s of stations) {
    const days = {};
    const ranges = [];
    for (const ymd of daysOf(year)) {
      const events = await fetchDay(key, s.id, ymd.replaceAll("-", ""));
      if (events.length === 0) continue;
      days[ymd] = events.map((e) => [e.t, e.cm, e.hl]);

      const highs = events.filter((e) => e.hl === "H").map((e) => e.cm);
      const lows = events.filter((e) => e.hl === "L").map((e) => e.cm);
      if (highs.length > 0 && lows.length > 0) {
        ranges.push(Math.max(...highs) - Math.min(...lows));
      }
      // 초당 호출 제한에 걸리지 않게 살살 부릅니다.
      await sleep(60);
    }
    if (Object.keys(days).length === 0) {
      console.warn(`  ${s.name}: 데이터 없음 — 건너뜀`);
      continue;
    }
    ranges.sort((a, b) => a - b);
    writeFileSync(
      `${OUT}/${s.id}.json`,
      JSON.stringify({
        station: s,
        rangeP25: percentile(ranges, 25),
        rangeP75: percentile(ranges, 75),
        days,
      }),
    );
    index.push(s);
    console.log(`  ${s.name} (${s.id}) ${Object.keys(days).length}일`);
  }

  writeFileSync(`${OUT}/index.json`, JSON.stringify(index));
  console.log(`\n관측소 ${index.length}곳 저장 완료`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
