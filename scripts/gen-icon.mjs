/**
 * 앱 아이콘 600×600 생성기.
 *
 *   node scripts/gen-icon.mjs            → assets/icon-candidates/*.png
 *   node scripts/gen-icon.mjs --pick a   → 고른 안을 assets/icon.png 로 덮어써요
 *
 * 토스가 모서리를 알아서 깎으니 라운드·여백 없이 꽉 채웁니다(full-bleed).
 * 달(물때를 만드는 것) + 물결(바다) 조합은 그대로 두고, 하늘을 깊게·물을
 * 밝게(#13B5FF) 나눠서 작게 줄여도 위아래가 구분되게 했어요.
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const S = 600;
const OUT = resolve(process.cwd(), "assets/icon-candidates");

const args = process.argv.slice(2);
const pick = args.includes("--pick") ? args[args.indexOf("--pick") + 1] : null;

/** 잔물결 하나. y에서 시작해 파도 네 마루를 그리고 바닥까지 채워요. */
const wave = (y, amp, fill) =>
  `<path d="M0 ${y} q 75 ${-amp} 150 0 t 150 0 t 150 0 t 150 0 V${S} H0 Z" fill="${fill}"/>`;

/** 초승달. 큰 원에서 작은 원을 빼서 만들어요 — 작게 줄여도 안 뭉치게 두껍게. */
const moon = (cx, cy, r, fill, opacity = 1) => `
  <mask id="m${cx}${cy}">
    <rect width="${S}" height="${S}" fill="#000"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>
    <circle cx="${cx + r * 0.52}" cy="${cy - r * 0.3}" r="${r * 0.86}" fill="#000"/>
  </mask>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}" mask="url(#m${cx}${cy})"/>`;

/** 달빛이 물 위에 부서진 자국. 짧은 가로줄 몇 개면 충분해요. */
const glints = (cx, top) =>
  [
    [cx - 46, top + 26, 92, 12],
    [cx - 30, top + 58, 60, 10],
    [cx - 16, top + 86, 32, 9],
  ]
    .map(
      ([x, y, w, h]) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#FFFFFF" opacity="0.55"/>`,
    )
    .join("");

const variants = {
  // A. 깊은 밤하늘 + 밝은 물. 달은 흰색으로 하늘 위에서만 대비를 받아요.
  a: `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="#0A2E6B"/><stop offset="1" stop-color="#0E63C8"/>
      </linearGradient>
      <radialGradient id="halo" cx="0.5" cy="0.5">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.30"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="url(#sky)"/>
    <circle cx="300" cy="215" r="215" fill="url(#halo)"/>
    ${moon(300, 215, 118, "#FFFFFF")}
    ${wave(392, 34, "#0C7FE0")}
    ${wave(436, 30, "#13B5FF")}
    ${wave(486, 24, "#7FDBFF")}
  `,

  // B. A + 달빛 반영. 물때 앱이라는 걸 한 겹 더 말해줘요.
  b: `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="#082A63"/><stop offset="1" stop-color="#0D5FC2"/>
      </linearGradient>
      <radialGradient id="halo" cx="0.5" cy="0.5">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.32"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="url(#sky)"/>
    <circle cx="300" cy="196" r="205" fill="url(#halo)"/>
    ${moon(300, 196, 110, "#FFFFFF")}
    ${wave(376, 30, "#13B5FF")}
    ${glints(300, 400)}
    ${wave(492, 22, "#7FDBFF")}
  `,

  // D. A 를 다듬은 안. 맨 아래 큰 면을 브랜드색(#13B5FF)으로 두고, 밝은 색은
  //    사이에 얇게만 넣어요. 흰 배경 목록에서 아이콘 아래쪽이 흐려지지 않아요.
  d: `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="#0A2E6B"/><stop offset="1" stop-color="#0E63C8"/>
      </linearGradient>
      <radialGradient id="halo" cx="0.5" cy="0.5">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.28"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="url(#sky)"/>
    <circle cx="300" cy="205" r="210" fill="url(#halo)"/>
    ${moon(300, 205, 116, "#FFFFFF")}
    ${wave(382, 32, "#0C7FE0")}
    ${wave(424, 28, "#5FD2FF")}
    ${wave(468, 26, "#13B5FF")}
  `,

  // C. 밝은 쪽을 전면에. 하늘을 #13B5FF 로 두고 물을 깊게 눌러 반대로 잡았어요.
  c: `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#13B5FF"/><stop offset="1" stop-color="#0A6FE0"/>
      </linearGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="url(#sky)"/>
    ${moon(300, 210, 118, "#FFFFFF")}
    ${wave(392, 32, "#0B4FA8")}
    ${wave(440, 28, "#083B84")}
  `,
};

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: S, height: S, deviceScaleFactor: 1 });

for (const [key, body] of Object.entries(variants)) {
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style>
     <svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>`,
  );
  await page.screenshot({ path: resolve(OUT, `icon-${key}.png`) });
  console.log(`assets/icon-candidates/icon-${key}.png`);
}

await browser.close();

if (pick != null) {
  copyFileSync(resolve(OUT, `icon-${pick}.png`), resolve(process.cwd(), "assets/icon.png"));
  console.log(`assets/icon.png ← icon-${pick}.png`);
}
