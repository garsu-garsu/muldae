/**
 * 공유 버튼이 물때표 아래에 뜨는지 확인.
 *   npx vite dev --port 5190 --strictPort   (다른 창에서)
 *   node scripts/shot-share.mjs
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const URL_ = process.env.BASE_URL ?? "http://localhost:5190/";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 636, height: 1048, deviceScaleFactor: 1 });
await browser.defaultBrowserContext().overridePermissions(new URL(URL_).origin, ["geolocation"]);
await page.setGeolocation({ latitude: 35.9756, longitude: 126.5631 });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL_, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => localStorage.setItem("muldae:coach:v1", "1"));
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3500));

console.log(
  "공유 버튼:",
  await page.evaluate(() => (document.body.innerText.includes("이 물때 공유하기") ? "있음" : "없음")),
);
console.log(
  "일출·일몰 줄:",
  await page.evaluate(() => document.body.innerText.match(/일출[^\n]*/)?.[0] ?? "없음"),
);
console.log("페이지 오류:", errors.length === 0 ? "없음" : errors.slice(0, 2));
await page.screenshot({ path: "screenshots/share-button.png" });
await browser.close();
