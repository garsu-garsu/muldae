import { Device } from "@apps-in-toss/web-framework";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

import { TILE_ATTRIBUTION, TILE_URL } from "../../lib/env";
import { distanceM, formatDistance, type LatLng } from "../../lib/geo";
import { loadTide, todayKey } from "../../lib/stations";
import { tidalRange, tier, type Station, type Tier } from "../../lib/tide";
import { palette } from "../../theme";

type Popup =
  | { station: Station; k: "loading" }
  | { station: Station; k: "ready"; tierVal: Tier; range: number }
  | { station: Station; k: "error" };

/**
 * 항 고르기 지도형. 전국 166곳을 한 번에 찍고, 마커를 누르면 이름·거리·오늘
 * 물때가 뜨는 시트가 열려요. 목록형(StationPicker)을 대체하는 게 아니라
 * 나란히 있는 선택지예요 — 항 이름만 봐선 어딘지 모를 때 쓰라고 있어요.
 */
export function StationMap({
  stations,
  selected,
  favIds,
  onPick,
  onTileFailed,
}: {
  stations: Station[];
  /** 처음 열 때 이 항이 지도 가운데 오게 맞춰요. */
  selected: Station;
  favIds: string[];
  onPick: (id: string) => void;
  onTileFailed: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [tileFailed, setTileFailed] = useState(false);
  const [me, setMe] = useState<LatLng | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);

  // "내 위치에서 거리"용 — 못 구해도 지도는 그대로 씁니다(거리 줄만 빠져요).
  useEffect(() => {
    Device.getLocation({ accuracy: 3 })
      .then((loc) => setMe({ lat: loc.coords.latitude, lng: loc.coords.longitude }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tileFailed) onTileFailed();
  }, [tileFailed, onTileFailed]);

  // 지도 만들기 — 열릴 때 한 번만. 선택된 항이 가운데, 주변 항들이 보이는 배율로.
  useEffect(() => {
    if (boxRef.current == null || mapRef.current != null) return;

    const map = L.map(boxRef.current, {
      center: [selected.lat, selected.lng],
      zoom: 10,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;

    const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION });
    let anyLoaded = false;
    tiles.on("tileload", () => {
      anyLoaded = true;
    });
    tiles.on("tileerror", () => {
      if (!anyLoaded) setTileFailed(true);
    });
    tiles.addTo(map);

    const layer = L.layerGroup().addTo(map);
    markersRef.current = layer;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 마커 — 즐겨찾기는 다르게 그려요(별 모양·색). stations/favIds는 열려 있는 동안
  // 안 바뀌는 게 보통이라 여기서만 다시 그립니다.
  useEffect(() => {
    const layer = markersRef.current;
    if (layer == null) return;
    layer.clearLayers();
    const favSet = new Set(favIds);
    for (const s of stations) {
      const isFav = favSet.has(s.id);
      L.marker([s.lat, s.lng], { icon: pinIcon(isFav), zIndexOffset: isFav ? 1000 : 0 })
        .on("click", () => selectStation(s))
        .addTo(layer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, favIds]);

  function selectStation(s: Station) {
    setPopup({ station: s, k: "loading" });
    loadTide(s.id)
      .then((td) => {
        const events = td.days[todayKey()] ?? [];
        const range = tidalRange(events);
        setPopup({ station: s, k: "ready", tierVal: tier(range, td.rangeP25, td.rangeP75), range });
      })
      .catch(() => setPopup({ station: s, k: "error" }));
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "58vh" }}>
      <div ref={boxRef} style={{ width: "100%", height: "100%", borderRadius: 12, background: "#E8ECF1" }} />

      {tileFailed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: palette.bg,
            zIndex: 1000,
            padding: 24,
            borderRadius: 12,
          }}
        >
          <p style={{ fontSize: 15, color: palette.sub, textAlign: "center", lineHeight: 1.7, margin: 0 }}>
            지도를 불러오지 못했어요.
            <br />
            목록에서 골라주세요.
          </p>
        </div>
      )}

      {popup != null && (
        <StationSheet
          popup={popup}
          me={me}
          onClose={() => setPopup(null)}
          onPick={() => {
            onPick(popup.station.id);
            setPopup(null);
          }}
        />
      )}
    </div>
  );
}

function StationSheet({
  popup,
  me,
  onClose,
  onPick,
}: {
  popup: Popup;
  me: LatLng | null;
  onClose: () => void;
  onPick: () => void;
}) {
  const { station } = popup;
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        bottom: 10,
        zIndex: 1000, // Leaflet 마커·타일이 400~700이라 그 위여야 눌려요.
        background: palette.card,
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 6px 24px rgba(27,29,33,0.22)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: palette.ink }}>{station.name}</div>
          <div style={{ fontSize: 14, color: palette.sub, marginTop: 4 }}>
            {me != null ? `내 위치에서 ${formatDistance(distanceM(me, station))}` : "거리 확인 중…"}
            {" · "}
            {popup.k === "loading" && "오늘 물때 확인 중…"}
            {popup.k === "error" && "오늘 물때를 불러오지 못했어요"}
            {popup.k === "ready" && `오늘 ${popup.tierVal} · 조차 ${popup.range}cm`}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{ border: "none", background: "transparent", fontSize: 20, color: palette.sub, padding: 4 }}
        >
          ✕
        </button>
      </div>

      <button
        onClick={onPick}
        style={{
          width: "100%",
          marginTop: 14,
          border: "none",
          borderRadius: 12,
          padding: "14px 0",
          fontSize: 16,
          fontWeight: 700,
          color: palette.white,
          background: palette.primary,
        }}
      >
        이 항으로 보기
      </button>
    </div>
  );
}

/** 핀. 즐겨찾기는 별 모양(금색), 나머지는 파란 점. */
function pinIcon(isFav: boolean): L.DivIcon {
  const html = isFav
    ? `<div style="width:28px;height:28px;border-radius:50%;background:#E8A93B;border:3px solid #fff;` +
      `box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;` +
      `font-size:14px;line-height:1;">★</div>`
    : `<div style="width:22px;height:22px;border-radius:50%;background:${palette.primary};` +
      `border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>`;
  return L.divIcon({ className: "", html, iconSize: [28, 28], iconAnchor: [14, 14] });
}
