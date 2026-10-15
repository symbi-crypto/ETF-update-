const fs = require("fs");
const D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_extract.json", "utf-8"));
global.D = D; global.POOL = D.pool;
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const codes = ["510300.SH","510500.SH","159915.SZ","510050.SH","512100.SH","588000.SH"];
const res = W.backtestGrid(D, { codes, initial_capital: 1000000, mgmt: "B", period_n: 12, period_unit: "周",
  commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0 });
const nav = res.nav, dates = res.dates;
// 找走平起点（连续 30 天相同）
let flatStart = -1, run = 1;
for (let i=1;i<nav.length;i++){
  if (nav[i] === nav[i-1]) { run++; if (run >= 30 && flatStart < 0) flatStart = i-run+1; }
  else run = 1;
}
console.log("走平起点:", flatStart >= 0 ? dates[flatStart] : "无", "(@", flatStart, ")");
console.log("trades 总数:", res.trades.length, "| 最后 6 条:", JSON.stringify(res.trades.slice(-6)));
console.log("health 总数:", res.health.length, "| 最后 8 条:", JSON.stringify(res.health.slice(-8)));
// health 时间线（年份计数）
const yrs = {};
res.health.forEach(h => { const y = h.d.slice(0,4); yrs[y] = (yrs[y]||0)+1; });
console.log("health 按年:", JSON.stringify(yrs));
// 走平起点前后的 trades
const flatDate = dates[flatStart];
const nearTrades = res.trades.filter(t => t.d >= "2020-01-01" && t.d <= flatDate);
console.log("2020~走平起点 trades:", nearTrades.length, JSON.stringify(nearTrades.slice(-5)));
