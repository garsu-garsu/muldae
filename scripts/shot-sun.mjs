/**
 * 일출·일몰 한 줄이 오늘/내일 각각 제대로 나오는지 확인.
 * 코치마크를 미리 끈 상태로 찍어요(요약 카드를 가려서 안 보임).
 *
 *   npx vite dev --port 5173   (다른 창에서)
 *   node scripts/shot-sun.mjs
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const URL_ = "http://localhost:5173/";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 636, height: 1048, deviceScaleFactor: 1 });
await browser.defaultBrowserContext().overridePermissions(new URL(URL_).origin, ["geolocation"]);
await page.setGeolocation({ latitude: 35.9756, longitude: 126.5631 }); // 군산 앞바다

await page.goto(URL_, { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.setItem("muldae:coach:v1", "1"));
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3500));

const line = () => page.evaluate(() => document.body.innerText.match(/일출[^\n]*/)?.[0] ?? "없음");
await page.screenshot({ path: "screenshots/sun-today.png" });
console.log("오늘  :", await line());

const clicked = await page.evaluate(() => {
  const next = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "›");
  if (next == null) return false;
  next.click();
  return true;
});
if (clicked) {
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: "screenshots/sun-tomorrow.png" });
  console.log("내일  :", await line());
}

await browser.close();
