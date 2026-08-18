/**
 * 일일 정보(파고·바람 + 9종 여건)와 잠금·광고 버튼을 확인해요.
 *   npx vite dev --port 5311 --strictPort   (다른 창에서)
 *   node scripts/shot-daily.mjs
 */
import puppeteer from "puppeteer-core";

const CHROME = String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`;
const URL_ = process.env.BASE_URL ?? "http://localhost:5311/";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 636, height: 1400, deviceScaleFactor: 1 });
await browser.defaultBrowserContext().overridePermissions(new URL(URL_).origin, ["geolocation"]);
await page.setGeolocation({ latitude: 35.9756, longitude: 126.5631 }); // 군산 앞바다

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL_, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => {
  localStorage.setItem("muldae:coach:v1", "1");
  localStorage.removeItem("muldae:unlocked-date");
});
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 15000));

const text = () => page.evaluate(() => document.body.innerText);
let t = await text();
console.log("오늘 파도 줄:", t.match(/파도[^\n]*/)?.[0] ?? "없음");
console.log("오늘 바람 줄:", t.match(/바람[^\n]*/)?.[0] ?? "없음");
console.log("여건 카드:", t.includes("이 근처 바다 여건") ? "있음" : "없음");
console.log("지수 줄 수:", (t.match(/매우좋음|좋음|보통|나쁨|매우나쁨/g) ?? []).length);
console.log("오늘 광고 버튼:", t.includes("광고 보고 이 날짜 여건 보기") ? "있음(잘못)" : "없음(정상)");
await page.screenshot({ path: "screenshots/daily-today.png" });

// 내일로 넘겨서 잠금 확인
await page.evaluate(() => {
  const next = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "›");
  next?.click();
});
await new Promise((r) => setTimeout(r, 12000));
t = await text();
console.log("내일 광고 버튼:", t.includes("광고 보고 이 날짜 여건 보기") ? "있음(정상)" : "없음(잘못)");
const skeletons = await page.evaluate(
  () => document.querySelectorAll('[aria-label="광고를 보면 열려요"]').length,
);
console.log("가려진 글자 수:", skeletons);
await page.screenshot({ path: "screenshots/daily-locked.png" });
console.log("페이지 오류:", errors.length === 0 ? "없음" : errors.slice(0, 2));
await browser.close();
