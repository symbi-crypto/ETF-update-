const fs = require("fs");
global.D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_full.json", "utf-8"));
global.POOL = global.D.pool;
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const D = global.D;
const params = { codes: ["510300.SH","159915.SZ"], initial_capital: 1000000, mgmt: "B", period_n: 12, period_unit: "周", commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0 };
const r1 = W.backtestGrid(D, params);
console.log("第1次:", r1.metrics.total_return, r1.metrics.n_trades);
const r2 = W.backtestGrid(D, params);
console.log("第2次:", r2.metrics.total_return, r2.metrics.n_trades);
// 深拷贝数据再跑
global.D2 = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_full.json", "utf-8"));
const r3 = W.backtestGrid(global.D2, params);
console.log("深拷贝跑:", r3.metrics.total_return, r3.metrics.n_trades);
// 检查 D 数据是否被改
console.log("510300 close 末值:", D.series["510300.SH"].close[2512], "(原始应5.616)");
