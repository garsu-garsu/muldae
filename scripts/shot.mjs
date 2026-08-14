/**
 * 화면 확인용 스크린샷(636x1048 — 콘솔 제출 규격).
 *
 *   npx vite dev --port 5173   (다른 창에서 띄워두고)
 *   node scripts/shot.mjs
 *
 * ⚠️ 반드시 `vite dev`(개발 서버)로 확인하세요. `vite build`/`vite preview`는
 *    NODE_ENV=production 이라 @apps-in-toss/devtools 의 위치 모킹이 빠지고,
 *    Device.getLocation 이 진짜 토스 앱 브릿지를 찾다가 그냥 던져버려요.
 *    개발 서버에서는 표준 geolocation 으로 좌표를 흘려보내는 모킹이 살아 있어서
 *    실제 좌표를 물리면 가장 가까운 관측소를 골라 API까지 실제로 부릅니다.
 *    (프로덕션 빌드 자체가 되는지는 `npm run build` 로 따로 확인하세요.)
 */
import { mkdir } from "node:fs/promises";

import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const PAGE_URL = process.env.BASE_URL ?? "http://localhost:5173/";
const OUT = "screenshots";
const SIZE = { width: 636, height: 1048, deviceScaleFactor: 1 };

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
  const apiFailed = [];
  page.on("response", (r) => {
    if (r.url().includes("apis.data.go.kr") && r.status() >= 400) {
      apiFailed.push(`${r.status()} ${r.url()}`);
    }
  });

  // 군산 앞바다(35.9756, 126.5631) — DT_0018 인근. 다른 좌표로 확인하려면 이 두 값만 바꾸세요.
  const ME = { latitude: 35.9756, longitude: 126.5631 };
  await browser.defaultBrowserContext().overridePermissions(new URL(PAGE_URL).origin, [
    "geolocation",
  ]);
  await page.setGeolocation(ME);

  await page.goto(PAGE_URL, { waitUntil: "networkidle2", timeout: 30000 });
  // 위치 확인 → 물때 API 응답까지 걸리니 넉넉히 기다려요.
  await new Promise((r) => setTimeout(r, 3000));

  await page.screenshot({ path: `${OUT}/1-home.png` });

  // 내일 화살표를 눌러 날짜별 재조회도 확인해요.
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const next = btns.find((b) => b.textContent?.trim() === "›");
    if (next == null) return false;
    next.click();
    return true;
  });
  if (clicked) {
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: `${OUT}/2-tomorrow.png` });
  }

  const stationName = await page.$eval("span", (el) => el.textContent ?? "").catch(() => "");
  const bodyText = await page.evaluate(() => document.body.innerText);

  console.log(`스크린샷 ${OUT}/ 에 저장`);
  console.log("API 호출 실패:", apiFailed.length === 0 ? "없음" : apiFailed.slice(0, 5));
  console.log("페이지 오류:", errors.length === 0 ? "없음" : errors.slice(0, 3));
  console.log("첫 span 텍스트(관측소 이름 기대):", stationName);
  console.log("만조/간조 포함 여부:", /만조/.test(bodyText) && /간조/.test(bodyText));
} finally {
  await browser.close();
}
