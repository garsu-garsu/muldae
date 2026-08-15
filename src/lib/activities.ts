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
import { formatTime, nextLowTide, type Event } from "./tide.ts";

export type ActivityKey =
  | "갯바위낚시"
  | "선상낚시"
  | "갯벌체험"
  | "해수욕"
  | "스킨스쿠버"
  | "서핑"
  | "바다여행"
  | "뱃멀미"
  | "바다갈라짐";

export const ACTIVITY_LABEL: Record<ActivityKey, string> = {
  갯바위낚시: "갯바위낚시",
  선상낚시: "선상낚시",
  갯벌체험: "갯벌체험",
  해수욕: "해수욕",
  스킨스쿠버: "스킨스쿠버",
  서핑: "서핑",
  바다여행: "바다여행",
  뱃멀미: "뱃멀미",
  바다갈라짐: "바다갈라짐",
};

/** "오늘 {verb} 좋아요" 형태의 기본 동사. 어색한 것만 예외로 바꿔요. */
const ACTIVITY_VERB: Partial<Record<ActivityKey, string>> = {
  바다갈라짐: "바다갈라짐 구경하기",
};

/** 물이 들어오거나 길이 잠기면 위험해지는 활동. 이 활동을 고르면 시각을 같이 보여줘요. */
export const NEEDS_INFLOW_WARNING: ReadonlySet<ActivityKey> = new Set([
  "갯벌체험",
  "해수욕",
  "스킨스쿠버",
  "바다갈라짐",
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

const FISHING_INCLUDE =
  "seafsPstnNm,lat,lot,predcYmd,predcNoonSeCd,totalIndex,minWvhgt,maxWvhgt,minWtem,maxWtem";

const DEFS: Record<ActivityKey, ActivityDef> = {
  갯바위낚시: {
    path: "fcstFishingv2",
    op: "GetFcstFishingApiServicev2",
    nameKey: "seafsPstnNm",
    query: "&gubun=갯바위",
    include: FISHING_INCLUDE,
  },
  선상낚시: {
    path: "fcstFishingv2",
    op: "GetFcstFishingApiServicev2",
    nameKey: "seafsPstnNm",
    query: "&gubun=선상",
    include: FISHING_INCLUDE,
  },
  갯벌체험: { path: "fcstMudflatv2", op: "GetFcstMudflatApiServicev2", nameKey: "mdftExpcnVlgNm", query: "" },
  해수욕: { path: "fcstBeachv2", op: "GetFcstBeachApiServicev2", nameKey: "bbchNm", query: "" },
  스킨스쿠버: { path: "fcstSkinScubav2", op: "GetFcstSkinScubaApiServicev2", nameKey: "skscExpcnRgnNm", query: "" },
  서핑: { path: "fcstSurfingv2", op: "GetFcstSurfingApiServicev2", nameKey: "surfPlcNm", query: "" },
  바다여행: { path: "fcstSeaTripv2", op: "GetFcstSeaTripApiServicev2", nameKey: "sareaDtlNm", query: "" },
  뱃멀미: { path: "fcstSicknessv2", op: "GetFcstSicknessApiServicev2", nameKey: "nvgtNm", query: "" },
  바다갈라짐: { path: "fcstSeaSplitv2", op: "GetFcstSeaSplitApiServicev2", nameKey: "splocPstnNm", query: "" },
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

/**
 * 지수 등급 한 줄. 원문(매우좋음~매우나쁨류)이 낯설어서 활동에 붙여 자연스러운 말로 바꿔요.
 * 뱃멀미는 방향이 반대라(등급이 좋을수록 "안 멀미함") 여기 쓰면 안 되고 seasickHeadline을 써요.
 */
export function indexHeadline(key: ActivityKey, grade: string): string {
  const verb = ACTIVITY_VERB[key] ?? `${ACTIVITY_LABEL[key]}하기`;
  if (grade === "매우좋음") return `오늘 ${verb} 아주 좋아요`;
  if (grade === "좋음") return `오늘 ${verb} 좋아요`;
  if (grade === "보통") return `오늘 ${verb} 무난해요`;
  if (grade === "나쁨") return `오늘 ${verb} 별로예요`;
  if (grade === "매우나쁨") return `오늘 ${verb} 좋지 않아요`;
  return `오늘 지수: ${grade}`;
}

/**
 * 뱃멀미 전용 한 줄. API의 totalIndex는 다른 8종과 같은 방향(매우좋음=쾌적, 매우나쁨=
 * 험함)이지만, 그대로 indexHeadline에 넣으면 "오늘 뱃멀미하기 좋아요"가 되어 버려요 —
 * 활동이 아니라 겪고 싶지 않은 증상이라 "좋다/나쁘다" 틀 자체가 안 맞습니다. 그래서
 * "멀미하기 쉬운 정도"로 다시 풀어 씁니다(khoa-probe.md 확인: 등급값은 동일한 5단계).
 */
export function seasickHeadline(grade: string): string {
  if (grade === "매우좋음") return "오늘 배 타기 아주 편안해요";
  if (grade === "좋음") return "오늘 배 타기 편안해요";
  if (grade === "보통") return "오늘 배가 조금 흔들려요";
  if (grade === "나쁨") return "오늘 배 타면 멀미하기 쉬워요";
  if (grade === "매우나쁨") return "오늘 배 타면 멀미하기 아주 쉬워요";
  return `오늘 뱃멀미 지수: ${grade}`;
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

/** "파도 0.5m 안팎 · 수온 27도 정도" 류의 근거 한 줄 조각들. 오늘 카드·주간 베스트가 같이 써요. */
export function activityBits(activity: ActivityKey, record: ActivityRecord): string[] {
  const bits: string[] = [];
  if (record.wave != null) bits.push(`파도 ${record.wave}m 안팎`);
  if (record.temp != null) bits.push(`수온 ${Math.round(record.temp)}도 정도`);
  if (activity === "서핑" && record.grade2) bits.push(`난이도 ${record.grade2}`);
  if (activity === "해수욕" && record.open) bits.push(record.open === "개장" ? "개장 중" : record.open);
  return bits;
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

/**
 * 갯벌체험·바다갈라짐 시각 필드. 정부 API가 "체험/통행 불가"(totalIndex가 그렇게
 * 나올 때)엔 실제 시각 대신 00:00~00:00 더미값을 줘요(khoa-probe.md류 확인 없이도
 * 실측: 백사마을 2026-08-16 totalIndex "체험불가" → begin/end 둘 다 "00:00"). 진짜
 * 자정 시각이 아니라 "값 없음" 표시라, 그대로 두면 "00:00부터 물이 들어와요" 같은
 * 안전 정보에 쓰레기 값이 뜨니 빈 문자열로 지워서 inflowLabel의 `!record.end` 가드가
 * 자동으로 줄 자체를 안 보여주게 해요.
 */
function realWindow(begin: string, end: string): { begin: string; end: string } {
  return begin === "00:00" && end === "00:00" ? { begin: "", end: "" } : { begin, end };
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
    const { begin, end } = realWindow(String(it.mdftExprnBgngTm ?? ""), String(it.mdftExprnEndTm ?? ""));
    return { ...base, wave: null, temp: null, begin, end };
  }
  if (key === "바다갈라짐") {
    const { begin, end } = realWindow(String(it.splocBgngDt ?? ""), String(it.splocEndDt ?? ""));
    return { ...base, wave: null, temp: null, begin, end };
  }
  if (key === "해수욕") {
    return { ...base, wave: num(it.maxWvhgt), temp: num(it.avgWtem), open: String(it.opnStat ?? "") };
  }
  if (key === "서핑") {
    return { ...base, wave: num(it.avgWvhgt), temp: num(it.avgWtem), grade2: String(it.grdCn ?? "") };
  }
  if (key === "바다여행") {
    return { ...base, wave: num(it.avgWvhgt), temp: num(it.avgWtem) };
  }
  if (key === "뱃멀미") {
    return { ...base, wave: avg(it.minWvhgt, it.maxWvhgt), temp: null };
  }
  // 갯바위낚시, 선상낚시, 스킨스쿠버 — min/max 파고·수온을 평균으로 대표값 삼아요.
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

/**
 * "내일 이후"처럼 날짜 화살표로 골라 본 특정 날짜의 레코드. pickCurrent와 달리
 * 낡은 캐시 대신 최근 날짜로 넘어가는 보정을 안 해요 — 사용자가 고른 그 날짜가
 * 없으면 그냥 null(그 날짜엔 지수가 없다는 뜻)이에요.
 */
export function pickForDate(records: ActivityRecord[], ymd: string): ActivityRecord | null {
  const day = records.filter((r) => r.ymd === ymd);
  if (day.length === 0) return null;
  const half = ymd === todayYmd() && new Date().getHours() >= 12 ? "오후" : "오전";
  return day.find((r) => r.noon === half) ?? day.find((r) => r.noon === null) ?? day[0];
}

/** "2026-08-14" → "8월 14일". */
export function formatYmd(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-08-14" → "8월 14일 (금)". */
export function formatYmdWeekday(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${formatYmd(ymd)} (${WEEKDAY[new Date(y, m - 1, d).getDay()]})`;
}

/** 등급이 좋을수록 큰 점수. 모르는 값(빈 문자열 등)은 0으로 맨 뒤. */
const GRADE_SCORE: Record<string, number> = {
  매우좋음: 5,
  좋음: 4,
  보통: 3,
  나쁨: 2,
  매우나쁨: 1,
};

/** "보통" 이상이면 괜찮은 날. "이번 주 좋은 시간대" 제목이 실제 등급과 어긋나지 않으려고 써요. */
export function isGoodEnough(grade: string): boolean {
  return (GRADE_SCORE[grade] ?? 0) >= GRADE_SCORE["보통"];
}

/** 날짜+오전/오후를 비교 가능한 문자열로. 정렬용 — 표시용이 아니에요. */
function timeKey(r: ActivityRecord): string {
  return `${r.ymd}${r.noon === "오후" ? 1 : 0}`;
}

/**
 * 이번 주(오늘부터 API가 주는 7일) 중 가장 좋은 시간대 상위 N개.
 * 등급 좋은 순 → 등급이 같으면 가까운 날짜(더 이른 시간대) 순. 뱃멀미도 등급값의
 * 방향은 동일(매우좋음=쾌적)이라 활동별로 다르게 정렬할 필요가 없어요.
 *
 * 같은 날짜·오전/오후에 원본 API가 행을 중복으로 주는 지점이 있어(예: 갯바위낚시
 * "신지도" — 같은 시간대에 등급이 다른 행이 여럿). 그대로 두면 3자리 중 둘이 같은
 * 시간대가 되어버려서, 시간대별로 하나만(그중 더 좋은 등급) 남기고 순위를 매겨요.
 * ponytail: 등급만 보고 고름 — 파고·수온까지 합쳐 대표값을 만들려면 더 손이 가요.
 */
export function rankWeekly(records: ActivityRecord[], limit = 3): ActivityRecord[] {
  const byTime = new Map<string, ActivityRecord>();
  for (const r of records) {
    const k = timeKey(r);
    const prev = byTime.get(k);
    if (prev == null || (GRADE_SCORE[r.grade] ?? 0) > (GRADE_SCORE[prev.grade] ?? 0)) byTime.set(k, r);
  }
  return [...byTime.values()]
    .sort((a, b) => {
      const byGrade = (GRADE_SCORE[b.grade] ?? 0) - (GRADE_SCORE[a.grade] ?? 0);
      return byGrade !== 0 ? byGrade : timeKey(a).localeCompare(timeKey(b));
    })
    .slice(0, limit);
}

export interface InflowLabel {
  line1: string;
  line2?: string;
}

/**
 * 물이 들어오면 위험해지는 활동만 — 언제까지 나와야 하는지 안내예요.
 * 갯벌 지점과 물때표의 관측소는 서로 다른 곳이라 시각이 다를 수 있어요. 그래서
 * "어디 기준 시각인지"를 문구에 꼭 넣어요 — 안 넣으면 두 시각을 헷갈려서 고립 사고로
 * 이어질 수 있습니다.
 *
 * 오늘 남은 간조가 없으면(늦은 밤) 내일 첫 간조로 넘겨요 — 밤에 켜서 내일 계획을
 * 보는 사람도 있으니까요. 그럴 땐 "내일"임을 문구에 밝혀요.
 */
export function inflowLabel(
  activity: ActivityKey,
  record: ActivityRecord,
  events: Event[],
  tomorrowEvents: Event[],
  nowMin: number,
  pointName: string,
  stationName: string,
): InflowLabel | null {
  if (!NEEDS_INFLOW_WARNING.has(activity)) return null;

  if (activity === "갯벌체험") {
    if (!record.end) return null;
    return {
      line1: `${pointName} 갯벌 기준 · ${record.end} 무렵부터 물이 들어와요`,
      line2: record.begin ? `체험 가능 ${record.begin}~${record.end}` : undefined,
    };
  }
  if (activity === "바다갈라짐") {
    if (!record.end) return null;
    return {
      line1: `${pointName} 기준 · ${record.end} 무렵부터 길이 잠겨요`,
      line2: record.begin ? `건널 수 있는 시간 ${record.begin}~${record.end}` : undefined,
    };
  }

  const low = nextLowTide(events, nowMin);
  if (low != null) return { line1: `${stationName} 기준 · ${formatTime(low.t)} 간조 이후부터 물이 들어와요` };

  const tomorrowLow = nextLowTide(tomorrowEvents, -1);
  if (tomorrowLow != null) {
    return { line1: `${stationName} 기준 · 내일 ${formatTime(tomorrowLow.t)} 간조 이후부터 물이 들어와요` };
  }
  return null;
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

  // "항을 바꾸면 활동 목록도 그 항 기준으로 바뀐다" — 화면은 내 실제 위치가 아니라
  // 선택된 관측소 좌표를 넘겨요. 서울시청(내륙)에선 활동이 하나도 안 잡혀야 하고,
  // 부산항(DT_0005, stations-index.ts) 좌표를 넣으면 근처 활동이 잡혀야 합니다.
  const seoulActivities = visibleActivities({ lat: 37.5665, lng: 126.978 });
  eq(seoulActivities, [], "내륙 좌표(서울시청)는 활동이 하나도 안 잡힘");
  const busanActivities = visibleActivities({ lat: 35.09638, lng: 129.03527 });
  if (busanActivities.length === 0) throw new Error("부산항 좌표를 넣었는데 활동이 하나도 안 잡힘");
  if (!busanActivities.includes("해수욕")) throw new Error("부산항 좌표인데 해수욕(해운대 인근)이 안 잡힘");

  // 지수 등급 → 한 줄
  eq(indexHeadline("갯바위낚시", "매우좋음"), "오늘 갯바위낚시하기 아주 좋아요", "매우좋음");
  eq(indexHeadline("서핑", "나쁨"), "오늘 서핑하기 별로예요", "나쁨");
  eq(indexHeadline("해수욕", "이상값"), "오늘 지수: 이상값", "모르는 등급은 원문 그대로");

  // 레코드 파싱
  const fishing = parseRecord("갯바위낚시", {
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

  // 체험불가일 때 API가 00:00~00:00 더미값을 줘요 — 실제 시각이 아니니 빈 값으로 지워야 해요.
  const impossible = parseRecord("갯벌체험", {
    predcYmd: "2026-08-16",
    totalIndex: "체험불가",
    mdftExprnBgngTm: "00:00",
    mdftExprnEndTm: "00:00",
  });
  eq(impossible.begin, "", "체험불가는 시작 시각도 빈 값");
  eq(impossible.end, "", "체험불가는 종료 시각도 빈 값");
  eq(inflowLabel("갯벌체험", impossible, [], [], 0, "백사마을", "사초항"), null, "00:00 더미값은 안전 정보 줄 자체가 안 뜸");

  const splitImpossible = parseRecord("바다갈라짐", {
    predcYmd: "2026-08-16",
    totalIndex: "매우나쁨",
    splocBgngDt: "00:00",
    splocEndDt: "00:00",
  });
  eq(splitImpossible.end, "", "바다갈라짐도 같은 더미값을 지움");

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

  // 물 들어오는 시각 — 지점명 표기, 내일 간조 넘김
  const mudflatRecord: ActivityRecord = { ymd: today, noon: null, grade: "좋음", wave: null, temp: null, begin: "16:30", end: "18:00" };
  const mudflatInflow = inflowLabel("갯벌체험", mudflatRecord, [], [], 0, "백사마을", "사초항");
  eq(mudflatInflow?.line1, "백사마을 갯벌 기준 · 18:00 무렵부터 물이 들어와요", "갯벌은 지점명을 밝힘");
  eq(mudflatInflow?.line2, "체험 가능 16:30~18:00", "체험 가능 시간은 둘째 줄");

  const beachRecord: ActivityRecord = { ymd: today, noon: null, grade: "좋음", wave: 0.3, temp: 27 };
  const todayLow = [{ t: "1509", cm: 15, hl: "L" as const }];
  const beachInflow = inflowLabel("해수욕", beachRecord, todayLow, [], 0, "", "사초항");
  eq(beachInflow?.line1, "사초항 기준 · 15:09 간조 이후부터 물이 들어와요", "해수욕은 관측소명을 밝힘");

  // 오늘 간조가 다 지났으면(늦은 밤) 내일 첫 간조로 넘어감
  const tomorrowLow = [{ t: "0612", cm: 20, hl: "L" as const }];
  const overnight = inflowLabel("해수욕", beachRecord, todayLow, tomorrowLow, 23 * 60, "", "사초항");
  eq(overnight?.line1, "사초항 기준 · 내일 06:12 간조 이후부터 물이 들어와요", "밤엔 내일 간조로 넘어가고 '내일'을 밝힘");

  // 내일 것도 없으면(정말 드물게) 조용히 null
  eq(inflowLabel("해수욕", beachRecord, todayLow, [], 23 * 60, "", "사초항"), null, "낼 것도 없으면 null");

  // 바다갈라짐 — 갯벌과 같은 방식으로 "길이 잠기는" 시각을 지점명과 함께
  const splitRecord: ActivityRecord = { ymd: today, noon: null, grade: "보통", wave: null, temp: null, begin: "14:39", end: "18:00" };
  const splitInflow = inflowLabel("바다갈라짐", splitRecord, [], [], 0, "대섬", "사초항");
  eq(splitInflow?.line1, "대섬 기준 · 18:00 무렵부터 길이 잠겨요", "바다갈라짐은 지점명 + 잠기는 시각");
  eq(splitInflow?.line2, "건널 수 있는 시간 14:39~18:00", "건널 수 있는 시간은 둘째 줄");

  const split = parseRecord("바다갈라짐", { predcYmd: today, totalIndex: "매우나쁨", splocBgngDt: "17:28", splocEndDt: "18:00" });
  eq(split.begin, "17:28", "바다갈라짐 시작");
  eq(split.end, "18:00", "바다갈라짐 종료(=길이 잠기는 시각)");

  // 뱃멀미 — 방향이 반대라는 게 제일 중요한 점검. 등급이 나쁠수록(매우나쁨) "멀미하기
  // 쉽다" 쪽으로, 좋을수록(매우좋음) "편안하다" 쪽으로 가야지 거꾸로면 사고입니다.
  const seasickBad = seasickHeadline("매우나쁨");
  const seasickGood = seasickHeadline("매우좋음");
  if (!seasickBad.includes("멀미")) throw new Error(`나쁜 등급인데 멀미 언급이 없음: ${seasickBad}`);
  if (seasickGood.includes("멀미")) throw new Error(`좋은 등급인데 멀미를 언급함(방향 반대 의심): ${seasickGood}`);
  eq(seasickGood, "오늘 배 타기 아주 편안해요", "좋은 등급은 편안하다로");
  eq(seasickBad, "오늘 배 타면 멀미하기 아주 쉬워요", "나쁜 등급은 멀미하기 쉽다로");
  // indexHeadline(일반 템플릿)을 뱃멀미에 그대로 쓰면 "오늘 뱃멀미하기 좋아요"가 되어
  // 방향이 뒤집혀 보이므로, seasickHeadline이 그 표현을 쓰지 않는지도 확인해요.
  if (seasickGood.includes("뱃멀미하기")) throw new Error("일반 템플릿 표현이 새어 나옴");

  // 바다갈라짐만 동사가 다름("구경하기") — 나머지는 "{label}하기" 그대로.
  eq(indexHeadline("바다갈라짐", "좋음"), "오늘 바다갈라짐 구경하기 좋아요", "바다갈라짐은 구경하기");
  eq(indexHeadline("선상낚시", "좋음"), "오늘 선상낚시하기 좋아요", "선상낚시는 기본 동사");

  // 이번 주 좋은 시간대 — 등급 좋은 순, 동점이면 가까운 날짜가 앞서야 해요.
  const weekly: ActivityRecord[] = [
    { ymd: "2026-08-14", noon: "오전", grade: "보통", wave: null, temp: null },
    { ymd: "2026-08-14", noon: "오후", grade: "매우좋음", wave: null, temp: null },
    { ymd: "2026-08-15", noon: "오전", grade: "매우좋음", wave: null, temp: null },
    { ymd: "2026-08-15", noon: "오후", grade: "나쁨", wave: null, temp: null },
    { ymd: "2026-08-16", noon: "오전", grade: "좋음", wave: null, temp: null },
  ];
  const ranked = rankWeekly(weekly);
  eq(ranked.length, 3, "상위 3개만 뽑힘");
  eq(`${ranked[0].ymd} ${ranked[0].noon}`, "2026-08-14 오후", "매우좋음 동점 중 더 이른 시간대가 1등");
  eq(`${ranked[1].ymd} ${ranked[1].noon}`, "2026-08-15 오전", "매우좋음 동점 중 나머지가 2등");
  eq(`${ranked[2].ymd} ${ranked[2].noon}`, "2026-08-16 오전", "좋음 등급이 3등");
  eq(rankWeekly(weekly.slice(0, 2)).length, 2, "데이터가 3개 미만이면 있는 만큼만");
  eq(rankWeekly([]).length, 0, "레코드가 없으면 빈 배열");

  // 원본 API가 같은 날짜·시간대에 행을 중복으로 주는 지점이 있어요(신지도 등) —
  // 시간대당 하나만(더 좋은 등급) 남아야 top3가 진짜 3개의 다른 시간대가 돼요.
  const dupTime: ActivityRecord[] = [
    { ymd: "2026-08-15", noon: "오전", grade: "좋음", wave: null, temp: null },
    { ymd: "2026-08-15", noon: "오전", grade: "보통", wave: null, temp: null },
    { ymd: "2026-08-16", noon: "오전", grade: "나쁨", wave: null, temp: null },
  ];
  const dedup = rankWeekly(dupTime);
  eq(dedup.length, 2, "같은 시간대 중복은 하나로 합쳐짐");
  eq(dedup[0].grade, "좋음", "중복 중 더 좋은 등급이 남음");

  // 날짜 화살표로 고른 특정 날짜 — pickCurrent와 달리 낡은 캐시로 안 넘어가요.
  eq(pickForDate(weekly, "2026-08-16")?.grade, "좋음", "그 날짜 레코드를 그대로 돌려줌");
  eq(pickForDate(weekly, "2026-08-19"), null, "그 날짜 레코드가 없으면 null");

  // "좋은 시간대" 제목이 실제 등급과 어긋나면 안 돼요 — 보통 이상이 하나도 없을 때만 문구를 바꿔요.
  eq(isGoodEnough("매우좋음"), true, "매우좋음은 괜찮음");
  eq(isGoodEnough("보통"), true, "보통도 경계값으로 괜찮음");
  eq(isGoodEnough("나쁨"), false, "나쁨은 괜찮지 않음");
  eq(isGoodEnough("매우나쁨"), false, "매우나쁨도 괜찮지 않음");

  eq(formatYmdWeekday("2026-08-15"), "8월 15일 (토)", "요일 포함 표기");

  console.log("activities.ts OK");
}
