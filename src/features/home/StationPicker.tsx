import { useMemo, useRef } from "react";

import { chosung, INDEX_CHARS } from "../../lib/hangul";
import { moveFavorite, toggleFavorite } from "../../lib/stations";
import type { Station } from "../../lib/tide";
import { palette } from "../../theme";

/**
 * 항 선택 목록.
 * - 즐겨찾기는 위에 따로 묶어서 보여주고, 그 안에서만 화살표로 순서를 바꿔요.
 * - 전체 목록은 가나다순이고, 오른쪽 초성 바로 빠르게 훑을 수 있어요.
 */
export function StationPicker({
  stations,
  selectedId,
  favIds,
  onPick,
  onFavChange,
}: {
  stations: Station[];
  selectedId: string;
  favIds: string[];
  onPick: (id: string) => void;
  onFavChange: (ids: string[]) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const groupEls = useRef(new Map<string, HTMLDivElement>());

  const favSet = useMemo(() => new Set(favIds), [favIds]);

  // 즐겨찾기는 위 섹션에 이미 있으니 전체 목록에서는 빼요(중복 표시 방지).
  // 한글이 아닌 이름은 "#" 칸으로 몰아 맨 뒤로 보내요.
  const sorted = useMemo(() => {
    return stations
      .filter((s) => !favSet.has(s.id))
      .sort((a, b) => {
        const ka = chosung(a.name) === "#" ? 1 : 0;
        const kb = chosung(b.name) === "#" ? 1 : 0;
        if (ka !== kb) return ka - kb;
        return a.name.localeCompare(b.name, "ko");
      });
  }, [stations, favSet]);

  // 초성이 바뀌는 첫 항목의 id만 모아둬요 — 그 항목에만 점프용 ref를 답니다.
  const firstIdOfGroup = useMemo(() => {
    const seen = new Set<string>();
    const ids = new Set<string>();
    for (const s of sorted) {
      const c = chosung(s.name);
      if (!seen.has(c)) {
        seen.add(c);
        ids.add(s.id);
      }
    }
    return ids;
  }, [sorted]);

  const presentChars = useMemo(() => new Set(sorted.map((s) => chosung(s.name))), [sorted]);

  const favStations = favIds
    .map((id) => stations.find((s) => s.id === id))
    .filter((s): s is Station => s != null);

  const jump = (char: string) => {
    groupEls.current.get(char)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const handleToggleFav = (id: string) => onFavChange(toggleFavorite(id));
  const handleMoveFav = (id: string, dir: -1 | 1) => onFavChange(moveFavorite(id, dir));

  return (
    <div style={{ position: "relative", paddingRight: 34 }}>
      <div
        ref={listRef}
        style={{ maxHeight: "58vh", overflowY: "auto", overscrollBehavior: "contain" }}
      >
        {favStations.length > 0 && (
          <>
            <SectionLabel text="자주 가는 곳" />
            {favStations.map((s, i) => (
              <Row
                key={s.id}
                station={s}
                selected={s.id === selectedId}
                isFav
                onPick={onPick}
                onToggleFav={handleToggleFav}
                reorder={{
                  canUp: i > 0,
                  canDown: i < favStations.length - 1,
                  onMove: (dir) => handleMoveFav(s.id, dir),
                }}
              />
            ))}
            <div style={{ height: 1, background: palette.line, margin: "8px 0" }} />
          </>
        )}

        {sorted.map((s) => {
          const isFirst = firstIdOfGroup.has(s.id);
          const c = chosung(s.name);
          return (
            <Row
              key={s.id}
              refEl={isFirst ? (el) => { if (el) groupEls.current.set(c, el); } : undefined}
              station={s}
              selected={s.id === selectedId}
              isFav={favSet.has(s.id)}
              onPick={onPick}
              onToggleFav={handleToggleFav}
            />
          );
        })}
      </div>

      {/* 목록 영역에 고정된 초성 바 — 안쪽 목록만 스크롤되고 바는 그대로예요. */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 26,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {INDEX_CHARS.map((c) => {
          const has = presentChars.has(c);
          return (
            <button
              key={c}
              disabled={!has}
              onClick={() => jump(c)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "transparent",
                padding: 0,
                fontSize: 11,
                fontWeight: 700,
                color: has ? palette.primary : palette.sub,
                opacity: has ? 1 : 0.35,
              }}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <p style={{ fontSize: 13, fontWeight: 700, color: palette.sub, margin: "4px 4px 6px" }}>
      {text}
    </p>
  );
}

function Row({
  station,
  selected,
  isFav,
  onPick,
  onToggleFav,
  reorder,
  refEl,
}: {
  station: Station;
  selected: boolean;
  isFav: boolean;
  onPick: (id: string) => void;
  onToggleFav: (id: string) => void;
  reorder?: { canUp: boolean; canDown: boolean; onMove: (dir: -1 | 1) => void };
  refEl?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={refEl}
      onClick={() => onPick(station.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "6px 4px",
        borderRadius: 10,
        background: selected ? "rgba(22,104,184,0.08)" : "transparent",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          flex: 1,
          fontSize: 16,
          fontWeight: selected ? 700 : 500,
          color: palette.ink,
        }}
      >
        {station.name}
      </span>
      {reorder != null && (
        <>
          <IconBtn label="▲" disabled={!reorder.canUp} onClick={() => reorder.onMove(-1)} />
          <IconBtn label="▼" disabled={!reorder.canDown} onClick={() => reorder.onMove(1)} />
        </>
      )}
      <IconBtn
        label={isFav ? "★" : "☆"}
        active={isFav}
        onClick={() => onToggleFav(station.id)}
      />
    </div>
  );
}

/** 44px 이상 — 손가락으로 누르기 쉬운 크기예요. */
function IconBtn({
  label,
  onClick,
  disabled,
  active,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      style={{
        width: 44,
        height: 44,
        border: "none",
        background: "transparent",
        fontSize: 18,
        color: active ? palette.primary : palette.sub,
        opacity: disabled ? 0.3 : 1,
      }}
    >
      {label}
    </button>
  );
}
