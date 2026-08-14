import { Device } from "@apps-in-toss/web-framework";
import { useCallback, useEffect, useRef, useState } from "react";

import { ImageBannerAd } from "../../components/BannerAd";
import { Card } from "../../components/ScreenLayout";
import { EVENT, track, trackScreen } from "../../lib/analytics";
import type { LatLng } from "../../lib/geo";
import {
  favoriteIds,
  lastStation,
  loadStations,
  loadTide,
  nearestStation,
  rememberStation,
  todayKey,
} from "../../lib/stations";
import {
  bestWindow,
  formatTime,
  tidalRange,
  tier,
  untilLabel,
  type Event,
  type Station,
  type StationTide,
} from "../../lib/tide";
import { palette, tierStyle } from "../../theme";
import { ActivityChips } from "./ActivityChips";
import { StationPicker } from "./StationPicker";

type Phase =
  | { k: "loading" }
  | { k: "ready"; stations: Station[]; tide: StationTide }
  | { k: "error"; message: string };

export function HomeScreen() {
  const [phase, setPhase] = useState<Phase>({ k: "loading" });
  const [picking, setPicking] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [favIds, setFavIds] = useState<string[]>(() => favoriteIds());
  // 활동 칩 20km 판정에만 써요 — 위치를 못 얻으면 칩 자체를 숨깁니다.
  const [coords, setCoords] = useState<LatLng | null>(null);

  const pick = useCallback(async (id: string, stations: Station[]) => {
    const tide = await loadTide(id);
    rememberStation(id);
    track(EVENT.stationPicked, { station: tide.station.name });
    setPhase({ k: "ready", stations, tide });
  }, []);

  const boot = useCallback(async () => {
    setPhase({ k: "loading" });
    try {
      const stations = await loadStations();
      if (stations.length === 0) {
        setPhase({ k: "error", message: "물때 데이터가 아직 없어요." });
        return;
      }

      // 이동했을 수 있으니 위치로 가장 가까운 곳을 먼저 봅니다.
      // 위치를 막으면 마지막에 고른 항으로 — 물때를 보러 온 사람을 권한 화면
      // 앞에 세워두면 안 돼요.
      try {
        const loc = await Device.getLocation({ accuracy: 3 });
        const me = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setCoords(me);
        const near = nearestStation(me, stations);
        await pick((near ?? stations[0]).id, stations);
        return;
      } catch {
        // 위치를 못 쓸 때의 대비책
      }

      const saved = lastStation();
      if (saved != null && stations.some((s) => s.id === saved)) {
        await pick(saved, stations);
        return;
      }

      await pick(stations[0].id, stations);
    } catch {
      setPhase({ k: "error", message: "물때표를 불러오지 못했어요." });
    }
  }, [pick]);

  useEffect(() => {
    trackScreen("home");
    void boot();
  }, [boot]);

  // 화살표로 어제·내일을 보면 그 날짜는 아직 안 받아온 상태라 API를 한 번 더 불러요.
  useEffect(() => {
    if (phase.k !== "ready") return;
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    const key = todayKey(date);
    if (phase.tide.days[key] != null) return;

    let alive = true;
    void loadTide(phase.tide.station.id, date).then((tide) => {
      if (alive) setPhase((p) => (p.k === "ready" ? { ...p, tide } : p));
    });
    return () => {
      alive = false;
    };
  }, [dayOffset, phase]);

  // 늦은 밤엔 오늘 간조가 다 지나 있어요. 내일 첫 간조까지 보여주려고 하루 앞서
  // 받아둬요(dayOffset과 무관 — 활동 카드는 항상 "오늘"만 보므로).
  useEffect(() => {
    if (phase.k !== "ready") return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const key = todayKey(tomorrow);
    if (phase.tide.days[key] != null) return;

    let alive = true;
    void loadTide(phase.tide.station.id, tomorrow).then((tide) => {
      if (alive) setPhase((p) => (p.k === "ready" ? { ...p, tide } : p));
    });
    return () => {
      alive = false;
    };
  }, [phase]);

  if (phase.k === "loading") return <Pad><Note text="물때표를 불러오는 중이에요…" /></Pad>;
  if (phase.k === "error")
    return (
      <Pad>
        <Note text={phase.message} action={{ label: "다시 시도", onClick: () => void boot() }} />
      </Pad>
    );

  const { stations, tide } = phase;
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const key = todayKey(date);
  const events = tide.days[key] ?? [];
  const range = tidalRange(events);
  const t = tier(range, tide.rangeP25, tide.rangeP75);
  const ts = tierStyle(t);
  const now = new Date();
  const nowMin = dayOffset === 0 ? now.getHours() * 60 + now.getMinutes() : 0;
  // 활동 지수는 날짜 화살표와 상관없이 항상 "오늘" 기준이에요.
  const todayEvents = tide.days[todayKey()] ?? [];
  const todayNowMin = now.getHours() * 60 + now.getMinutes();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowEvents = tide.days[todayKey(tomorrow)] ?? [];

  return (
    <Pad>
      {/* ------------------------------------------------- 관측소 선택 */}
      <button
        onClick={() => setPicking((v) => !v)}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 24, fontWeight: 800, color: palette.ink }}>
          {tide.station.name}
        </span>
        <span style={{ fontSize: 16, color: palette.sub }}>{picking ? "▲" : "▼"}</span>
      </button>

      {picking && (
        <Card style={{ padding: 8, marginBottom: 12 }}>
          <StationPicker
            stations={stations}
            selectedId={tide.station.id}
            favIds={favIds}
            onFavChange={setFavIds}
            onPick={(id) => {
              setPicking(false);
              setDayOffset(0);
              void pick(id, stations);
            }}
          />
        </Card>
      )}

      <DayNav offset={dayOffset} onChange={setDayOffset} date={date} />

      {events.length === 0 ? (
        <Note text="이 날짜의 물때 정보가 없어요." />
      ) : (
        <>
          {/* --------------------------------------------- 한 줄 판정 */}
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: ts.color }}>{t}</span>
              <GlossaryButton />
              <span style={{ fontSize: 15, color: palette.sub }}>조차 {range}cm</span>
            </div>
            <p style={{ fontSize: 15, color: palette.sub, margin: "6px 0 0", lineHeight: 1.6 }}>
              {ts.hint}
            </p>

            {dayOffset === 0 && untilLabel(events, nowMin) != null && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: `1px solid ${palette.line}`,
                  fontSize: 18,
                  fontWeight: 700,
                  color: palette.ink,
                }}
              >
                {untilLabel(events, nowMin)}
              </div>
            )}

            {bestWindow(events, nowMin) != null && (
              <div style={{ marginTop: 8, fontSize: 15, color: palette.primary, fontWeight: 700 }}>
                물 볼 시간 · {bestWindow(events, nowMin)}
              </div>
            )}
          </Card>

          {/* ------------------------------------------------- 물때표 */}
          <Card>
            {events.map((e, i) => (
              <EventRow key={i} e={e} passed={dayOffset === 0 && toMin(e.t) <= nowMin} />
            ))}
          </Card>

          {/* ------------------------------------------- 활동별 오늘 여건 */}
          <ActivityChips
            coords={coords}
            events={todayEvents}
            tomorrowEvents={tomorrowEvents}
            nowMin={todayNowMin}
            stationName={tide.station.name}
          />
        </>
      )}

      <p style={{ fontSize: 12, color: palette.sub, marginTop: 16, lineHeight: 1.6 }}>
        국립해양조사원 조석예보 기준이에요. 실제 바다는 바람·기압에 따라 달라질 수 있어요.
      </p>

      {/* 이미지형 배너 — 물때표를 다 본 뒤에 만나요. */}
      <div style={{ marginTop: 24 }}>
        <ImageBannerAd />
      </div>
    </Pad>
  );
}

