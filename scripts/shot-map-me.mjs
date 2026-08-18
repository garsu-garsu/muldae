/**
 * 항 고르기 지도에서 내 위치 마커와 "내 위치로" 버튼을 확인해요.
 *   npx vite dev --port 5197 --strictPort   (다른 창에서)
 *   node scripts/shot-map-me.mjs
 */
import puppeteer from "puppeteer-core";

const CHROME = String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`;
const URL_ = process.env.BASE_URL ?? "http://localhost:5197/";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 636, height: 1048, deviceScaleFactor: 1 });
await browser.defaultBrowserContext().overridePermissions(new URL(URL_).origin, ["geolocation"]);
await page.setGeolocation({ latitude: 35.9756, longitude: 126.5631 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL_, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => {
  localStorage.setItem("muldae:coach:v1", "1");
  localStorage.setItem("muldae:picker-view", "map");
});
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3500));

// 항 이름을 눌러 고르기 화면을 열고 지도 탭으로.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => /▼|▲/.test(b.textContent ?? ""));
  btn?.click();
});
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const tab = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "지도");
  tab?.click();
});
await new Promise((r) => setTimeout(r, 2500));

console.log("내 위치 마커:", await page.evaluate(() => (document.body.innerText.includes("내 위치") ? "있음" : "없음")));
console.log("이동 버튼:", await page.evaluate(() => (document.querySelector('[aria-label="내 위치로 이동"]') != null ? "있음" : "없음")));
await page.screenshot({ path: "screenshots/map-me-1.png" });

// 지도를 멀리 옮긴 뒤 버튼으로 돌아오는지 확인.
const before = await page.evaluate(() => document.querySelector('[aria-label="내 위치로 이동"]') != null);
if (before) {
  await page.evaluate(() => {
    const el = document.querySelector(".leaflet-container");
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mousemove", { ...opts, clientX: r.left + 40, clientY: r.top + 40 }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...opts, clientX: r.left + 40, clientY: r.top + 40 }));
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.click('[aria-label="내 위치로 이동"]');
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: "screenshots/map-me-2.png" });
  console.log("버튼 클릭 후 오류:", errors.length === 0 ? "없음" : errors.slice(0, 2));
}
console.log("페이지 오류:", errors.length === 0 ? "없음" : errors.slice(0, 3));
await browser.close();
