import { distanceM, type LatLng } from "./geo";
import type { Station, StationTide, Event } from "./tide";

/** 빌드 때 구운 정적 파일. 런타임에 외부 API를 부르지 않아요. */
const INDEX_URL = "/data/tide/index.json";
const STATION_URL = (id: string) => `/data/tide/${id}.json`;

const LAST_KEY = "muldae:last-station";

let indexCache: Station[] | null = null;

export async function loadStations(): Promise<Station[]> {
  if (indexCache != null) return indexCache;
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error("관측소 목록을 읽지 못했어요");
  indexCache = (await res.json()) as Station[];
  return indexCache;
}

/** 파일에는 배열로 눌러 담겨 있어요. 앱에서 쓸 모양으로 폅니다. */
type RawEvent = [string, number, "H" | "L"];
interface RawTide {
  station: Station;
  rangeP25: number;
  rangeP75: number;
  days: Record<string, RawEvent[]>;
}

const tideCache = new Map<string, StationTide>();

export async function loadTide(id: string): Promise<StationTide> {
  const hit = tideCache.get(id);
  if (hit != null) return hit;
  const res = await fetch(STATION_URL(id));
  if (!res.ok) throw new Error("물때표를 읽지 못했어요");
  const raw = (await res.json()) as RawTide;
  const days: Record<string, Event[]> = {};
  for (const [ymd, list] of Object.entries(raw.days)) {
    days[ymd] = list.map(([t, cm, hl]) => ({ t, cm, hl }));
  }
  const out: StationTide = {
    station: raw.station,
    rangeP25: raw.rangeP25,
    rangeP75: raw.rangeP75,
    days,
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

/** 오늘 날짜(한국 기준). 파일 키와 같은 형식이에요. */
export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
