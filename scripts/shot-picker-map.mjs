/**
 * 항 고르기 지도형 확인용 스크린샷 4장. 반드시 `vite dev`로 확인하세요.
 *
 *   node scripts/shot-picker-map.mjs
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

  await page.goto(PAGE_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));

  // 1) 지도 아이콘이 보이는 초기 화면
  await page.screenshot({ path: `${OUT}/picker-map-entry.png` });
  console.log("picker-map-entry.png 저장");

  // 지도 아이콘 클릭 — 바로 지도형으로 열려야 해요.
  const clickedIcon = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "지도로 항 고르기");
    if (btn == null) return false;
    btn.click();
    return true;
  });
  console.log("지도 아이콘 클릭:", clickedIcon);
  await new Promise((r) => setTimeout(r, 3500)); // 타일 로딩 대기

  const markerCount = await page.evaluate(() => document.querySelectorAll(".leaflet-marker-icon").length);
  console.log("마커 개수:", markerCount);
  const tileFailedShown = await page.evaluate(() => document.body.innerText.includes("지도를 불러오지 못했어요"));
  console.log("타일 실패 안내 보임:", tileFailedShown);

  // 2) 지도형이 열려 마커가 찍힌 화면
  await page.screenshot({ path: `${OUT}/picker-map.png` });
  console.log("picker-map.png 저장");

  // 마커 하나 클릭
  const clickedMarker = await page.evaluate(() => {
    const marker = document.querySelector(".leaflet-marker-icon");
    if (marker == null) return false;
    marker.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  });
  console.log("마커 클릭:", clickedMarker);
  await new Promise((r) => setTimeout(r, 3000));

  const sheetShown = await page.evaluate(() => document.body.innerText.includes("이 항으로 보기"));
  console.log("[이 항으로 보기] 시트 보임:", sheetShown);

  // 3) 마커를 눌러 시트가 뜬 화면
  await page.screenshot({ path: `${OUT}/picker-map-selected.png` });
  console.log("picker-map-selected.png 저장");

  // 시트 닫고 목록 탭으로 전환
  await page.evaluate(() => {
    const closeBtn = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "닫기");
    closeBtn?.click();
  });
  const clickedListTab = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "목록");
    if (btn == null) return false;
    btn.click();
    return true;
  });
  console.log("목록 탭 클릭:", clickedListTab);
  await new Promise((r) => setTimeout(r, 500));

  // 4) 목록/지도 전환 탭이 보이는 화면(목록으로 전환된 상태)
  await page.screenshot({ path: `${OUT}/picker-map-toggle.png` });
  console.log("picker-map-toggle.png 저장");

  console.log("페이지 오류:", errors.length === 0 ? "없음" : errors);
} finally {
  await browser.close();
}
