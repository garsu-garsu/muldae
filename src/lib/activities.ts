/**
 * 활동별 생활해양예보지수 (국립해양조사원).
 *
 * 물때(사리·조금)만으로는 활동별 좋고 나쁨을 판단할 수 없어요 — 갯벌은 사리가
 * 최고인데 스노클링은 사리가 최악이거든요. 파고·수온·풍속을 반영한 정부 예보를
 * 그대로 보여줍니다.
 *
 * 지점 코드가 없어서(활동 지점 코드 포맷을 못 구함 — data/khoa-probe.md 참고)
 * 카테고리를 부르면 전국이 한 번에 옵니다. 그래서:
 *   1) "이 근처에 지점이 있는지"는 미리 구운 좌표표(activity-points.ts)로 즉시 판정하고,
 *   2) 실제 지수는 칩을 고른 활동만, 하루에 한 번만 부릅니다.
 */
import { DATA_KEY } from "./env.ts";
import { distanceM, type LatLng } from "./geo.ts";
import { ACTIVITY_POINTS } from "./activity-points.ts";

export type ActivityKey = "낚시" | "갯벌체험" | "해수욕" | "스킨스쿠버" | "서핑";

export const ACTIVITY_LABEL: Record<ActivityKey, string> = {
  낚시: "낚시",
  갯벌체험: "갯벌체험",
  해수욕: "해수욕",
  스킨스쿠버: "스킨스쿠버",
  서핑: "서핑",
};

/** 물이 들어오면 위험해지는 활동. 이 활동을 고르면 물 들어오는 시각을 같이 보여줘요. */
export const NEEDS_INFLOW_WARNING: ReadonlySet<ActivityKey> = new Set([
  "갯벌체험",
  "해수욕",
  "스킨스쿠버",
]);

interface ActivityDef {
  path: string;
  op: string;
  /** 응답에서 지점 이름이 들어있는 필드 */
  nameKey: string;
  /** 고정 쿼리 파라미터 (예: 바다낚시의 gubun) */
  query: string;
  /** 응답이 커서 필드를 줄일 때만 씀 */
  include?: string;
}

const DEFS: Record<ActivityKey, ActivityDef> = {
  낚시: {
    path: "fcstFishingv2",
    op: "GetFcstFishingApiServicev2",
    nameKey: "seafsPstnNm",
    query: "&gubun=갯바위",
    include: "seafsPstnNm,lat,lot,predcYmd,predcNoonSeCd,totalIndex,minWvhgt,maxWvhgt,minWtem,maxWtem",
  },
  갯벌체험: { path: "fcstMudflatv2", op: "GetFcstMudflatApiServicev2", nameKey: "mdftExpcnVlgNm", query: "" },
  해수욕: { path: "fcstBeachv2", op: "GetFcstBeachApiServicev2", nameKey: "bbchNm", query: "" },
  스킨스쿠버: { path: "fcstSkinScubav2", op: "GetFcstSkinScubaApiServicev2", nameKey: "skscExpcnRgnNm", query: "" },
  서핑: { path: "fcstSurfingv2", op: "GetFcstSurfingApiServicev2", nameKey: "surfPlcNm", query: "" },
};

/** 관측소 166곳 중 151곳이 이 반경 안에 활동 지점을 하나는 갖고 있어요(khoa-probe.md 4번). */
const RADIUS_M = 20000;

export interface NearbyPoint {
  name: string;
  distanceM: number;
}

/** 이 활동의 지점 중 가장 가까운 곳. 20km 밖이면 null — 칩을 숨기는 기준이에요. */
export function nearestActivityPoint(me: LatLng, key: ActivityKey): NearbyPoint | null {
  let best: NearbyPoint | null = null;
  for (const [name, lat, lng] of ACTIVITY_POINTS[key]) {
    const d = distanceM(me, { lat, lng });
    if (d <= RADIUS_M && (best == null || d < best.distanceM)) best = { name, distanceM: d };
  }
  return best;
}

