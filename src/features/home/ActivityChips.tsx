import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { Card } from "../../components/ScreenLayout";
import { EVENT, track } from "../../lib/analytics";
import {
  ACTIVITY_LABEL,
  NEEDS_INFLOW_WARNING,
  formatYmd,
  indexHeadline,
  isRipUrgent,
  lastActivity,
  loadActivity,
  loadRipCurrent,
  nearestActivityPoint,
  nearestRipPoint,
  pickCurrent,
  rememberActivity,
  visibleActivities,
  type ActivityKey,
  type ActivityRecord,
  type RipRecord,
} from "../../lib/activities";
import type { LatLng } from "../../lib/geo";
import { formatTime, nextLowTide, type Event } from "../../lib/tide";
import { palette } from "../../theme";

type ActState =
  | { k: "idle" }
  | { k: "loading" }
  | { k: "ready"; record: ActivityRecord | null; pointName: string }
  | { k: "error" };

/**
 * 활동별 오늘 여건. 무료 덤 기능이라 지수를 못 받아와도 화면이 죽으면 안 돼요
 * — 실패하면 이 카드만 조용히 안내 문구로 바뀝니다.
 */
export function ActivityChips({
  coords,
  events,
  nowMin,
  stationName,
}: {
  coords: LatLng | null;
  events: Event[];
  nowMin: number;
  /** 위 물때표가 어느 관측소 기준인지 — 갯벌·해수욕 지점과 다를 수 있어 시각 안내에 같이 써요. */
  stationName: string;
}) {
  const [selected, setSelected] = useState<ActivityKey | null>(null);
  const [state, setState] = useState<ActState>({ k: "idle" });
  const [rip, setRip] = useState<RipRecord | null>(null);

  const visible = useMemo(() => (coords == null ? [] : visibleActivities(coords)), [coords]);

  // 위치를 처음 얻은 뒤 — 지난번에 고른 활동이 이번에도 보이면 그대로 이어가요.
  useEffect(() => {
    if (coords == null || visible.length === 0) return;
    setSelected((cur) => {
      if (cur != null && visible.includes(cur)) return cur;
      const saved = lastActivity();
      return saved != null && visible.includes(saved) ? saved : null;
    });
  }, [coords, visible]);

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
        if (alive) setState({ k: "ready", record: pickCurrent(records), pointName: point.name });
      })
      .catch(() => {
        if (alive) setState({ k: "error" });
      });
    return () => {
      alive = false;
    };
  }, [selected, coords]);

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
  }, [selected, coords]);

  if (visible.length === 0) return null;

  const pick = (key: ActivityKey) => {
    setSelected(key);
    rememberActivity(key);
    track(EVENT.activityPicked, { activity: key });
  };

  return (
    <Card style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: palette.sub, margin: "0 0 10px" }}>
        오늘 바다 활동 여건
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {visible.map((k) => (
          <Chip key={k} label={ACTIVITY_LABEL[k]} active={k === selected} onClick={() => pick(k)} />
        ))}
      </div>

      {selected != null && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${palette.line}` }}>
          {state.k === "loading" && <p style={muted}>{ACTIVITY_LABEL[selected]} 지수를 불러오는 중이에요…</p>}
          {state.k === "error" && (
            <p style={muted}>지금은 {ACTIVITY_LABEL[selected]} 지수를 불러오지 못했어요.</p>
          )}
          {state.k === "ready" && state.record == null && (
            <p style={muted}>오늘은 {ACTIVITY_LABEL[selected]} 지수가 없어요.</p>
          )}
          {state.k === "ready" && state.record != null && (
            <ActivityDetail
              activity={selected}
              record={state.record}
              pointName={state.pointName}
              events={events}
              nowMin={nowMin}
              stationName={stationName}
            />
          )}
          {rip != null && <RipWarning record={rip} />}
        </div>
      )}

      <p style={{ fontSize: 12, color: palette.sub, marginTop: 12, lineHeight: 1.6 }}>
        {state.k === "ready" && state.record != null
          ? `국립해양조사원 · ${formatYmd(state.record.ymd)} 예보 기준`
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
  nowMin,
  stationName,
}: {
  activity: ActivityKey;
  record: ActivityRecord;
  pointName: string;
  events: Event[];
  nowMin: number;
  stationName: string;
}) {
  const headline = indexHeadline(activity, record.grade);

  const bits: string[] = [];
  if (record.wave != null) bits.push(`파도 ${record.wave}m 안팎`);
  if (record.temp != null) bits.push(`수온 ${Math.round(record.temp)}도 정도`);
  if (activity === "서핑" && record.grade2) bits.push(`난이도 ${record.grade2}`);
  if (activity === "해수욕" && record.open) bits.push(record.open === "개장" ? "개장 중" : record.open);

  const inflow = inflowLabel(activity, record, events, nowMin, pointName, stationName);

  return (
    <div>
      <p style={{ fontSize: 20, fontWeight: 800, color: palette.ink, margin: 0 }}>{headline}</p>
      {bits.length > 0 && (
        <p style={{ fontSize: 15, color: palette.sub, margin: "6px 0 0" }}>{bits.join(" · ")}</p>
      )}
      {inflow != null && (
        <p style={{ fontSize: 15, fontWeight: 700, color: palette.primaryDeep, margin: "10px 0 0" }}>
          {inflow}
        </p>
      )}
    </div>
  );
}

/**
 * 물이 들어오면 위험해지는 활동만 — 언제까지 나와야 하는지 안내예요.
 * 갯벌 지점과 위 물때표의 관측소는 서로 다른 곳이라 시각이 다를 수 있어요. 그래서
 * "어디 기준 시각인지"를 문구에 꼭 넣어요 — 안 넣으면 두 시각을 헷갈려서 고립 사고로
 * 이어질 수 있습니다.
 */
function inflowLabel(
  activity: ActivityKey,
  record: ActivityRecord,
  events: Event[],
  nowMin: number,
  pointName: string,
  stationName: string,
): string | null {
  if (!NEEDS_INFLOW_WARNING.has(activity)) return null;

  if (activity === "갯벌체험") {
    if (!record.end) return null;
    const range = record.begin ? ` (체험 가능 ${record.begin}~${record.end})` : "";
    return `물 들어오는 시각 · ${pointName} 기준 ${record.end} 무렵부터${range}`;
  }

  const low = nextLowTide(events, nowMin);
  if (low == null) return null;
  return `물 들어오는 시각 · ${stationName} 물때 기준 ${formatTime(low.t)} 간조 이후부터`;
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
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
