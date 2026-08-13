import { BannerAd } from "./components/BannerAd";
import { HomeScreen } from "./features/home/HomeScreen";

/**
 * 화면 하나짜리 앱이에요. 물때는 매일 아침 30초 보고 닫는 정보라
 * 탐색 단계를 두면 안 돼요.
 */
export default function App() {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <HomeScreen />
      </div>
      <div
        style={{
          flexShrink: 0,
          height: 96,
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "#FFFFFF",
        }}
      >
        <BannerAd />
      </div>
    </div>
  );
}
