import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { Card } from "../../components/ScreenLayout";
import { useAdGate } from "../../hooks/useAdGate";
import { EVENT, track } from "../../lib/analytics";
import {
  ACTIVITY_LABEL,
  activityBits,
  formatYmd,
  formatYmdWeekday,
  indexHeadline,
  inflowLabel,
  isRipUrgent,
  lastActivity,
  loadActivity,
  loadRipCurrent,
  nearestActivityPoint,
  nearestRipPoint,
  pickCurrent,
  pickForDate,
  rememberActivity,
  seasickHeadline,
  visibleActivities,
  type ActivityKey,
  type ActivityRecord,
  type RipRecord,
} from "../../lib/activities";
import type { LatLng } from "../../lib/geo";
import type { Event } from "../../lib/tide";
import { palette } from "../../theme";
import { isIndexLocked, isUnlockedToday, markUnlockedToday } from "../../lib/unlock";
import { WeeklyBest } from "./WeeklyBest";

type ActState =
  | { k: "idle" }
  | { k: "loading" }
  | { k: "ready"; records: ActivityRecord[]; pointName: string }
  | { k: "error" };

/**
 * 활동별 여건. 무료 덤 기능이라 지수를 못 받아와도 화면이 죽으면 안 돼요
 * — 실패하면 이 카드만 조용히 안내 문구로 바뀝니다.
 *
 * 오늘 지수는 항상 무료, 내일 이후 지수·이번 주 좋은 시간대는 광고 한 번으로
 * 하루 동안 같이 열려요(잠금 판정은 lib/unlock.ts).
 */