/* ------------------------------------------------------------------ 조각 */

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(2));

/** 사리/보통/조금/조차 용어 설명. 물음표는 작게 — 물때 표시가 주인공이에요. */
function GlossaryButton() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (boxRef.current != null && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={boxRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="물때 용어 설명 보기"
        style={{
          border: `1px solid ${palette.line}`,
          borderRadius: "50%",
          width: 22,
          height: 22,
          padding: 0,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: "20px",
          color: palette.sub,
          background: palette.white,
        }}
      >
        ?
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 0,
            zIndex: 10,
            width: 260,
            padding: 16,
            borderRadius: 14,
            background: palette.white,
            boxShadow: "0 4px 20px rgba(27,29,33,0.18)",
          }}
        >
          <GlossaryEntry term="사리" text="물이 가장 많이 들고 나는 때예요. 갯벌이 넓게 드러나고 물살도 셉니다." />
          <GlossaryEntry term="보통" text="사리와 조금 사이예요. 물이 적당히 움직입니다." />
          <GlossaryEntry term="조금" text="물이 가장 적게 움직이는 때예요. 물때 차이가 작습니다." />
          <GlossaryEntry
            term="조차"
            text="그날 물이 가장 높을 때와 가장 낮을 때의 높이 차이예요. 숫자가 클수록 물이 크게 움직여요."
            last
          />
        </div>
      )}
    </div>
  );
}

