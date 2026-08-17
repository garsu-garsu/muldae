/**
 * 공유.
 *
 * "내일 그 항 물때 어때?" 는 낚시·갯벌 다니는 사람들이 실제로 서로 묻는
 * 말이에요. 그 답을 그대로 보낼 수 있게 만들었어요 — 받은 사람이 링크를
 * 누르면 이 미니앱이 열리니, 새 사용자가 들어오는 길이 됩니다.
 *
 * 실패해도 조용히 넘어가요. 공유가 안 되는 것뿐이고 물때 보기는 그대로 돼야 해요.
 */
import { getTossShareLink, Share } from "@apps-in-toss/web-framework";

import { EVENT, track } from "./analytics.ts";
import { formatSunTime, sunTimes } from "./sun.ts";
import { formatTime, tidalRange, tier, type Event, type Station } from "./tide.ts";

export interface ShareInput {
  station: Station;
  /** "YYYY-MM-DD" */
  ymd: string;
  events: Event[];
  rangeP25: number;
  rangeP75: number;
}

/** 그날 물때를 사람이 읽는 한 덩어리로. */
export function shareMessage(input: ShareInput, link: string): string {
  const { station, ymd, events, rangeP25, rangeP75 } = input;
  const range = tidalRange(events);
  const md = `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;

  const lines = [`${station.name} ${md} 물때`, `${tier(range, rangeP25, rangeP75)} · 조차 ${range}cm`];

  const times = events.map((e) => `${e.hl === "H" ? "만조" : "간조"} ${formatTime(e.t)}`);
  if (times.length > 0) lines.push(times.join(" · "));

  const sun = sunTimes(ymd, station.lat, station.lng);
  if (sun != null) {
    lines.push(`일출 ${formatSunTime(sun.rise)} · 일몰 ${formatSunTime(sun.set)}`);
  }
  if (link !== "") lines.push(link);

  return lines.join("\n");
}

export async function shareTide(input: ShareInput): Promise<void> {
  let link = "";
  try {
    link = await getTossShareLink("intoss://muldae");
  } catch (err) {
    console.error("공유 링크 생성 실패:", err);
  }

  try {
    await Share.sendMessage({ message: shareMessage(input, link) });
    track(EVENT.shareCompleted, { station: input.station.name });
  } catch (err) {
    console.error("공유 실패:", err);
  }
}

/* ------------------------------------------------------------------ */
/* 자체 점검 — `npm run check:growth`                                   */
/* ------------------------------------------------------------------ */
export function demo(): void {
  const msg = shareMessage(
    {
      station: { id: "DT_0001", name: "인천", lat: 37.45194, lng: 126.59222 },
      ymd: "2026-08-17",
      events: [
        { t: "0136", cm: 55, hl: "L" },
        { t: "0734", cm: 897, hl: "H" },
      ],
      rangeP25: 300,
      rangeP75: 700,
    },
    "https://example.test/link",
  );

  for (const must of ["인천 8월 17일 물때", "만조 07:34", "간조 01:36", "일출 05:51", "일몰"]) {
    if (!msg.includes(must)) throw new Error(`공유 문구에 "${must}" 가 없어요:\n${msg}`);
  }
  // 링크가 없으면 문구만 나가야 해요(빈 줄이 남지 않게).
  const noLink = shareMessage(
    {
      station: { id: "DT_0001", name: "인천", lat: 37.45194, lng: 126.59222 },
      ymd: "2026-08-17",
      events: [],
      rangeP25: 300,
      rangeP75: 700,
    },
    "",
  );
  if (noLink.endsWith("\n")) throw new Error("링크가 없을 때 빈 줄이 남아요");

  console.log("share.ts OK");
}
