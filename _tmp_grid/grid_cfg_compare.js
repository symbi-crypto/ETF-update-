const fs = require("fs");
global.D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_full.json", "utf-8"));
global.POOL = global.D.pool;
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const D = global.D;
const codes = ["510300.SH","159915.SZ"];
const base = { codes: codes, initial_capital: 1000000, mgmt: "B", period_n: 12, period_unit: "周", commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0 };

// 配置A：模拟 UI 改后（vol_win 120 + overrides baseAmt30万/perL6万/triggerBase5.8）
const ov = {};
const pA = W.gridParams("510300.SH", D.calendar.length-1, 500000, 0.00075, 120);
ov["510300.SH"] = { lower: pA.lower, upper: pA.upper, step: pA.step, nLevels: pA.nLevels, perLevelAmt: 60000, baseAmt: 300000, triggerBase: 5.8 };
const pB2 = W.gridParams("159915.SZ", D.calendar.length-1, 500000, 0.00075, 120);
ov["159915.SZ"] = { lower: pB2.lower, upper: pB2.upper, step: pB2.step, nLevels: pB2.nLevels, perLevelAmt: 100000, baseAmt: 500000, triggerBase: pB2.cur };
const rA = W.backtestGrid(D, Object.assign({}, base, { vol_win: 120, gridOverrides: ov }));
console.log("A(120+覆盖):", rA.metrics.total_return.toFixed(2)+"%", rA.metrics.n_trades, "笔");

// 配置B：默认（无 vol_win 无覆盖）
const rB = W.backtestGrid(D, Object.assign({}, base));
console.log("B(默认):", rB.metrics.total_return.toFixed(2)+"%", rB.metrics.n_trades, "笔");

// 配置C：仅 vol_win 120
const rC = W.backtestGrid(D, Object.assign({}, base, { vol_win: 120 }));
console.log("C(仅120):", rC.metrics.total_return.toFixed(2)+"%", rC.metrics.n_trades, "笔");

// 配置D：仅 overrides（无 vol_win）
const rD = W.backtestGrid(D, Object.assign({}, base, { gridOverrides: ov }));
console.log("D(仅覆盖):", rD.metrics.total_return.toFixed(2)+"%", rD.metrics.n_trades, "笔");
