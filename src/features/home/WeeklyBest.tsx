import { useEffect, useMemo, useState } from "react";

import {
  ACTIVITY_LABEL,
  NEEDS_INFLOW_WARNING,
  activityBits,
  formatYmdWeekday,
  inflowLabel,
  isGoodEnough,
  rankWeekly,
  type ActivityKey,
  type ActivityRecord,
} from "../../lib/activities";
import { loadTide } from "../../lib/stations";
import type { Event } from "../../lib/tide";
import { palette } from "../../theme";

/** 갯벌체험·바다갈라짐은 지수 응답 자체에 시각이 들어 있어요. 해수욕·스킨스쿠버만 관측소 물때가 따로 필요해요. */
function needsStationTide(activity: ActivityKey): boolean {
  return activity === "해수욕" || activity === "스킨스쿠버";
}

/**
 * "이번 주 좋은 시간대" — API가 원래 같이 주는 7일치(오전/오후) 중 좋은 순 3개.
 * 잠금·해제는 부모(ActivityChips)가 "내일 이후 활동 지수"와 하나로 묶어 관리해요
 * — 광고 한 번으로 둘 다 같이 열려야 하기 때문이에요.
 */
export function WeeklyBest({
  activity,
  records,
  pointName,
  stationId,
  stationName,
  isToday,
  unlocked,
  onOpen,
}: {
  activity: ActivityKey;
  records: ActivityRecord[];
  pointName: string;
  stationId: string;
  stationName: string;
  /** 오늘이 아니면 이 버튼이 "내일 이후 지수"도 같이 열어요 — 안내 문구가 그래서 달라져요. */
  isToday: boolean;
  unlocked: boolean;
  onOpen: () => void;
}) {
  const [dayTides, setDayTides] = useState<Record<string, Event[]>>({});

  const top3 = useMemo(() => rankWeekly(records), [records]);

  // 해수욕·스킨스쿠버는 물때가 활동 지점이 아니라 관측소 데이터라 날짜별로 따로 받아요.
  useEffect(() => {
    if (!unlocked || !needsStationTide(activity)) return;
    let alive = true;
    for (const r of top3) {
      if (dayTides[r.ymd] != null) continue;
      const [y, m, d] = r.ymd.split("-").map(Number);
      void loadTide(stationId, new Date(y, m - 1, d)).then((tide) => {
        if (alive) setDayTides((cur) => ({ ...cur, [r.ymd]: tide.days[r.ymd] ?? [] }));
      });
    }
    return () => {
      alive = false;
    };
  }, [unlocked, activity, stationId, top3]); // eslint-disable-line react-hooks/exhaustive-deps

  if (top3.length === 0) return null;

  // 제목이 실제 등급과 어긋나면 안 돼요 — top3에 "보통" 이상이 하나도 없으면
  // "좋은 시간대"라고 하지 않고 그나마 나은 순서라고 솔직하게 말해요.
  const hasGoodDay = top3.some((r) => isGoodEnough(r.grade));
  const title = hasGoodDay
    ? "이번 주 좋은 시간대"
    : `이번 주는 ${ACTIVITY_LABEL[activity]}하기 좋은 날이 없어요`;

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${palette.line}` }}>
      <p style={{ fontSize: 16, fontWeight: 800, color: palette.ink, margin: "0 0 8px" }}>{title}</p>

      {!unlocked ? (
        <div>
          <p style={{ fontSize: 15, color: palette.sub, margin: "0 0 10px", lineHeight: 1.6 }}>
            {/* 오늘이 아니면 이 버튼 하나로 활동 지수까지 같이 열려요 — 버튼을 두 개
                두지 않고 여기서 한 번에 안내해요. */}
            {!isToday
              ? "광고 한 번 보면 내일 이후 활동 지수와 이번 주 좋은 시간대를 같이 볼 수 있어요."
              : hasGoodDay
                ? `이번 주 7일 중 ${ACTIVITY_LABEL[activity]}하기 가장 좋은 때 3개를 알려드려요.`
                : "좋은 날은 없지만 그나마 나은 순서로 3개를 보여드려요."}
          </p>
          <button
            onClick={onOpen}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 12,
              padding: "16px 0",
              fontSize: 17,
              fontWeight: 800,
              color: palette.white,
              background: palette.primary,
            }}
          >
            이번 주 언제가 좋을까
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {top3.map((r, i) => (
            <WeeklyRow
              key={`${r.ymd}-${r.noon}`}
              rank={i + 1}
              activity={activity}
              record={r}
              inflow={
                NEEDS_INFLOW_WARNING.has(activity)
                  ? inflowLabel(activity, r, dayTides[r.ymd] ?? [], [], -1, pointName, stationName)
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WeeklyRow({
  rank,
  activity,
  record,
  inflow,
}: {
  rank: number;
  activity: ActivityKey;
  record: ActivityRecord;
  inflow: ReturnType<typeof inflowLabel>;
}) {
  const bits = activityBits(activity, record);
  return (
    <div style={{ border: `1px solid ${palette.line}`, borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: palette.primaryDeep }}>{rank}위</span>
        <span style={{ fontSize: 17, fontWeight: 800, color: palette.ink }}>
          {formatYmdWeekday(record.ymd)}
          {record.noon != null ? ` ${record.noon}` : ""}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: palette.sub, marginLeft: "auto" }}>
          {record.grade}
        </span>
      </div>
      {bits.length > 0 && (
        <p style={{ fontSize: 15, color: palette.sub, margin: "6px 0 0" }}>{bits.join(" · ")}</p>
      )}
      {inflow != null && (
        <p style={{ fontSize: 15, color: palette.primaryDeep, fontWeight: 700, margin: "6px 0 0" }}>
          {inflow.line1}
        </p>
      )}
    </div>
  );
}
