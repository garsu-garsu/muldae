/**
 * "내일 이후 활동 지수"·"이번 주 좋은 시간대"를 하루에 한 번 광고로 같이 열어요.
 * 활동·항·날짜별로 따로 잠그면 광고를 여러 번 보게 되니, 열람 여부는 "오늘 날짜"
 * 하나로만 판단합니다 — 한 번 열면 자정까지 무엇을 골라도 열려 있어요.
 */

const KEY = "muldae:unlocked-date";

/** 오늘 날짜(한국 기준). stations.ts/activities.ts와 같은 형식이에요. */
function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 저장된 날짜가 오늘이면 열림. 순수 비교라 Date를 몰라도 테스트할 수 있어요. */
export function isUnlockedForDate(storedDate: string | null, today: string): boolean {
  return storedDate === today;
}

export function isUnlockedToday(): boolean {
  try {
    return isUnlockedForDate(localStorage.getItem(KEY), todayKey());
  } catch {
    return false;
  }
}

export function markUnlockedToday(): void {
  try {
    localStorage.setItem(KEY, todayKey());
  } catch {
    /* 시크릿 모드 등에서 실패해도 이번 세션엔 그대로 열려 있어요. */
  }
}

/**
 * 오늘 지수는 항상 열려 있어요 — 매일 여는 무료 정보라 절대 잠그면 안 됩니다.
 * 그 외 날짜(내일 이후)는 오늘 이미 한 번 열었을 때만 열려요.
 */
export function isIndexLocked(isToday: boolean, unlockedToday: boolean): boolean {
  return !isToday && !unlockedToday;
}

/* ------------------------------------------------------------------ */
/* 자체 점검 — `npm run check:unlock`                                   */
/* ------------------------------------------------------------------ */
export function demo(): void {
  const eq = (got: unknown, want: unknown, label: string) => {
    if (got !== want) throw new Error(`${label}: ${String(got)} !== ${String(want)}`);
  };

  eq(isIndexLocked(true, false), false, "오늘 지수는 안 열었어도 항상 열림");
  eq(isIndexLocked(true, true), false, "오늘 지수는 열었어도 당연히 열림");
  eq(isIndexLocked(false, false), true, "오늘이 아니고 안 열었으면 잠김");
  eq(isIndexLocked(false, true), false, "오늘이 아니어도 이미 열었으면 열림");

  eq(isUnlockedForDate(null, "2026-08-16"), false, "저장된 게 없으면 잠김");
  eq(isUnlockedForDate("2026-08-15", "2026-08-16"), false, "지난 날짜로 열렸으면 오늘 기준 다시 잠김(날짜가 바뀌면 재잠금)");
  eq(isUnlockedForDate("2026-08-16", "2026-08-16"), true, "오늘 열었으면 열림");

  console.log("unlock.ts OK");
}
