/**
 * "내일 이후 활동 지수" + "이번 주 좋은 시간대" 확인용 스크린샷. 반드시 `vite dev`로.
 *
 *   node scripts/shot-weekly.mjs
 *
 * 백사마을(34.49288, 126.7939) 근처 — 갯바위낚시·갯벌체험이 20km 안에 잡혀요.
 * 갯바위낚시는 물 들어오는 시각이 없는 활동, 갯벌체험은 있는 활동이라 결과
 * 화면이 서로 다르게 나와요.
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

const clickButtonWithText = async (page, text) =>
  page.evaluate((t) => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find((b) => b.textContent?.trim() === t);
    if (btn == null) return false;
    btn.scrollIntoView({ block: "center" });
    btn.click();
    return true;
  }, text);

const scrollToButtonWithText = async (page, text) =>
  page.evaluate((t) => {
    const btns = [...document.querySelectorAll("button")];
    const btn = btns.find((b) => b.textContent?.trim() === t);
    if (btn == null) return false;
    btn.scrollIntoView({ block: "center" });
    return true;
  }, text);

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

  // 물 들어오는 시각이 있는 활동을 먼저 골라, 내일로 넘겨서 "물때는 정상,
  // 활동 지수만 잠김" 경계를 찍어요. 아직 광고를 한 번도 안 봤어야 하는 화면이라
  // 다른 화면보다 먼저 찍습니다.
  const pickedMudflatFirst = await clickButtonWithText(page, "갯벌체험");
  if (!pickedMudflatFirst) throw new Error("갯벌체험 칩을 못 찾음");
  await new Promise((r) => setTimeout(r, 4000));

  const wentTomorrow = await clickButtonWithText(page, "›");
  if (!wentTomorrow) throw new Error("다음 날 화살표를 못 찾음");
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: `${OUT}/readme-weekly-locked-tomorrow.png` });
  console.log("readme-weekly-locked-tomorrow.png 저장 (물때·물 들어오는 시각은 그대로, 활동 지수만 잠김)");

  // 오늘로 되돌아와서 물 들어오는 시각이 없는 활동(갯바위낚시)으로 이번 주 버튼 흐름을 봐요.
  const wentToday = await clickButtonWithText(page, "‹");
  if (!wentToday) throw new Error("이전 날 화살표를 못 찾음");
  await new Promise((r) => setTimeout(r, 1000));

  const pickedFishing = await clickButtonWithText(page, "갯바위낚시");
  if (!pickedFishing) throw new Error("갯바위낚시 칩을 못 찾음");
  await new Promise((r) => setTimeout(r, 4000));

  await scrollToButtonWithText(page, "이번 주 언제가 좋을까"); // 스크롤만, 아직 안 눌러요
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}/readme-weekly-locked.png` });
  console.log("readme-weekly-locked.png 저장 (버튼 상태)");

  const clickedOpen = await clickButtonWithText(page, "이번 주 언제가 좋을까");
  if (!clickedOpen) throw new Error("이번 주 언제가 좋을까 버튼을 못 찾음");
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `${OUT}/readme-weekly-result.png` });
  console.log("readme-weekly-result.png 저장 (top3 열람)");

  // 광고 한 번으로 내일 이후 지수도 같이 열렸는지 확인 — 갯벌체험으로 바꿔서 top3를 봐요.
  const pickedMudflat = await clickButtonWithText(page, "갯벌체험");
  if (!pickedMudflat) throw new Error("갯벌체험 칩을 못 찾음(2회차)");
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: `${OUT}/readme-weekly-tide.png` });
  console.log("readme-weekly-tide.png 저장 (물 들어오는 시각 포함, 광고 재요청 없이 바로 열림)");

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("페이지 오류:", errors.length === 0 ? "없음" : errors);
  console.log("'이번 주 좋은 시간대' 포함:", bodyText.includes("이번 주 좋은 시간대"));
  console.log("'물이 들어와요' 포함:", bodyText.includes("물이 들어와요"));
} finally {
  await browser.close();
}
