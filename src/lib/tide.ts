/**
 * 물때 판정.
 *
 * 조석은 천문학적으로 결정돼요. 그래서 1년치를 미리 계산해 정적 파일로 굽고,
 * 앱은 계산된 값만 읽습니다. 런타임에 부르는 API가 없어요.
 *
 * 여기서 하는 일은 "숫자를 사람 말로 바꾸는" 것뿐이에요.
 * 원본은 만조/간조 시각과 조위(cm) 나열일 뿐이라 그대로 보여주면 아무 의미가 없어요.
 */

/** 만조(H) / 간조(L) 한 번. */
export interface Event {
  /** "HHMM" (한국시) */
  t: string;
  /** 조위 cm */
  cm: number;
  hl: "H" | "L";
}

export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface StationTide {
  station: Station;
  /** 연중 조차 분포. 사리/조금 판정 기준선이에요. */
  rangeP25: number;
  rangeP75: number;
  /** "YYYY-MM-DD" → 그날의 만조·간조 */
  days: Record<string, Event[]>;
}

export type Tier = "사리" | "보통" | "조금";

export function toMinutes(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(2));
}

export function formatTime(t: string): string {
  return `${t.slice(0, 2)}:${t.slice(2)}`;
}

/** 그날의 조차 = 최고 만조 - 최저 간조. 물이 얼마나 크게 움직이는지예요. */
export function tidalRange(events: Event[]): number {
  if (events.length === 0) return 0;
  const highs = events.filter((e) => e.hl === "H").map((e) => e.cm);
  const lows = events.filter((e) => e.hl === "L").map((e) => e.cm);
  if (highs.length === 0 || lows.length === 0) return 0;
  return Math.max(...highs) - Math.min(...lows);
}

/**
 * 사리 / 보통 / 조금.
 *
 * 음력을 계산해서 물때 숫자를 뽑는 방식은 지역마다 기준이 달라요(7물때식·8물때식).
 * 조차는 데이터에 이미 들어 있고 지역 기준을 탈 일이 없어서, 그 관측소의
 * 연중 조차 분포에서 어디쯤인지로 판정합니다.
 * ponytail: 조차 백분위로 판정. 물때 숫자(N물)가 꼭 필요하면 음력 계산을 붙이세요.
 */
export function tier(range: number, p25: number, p75: number): Tier {
  if (range >= p75) return "사리";
  if (range <= p25) return "조금";
  return "보통";
}

/** 다음에 올 물돌이. 이미 다 지났으면 null. */
export function nextEvent(events: Event[], nowMin: number): Event | null {
  return events.find((e) => toMinutes(e.t) > nowMin) ?? null;
}

/**
 * "언제 나가야 하나" 한 줄.
 *
 * 물이 멈춰 있는 만조·간조 정각보다, 그 앞뒤로 물이 움직이는 때가 좋아요.
 * 가장 가까운 물돌이의 앞뒤 1시간 30분을 추천 창으로 잡습니다.
 */
export function bestWindow(events: Event[], nowMin: number): string | null {
  const next = nextEvent(events, nowMin);
  if (next == null) return null;
  const m = toMinutes(next.t);
  const fmt = (v: number) => {
    const w = ((v % 1440) + 1440) % 1440;
    return `${String(Math.floor(w / 60)).padStart(2, "0")}:${String(w % 60).padStart(2, "0")}`;
  };
  const kind = next.hl === "H" ? "만조" : "간조";
  return `${fmt(m - 90)}~${fmt(m + 90)} (${formatTime(next.t)} ${kind} 앞뒤)`;
}

/** 지금부터 다음 물돌이까지 남은 시간. */
export function untilLabel(events: Event[], nowMin: number): string | null {
  const next = nextEvent(events, nowMin);
  if (next == null) return null;
  const diff = toMinutes(next.t) - nowMin;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  const kind = next.hl === "H" ? "만조" : "간조";
  if (h === 0) return `${m}분 뒤 ${kind}`;
  return `${h}시간 ${m}분 뒤 ${kind}`;
}

/* ------------------------------------------------------------------ */
/* 자체 점검 — `npm run check:tide`                                    */
/* ------------------------------------------------------------------ */
export function demo(): void {
  const eq = (got: unknown, want: unknown, label: string) => {
    if (got !== want) throw new Error(`${label}: ${String(got)} !== ${String(want)}`);
  };

  const day: Event[] = [
    { t: "0312", cm: 812, hl: "H" },
    { t: "0930", cm: 96, hl: "L" },
    { t: "1548", cm: 845, hl: "H" },
    { t: "2201", cm: 130, hl: "L" },
  ];

  eq(tidalRange(day), 845 - 96, "조차는 최고만조-최저간조");
  eq(tidalRange([]), 0, "빈 날은 0");
  eq(tidalRange([{ t: "0100", cm: 500, hl: "H" }]), 0, "간조가 없으면 0");

  eq(tier(800, 300, 700), "사리", "p75 이상은 사리");
  eq(tier(200, 300, 700), "조금", "p25 이하는 조금");
  eq(tier(500, 300, 700), "보통", "사이는 보통");
  eq(tier(700, 300, 700), "사리", "경계는 사리 쪽");

  eq(nextEvent(day, 0)?.t, "0312", "자정엔 첫 만조가 다음");
  eq(nextEvent(day, toMinutes("0312"))?.t, "0930", "정각은 지난 것으로 봄");
  eq(nextEvent(day, toMinutes("2300")), null, "다 지나면 null");

  eq(untilLabel(day, toMinutes("0300")), "12분 뒤 만조", "1시간 미만");
  eq(untilLabel(day, toMinutes("0100")), "2시간 12분 뒤 만조", "시간+분");

  eq(bestWindow(day, toMinutes("0100")), "01:42~04:42 (03:12 만조 앞뒤)", "추천 창");
  // 자정을 넘어가도 시각이 깨지지 않아야 해요.
  eq(bestWindow([{ t: "0030", cm: 800, hl: "H" }], 0), "23:00~02:00 (00:30 만조 앞뒤)", "자정 넘김");

  eq(formatTime("0930"), "09:30", "시각 표기");
  console.log("tide.ts OK");
}
