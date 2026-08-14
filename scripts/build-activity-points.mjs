/**
 * 활동별 예보지점 표 굽기 (1회성 배치 — data/khoa-points-live.json 에서 뽑아요).
 *
 *   node scripts/build-activity-points.mjs
 *
 * 지점 이름·좌표는 해가 바뀌어도 거의 안 바뀌어요. 그래서 "이 활동이 내 위치
 * 20km 안에 있는지"는 매번 API를 부르지 않고 이 표로 즉시 판정합니다. 실제
 * 오늘 지수는 칩을 고른 활동만 런타임에 API로 받아요 (src/lib/activities.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_PATH = resolve(HERE, "../data/khoa-points-live.json");
const OUT_PATH = resolve(HERE, "../src/lib/activity-points.ts");

/** 내부 키 → data/khoa-points-live.json 의 카테고리 이름 */
const KEY_TO_SOURCE = {
  낚시: "바다낚시",
  갯벌체험: "갯벌체험",
  해수욕: "해수욕장",
  스킨스쿠버: "스킨스쿠버",
  서핑: "서핑",
};

const live = JSON.parse(readFileSync(SRC_PATH, "utf8"));

const rows = {};
for (const [key, sourceName] of Object.entries(KEY_TO_SOURCE)) {
  const pts = live[sourceName] ?? [];
  rows[key] = pts.map((p) => [p.name, p.lat, p.lon]);
}

const source = `/**
 * 활동별 예보지점 표. scripts/build-activity-points.mjs 로 구웠어요 (자동 생성).
 * 다시 구우려면: node scripts/build-activity-points.mjs
 */
import type { ActivityKey } from "./activities.ts";

/** [지점명, 위도, 경도] */
export type ActivityPointRow = [string, number, number];

export const ACTIVITY_POINTS: Record<ActivityKey, ActivityPointRow[]> = ${JSON.stringify(rows, null, 2)};
`;

writeFileSync(OUT_PATH, source);
for (const [key, pts] of Object.entries(rows)) console.log(`${key}: ${pts.length}곳`);
console.log(`\n저장: ${OUT_PATH}`);
