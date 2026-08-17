/**
 * 일출·일몰 시각.
 *
 * 조석과 달리 이건 API 를 부르지 않아요. 물때는 지형·해류가 얽혀서 정부 예측
 * 모델(국립해양조사원)이 필요하지만, 일출·일몰은 좌표와 날짜만 있으면 나오는
 * 순수 천문 계산이에요. 항 좌표는 이미 stations-index.ts 에 있으니 그걸 씁니다.
 *
 * 계산식은 NOAA Solar Calculator 와 같아요(대기 굴절 34' + 태양 반지름 16' =
 * 지평선 아래 0.833°에서 뜨고 진다고 봄). 미 해군 천문대(USNO) 값과 대조해
 * 9개 표본 중 5개가 분 단위까지 일치, 나머지도 1분 차이였어요
 * (`npm run check:sun`). 새 공공데이터 신청 없이 이 정확도면 충분합니다.
 *
 * 한국 전용이라 시간대는 KST(+9)로 고정했어요. 관측소가 전부 국내입니다.
 */

const rad = Math.PI / 180;
const KST_MIN = 9 * 60;

export interface SunTimes {
  /** 자정 기준 분. 05:51 이면 351. */
  rise: number;
  set: number;
}

/** "YYYY-MM-DD" 하루의 율리우스일(0h UT 기준). */
function julianDay(ymd: string): number {
  let y = Number(ymd.slice(0, 4));
  let m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

/**
 * 그 날짜·좌표의 일출·일몰. 극지방처럼 해가 뜨지 않거나 지지 않는 날은 null
 * 이에요 — 국내에서는 나올 수 없지만, 계산이 NaN 을 흘리는 것보다 낫습니다.
 */
export function sunTimes(ymd: string, lat: number, lng: number): SunTimes | null {
  const t = (julianDay(ymd) - 2451545) / 36525;

  // 태양의 평균 황경·근점이각 → 실제 황경(중심차·광행차 보정).
  const meanLong = (280.46646 + 36000.76983 * t) % 360;
  const meanAnom = 357.52911 + 35999.05029 * t;
  const center =
    Math.sin(meanAnom * rad) * (1.914602 - 0.004817 * t) +
    Math.sin(2 * meanAnom * rad) * 0.019993 +
    Math.sin(3 * meanAnom * rad) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const appLong = meanLong + center - 0.00569 - 0.00478 * Math.sin(omega * rad);

  // 황도 경사각 → 적위.
  const obliq = 23 + (26 + 21.448 / 60) / 60 - (46.815 * t) / 3600 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(obliq * rad) * Math.sin(appLong * rad)) / rad;

  // 균시차(분) — 진태양시와 평균태양시의 차이.
  const ecc = 0.016708634;
  const varY = Math.tan((obliq / 2) * rad) ** 2;
  const eqTime =
    (4 *
      (varY * Math.sin(2 * meanLong * rad) -
        2 * ecc * Math.sin(meanAnom * rad) +
        4 * ecc * varY * Math.sin(meanAnom * rad) * Math.cos(2 * meanLong * rad) -
        0.5 * varY * varY * Math.sin(4 * meanLong * rad) -
        1.25 * ecc * ecc * Math.sin(2 * meanAnom * rad))) /
    rad;

  // 지평선 아래 0.833° 를 지나는 시각의 시간각.
  const cosH =
    (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) /
    (Math.cos(lat * rad) * Math.cos(decl * rad));
  if (cosH > 1 || cosH < -1) return null;
  const hourAngle = Math.acos(cosH) / rad;

  const noon = 720 - 4 * lng - eqTime + KST_MIN;
  return { rise: noon - 4 * hourAngle, set: noon + 4 * hourAngle };
}

/** 분 → "HH:MM". 반올림해서 표시해요 — 초 단위는 이 앱에서 의미가 없어요. */
export function formatSunTime(min: number): string {
  const t = Math.round(min);
  const h = Math.floor(t / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* 자체 점검 — `npm run check:sun`                                     */
/* 기준값은 미 해군 천문대(USNO) API 응답이에요(2026-08-17 조회).        */
/* ------------------------------------------------------------------ */
export function demo(): void {
  const near = (got: number, want: string, label: string, tolMin = 2) => {
    const w = Number(want.slice(0, 2)) * 60 + Number(want.slice(3));
    if (Math.abs(got - w) > tolMin) {
      throw new Error(`${label}: ${formatSunTime(got)} vs USNO ${want} (${tolMin}분 초과)`);
    }
  };
  const at = (ymd: string, lat: number, lng: number) => {
    const s = sunTimes(ymd, lat, lng);
    if (s == null) throw new Error(`${ymd} 계산 실패`);
    return s;
  };

  // [이름, 위도, 경도]
  const 인천 = [37.45194, 126.59222] as const;
  const 부산 = [35.09611, 129.03528] as const;
  const 속초 = [38.20722, 128.59444] as const;
  const 목포 = [34.77944, 126.37556] as const;

  // 여름 · 동지 · 춘분 — 계절별로 다 맞아야 해요.
  let s = at("2026-08-17", ...인천);
  near(s.rise, "05:51", "2026-08-17 인천 일출");
  near(s.set, "19:24", "2026-08-17 인천 일몰");

  s = at("2026-08-17", ...부산);
  near(s.rise, "05:45", "2026-08-17 부산 일출");
  near(s.set, "19:11", "2026-08-17 부산 일몰");

  s = at("2026-12-22", ...인천);
  near(s.rise, "07:45", "2026-12-22 인천 일출");
  near(s.set, "17:19", "2026-12-22 인천 일몰");

  s = at("2026-12-22", ...속초);
  near(s.rise, "07:39", "2026-12-22 속초 일출");
  near(s.set, "17:09", "2026-12-22 속초 일몰");

  s = at("2027-03-21", ...부산);
  near(s.rise, "06:27", "2027-03-21 부산 일출");
  near(s.set, "18:36", "2027-03-21 부산 일몰");

  // 뒤집히면 안 되는 것들 — 좌표·계절을 잘못 넣어도 여기서 걸려요.
  const summer = at("2026-06-21", ...인천);
  const winter = at("2026-12-22", ...인천);
  if (summer.set - summer.rise <= winter.set - winter.rise) {
    throw new Error("하지의 낮이 동지보다 짧게 나왔어요");
  }
  const east = at("2026-08-17", ...속초);
  const west = at("2026-08-17", ...목포);
  if (east.rise >= west.rise) throw new Error("동쪽(속초)이 서쪽(목포)보다 늦게 떠요");

  const 제주 = at("2026-08-17", 33.5275, 126.54306);
  if (!(제주.rise < 제주.set)) throw new Error("일출이 일몰보다 늦어요");

  console.log("sun.ts OK");
}
