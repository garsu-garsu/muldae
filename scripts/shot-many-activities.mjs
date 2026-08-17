/**
 * 칩 9개 중 다수가 뜨는 화면 + 뱃멀미 문구 확인용 스크린샷. 반드시 `vite dev`로 확인하세요.
 *
 *   node scripts/shot-many-activities.mjs
 *
 * 중문색달해수욕장(33.245, 126.411) — 8종(갯바위낚시·선상낚시·해수욕·스킨스쿠버·서핑·
 * 바다여행·뱃멀미·바다갈라짐)이 20km 안에 잡혀요.
 */
import { mkdir } from "node:fs/promises";

import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const PAGE_URL = process.env.BASE_URL ?? "http://localhost:5173/";
const OUT = "screenshots";
// 콘솔 스샷 규격(636px)은 넓어서 8개가 거의 다 들어가 버려요. 실제 폰 폭(375px)으로
// 찍어야 가로 스크롤이 필요하다는 게 눈에 보입니다.
const SIZE = { width: 375, height: 812, deviceScaleFactor: 1 };
const ME = { latitude: 33.245, longitude: 126.411 };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [`--window-size=${SIZE.width},${SIZE.height}`],
});

try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport(SIZE);

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.evaluateOnNewDocument((coords) => {
    Object.defineProperty(window, "__ait", {
      configurable: true,
      set(value) {
        value.patch("location", {
          coords: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            altitude: 0,
            accuracy: 10,
            altitudeAccuracy: 0,
            heading: 0,
          },
          timestamp: Date.now(),
          accessLocation: "FINE",
        });
        Object.defineProperty(window, "__ait", { value, writable: true, configurable: true, enumerable: true });
      },
      get() {
        return void 0;
      },
    });
  }, ME);

  await page.goto(PAGE_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 5000));

  // 칩 줄이 가로로 넘치는지 확인 — scrollWidth가 clientWidth보다 크면 스크롤이 필요한 상태.
  const scrollInfo = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("div")].filter((d) => d.scrollWidth > d.clientWidth + 4);
    return rows.length;
  });
  console.log("가로 스크롤이 필요한 줄 개수:", scrollInfo);
  await page.screenshot({ path: `${OUT}/activity-many-chips.png` });
  console.log("activity-many-chips.png 저장");

  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find((b) => b.textContent?.trim() === "뱃멀미");
    if (btn == null) return false;
    btn.click();
    return true;
  });
  if (!clicked) {
    console.log("뱃멀미 칩을 못 찾음");
  } else {
    await new Promise((r) => setTimeout(r, 4000));
    await page.screenshot({ path: `${OUT}/activity-seasick.png` });
    console.log("activity-seasick.png 저장");
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("페이지 오류:", errors.length === 0 ? "없음" : errors);
  console.log("'멀미' 포함:", bodyText.includes("멀미"));
  console.log("'뱃멀미하기' 오포함(방향 반대 의심 문구):", bodyText.includes("뱃멀미하기"));
} finally {
  await browser.close();
}
