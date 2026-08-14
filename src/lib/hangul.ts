/** 이름 첫 글자의 초성 한 칸. 관측소 목록 옆 빠른 스크롤 바에 씁니다. */

const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
/** 쌍자음은 인덱스 바를 길게 만들어서, 홑자음 칸으로 합쳐요. */
const MERGE: Record<string, string> = { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" };

/** 인덱스 바에 실제로 찍는 칸(쌍자음 합친 뒤). 순서가 목록 정렬 순서와 같아요. */
export const INDEX_CHARS = [
  "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "#",
];

/** 이름의 초성. 한글로 시작하지 않으면 "#". */
export function chosung(name: string): string {
  const code = name.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 0xd7a3 - 0xac00) return "#";
  const cho = CHO[Math.floor(code / 588)];
  return MERGE[cho] ?? cho;
}

/* ------------------------------------------------------------------ */
/* 자체 점검 — `npm run check:tide` 안에서 같이 돌아요                  */
/* ------------------------------------------------------------------ */
export function demo(): void {
  const eq = (got: unknown, want: unknown, label: string) => {
    if (got !== want) throw new Error(`${label}: ${String(got)} !== ${String(want)}`);
  };
  eq(chosung("군산"), "ㄱ", "군산은 ㄱ");
  eq(chosung("따오기항"), "ㄷ", "쌍자음은 홑자음으로 합침");
  eq(chosung("123항"), "#", "한글로 안 시작하면 #");
  console.log("hangul.ts OK");
}
