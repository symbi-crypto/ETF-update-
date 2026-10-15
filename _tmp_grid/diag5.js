const fs = require("fs");
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_extract.json", "utf-8"));
global.D = D; global.POOL = D.pool;
const cal = D.calendar;
console.log("cal[1449]:", cal[1449], "| cal[1509]:", cal[1509], "| cal[1569]:", cal[1569]);
// 2022-05-20 后 3 个体检日（1449+60k）的合格候选数
for (const ii of [1449, 1509, 1569, 1629]) {
  let pass = 0;
  for (const p of D.pool) {
    if (!/^[0-9]{6}\.(SH|SZ)$/.test(p.code)) continue;
    const sc = W.gridScore(p.code, ii);
    if (sc && !sc.gate.length && sc.score >= 60) pass++;
  }
  console.log("ii=", ii, "(", cal[ii], ") pass:", pass);
}
