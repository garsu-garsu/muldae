/** 아이콘이 목록 크기에서도 읽히는지 확인용. node scripts/preview-icon.mjs */
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
// setContent 로 띄운 페이지는 file:// 을 못 읽어서 그대로 심어요.
const dataUri = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
const oldIcon = dataUri("assets/icon.png");
const newIcon = dataUri("assets/icon-candidates/icon-d.png");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 440, height: 170, deviceScaleFactor: 1 });
await page.setContent(`<style>
  body{margin:0;background:#fff;display:flex;gap:30px;align-items:center;padding:24px;
       font:12px -apple-system,"Malgun Gothic",system-ui;color:#333}
  img{border-radius:22%;display:block;margin-bottom:6px}
</style>
<div><img src="${oldIcon}" width="56" height="56">현재 56px</div>
<div><img src="${newIcon}" width="56" height="56">새 안 56px</div>
<div><img src="${newIcon}" width="96" height="96">새 안 96px</div>`);
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: "assets/icon-candidates/preview-small.png" });
await browser.close();
console.log("assets/icon-candidates/preview-small.png");
