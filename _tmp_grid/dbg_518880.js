const fs = require("fs");
eval(fs.readFileSync("_tmp_grid/engine_now.js", "utf-8"));
const D = JSON.parse(fs.readFileSync("_tmp_grid/data_full.json", "utf-8"));
global.D = D;
const E = global.WufuEngine || module.exports;
const params = { codes: ["518880.SH"], initial_capital: 1000000, mgmt: "B", period_n: 12, period_unit: "周",
  commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 5, vol_win: 60, top_n: 10, idle_buy: "cash", gridOverrides: {} };
const r = E.backtestGrid(D, params);
if (!r) { console.log("null"); process.exit(); }
console.log("metrics:", JSON.stringify(r.metrics));
console.log("health 条数:", (r.health||[]).length, " 前2:", JSON.stringify((r.health||[]).slice(0,2)));
console.log("trades 条数:", r.trades.length, " 前3:", JSON.stringify(r.trades.slice(0,3)));
console.log("dates:", r.dates.length, " nav 首末:", r.nav[0].toFixed(4), r.nav[r.nav.length-1].toFixed(4));
// 体检撤换统计
const h = r.health || [];
console.log("health 标签:", [...new Set(h.map(x => x.kind || x.type || x.reason || "?"))].join(","));
