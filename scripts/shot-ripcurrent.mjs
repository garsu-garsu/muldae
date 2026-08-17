/**
 * 이안류 경고 화면 확인용 스크린샷. 반드시 `vite dev`로 확인하세요.
 *
 *   node scripts/shot-ripcurrent.mjs
 *
 * 해운대(35.15867, 129.16035) — 해수욕 선택 시 이안류 지점이 20km 안에 잡혀요.
 */
import { mkdir } from "node:fs/promises";

import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const PAGE_URL = process.env.BASE_URL ?? "http://localhost:5173/";
const OUT = "screenshots";
const SIZE = { width: 636, height: 1048, deviceScaleFactor: 1 };
const ME = { latitude: 35.15867, longitude: 129.16035 };

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
  await new Promise((r) => setTimeout(r, 3000));

  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find((b) => b.textContent?.trim() === "해수욕");
    if (btn == null) return false;
    btn.click();
    return true;
  });
  if (!clicked) {
    console.log("해수욕 칩을 못 찾음 — 20km 안에 해수욕장이 없을 수 있어요.");
  } else {
    await new Promise((r) => setTimeout(r, 4000));
    await page.screenshot({ path: `${OUT}/ripcurrent-warning.png` });
    console.log("ripcurrent-warning.png 저장");
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("페이지 오류:", errors.length === 0 ? "없음" : errors);
  console.log("'이안류' 포함:", bodyText.includes("이안류"));
} finally {
  await browser.close();
}
