/* 수학 문제 생성기 검사 스크립트
   사용법: node tools/check-generators.mjs [--samples]
   index.html에서 생성기 코드를 꺼내 학년·난이도별로 여러 번 돌려 보고,
   답이 이상하거나(NaN·음수·0) 문장의 조사가 틀린 문제가 나오면 알려 준다. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "index.html"), "utf8").replace(/\r\n/g, "\n");

/* 생성기 구간만 잘라서 실행 (randInt ~ TOPICS 끝) */
const start = src.indexOf("function randInt");
const end = src.indexOf("/* ========================= 국어 문제은행");
if (start < 0 || end < 0) throw new Error("생성기 구간을 찾지 못했습니다");
const mod = {};
new Function("module", src.slice(start, end) + ";module.exports={TOPICS,WORD_ITEMS,WORD_GOODS,WORD_NAMES,hasBatchim};")(mod);
const { TOPICS, WORD_ITEMS, WORD_GOODS, WORD_NAMES, hasBatchim } = mod.exports;

const RUNS = 1500;
const issues = {};
const note = (key, example) => (issues[key] ??= []).push(example);
const isInt = Number.isInteger;

/* 조사 검사: 숫자나 알려진 명사 뒤의 조사만 본다 (동사 어미 '있는' 등은 건너뜀) */
const NOUNS = [...WORD_ITEMS, ...WORD_GOODS, ...WORD_NAMES.map(n => (hasBatchim(n) ? n + "이" : n)),
  "반", "책", "명", "개", "권", "원", "회", "대", "자루", "줄", "돈", "학생", "사람", "남자", "여자",
  "모둠", "팔찌", "묶음", "버스", "봉지", "상자", "도시", "마을", "인구", "동영상", "무게", "거리", "과자"];
const NEEDS_BATCHIM = { 을: true, 를: false, 이: true, 가: false, 은: true, 는: false, 과: true, 와: false };
function josaErrors(text) {
  const errs = [];
  const re = /(\S+?)(을|를|이|가|은|는|과|와)(?=[\s,.?]|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const base = m[1];
    const known = /[0-9]$/.test(base) || NOUNS.some(n => base.endsWith(n));
    if (!known) continue;
    if (hasBatchim(base) !== NEEDS_BATCHIM[m[2]]) errs.push(base + m[2]);
  }
  /* 모음으로 끝나는 이름에 '이'가 붙은 경우 (시우이는 ×) */
  const vowelNames = WORD_NAMES.filter(n => !hasBatchim(n));
  const bad = new RegExp("(" + vowelNames.join("|") + ")이(는|가|네|에게)").exec(text);
  if (bad) errs.push(bad[0]);
  return errs;
}

let runs = 0;
for (const t of TOPICS) for (const g of t.grades) for (const d of [1, 2, 3]) for (let k = 0; k < RUNS; k++) {
  runs++;
  let p;
  try { p = t.generate(g, d, { word: true }); }
  catch (e) { note(t.id + " 예외: " + e.message, g + "학년/난이도" + d); continue; }
  const where = g + "학년/난이도" + d + " | " + p.question.slice(0, 70);
  if (!p.question || /undefined|NaN/.test(p.question)) note(t.id + " 문제 텍스트 오류", where);
  if (/\s{2,}/.test(p.question) && !p.question.includes("= ?")) note(t.id + " 두 칸 띄어쓰기", where);
  const c = p.correct;
  if (p.answerType === "number") {
    if (typeof c !== "number" || isNaN(c)) note(t.id + " 답이 숫자가 아님", where);
    else if (c < 0) note(t.id + " 답이 음수", where);
    else if (c === 0 && t.id !== "sub") note(t.id + " 답이 0", where);
    else if (t.id !== "dec" && !isInt(c)) note(t.id + " 답이 정수가 아님", where);
  }
  if (p.answerType === "division" && (!isInt(c.q) || !isInt(c.r) || c.r < 0)) note(t.id + " 몫·나머지 오류", where);
  if (p.answerType === "fraction" && (!isInt(c.num) || !isInt(c.den) || c.den <= 0 || c.num <= 0)) note(t.id + " 분수 답 오류", where);
  if (p.answerType === "ratio" && (!isInt(c.a) || !isInt(c.b))) note(t.id + " 비 답 오류", where);
  if (p.steps.some(s => /undefined|NaN/.test(s))) note(t.id + " 풀이 텍스트 오류", where);
  for (const e of josaErrors(p.question)) note(t.id + " 조사 오류: " + e, where);
  for (const s of p.steps) for (const e of josaErrors(s)) note(t.id + " 풀이 조사 오류: " + e, s.slice(0, 70));
}

console.log("검사 횟수:", runs);
const keys = Object.keys(issues);
if (!keys.length) console.log("문제 없음 ✔");
for (const k of keys) console.log(issues[k].length + "회 |", k, "| 예:", issues[k][0]);

if (process.argv.includes("--samples")) {
  console.log("\n=== 문장제 예시 ===");
  for (const t of TOPICS) for (const g of t.grades) {
    const seen = new Set();
    for (let k = 0; k < 40 && seen.size < 3; k++) {
      const p = t.generate(g, 1 + (k % 3), { word: true });
      if (p.isWord) seen.add(p.question);
    }
    for (const q of seen) console.log(t.id, g + "학년 |", q);
  }
}
process.exitCode = keys.length ? 1 : 0;
