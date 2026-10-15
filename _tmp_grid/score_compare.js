// 新旧权重全池 TOP15 对比（用新引擎 parts 重算旧分）
const fs = require("fs");
const engCode = fs.readFileSync("_tmp_grid/engine_now.js", "utf-8");
eval(engCode); // 定义 global.WufuEngine
const D = JSON.parse(fs.readFileSync("_tmp_grid/data_full.json", "utf-8"));
global.D = D;
const E = global.WufuEngine || module.exports;
const POOL = D.pool || [];
const i = D.calendar.length - 1;
const T0 = /^(511|513|518)/;
const rows = [], gated = {};
POOL.forEach(p => {
  const s = E.gridScore(p.code, i);
  if (!s) return;
  if (s.gate.length) {
    (gated[s.gate[0]] = gated[s.gate[0]] || []).push(p.code + (p.name ? " " + p.name : ""));
    return;
  }
  const oldLiq = Math.min(100, s.amtAvg / 2 * 100) + (T0.test(p.code) ? 10 : 0);
  const oldScore = 0.30 * s.parts.osc + 0.25 * s.parts.vol + 0.20 * s.parts.cov + 0.15 * s.parts.trig + 0.10 * oldLiq;
  rows.push({ code: p.code, name: p.name, new: +s.score.toFixed(1), old: +oldScore.toFixed(1),
    osc: Math.round(s.parts.osc), vol: Math.round(s.parts.vol), cov: Math.round(s.parts.cov), trig: Math.round(s.parts.trig),
    amt: +s.amtAvg.toFixed(2), t0: s.parts.t0b || 0 });
});
rows.sort((a, b) => b.new - a.new);
const newTop = rows.slice(0, 15);
const oldTop = rows.slice().sort((a, b) => b.old - a.old).slice(0, 15);
console.log("=== 新权重 TOP15（0.32/0.27/0.22/0.19 + T+0加5）===");
newTop.forEach((r, k) => console.log(String(k + 1).padStart(2), r.code.padEnd(10), r.name.padEnd(14), "新" + r.new.toFixed(1).padStart(6), "旧" + r.old.toFixed(1).padStart(6), "震" + r.osc + " 波" + r.vol + " 区" + r.cov + " 触" + r.trig, "日均" + r.amt + "亿", r.t0 ? "T+0" : ""));
console.log("\n=== 旧权重 TOP15（0.30/0.25/0.20/0.15/0.10）===");
oldTop.forEach((r, k) => console.log(String(k + 1).padStart(2), r.code.padEnd(10), r.name.padEnd(14), "新" + r.new.toFixed(1).padStart(6), "旧" + r.old.toFixed(1).padStart(6), "震" + r.osc + " 波" + r.vol + " 区" + r.cov + " 触" + r.trig, "日均" + r.amt + "亿", r.t0 ? "T+0" : ""));
console.log("\n=== 新旧 TOP15 集合差异 ===");
const ns = newTop.map(r => r.code), os = oldTop.map(r => r.code);
console.log("新有旧无:", ns.filter(c => !os.includes(c)).join(", ") || "无");
console.log("旧有新无:", os.filter(c => !ns.includes(c)).join(", ") || "无");
console.log("\n=== 硬门槛剔除统计（全池）===");
Object.keys(gated).forEach(k => console.log(k, ":", gated[k].length, "只 ->", gated[k].slice(0, 8).join(", ")));
console.log("\n通过硬门槛:", rows.length, "只");
