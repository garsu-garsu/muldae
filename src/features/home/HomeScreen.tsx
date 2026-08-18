import { Device } from "@apps-in-toss/web-framework";
import { useCallback, useEffect, useRef, useState } from "react";

import { ImageBannerAd } from "../../components/BannerAd";
import { CoachMarks } from "../../components/CoachMarks";
import { Card } from "../../components/ScreenLayout";
import { EVENT, track, trackScreen } from "../../lib/analytics";
import { isLocationAllowed } from "../../lib/locationPermission";
import { noteGoodExperience } from "../../lib/review";
import { shareTide } from "../../lib/share";
import {
  favoriteIds,
  lastPickerView,
  lastStation,
  loadStations,
  loadTide,
  nearestStation,
  rememberPickerView,
  rememberStation,
  todayKey,
  type PickerView,
} from "../../lib/stations";
import { formatSunTime, sunTimes } from "../../lib/sun";
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
import { StationMap } from "./StationMap";
import { StationPicker } from "./StationPicker";

type Phase =
  | { k: "loading" }
  | { k: "ready"; stations: Station[]; tide: StationTide }
  | { k: "error"; message: string };

export function HomeScreen() {
  const [phase, setPhase] = useState<Phase>({ k: "loading" });
  const [picking, setPicking] = useState(false);
  const [pickerView, setPickerViewState] = useState<PickerView>(() => lastPickerView());
  const [dayOffset, setDayOffset] = useState(0);
  const [favIds, setFavIds] = useState<string[]>(() => favoriteIds());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  /** 위치로 항을 잡아본 적이 있는지. 버튼 문구를 정하는 데만 써요. */
  const locatedRef = useRef(false);

  // 코치마크가 가리킬 요소들.
  const stationRowRef = useRef<HTMLDivElement>(null);
  const glossaryRef = useRef<HTMLDivElement>(null);
  const activityRowRef = useRef<HTMLDivElement>(null);
  const dayNavRef = useRef<HTMLDivElement>(null);

  const pick = useCallback(async (id: string, stations: Station[]) => {
    const tide = await loadTide(id);
    rememberStation(id);
    track(EVENT.stationPicked, { station: tide.station.name });
    setPhase({ k: "ready", stations, tide });
  }, []);

  /** 지금 위치에서 가장 가까운 항으로. 못 찾으면 그냥 던져요 — 호출한 쪽에서 대비책을 정합니다. */
  const locateNearest = useCallback(
    async (stations: Station[]) => {
      const loc = await Device.getLocation({ accuracy: 3 });
      locatedRef.current = true;
      const me = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      const near = nearestStation(me, stations);
      await pick((near ?? stations[0]).id, stations);
    },
    [pick],
  );

  const boot = useCallback(async () => {
    setPhase({ k: "loading" });
    try {
      const stations = await loadStations();
      if (stations.length === 0) {
        setPhase({ k: "error", message: "물때 데이터가 아직 없어요." });
        return;
      }

      // 이동했을 수 있으니 위치로 가장 가까운 곳을 먼저 봅니다.
      // 단, **이미 허용된 경우에만** 이에요. 아직 허용 전이라면 여기서 위치를
      // 물으면 진입 직후 권한 바텀시트가 뜨고, 그게 심사 반려 사유입니다
      // (20260818-16). 그때는 마지막에 고른 항으로 물때를 바로 보여주고,
      // 위치는 "가까운 항으로" 버튼을 누를 때 잡아요.
      if (await isLocationAllowed()) {
        try {
          await locateNearest(stations);
          return;
        } catch {
          // 허용돼 있는데도 실패하면 아래 대비책으로 내려가요.
        }
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
  }, [pick, locateNearest]);

  useEffect(() => {
    trackScreen("home");
    void boot();
  }, [boot]);

  /**
   * "다시 찾기". 앱을 안 끄고 이동했을 수 있으니 지금 위치로 다시 잡아요.
   * 마지막 선택·즐겨찾기와 무관하게 항상 지금 위치 기준입니다. 실패해도 보고
   * 있던 화면은 그대로 두고 실패만 알려요 — 빈 화면이 되면 안 돼요.
   */
  const refresh = useCallback(() => {
    if (refreshing || phase.k !== "ready") return; // 연타 방지
    setRefreshing(true);
    setRefreshError(null);
    void locateNearest(phase.stations)
      .then(() => setDayOffset(0))
      .catch(() => setRefreshError("위치를 다시 잡지 못했어요."))
      .finally(() => setRefreshing(false));
  }, [refreshing, phase, locateNearest]);

  const setPickerView = (v: PickerView) => {
    setPickerViewState(v);
    rememberPickerView(v);
  };

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
  // 활동 카드도 이제 날짜 화살표를 따라가요(오늘 이후는 광고로 잠김) — 늦은 밤
  // 오늘 간조가 다 지났을 때만 내일 것으로 넘어가는 용도로 tomorrowEvents를 남겨둬요.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowEvents = tide.days[todayKey(tomorrow)] ?? [];
  // 일출·일몰은 좌표만 있으면 계산되니 API 도, 잠금도 없어요. 새벽 만조가 해
  // 뜨기 전인지 후인지가 이 앱을 여는 이유의 절반이라, 어느 날짜든 그냥 보여줘요.
  const sun = sunTimes(key, tide.station.lat, tide.station.lng);

  return (
    <Pad>
      {/* ------------------------------------------------- 관측소 선택 */}
      <div
        ref={stationRowRef}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}
      >
        <button
          onClick={() => setPicking((v) => !v)}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 24, fontWeight: 800, color: palette.ink }}>
            {tide.station.name}
          </span>
          <span style={{ fontSize: 16, color: palette.sub }}>{picking ? "▲" : "▼"}</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => {
              setPickerView("map");
              setPicking(true);
            }}
            aria-label="지도로 항 고르기"
            style={{
              border: "none",
              borderRadius: 10,
              width: 36,
              height: 36,
              fontSize: 17,
              background: "rgba(22,104,184,0.10)",
            }}
          >
            🗺️
          </button>

          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              border: "none",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 14,
              fontWeight: 700,
              color: refreshing ? palette.sub : palette.primary,
              background: "rgba(22,104,184,0.10)",
            }}
          >
            {refreshing ? "찾는 중…" : locatedRef.current ? "다시 찾기" : "가까운 항으로"}
          </button>
        </div>
      </div>
      {refreshError != null && (
        <p style={{ fontSize: 12, color: palette.low, margin: "0 0 4px" }}>{refreshError}</p>
      )}

      {picking && (
        <Card style={{ padding: 8, marginBottom: 12 }}>
          {/* 목록형 ↔ 지도형 전환. 마지막에 고른 쪽을 기억해요. */}
          <div style={{ display: "flex", gap: 8, padding: "4px 4px 10px" }}>
            <ViewTab label="목록" active={pickerView === "list"} onClick={() => setPickerView("list")} />
            <ViewTab label="지도" active={pickerView === "map"} onClick={() => setPickerView("map")} />
          </div>

          {pickerView === "list" ? (
            <StationPicker
              stations={stations}
              selectedId={tide.station.id}
              favIds={favIds}
              onFavChange={setFavIds}
              onPick={(id) => {
                setPicking(false);
                setDayOffset(0);
                // 보려던 항을 직접 골라 물때를 본 것 = 이 앱에서의 좋은 경험.
                // 리뷰는 이때만 물어봐요(진입 직후에 뜨는 창은 반려 사유).
                void pick(id, stations).then(noteGoodExperience);
              }}
            />
          ) : (
            <StationMap
              stations={stations}
              selected={tide.station}
              favIds={favIds}
              onPick={(id) => {
                setPicking(false);
                setDayOffset(0);
                // 보려던 항을 직접 골라 물때를 본 것 = 이 앱에서의 좋은 경험.
                // 리뷰는 이때만 물어봐요(진입 직후에 뜨는 창은 반려 사유).
                void pick(id, stations).then(noteGoodExperience);
              }}
              onTileFailed={() => setPickerView("list")}
            />
          )}
        </Card>
      )}

      <DayNav offset={dayOffset} onChange={setDayOffset} date={date} navRef={dayNavRef} />

      {events.length === 0 ? (
        <Note text="이 날짜의 물때 정보가 없어요." />
      ) : (
        <>
          {/* --------------------------------------------- 한 줄 판정 */}
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: ts.color }}>{t}</span>
              <GlossaryButton markRef={glossaryRef} />
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

            {sun != null && (
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 14,
                  fontSize: 15,
                  color: palette.sub,
                }}
              >
                {/* 해가 뜨고 지는 시각. 색이 아니라 글자로 구분해요. */}
                <span>
                  일출 <b style={{ color: palette.ink }}>{formatSunTime(sun.rise)}</b>
                </span>
                <span>
                  일몰 <b style={{ color: palette.ink }}>{formatSunTime(sun.set)}</b>
                </span>
              </div>
            )}
          </Card>

          {/* ------------------------------------------------- 물때표 */}
          <Card>
            {events.map((e, i) => (
              <EventRow key={i} e={e} passed={dayOffset === 0 && toMin(e.t) <= nowMin} />
            ))}
          </Card>

          {/* "내일 그 항 어때?" 를 그대로 보낼 수 있게. 만조·간조·일출·일몰이 한 덩어리로 나가요. */}
          <button
            type="button"
            onClick={() =>
              void shareTide({
                station: tide.station,
                ymd: key,
                events,
                rangeP25: tide.rangeP25,
                rangeP75: tide.rangeP75,
              })
            }
            style={{
              width: "100%",
              marginTop: 10,
              border: `1px solid ${palette.line}`,
              borderRadius: 12,
              padding: "13px 0",
              fontSize: 15,
              fontWeight: 700,
              color: palette.primary,
              background: "transparent",
            }}
          >
            이 물때 공유하기
          </button>

          {/* ------------------------------------------- 활동별 여건 */}
          {/* 활동 지점은 "화면에 뜬 항" 기준이에요 — 물때는 가기 전에 미리 보는
              앱이라, 내 실제 위치가 아니라 지금 보고 있는 항(예: 서울 사는 사람이
              태안으로 바꿔 본 경우) 근처 활동을 보여줘야 해요. 날짜는 위 화살표를
              따라가되, 오늘 이후는 광고로 잠겨요(ActivityChips 안에서 처리). */}
          <ActivityChips
            coords={{ lat: tide.station.lat, lng: tide.station.lng }}
            events={events}
            tomorrowEvents={tomorrowEvents}
            nowMin={nowMin}
            stationName={tide.station.name}
            stationId={tide.station.id}
            selectedYmd={key}
            isToday={dayOffset === 0}
            rootRef={activityRowRef}
          />
        </>
      )}

      {/* 출처는 두 줄로 나눠요 — 물때는 정부 예보를 받아오고, 일출·일몰은 앱이
          직접 계산해서 성격이 다릅니다. 한 문단에 붙이면 둘 다 조석예보에서
          받아온 것처럼 읽혀요. */}
      <p style={{ fontSize: 12, color: palette.sub, marginTop: 16, lineHeight: 1.6 }}>
        국립해양조사원 조석예보 기준이에요. 실제 바다는 바람·기압에 따라 달라질 수 있어요.
      </p>
      <p style={{ fontSize: 12, color: palette.sub, margin: "4px 0 0", lineHeight: 1.6 }}>
        일출·일몰은 이 항의 위치로 앱이 직접 계산해요. 미국 해군천문대(USNO)가 공개한
        시각과 대조해 1분 안으로 맞췄고, 산이나 건물에 가리면 실제로 보이는 시각은
        조금 늦거나 빠를 수 있어요.
      </p>

      {/* 이미지형 배너 — 물때표를 다 본 뒤에 만나요. */}
      <div style={{ marginTop: 24 }}>
        <ImageBannerAd />
      </div>

      <CoachMarks
        storageKey="muldae:coach:v1"
        steps={[
          {
            ref: stationRowRef,
            title: "다른 항으로 바꿔보세요",
            body: "이름을 누르면 목록에서, 지도 아이콘을 누르면 지도에서 항을 고를 수 있어요.",
          },
          {
            ref: glossaryRef,
            title: "사리·조금이 궁금하다면",
            body: "물음표를 누르면 사리·조금·조차가 무슨 뜻인지 바로 볼 수 있어요.",
          },
          {
            ref: activityRowRef,
            title: "오늘 바다 활동은 어때요?",
            body: "낚시·갯벌·해수욕 중에 고르면 오늘 여건이 좋은지 알려드려요.",
          },
          {
            ref: dayNavRef,
            title: "다른 날도 볼 수 있어요",
            body: "화살표를 누르면 어제와 내일, 다음 주 물때까지 미리 볼 수 있어요.",
          },
        ]}
      />
    </Pad>
  );
}

