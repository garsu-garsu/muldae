/**
 * "활동은 내 위치가 아니라 화면에 뜬 항 기준" 확인용 스크린샷. 반드시 `vite dev`로.
 *
 *   node scripts/shot-by-station.mjs
 *
 * 위치는 서울시청(개발 모드 기본값) 그대로 두고, 항만 부산으로 바꿔서 활동 칩이
 * 부산 기준으로 뜨는지 확인해요.
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

  // 위치를 안 건드려요 — 개발 모드 기본값이 이미 서울시청(37.5665, 126.978)입니다.
  await page.goto(PAGE_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));

  const beforeText = await page.evaluate(() => document.body.innerText);
  console.log("항 바꾸기 전 관측소:", (beforeText.match(/^[^\n]+/) ?? [""])[0]);
  console.log("항 바꾸기 전 '오늘 바다 활동 여건' 포함:", beforeText.includes("오늘 바다 활동 여건"));

  // 항 선택 열고 "부산"으로 바꿔요.
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    btns.find((b) => b.textContent?.includes("▼"))?.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  const clickedBusan = await page.evaluate(() => {
    const spans = [...document.querySelectorAll("span")];
    const span = spans.find((s) => s.textContent?.trim() === "부산");
    if (span == null) return false;
    span.click();
    return true;
  });
  console.log("부산 선택:", clickedBusan);

  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: `${OUT}/activity-by-station.png` });
  console.log("activity-by-station.png 저장");

  const afterText = await page.evaluate(() => document.body.innerText);
  console.log("항 바꾼 뒤 관측소:", (afterText.match(/^[^\n]+/) ?? [""])[0]);
  console.log("항 바꾼 뒤 '오늘 바다 활동 여건' 포함:", afterText.includes("오늘 바다 활동 여건"));
  console.log("'해수욕' 칩 포함:", afterText.includes("해수욕"));
  console.log("페이지 오류:", errors.length === 0 ? "없음" : errors);
} finally {
  await browser.close();
}
