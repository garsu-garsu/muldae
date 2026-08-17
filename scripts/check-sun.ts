/**
 * `npm run check:sun` — 일출·일몰 계산이 깨지면 여기서 터져요.
 *
 * 기본은 오프라인(USNO 로 확인해 둔 기준값과 대조). `--usno` 를 주면 미 해군
 * 천문대 API 를 직접 불러 지금 계산값과 다시 맞춰봐요 — 계산식을 손댔을 때만
 * 쓰면 됩니다.
 */
import { demo, formatSunTime, sunTimes } from "../src/lib/sun.ts";

demo();

if (process.argv.includes("--usno")) {
  const spots: [string, number, number][] = [
    ["인천", 37.45194, 126.59222],
    ["부산", 35.09611, 129.03528],
    ["속초", 38.20722, 128.59444],
    ["목포", 34.77944, 126.37556],
    ["제주", 33.5275, 126.54306],
  ];
  const dates = ["2026-08-17", "2026-12-22", "2027-03-21"];
  let worst = 0;

  for (const ymd of dates) {
    for (const [name, lat, lng] of spots) {
      const mine = sunTimes(ymd, lat, lng);
      if (mine == null) continue;
      const res = await fetch(
        `https://aa.usno.navy.mil/api/rstt/oneday?date=${ymd}&coords=${lat},${lng}&tz=9`,
      );
      const json = (await res.json()) as {
        properties: { data: { sundata: { phen: string; time: string }[] } };
      };
      const pick = (phen: string) =>
        json.properties.data.sundata.find((x) => x.phen === phen)?.time ?? "";
      const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
      const dRise = Math.abs(mine.rise - toMin(pick("Rise")));
      const dSet = Math.abs(mine.set - toMin(pick("Set")));
      worst = Math.max(worst, dRise, dSet);
      console.log(
        `${ymd} ${name} 계산 ${formatSunTime(mine.rise)}/${formatSunTime(mine.set)}` +
          `  USNO ${pick("Rise")}/${pick("Set")}  차이 ${dRise.toFixed(1)}/${dSet.toFixed(1)}분`,
      );
    }
  }
  console.log(`최대 차이 ${worst.toFixed(1)}분`);
  if (worst > 2) throw new Error("USNO 와 2분 넘게 벌어졌어요");
}
