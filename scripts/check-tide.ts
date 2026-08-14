/** `npm run check:tide` — 물때 판정과 초성 계산이 깨지면 여기서 터져요. */
import { demo } from "../src/lib/tide.ts";
import { demo as demoHangul } from "../src/lib/hangul.ts";

demo();
demoHangul();
