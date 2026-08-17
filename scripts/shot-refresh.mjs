/** "다시 찾기" 버튼 확인용 스크린샷. 반드시 `vite dev`로 확인하세요. */
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

  const hasButton = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "다시 찾기"),
  );
  console.log("'다시 찾기' 버튼 있음:", hasButton);

  await page.screenshot({ path: `${OUT}/muldae-refresh.png` });
  console.log("muldae-refresh.png 저장");
  console.log("페이지 오류:", errors.length === 0 ? "없음" : errors);
} finally {
  await browser.close();
}
