const fs = require("fs");
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_extract.json", "utf-8"));
global.D = D; global.POOL = D.pool;
// 体检日 2022-05-20 在 calendar 的索引
const cal = D.calendar;
const ii = cal.findIndex(function(d){ return String(d).replace(/-/g, "") === "20220520"; });
console.log("ii =", ii);
// 全池合格候选（同引擎补位条件）
let nPass = 0, nGate = 0, nLow = 0;
const samples = [];
for (const p of D.pool) {
  if (!/^[0-9]{6}\.(SH|SZ)$/.test(p.code)) continue;
  const sc = W.gridScore(p.code, ii);
  if (!sc) continue;
  if (sc.gate.length) { nGate++; continue; }
  if (sc.score >= 60) { nPass++; if (samples.length < 8) samples.push(p.code + ":" + sc.score.toFixed(0)); }
  else nLow++;
}
console.log("合格(>=60):", nPass, "| gate:", nGate, "| <60:", nLow);
console.log("样例:", samples.join(", "));
// 510300 为什么不合格？
const sc300 = W.gridScore("510300.SH", ii);
console.log("510300:", JSON.stringify({score: sc300.score.toFixed(1), gate: sc300.gate, vol: (sc300.vol*100).toFixed(1)+"%", adx: sc300.adx.toFixed(1), er: sc300.er.toFixed(2), perY: sc300.parts.perY}));
