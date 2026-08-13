import type { Tier } from "./lib/tide";

// 바다 팔레트. 40~50대 남성이 주 사용자라 글자를 크고 진하게.
export const palette = {
  primary: "#1668B8",
  primaryDeep: "#0E4C87",
  high: "#1668B8", // 만조 = 물이 찬다
  low: "#B26A16", // 간조 = 물이 빠진다
  ink: "#12242F",
  sub: "#5E7280",
  line: "rgba(22,104,184,0.14)",
  card: "#FFFFFF",
  bg: "#F2F6FA",
  white: "#FFFFFF",
};

/** 사리/보통/조금. 색만으로 구분하지 않게 한 줄 설명을 같이 줍니다. */
export function tierStyle(t: Tier): { color: string; hint: string } {
  if (t === "사리")
    return { color: "#0E4C87", hint: "물이 크게 움직여요. 조류가 셉니다." };
  if (t === "조금")
    return { color: "#7A8A94", hint: "물이 거의 안 움직여요. 입질이 약합니다." };
  return { color: "#1668B8", hint: "무난한 물때예요." };
}
