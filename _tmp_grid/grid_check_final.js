// 网格回测锚点 + 破网冻结验证（518880 阈值50）
const fs = require("fs");
eval(fs.readFileSync("_tmp_grid/engine_now.js", "utf-8"));
const D = JSON.parse(fs.readFileSync("_tmp_grid/data_full.json", "utf-8"));
global.D = D;
const E = global.WufuEngine || module.exports;
// 518880 评分（新签名）
const sc = E.gridScore("518880.SH", D.calendar.length - 1);
console.log("518880 评分:", sc.score.toFixed(1), "gate:", sc.gate, "ADX:", sc.adx.toFixed(1));
// 网格回测（阈值50场景：518880 单标的）
const params = {
  codes: ["518880.SH"], initial_capital: 1000000,
  mgmt: "B", period_n: 12, period_unit: "周",
  commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0,
  vol_win: 60, top_n: 10, idle_buy: "cash"
};
const r = E.backtestGrid(D, params);
console.log("网格回测:", "累计", (r.metrics.total_return*100).toFixed(2)+"%", "回撤", (r.metrics.max_dd*100).toFixed(2)+"%", "成交", r.metrics.n_trades, "体检", r.health.length);
// 破网冻结统计：破网事件数（卖出明细 tag 含"破网"或体检退出原因）
const exits = r.health.filter(h => (h.reason || "").indexOf("退出") >= 0 || (h.action || "").indexOf("退出") >= 0);
console.log("体检退出数:", exits.length, exits.slice(0,3).map(e => e.reason || e.action));
// 网格净值首末
console.log("nav 首末:", r.nav[0].toFixed(4), r.nav[r.nav.length-1].toFixed(4));
// 历史回放（7段）快速验证
const segs = E.STRESS_SEGS.slice();
const mdd = E.gridMaxDDSeg(D, params);
if (mdd) segs.push(mdd);
const segR = E.gridStressSegs(D, params, segs);
segR.forEach(s => console.log(s.label, "|", s.start, "~", s.end, "|", s.status || (s.total_return*100).toFixed(1)+"%", "浮亏", (s.max_dd*100).toFixed(1)+"%", "补仓", s.buy_trades, "破网", s.broke, "天数", s.n_days));
