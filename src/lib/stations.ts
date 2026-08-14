import { distanceM, type LatLng } from "./geo";
import { DATA_KEY } from "./env";
import { STATIONS } from "./stations-index";
import type { Station, StationTide, Event } from "./tide";

/**
 * 국립해양조사원 조석예보 API를 런타임에 직접 부릅니다.
 * 관측소 목록과 사리/조금 판정 기준선(rangeP25/P75)은 scripts/build-stations.mjs 로
 * 미리 구운 stations-index.ts 표를 씁니다 — 조석은 결정론적이라 해가 바뀌어도
 * 거의 안 변해요. 그날그날의 만조·간조 시각만 API로 받아 메모리에 캐시합니다.
 */
const BASE = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";

const LAST_KEY = "muldae:last-station";

export async function loadStations(): Promise<Station[]> {
  return STATIONS.map(([id, name, lat, lng]) => ({ id, name, lat, lng }));
}

const rangeById = new Map(STATIONS.map(([id, , , , p25, p75]) => [id, { p25, p75 }] as const));

/** 관측소:날짜 별로 한 번 부른 건 다시 안 불러요. */
const dayCache = new Map<string, Event[]>();

async function fetchDay(id: string, ymd: string): Promise<Event[]> {
  const cacheKey = `${id}:${ymd}`;
  const hit = dayCache.get(cacheKey);
  if (hit != null) return hit;

  const url =
    `${BASE}?serviceKey=${DATA_KEY}&obsCode=${id}&reqDate=${ymd}` +
    `&numOfRows=300&type=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("물때표를 읽지 못했어요");
  const json: unknown = await res.json();
  const raw = (json as { body?: { items?: { item?: unknown } } })?.body?.items?.item;
  const items: Record<string, unknown>[] = raw == null ? [] : ([] as unknown[]).concat(raw) as Record<string, unknown>[];
  const events = items
    .map((it) => {
      const hhmm = String(it.predcDt ?? "").slice(11, 16).replace(":", "");
      return {
        t: hhmm,
        cm: Math.round(Number(it.predcTdlvVl)),
        hl: (Number(it.extrSe) % 2 === 1 ? "H" : "L") as Event["hl"], // 1·3=고조, 2·4=저조
      };
    })
    .filter((e) => /^\d{4}$/.test(e.t) && Number.isFinite(e.cm))
    .sort((a, b) => a.t.localeCompare(b.t));

  dayCache.set(cacheKey, events);
  return events;
}

const tideCache = new Map<string, StationTide>();

/** 한 관측소의 물때. date 를 안 주면 오늘이에요. 이미 받은 날짜는 다시 안 부릅니다. */
export async function loadTide(id: string, date: Date = new Date()): Promise<StationTide> {
  const station = (await loadStations()).find((s) => s.id === id);
  if (station == null) throw new Error("모르는 관측소예요");

  const ymd = todayKey(date);
  const events = await fetchDay(id, ymd.replace(/-/g, ""));
  const range = rangeById.get(id) ?? { p25: 0, p75: 0 };

  const prev = tideCache.get(id);
  const out: StationTide = {
    station,
    rangeP25: range.p25,
    rangeP75: range.p75,
    days: { ...(prev?.days ?? {}), [ymd]: events },
  };
  tideCache.set(id, out);
  return out;
}

export function nearestStation(me: LatLng, stations: Station[]): Station | null {
  if (stations.length === 0) return null;
  return stations.reduce((best, s) =>
    distanceM(me, s) < distanceM(me, best) ? s : best,
  );
}

/**
 * 마지막으로 본 관측소를 기억해요.
 * 낚시 가는 사람은 늘 같은 데를 봅니다. 매번 고르게 하면 안 돼요.
 */
export function rememberStation(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* 시크릿 모드 등에서 실패해도 앱이 멈출 일은 아니에요. */
  }
}

export function lastStation(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

const FAVORITES_KEY = "muldae:favorite-stations";

/** 즐겨찾기 목록(id 배열). 순서가 그대로 화면에 보이는 순서예요. */
export function favoriteIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw != null ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveFavorites(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    /* 시크릿 모드 등에서 실패해도 앱이 멈출 일은 아니에요. */
  }
}

/** 즐겨찾기 켜고 끄기. 새 목록을 돌려줘요. */
export function toggleFavorite(id: string): string[] {
  const ids = favoriteIds();
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  saveFavorites(next);
  return next;
}

/** 즐겨찾기 안에서 한 칸 위/아래로. 맨 끝이면 그대로예요. */
export function moveFavorite(id: string, dir: -1 | 1): string[] {
  const ids = favoriteIds();
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  saveFavorites(next);
  return next;
}

/** 오늘 날짜(한국 기준). API 요청 키와 같은 형식이에요. */
export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