export function ActivityChips({
  coords,
  events,
  tomorrowEvents,
  nowMin,
  stationName,
  stationId,
  selectedYmd,
  isToday,
}: {
  /** "화면에 뜬 항"의 좌표예요(내 실제 위치가 아니라) — 태안 항을 보고 있으면 태안 근처 활동을 찾습니다. */
  coords: LatLng | null;
  /** 날짜 화살표로 고른 그 날짜의 물때예요 — 활동 지수도 이제 이 날짜를 따라가요. */
  events: Event[];
  /** 오늘 간조가 이미 다 지났을 때(늦은 밤) 내일 첫 간조로 넘어가는 용도예요. isToday일 때만 써요. */
  tomorrowEvents: Event[];
  nowMin: number;
  /** 위 물때표가 어느 관측소 기준인지 — 갯벌·해수욕 지점과 다를 수 있어 시각 안내에 같이 써요. */
  stationName: string;
  /** 이번 주 좋은 시간대(해수욕·스킨스쿠버)에서 날짜별 물때를 따로 받아올 때 써요. */
  stationId: string;
  /** 날짜 화살표로 고른 날짜(YYYY-MM-DD). */
  selectedYmd: string;
  isToday: boolean;
}) {
  const [selected, setSelected] = useState<ActivityKey | null>(null);
  const [state, setState] = useState<ActState>({ k: "idle" });
  const [rip, setRip] = useState<RipRecord | null>(null);
  const { watchThen } = useAdGate();
  const [unlocked, setUnlocked] = useState(() => isUnlockedToday());

  // coords는 HomeScreen에서 매 렌더마다 새로 만든 객체라 참조가 안 바뀌길 기대하면
  // 안 돼요. 값이 실제로 바뀌었을 때만(=항이 바뀌었을 때만) 아래 effect들이 다시
  // 돌게, 좌표를 문자열 키로 바꿔서 의존성에 씁니다.
  const coordsKey = coords == null ? null : `${coords.lat},${coords.lng}`;

  const visible = useMemo(() => (coords == null ? [] : visibleActivities(coords)), [coordsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 항이 바뀐 뒤 — 지난번에 고른 활동이 새 항에도 있으면 그대로 이어가고, 없으면 풀어요.
  useEffect(() => {
    if (coords == null || visible.length === 0) return;
    setSelected((cur) => {
      if (cur != null && visible.includes(cur)) return cur;
      const saved = lastActivity();
      return saved != null && visible.includes(saved) ? saved : null;
    });
  }, [coordsKey, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selected == null || coords == null) {
      setState({ k: "idle" });
      return;
    }
    const point = nearestActivityPoint(coords, selected);
    if (point == null) {
      setState({ k: "idle" });
      return;
    }

    let alive = true;
    setState({ k: "loading" });
    loadActivity(selected, point.name)
      .then((records) => {
        if (alive) setState({ k: "ready", records, pointName: point.name });
      })
      .catch(() => {
        if (alive) setState({ k: "error" });
      });
    return () => {
      alive = false;
    };
  }, [selected, coordsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 날짜 화살표로 고른 날짜의 레코드. records는 이미 7일치라 다시 안 불러도 돼요.
  const dayRecord = useMemo(() => {
    if (state.k !== "ready") return null;
    return isToday ? pickCurrent(state.records) : pickForDate(state.records, selectedYmd);
  }, [state, isToday, selectedYmd]);

  // 이안류 — 해수욕·스킨스쿠버를 골랐고 20km 안에 관측 지점이 있을 때만.
  // 예보가 아니라 실측치라 별도 캐시 없이 매번 최신 한 건만 받아요.
  useEffect(() => {
    setRip(null);
    if (coords == null || (selected !== "해수욕" && selected !== "스킨스쿠버")) return;
    const point = nearestRipPoint(coords);
    if (point == null) return;
    let alive = true;
    loadRipCurrent(point.code)
      .then((r) => {
        if (alive) setRip(r);
      })
      .catch(() => {
        /* 덤 기능 — 실패해도 조용히 안 보여줘요. */
      });
    return () => {
      alive = false;
    };
  }, [selected, coordsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (visible.length === 0) return null;

  const pick = (key: ActivityKey) => {
    setSelected(key);
    rememberActivity(key);
    track(EVENT.activityPicked, { activity: key });
  };

  // 내일 이후 지수·이번 주 좋은 시간대를 하루 한 번 광고로 같이 열어요. 버튼이
  // 하나뿐이라(WeeklyBest 안) context를 따로 안 받아요.
  const openGate = () => {
    track(EVENT.premiumClicked);
    watchThen(() => {
      markUnlockedToday();
      setUnlocked(true);
      track(EVENT.premiumUnlocked);
    });
  };

  return (
    <Card style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: palette.sub, margin: "0 0 10px" }}>
        {isToday ? "오늘" : formatYmdWeekday(selectedYmd)} 바다 활동 여건
      </p>

      {/* 최대 9개까지 붙을 수 있어요 — 줄바꿈 대신 가로 스크롤로. 오른쪽에 그러데이션을
          얹어서 더 있다는 게 눈에 보이게 둡니다(스크롤이 실제로 필요 없어도 해로울 게 없어요). */}
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
          {visible.map((k) => (
            <Chip key={k} label={ACTIVITY_LABEL[k]} active={k === selected} onClick={() => pick(k)} />
          ))}
        </div>
        {visible.length > 4 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 2,
              width: 28,
              background: `linear-gradient(to right, transparent, ${palette.card})`,
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {selected != null && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${palette.line}` }}>
          {state.k === "loading" && <p style={muted}>{ACTIVITY_LABEL[selected]} 지수를 불러오는 중이에요…</p>}
          {state.k === "error" && (
            <p style={muted}>지금은 {ACTIVITY_LABEL[selected]} 지수를 불러오지 못했어요.</p>
          )}
          {state.k === "ready" && dayRecord == null && (
            <p style={muted}>{isToday ? "오늘은" : "그 날짜엔"} {ACTIVITY_LABEL[selected]} 지수가 없어요.</p>
          )}
          {state.k === "ready" && dayRecord != null && (
            <ActivityDetail
              activity={selected}
              record={dayRecord}
              pointName={state.pointName}
              events={events}
              tomorrowEvents={isToday ? tomorrowEvents : []}
              nowMin={nowMin}
              stationName={stationName}
              locked={isIndexLocked(isToday, unlocked)}
            />
          )}
          {rip != null && <RipWarning record={rip} />}
          {state.k === "ready" && (
            <WeeklyBest
              activity={selected}
              records={state.records}
              pointName={state.pointName}
              stationId={stationId}
              stationName={stationName}
              isToday={isToday}
              unlocked={unlocked}
              onOpen={openGate}
            />
          )}
        </div>
      )}

      <p style={{ fontSize: 12, color: palette.sub, marginTop: 12, lineHeight: 1.6 }}>
        {state.k === "ready" && dayRecord != null
          ? `국립해양조사원 · ${formatYmd(dayRecord.ymd)} 예보 기준`
          : "국립해양조사원 생활해양예보지수 기준이에요. 예보라 실제와 다를 수 있어요."}
      </p>
    </Card>
  );
}

/** 이안류 경고. 관심·주의는 조용히, 경계·위험만 눈에 띄게 — 늘 떠 있으면 무시당해요. */
function RipWarning({ record }: { record: RipRecord }) {
  const urgent = isRipUrgent(record.level);
  return (
    <div
      style={{
        marginTop: 12,
        padding: urgent ? 12 : 0,
        borderRadius: 10,
        background: urgent ? "#FDECEC" : "transparent",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: urgent ? 16 : 14,
          fontWeight: urgent ? 800 : 500,
          color: urgent ? "#C81E1E" : palette.sub,
        }}
      >
        {urgent ? "⚠ " : ""}이안류 {record.level} · {record.time} 관측
      </p>
    </div>
  );
}

function ActivityDetail({
  activity,
  record,
  pointName,
  events,
  tomorrowEvents,
  nowMin,
  stationName,
  locked,
}: {
  activity: ActivityKey;
  record: ActivityRecord;
  pointName: string;
  events: Event[];
  tomorrowEvents: Event[];
  nowMin: number;
  stationName: string;
  /** 내일 이후 날짜인데 오늘 아직 광고를 안 봤을 때. 여는 버튼은 아래 WeeklyBest 하나뿐이에요(중복 방지). */
  locked: boolean;
}) {
  // 뱃멀미는 등급 방향이 반대라(좋음=쾌적, 나쁨=멀미 쉬움) 다른 활동과 같은 틀을
  // 쓰면 "오늘 뱃멀미하기 좋아요"가 되어버려요. 전용 문구로 분리합니다.
  const headline = activity === "뱃멀미" ? seasickHeadline(record.grade) : indexHeadline(activity, record.grade);

  const bits = activityBits(activity, record);

  const inflow = inflowLabel(activity, record, events, tomorrowEvents, nowMin, pointName, stationName);

  return (
    <div>
      {locked ? (
        <p style={{ fontSize: 15, color: palette.sub, margin: 0, lineHeight: 1.5 }}>
          내일 이후 지수는 아래 "이번 주 좋은 시간대"에서 광고 한 번 보면 같이 열려요.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 20, fontWeight: 800, color: palette.ink, margin: 0 }}>{headline}</p>
          {bits.length > 0 && (
            <p style={{ fontSize: 15, color: palette.sub, margin: "6px 0 0" }}>{bits.join(" · ")}</p>
          )}
        </>
      )}
      {/* 물 들어오는 시각 — 다치는 걸 막는 안전 정보라 locked 여부와 무관하게 항상 보여요. */}
      {inflow != null && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: palette.primaryDeep, margin: 0 }}>
            {inflow.line1}
          </p>
          {inflow.line2 != null && (
            <p style={{ fontSize: 14, color: palette.sub, margin: "2px 0 0" }}>{inflow.line2}</p>
          )}
        </div>
      )}
    </div>
  );
}


function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        whiteSpace: "nowrap",
        border: active ? "none" : `1px solid ${palette.line}`,
        borderRadius: 20,
        padding: "10px 16px",
        fontSize: 15,
        fontWeight: 700,
        color: active ? palette.white : palette.ink,
        background: active ? palette.primary : palette.white,
      }}
    >
      {label}
    </button>
  );
}

const muted: CSSProperties = { fontSize: 15, color: palette.sub, margin: 0 };