/** 내 위치 20km 안에 지점이 있는 활동만. 칩 줄에 이 목록만 보여줘요. */
export function visibleActivities(me: LatLng): ActivityKey[] {
  return (Object.keys(DEFS) as ActivityKey[]).filter((k) => nearestActivityPoint(me, k) != null);
}

/** 지수 등급 한 줄. 원문(매우좋음~매우나쁨류)이 낯설어서 활동에 붙여 자연스러운 말로 바꿔요. */
export function indexHeadline(key: ActivityKey, grade: string): string {
  const verb = `${ACTIVITY_LABEL[key]}하기`;
  if (grade === "매우좋음") return `오늘 ${verb} 아주 좋아요`;
  if (grade === "좋음") return `오늘 ${verb} 좋아요`;
  if (grade === "보통") return `오늘 ${verb} 무난해요`;
  if (grade === "나쁨") return `오늘 ${verb} 별로예요`;
  if (grade === "매우나쁨") return `오늘 ${verb} 좋지 않아요`;
  return `오늘 지수: ${grade}`;
}

export interface ActivityRecord {
  ymd: string;
  noon: "오전" | "오후" | null;
  grade: string;
  /** m, 대표 파고 */
  wave: number | null;
  /** 도, 대표 수온 */
  temp: number | null;
  /** 갯벌체험 전용 — 체험 가능 시작/종료(=물 들어오기 시작) */
  begin?: string;
  end?: string;
  /** 해수욕장 전용 — 개장 상태 */
  open?: string;
  /** 서핑 전용 — 난이도 */
  grade2?: string;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function avg(a: unknown, b: unknown): number | null {
  const x = num(a);
  const y = num(b);
  if (x == null && y == null) return null;
  if (x == null) return y;
  if (y == null) return x;
  return Math.round(((x + y) / 2) * 10) / 10;
}

function parseRecord(key: ActivityKey, it: Record<string, unknown>): ActivityRecord {
  const base = {
    ymd: String(it.predcYmd ?? ""),
    noon: (it.predcNoonSeCd === "오전" || it.predcNoonSeCd === "오후" ? it.predcNoonSeCd : null) as
      | "오전"
      | "오후"
      | null,
    grade: String(it.totalIndex ?? ""),
  };
  if (key === "갯벌체험") {
    return { ...base, wave: null, temp: null, begin: String(it.mdftExprnBgngTm ?? ""), end: String(it.mdftExprnEndTm ?? "") };
  }
  if (key === "해수욕") {
    return { ...base, wave: num(it.maxWvhgt), temp: num(it.avgWtem), open: String(it.opnStat ?? "") };
  }
  if (key === "서핑") {
    return { ...base, wave: num(it.avgWvhgt), temp: num(it.avgWtem), grade2: String(it.grdCn ?? "") };
  }
  // 낚시, 스킨스쿠버 — min/max 파고·수온을 평균으로 대표값 삼아요.
  return { ...base, wave: avg(it.minWvhgt, it.maxWvhgt), temp: avg(it.minWtem, it.maxWtem) };
}

const SELECTED_KEY = "muldae:activity-selected";

/** 마지막으로 고른 활동. 매번 다시 고르게 하면 안 돼요. */
export function lastActivity(): ActivityKey | null {
  try {
    return localStorage.getItem(SELECTED_KEY) as ActivityKey | null;
  } catch {
    return null;
  }
}

export function rememberActivity(key: ActivityKey): void {
  try {
    localStorage.setItem(SELECTED_KEY, key);
  } catch {
    /* 시크릿 모드 등에서 실패해도 앱이 멈출 일은 아니에요. */
  }
}

const CACHE_PREFIX = "muldae:activity:";

/** 오늘 날짜(한국 기준). API 응답도 이 날짜부터 시작해요. */
function todayYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readCache(cacheKey: string): ActivityRecord[] | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    return raw != null ? (JSON.parse(raw) as ActivityRecord[]) : null;
  } catch {
    return null;
  }
}

