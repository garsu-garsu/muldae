/**
 * 일출·일몰을 API 없이 좌표로 계산해도 되는지 확인.
 *
 *   node scripts/probe-sun-calc.mjs
 *
 * 표준 NOAA 태양위치 계산(대기굴절 0.833° 포함)으로 구한 값을,
 * 외부 기준값(sunrise-sunset.org, 키 없이 열림)과 분 단위로 비교해요.
 * 차이가 1~2분 안이면 API 를 새로 신청할 이유가 없습니다.
 */

const rad = Math.PI / 180;

/** 그 날짜(KST 기준 자정)의 율리우스일. */
function julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

/**
 * 일출·일몰(KST 분). NOAA Solar Calculator 와 같은 식이에요.
 * lng 은 동경이 양수. 반환은 자정 기준 분 단위.
 */
function sunTimes(y, m, d, lat, lng, tzMin = 540) {
  const jd = julianDay(y, m, d);
  const n = jd - 2451545.0 + 0.0008;
  const t = n / 36525;
  // 평균 황경·근점이각
  const L0 = (280.46646 + 36000.76983 * t) % 360;
  const M = 357.52911 + 35999.05029 * t;
  const C =
    Math.sin(M * rad) * (1.914602 - 0.004817 * t) +
    Math.sin(2 * M * rad) * 0.019993 +
    Math.sin(3 * M * rad) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad);
  // 황도 경사각
  const eps0 = 23 + (26 + 21.448 / 60) / 60 - (46.815 * t) / 3600;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad)) / rad;
  // 시간차(균시차)
  const varY = Math.tan((eps / 2) * rad) ** 2;
  const eqTime =
    4 *
    (varY * Math.sin(2 * L0 * rad) -
      2 * 0.016708634 * Math.sin(M * rad) +
      4 * 0.016708634 * varY * Math.sin(M * rad) * Math.cos(2 * L0 * rad) -
      0.5 * varY * varY * Math.sin(4 * L0 * rad) -
      1.25 * 0.016708634 ** 2 * Math.sin(2 * M * rad)) /
    rad;
  // 지평선 아래 0.833°(굴절 + 태양 반지름)에서 뜨고 진다고 봐요.
  const zenith = 90.833;
  const cosH =
    (Math.cos(zenith * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) /
    (Math.cos(lat * rad) * Math.cos(decl * rad));
  if (cosH > 1 || cosH < -1) return null; // 극지방: 그날 안 뜨거나 안 짐
  const H = Math.acos(cosH) / rad;
  const solarNoon = 720 - 4 * lng - eqTime + tzMin;
  return { rise: solarNoon - 4 * H, set: solarNoon + 4 * H, noon: solarNoon };
}

const hhmm = (min) => {
  const t = Math.round(min);
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

// 남·서·동·북 골고루. [이름, 위도, 경도]
const SPOTS = [
  ["인천", 37.45194, 126.59222],
  ["부산", 35.09611, 129.03528],
  ["목포", 34.77944, 126.37556],
  ["속초", 38.20722, 128.59444],
  ["제주", 33.5275, 126.54306],
];
const DATES = [
  [2026, 8, 17],
  [2026, 12, 22], // 동지 — 오차가 가장 크게 벌어지는 날
  [2027, 3, 21],
];

let worst = 0;
for (const [y, m, d] of DATES) {
  const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  for (const [name, lat, lng] of SPOTS) {
    const mine = sunTimes(y, m, d, lat, lng);
    const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&date=${ymd}&formatted=0`;
    let ref = null;
    try {
      const json = await (await fetch(url)).json();
      const toKstMin = (iso) => {
        const t = new Date(iso);
        return (t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60 + 540) % 1440;
      };
      ref = { rise: toKstMin(json.results.sunrise), set: toKstMin(json.results.sunset) };
    } catch (err) {
      console.log(`${ymd} ${name}: 기준값 조회 실패 ${String(err)}`);
      continue;
    }
    const dRise = Math.abs(mine.rise - ref.rise);
    const dSet = Math.abs(mine.set - ref.set);
    worst = Math.max(worst, dRise, dSet);
    console.log(
      `${ymd} ${name.padEnd(3)} 계산 ${hhmm(mine.rise)}/${hhmm(mine.set)}  기준 ${hhmm(ref.rise)}/${hhmm(ref.set)}  차이 ${dRise.toFixed(1)}분/${dSet.toFixed(1)}분`,
    );
  }
}
console.log(`\n최대 차이 ${worst.toFixed(1)}분`);
