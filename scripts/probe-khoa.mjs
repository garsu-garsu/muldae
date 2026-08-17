// 조사 전용 스크립트. data.go.kr openapi.do 페이지에 박혀 있는 swagger JSON을 뽑아
// 종류별 필수 파라미터를 확인한다. 앱 코드는 건드리지 않는다.
import { writeFileSync } from "node:fs";

const DATASETS = [
  ["바다낚시", 15142486],
  ["갯벌체험", 15142489],
  ["해수욕장", 15142484],
  ["스킨스쿠버", 15142488],
  ["서핑", 15142490],
  ["바다여행", 15142491],
  ["뱃멀미", 15142487],
  ["바다갈라짐", 15142485],
  ["이안류", 15156028],
];

async function fetchSwagger(id) {
  const res = await fetch(`https://www.data.go.kr/data/${id}/openapi.do`);
  const html = await res.text();
  const m = html.match(/const swaggerJson = `([\s\S]*?)`;/);
  if (!m) return null;
  // 문자열 안의 이스케이프된 백틱/역슬래시 처리
  const raw = m[1].replace(/\`/g, "`");
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`  파싱 실패 (${id}): ${e.message}`);
    return null;
  }
}

async function main() {
  const results = {};
  for (const [name, id] of DATASETS) {
    console.log(`--- ${name} (${id}) ---`);
    try {
      const spec = await fetchSwagger(id);
      if (!spec) {
        console.log("  swagger json 못 찾음");
        continue;
      }
      const pathKey = Object.keys(spec.paths)[0];
      const pathObj = spec.paths[pathKey];
      const params = pathObj.parameters.map((p) => ({
        name: p.name,
        required: p.required,
        desc: p.description,
        type: p.type,
      }));
      console.log(`  host: ${spec.host}${pathKey}`);
      for (const p of params) {
        console.log(`  ${p.required ? "[필수]" : "[옵션]"} ${p.name} (${p.type}) - ${p.desc}`);
      }
      results[name] = { id, host: spec.host, path: pathKey, params };
    } catch (e) {
      console.error(`  실패: ${e.message}`);
    }
  }
  writeFileSync("data/khoa-swagger-params.json", JSON.stringify(results, null, 2), "utf8");
  console.log("\n저장: data/khoa-swagger-params.json");
}

main();
