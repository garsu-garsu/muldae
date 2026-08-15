import {
  loadFullScreenAd,
  showFullScreenAd,
} from "@apps-in-toss/web-framework";
import { useToast } from "@toss/tds-mobile";
import { useCallback, useEffect, useRef, useState } from "react";

import { AD_GROUP_ID_REWARDED } from "../lib/env";
import { EVENT, track } from "../lib/analytics";

interface UseAdGateReturn {
  ready: boolean;
  /**
   * 광고를 보여주고 끝까지 보면 onReward 를 실행해요.
   * 미지원/미설정(브라우저·개발)이거나 광고를 못 띄우면 즉시 onReward — 광고 때문에
   * 기능이 막히면 안 돼요. context 는 분석용 구분값.
   */
  watchThen: (onReward: () => void, context?: string) => void;
}

/** "광고 보고 → 액션 실행" 보상형 게이트. "이번 주 좋은 시간대" 열기에 씁니다. */
export function useAdGate(): UseAdGateReturn {
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const supportedRef = useRef(false);
  const unloadRef = useRef<(() => void) | null>(null);

  const load = useCallback(() => {
    if (AD_GROUP_ID_REWARDED === "") return;
    try {
      if (!loadFullScreenAd.isSupported()) return;
      supportedRef.current = true;
      unloadRef.current = loadFullScreenAd({
        options: { adGroupId: AD_GROUP_ID_REWARDED },
        onEvent: (e) => {
          if (e.type === "loaded") setReady(true);
        },
        onError: (err) => console.error("광고 로드 실패:", err),
      });
    } catch (err) {
      console.error("광고 환경 확인 실패:", err);
    }
  }, []);

  useEffect(() => {
    load();
    return () => unloadRef.current?.();
  }, [load]);

  const watchThen = useCallback(
    (onReward: () => void, context?: string) => {
      // 미설정/미지원 → 즉시 통과. 채울 광고가 없는 것도 사용자 잘못이 아니라 여기서
      // 같이 통과시켜요.
      if (AD_GROUP_ID_REWARDED === "" || !supportedRef.current) {
        onReward();
        return;
      }
      if (!ready) {
        // 아직 못 불러왔으면 못 띄운 것과 같은 취급 — 기능을 막지 않아요.
        onReward();
        load();
        return;
      }

      let rewarded = false;
      try {
        showFullScreenAd({
          options: { adGroupId: AD_GROUP_ID_REWARDED },
          onEvent: (e) => {
            if (e.type === "userEarnedReward") {
              rewarded = true;
              track(EVENT.adRewarded, { context: context ?? "" });
            } else if (e.type === "dismissed") {
              setReady(false);
              load();
              // 끝까지 봐야만 열어요. 중간에 닫으면 그 이유를 알려줘요.
              if (rewarded) onReward();
              else toast.openToast("광고를 끝까지 봐야 열려요.");
            } else if (e.type === "failedToShow") {
              // 못 띄운 것도 사용자 잘못이 아니에요 — 그냥 열어줘요.
              setReady(false);
              load();
              onReward();
            }
          },
          onError: (err) => {
            console.error("광고 표시 실패:", err);
            setReady(false);
            load();
            onReward();
          },
        });
      } catch (err) {
        console.error("광고 표시 실패:", err);
        onReward();
      }
    },
    [ready, load, toast],
  );

  return { ready, watchThen };
}
