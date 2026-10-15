const fs = require("fs");
eval(fs.readFileSync("_tmp_grid/engine_now.js", "utf-8"));
const D = JSON.parse(fs.readFileSync("_tmp_grid/data_full.json", "utf-8"));
global.D = D;
const E = global.WufuEngine || module.exports;
const i = D.calendar.length - 1;
// UI 场景：先算 518880 参数再传 overrides
const g = E.gridParams("518880.SH", i, 1000000/10, 0.00025+0.0005, 60);
console.log("gridParams:", JSON.stringify(g));
const overrides = {};
overrides["518880.SH"] = { lower: g.lower, upper: g.upper, step: g.step, nLevels: g.nLevels, perLevelAmt: g.perLevelAmt, baseAmt: g.baseAmt, triggerBase: g.triggerBase || g.cur };
const params = {
  codes: ["518880.SH"], initial_capital: 1000000,
  mgmt: "B", period_n: 12, period_unit: "周",
  commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0,
  vol_win: 60, top_n: 10, idle_buy: "cash", gridOverrides: overrides
};
const r = E.backtestGrid(D, params);
console.log("带overrides:", "累计", (r.metrics.total_return*100).toFixed(2)+"%", "成交", r.metrics.n_trades, "体检", r.health.length);
console.log("health 前5:", r.health.slice(0,5).map(h => h.d + " " + h.code + " " + (h.action||"") + " " + (h.reason||"") ));
console.log("health 后5:", r.health.slice(-5).map(h => h.d + " " + h.code + " " + (h.action||"") + " " + (h.reason||"") ));
