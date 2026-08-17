/**
 * 활동 칩 화면 확인용 스크린샷. 반드시 `vite dev`로 확인하세요.
 *
 *   node scripts/shot-activities.mjs
 *
 * 개발 모드는 위치가 서울시청으로 고정돼요(@apps-in-toss/devtools 목).
 * page.setGeolocation은 안 먹혀서 window.__ait.patch("location", ...)로 직접 옮깁니다.
 *
 * 백사마을(34.49288, 126.7939) 근처 — 낚시·갯벌체험·해수욕·서핑 4종이 20km 안에 잡혀요.
 */
import { mkdir } from "node:fs/promises";

import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const PAGE_URL = process.env.BASE_URL ?? "http://localhost:5173/";
const OUT = "screenshots";
const SIZE = { width: 636, height: 1048, deviceScaleFactor: 1 };
const ME = { latitude: 34.49288, longitude: 126.7939 };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [`--window-size=${SIZE.width},${SIZE.height}`],
});

const clickChip = async (page, label) =>
  page.evaluate((text) => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find((b) => b.textContent?.trim() === text);
    if (btn == null) return false;
    btn.click();
    return true;
  }, label);

try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport(SIZE);

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // window.__ait는 devtools 목 모듈이 로드되며 대입돼요. React가 useEffect에서
  // Device.getLocation을 부르기 전에 가로채 좌표를 바꿔치기합니다.
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
  await new Promise((r) => setTimeout(r, 3000));

  await page.screenshot({ path: `${OUT}/activity-chips.png` });
  console.log("activity-chips.png 저장");

  const clickedFishing = await clickChip(page, "갯바위낚시");
  if (clickedFishing) {
    await new Promise((r) => setTimeout(r, 4000));
    await page.screenshot({ path: `${OUT}/activity-selected.png` });
    console.log("activity-selected.png 저장 (낚시)");
  } else {
    console.log("낚시 칩을 못 찾음");
  }

  const clickedMudflat = await clickChip(page, "갯벌체험");
  if (clickedMudflat) {
    await new Promise((r) => setTimeout(r, 4000));
    await page.screenshot({ path: `${OUT}/activity-tide-warning.png` });
    console.log("activity-tide-warning.png 저장 (갯벌체험)");
  } else {
    console.log("갯벌체험 칩을 못 찾음");
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("페이지 오류:", errors.length === 0 ? "없음" : errors);
  console.log("'물 들어오는 시각' 포함:", bodyText.includes("물 들어오는 시각"));
  console.log("'국립해양조사원 생활해양예보지수' 포함:", bodyText.includes("국립해양조사원 생활해양예보지수"));
} finally {
  await browser.close();
}