function writeCache(key: ActivityKey, cacheKey: string, records: ActivityRecord[]): void {
  try {
    // 어제 이전 캐시는 지워요 — localStorage가 계속 불어나면 안 돼요.
    const prefix = `${CACHE_PREFIX}${key}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k != null && k.startsWith(prefix) && k !== cacheKey) localStorage.removeItem(k);
    }
    localStorage.setItem(cacheKey, JSON.stringify(records));
  } catch {
    /* 시크릿 모드 등에서 실패해도 앱이 멈출 일은 아니에요. */
  }
}

/** 이 활동으로 남아 있는 캐시 아무거나(날짜 무관). 오늘치 fetch가 실패했을 때 낡은 값이라도 보여주는 용도예요. */
function readAnyCache(key: ActivityKey): ActivityRecord[] | null {
  try {
    const prefix = `${CACHE_PREFIX}${key}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k != null && k.startsWith(prefix)) return readCache(k);
    }
  } catch {
    /* noop */
  }
  return null;
}

/**
 * 오늘 하루치 지수(오늘부터 7일 응답 중 이 지점 것만 골라 캐시). 이미 오늘 받은 게
 * 있으면 API를 다시 안 불러요. 새로 받다가 실패하면 예전에 받아둔 값이라도(날짜가
 * 다르더라도) 돌려줘요 — 아무것도 안 보여주는 것보다 낫습니다.
 */
export async function loadActivity(key: ActivityKey, pointName: string): Promise<ActivityRecord[]> {
  const ymd = todayYmd();
  const cacheKey = `${CACHE_PREFIX}${key}:${ymd}`;
  const cached = readCache(cacheKey);
  if (cached != null) return cached;

  try {
    const def = DEFS[key];
    const records: ActivityRecord[] = [];
    let page = 1;
    let total = Infinity;
    while ((page - 1) * 300 < total) {
      const url =
        `https://apis.data.go.kr/1192136/${def.path}/${def.op}` +
        `?serviceKey=${DATA_KEY}&type=json&numOfRows=300&pageNo=${page}${def.query}` +
        (def.include != null ? `&include=${def.include}` : "");
      const res = await fetch(url);
      if (!res.ok) throw new Error("활동 지수를 불러오지 못했어요");
      const json: unknown = await res.json();
      const body = (json as { body?: { totalCount?: number; items?: { item?: unknown } } })?.body;
      total = body?.totalCount ?? 0;
      const raw = body?.items?.item;
      const items = raw == null ? [] : (([] as unknown[]).concat(raw) as Record<string, unknown>[]);
      for (const it of items) {
        if (String(it[def.nameKey] ?? "") === pointName) records.push(parseRecord(key, it));
      }
      page++;
    }

    writeCache(key, cacheKey, records);
    return records;
  } catch (e) {
    const stale = readAnyCache(key);
    if (stale != null) return stale;
    throw e;
  }
}

/**
 * 지금 이 순간에 해당하는 레코드. 오늘 것이 있으면 그중 오전/오후 시각에 맞는 쪽을,
 * 없으면(캐시가 낡았을 때) 갖고 있는 것 중 가장 최근 날짜를 대신 보여줘요 — 화면에
 * 그 레코드의 날짜(ymd)를 같이 표시하면 사용자가 낡았다는 걸 바로 알 수 있어요.
 */
export function pickCurrent(records: ActivityRecord[]): ActivityRecord | null {
  if (records.length === 0) return null;
  const ymd = todayYmd();
  const bestYmd = records.some((r) => r.ymd === ymd)
    ? ymd
    : records.reduce((a, r) => (r.ymd > a ? r.ymd : a), records[0].ymd);
  const day = records.filter((r) => r.ymd === bestYmd);
  const half = new Date().getHours() < 12 ? "오전" : "오후";
  return day.find((r) => r.noon === half) ?? day.find((r) => r.noon === null) ?? day[0];
}