function GlossaryEntry({ term, text, last }: { term: string; text: string; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 10 }}>
      <span style={{ fontSize: 16, fontWeight: 800, color: palette.ink }}>{term}</span>
      <p style={{ fontSize: 15, color: palette.sub, margin: "2px 0 0", lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

function DayNav({
  offset,
  onChange,
  date,
}: {
  offset: number;
  onChange: (n: number) => void;
  date: Date;
}) {
  const label =
    offset === 0
      ? "오늘"
      : offset === 1
        ? "내일"
        : offset === -1
          ? "어제"
          : `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 14px" }}>
      <NavBtn label="‹" onClick={() => onChange(offset - 1)} />
      <span style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: 700, color: palette.ink }}>
        {label} ({date.getMonth() + 1}/{date.getDate()})
      </span>
      <NavBtn label="›" onClick={() => onChange(offset + 1)} />
    </div>
  );
}

function NavBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none",
        borderRadius: 10,
        width: 44,
        height: 44,
        fontSize: 22,
        fontWeight: 700,
        color: palette.primary,
        background: palette.white,
      }}
    >
      {label}
    </button>
  );
}

function EventRow({ e, passed }: { e: Event; passed: boolean }) {
  const isHigh = e.hl === "H";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        opacity: passed ? 0.4 : 1,
      }}
    >
      {/* 색만으로 구분하지 않아요 — 글자로도 만조/간조를 씁니다. */}
      <span
        style={{
          width: 52,
          fontSize: 15,
          fontWeight: 800,
          color: isHigh ? palette.high : palette.low,
        }}
      >
        {isHigh ? "만조" : "간조"}
      </span>
      <span style={{ flex: 1, fontSize: 22, fontWeight: 800, color: palette.ink }}>
        {formatTime(e.t)}
      </span>
      <span style={{ fontSize: 16, color: palette.sub }}>{e.cm}cm</span>
    </div>
  );
}

function Pad({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        background: palette.bg,
        padding: "16px 20px 24px",
        paddingTop: "max(16px, env(safe-area-inset-top))",
      }}
    >
      {children}
    </div>
  );
}

function Note({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Card style={{ textAlign: "center", padding: 24 }}>
      <p style={{ fontSize: 15, color: palette.sub, margin: 0, lineHeight: 1.6 }}>{text}</p>
      {action != null && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 16,
            border: "none",
            borderRadius: 12,
            padding: "14px 20px",
            fontSize: 16,
            fontWeight: 700,
            color: palette.white,
            background: palette.primary,
          }}
        >
          {action.label}
        </button>
      )}
    </Card>
  );
}