/* ------------------------------------------------------------------ 조각 */

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(2));

/** 사리/보통/조금/조차 용어 설명. 물음표는 작게 — 물때 표시가 주인공이에요. */
function GlossaryButton({ markRef }: { markRef: React.RefObject<HTMLDivElement> }) {
  const [open, setOpen] = useState(false);
  const boxRef = markRef;

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (boxRef.current != null && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open, boxRef]);

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
  navRef,
}: {
  offset: number;
  onChange: (n: number) => void;
  date: Date;
  navRef?: React.RefObject<HTMLDivElement>;
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
    <div ref={navRef} style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 14px" }}>
      <NavBtn label="‹" onClick={() => onChange(offset - 1)} />
      <span style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: 700, color: palette.ink }}>
        {label} ({date.getMonth() + 1}/{date.getDate()})
      </span>
      <NavBtn label="›" onClick={() => onChange(offset + 1)} />
    </div>
  );
}

/** 항 고르기 안의 목록/지도 전환 탭. */
function ViewTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        border: "none",
        borderRadius: 10,
        padding: "10px 0",
        fontSize: 15,
        fontWeight: 700,
        color: active ? palette.white : palette.sub,
        background: active ? palette.primary : "rgba(22,104,184,0.08)",
      }}
    >
      {label}
    </button>
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