/** "2026-08-14" → "8월 14일". */
export function formatYmd(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

/* ------------------------------------------------------------------ */
/* 이안류 — 다른 8종과 성격이 달라요. 예보가 아니라 실측치, 지점은 10곳뿐,   */
/* 6~9월만 서비스돼요. 그래서 캐시도 안 하고 매번 최신 한 건만 받아요.      */
/* ------------------------------------------------------------------ */

/** [beachCode, 이름, 위도, 경도] — data/khoa-ripcurrent-points.json (전국 10곳뿐). */
const RIP_POINTS: [string, string, number, number][] = [
  ["DAECHON", "대천", 36.30559, 126.50729],
  ["GORAEBUL", "고래불", 36.59722, 129.41111],
  ["GYEONGPO", "경포", 37.80088, 128.90947],
  ["HAE", "해운대", 35.15867, 129.16035],
  ["IMRANG", "임랑", 35.31841, 129.2644],
  ["JUNGMUN", "중문", 33.24501, 126.40944],
  ["MANGSANG", "망상", 37.593, 129.09],
  ["NAKSAN", "낙산", 38.118, 128.63138],
  ["SOKCHO", "속초", 38.19058, 128.60135],
  ["SONGJUNG", "송정", 35.1785, 129.19978],
];

export interface RipRecord {
  /** "HH:MM" — 실측치라 언제 잰 건지가 중요해요. */
  time: string;
  /** 관심 / 주의 / 경계 / 위험 */
  level: string;
}

/** 이안류 관측 지점 중 가장 가까운 곳. 20km 밖이면 null. */
export function nearestRipPoint(me: LatLng): { code: string; name: string } | null {
  let best: { code: string; name: string; distanceM: number } | null = null;
  for (const [code, name, lat, lng] of RIP_POINTS) {
    const d = distanceM(me, { lat, lng });
    if (d <= RADIUS_M && (best == null || d < best.distanceM)) best = { code, name, distanceM: d };
  }
  return best;
}

/**
 * 가장 최근 관측 한 건만. 하루치(283건, 0.63MB)를 다 받지 않으려고 페이지 수(=
 * totalCount)를 먼저 확인하고 그 마지막 페이지 한 건만 받아요.
 * 비시즌(10~5월)엔 totalCount가 0이라 null을 돌려줘요 — 에러가 아니에요.
 */
export async function loadRipCurrent(code: string): Promise<RipRecord | null> {
  const base = `https://apis.data.go.kr/1192136/ripCurrent/GetRipCurrentApiService?serviceKey=${DATA_KEY}&type=json&beachCode=${code}`;
  const r1 = await fetch(`${base}&numOfRows=1&pageNo=1`);
  if (!r1.ok) throw new Error("이안류 정보를 불러오지 못했어요");
  const j1: unknown = await r1.json();
  const total = (j1 as { body?: { totalCount?: number } })?.body?.totalCount ?? 0;
  if (total === 0) return null;

  const r2 = await fetch(`${base}&numOfRows=1&pageNo=${total}`);
  if (!r2.ok) throw new Error("이안류 정보를 불러오지 못했어요");
  const j2: unknown = await r2.json();
  const raw = (j2 as { body?: { items?: { item?: unknown } } })?.body?.items?.item;
  const it = (([] as unknown[]).concat(raw ?? []) as Record<string, unknown>[])[0];
  if (it == null) return null;
  return { time: String(it.obsrvnDt ?? "").slice(11, 16), level: String(it.lastScrCn ?? "") };
}

/** 경계·위험만 눈에 띄게 — 관심·주의를 매번 강조하면 사람들이 무시하게 돼요. */
export function isRipUrgent(level: string): boolean {
  return level === "경계" || level === "위험";
}

/* ------------------------------------------------------------------ */
/* 자체 점검 — `npm run check:activities`                              */
/* ------------------------------------------------------------------ */
export function demo(): void {
  const eq = (got: unknown, want: unknown, label: string) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(`${label}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`);
    }
  };

  // 지점 매칭 — 반경 안/밖
  const near = nearestActivityPoint({ lat: 34.9008, lng: 128.02302 }, "갯벌체험");
  eq(near?.name, "냉천마을", "20km 안 지점을 찾음");
  const far = nearestActivityPoint({ lat: 37.5665, lng: 126.978 }, "갯벌체험"); // 서울시청
  eq(far, null, "20km 밖이면 null");

  // 지수 등급 → 한 줄
  eq(indexHeadline("낚시", "매우좋음"), "오늘 낚시하기 아주 좋아요", "매우좋음");
  eq(indexHeadline("서핑", "나쁨"), "오늘 서핑하기 별로예요", "나쁨");
  eq(indexHeadline("해수욕", "이상값"), "오늘 지수: 이상값", "모르는 등급은 원문 그대로");

  // 레코드 파싱
  const fishing = parseRecord("낚시", {
    predcYmd: "2026-08-14",
    predcNoonSeCd: "오전",
    totalIndex: "좋음",
    minWvhgt: 0.4,
    maxWvhgt: 0.6,
    minWtem: 27,
    maxWtem: 28,
  });
  eq(fishing.wave, 0.5, "파고는 최소·최대 평균");
  eq(fishing.temp, 27.5, "수온도 평균");

  const mudflat = parseRecord("갯벌체험", {
    predcYmd: "2026-08-14",
    totalIndex: "나쁨",
    mdftExprnBgngTm: "11:10",
    mdftExprnEndTm: "13:10",
  });
  eq(mudflat.begin, "11:10", "갯벌 체험 시작");
  eq(mudflat.end, "13:10", "갯벌 체험 종료(=물 들어오는 시각)");

  // 오늘 중 오전/오후 선택 — todayYmd()가 실행 시각 기준이라 날짜를 하드코딩하면
  // 다음 날 이 점검이 깨져요. 같은 방식으로 "오늘"을 직접 구해서 써요.
  const today = todayYmd();
  const records: ActivityRecord[] = [
    { ymd: today, noon: "오전", grade: "좋음", wave: 0.4, temp: 27 },
    { ymd: today, noon: "오후", grade: "나쁨", wave: 0.8, temp: 26 },
    { ymd: "1999-01-01", noon: "오전", grade: "보통", wave: 0.5, temp: 27 },
  ];
  // pickCurrent는 실행 시각(now)에 따라 오전/오후를 고르므로, 둘 중 하나인지만 확인해요.
  const cur = pickCurrent(records);
  if (cur == null || cur.ymd !== today) throw new Error("오늘 레코드가 아님");

  // 오늘 것이 없으면(캐시가 낡았으면) 가장 최근 날짜로 대신 — 그리고 그 날짜를 보여줘요.
  const stale = pickCurrent([
    { ymd: "2026-08-10", noon: null, grade: "보통", wave: 0.3, temp: 26 },
    { ymd: "2026-08-12", noon: null, grade: "좋음", wave: 0.3, temp: 26 },
  ]);
  eq(stale?.ymd, "2026-08-12", "오늘 게 없으면 가장 최근 날짜");
  eq(pickCurrent([]), null, "레코드가 아예 없으면 null");
  eq(formatYmd("2026-08-14"), "8월 14일", "날짜 표시");

  // 이안류 — 20km 지점 매칭, 위험도 강조 기준
  eq(nearestRipPoint({ lat: 35.15867, lng: 129.16035 })?.name, "해운대", "해운대 좌표에서 해운대 매칭");
  eq(nearestRipPoint({ lat: 37.5665, lng: 126.978 }), null, "서울시청 20km 안엔 이안류 지점 없음");
  eq(isRipUrgent("위험"), true, "위험은 강조");
  eq(isRipUrgent("경계"), true, "경계도 강조");
  eq(isRipUrgent("주의"), false, "주의는 강조 안 함");
  eq(isRipUrgent("관심"), false, "관심도 강조 안 함");

  console.log("activities.ts OK");
}
