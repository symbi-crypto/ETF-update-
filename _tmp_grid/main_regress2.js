const fs = require("fs");
global.D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_full.json", "utf-8"));
global.POOL = global.D.pool;
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const D = global.D;
function fmt(p) {
  return { total: (p.total_return*100).toFixed(2)+"%", exc: (p.excess_return!==undefined? (p.excess_return*100).toFixed(2)+"%": "-"), mdd: (p.max_dd*100).toFixed(2)+"%", sh: p.sharpe.toFixed(2), n: p.n_trades };
}
// 锚点1：2标周度再平衡 50/50
let r = W.backtest(D, { mode: "rebalance", codes: ["510300.SH","511990.SH"], weights: [0.5,0.5], rebal_period_n: 1, rebal_period_unit: "周", initial_capital: 1000000, commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0 });
console.log("2标周度再平衡:", JSON.stringify(fmt(r.metrics)));
// 锚点2：8宽基周度等权
const c8 = ["510300.SH","510050.SH","510500.SH","159915.SZ","512100.SH","588000.SH","588080.SH","563300.SH"].filter(c => D.pool.some(p=>p.code===c));
r = W.backtest(D, { mode: "rebalance", codes: c8, weights: c8.map(()=>1/c8.length), rebal_period_n: 1, rebal_period_unit: "周", initial_capital: 1000000, commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0 });
console.log("8宽基周度等权:", JSON.stringify(fmt(r.metrics)), "codes:", c8.length);
// 锚点3：全池117 + high_dd 10%
const all = D.pool.filter(p=>/^[0-9]{6}\.(SH|SZ)$/.test(p.code)).map(p=>p.code);
r = W.backtest(D, { mode: "momentum", codes: all, sell_conds: [{type:"high_dd", v:0.10}], factors: [{type:"roc", n:20, usage:"rank"}], hold_n: 1, hold_m: 1, rebal_period_n: 4, rebal_period_unit: "周", initial_capital: 1000000, commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0 });
console.log("全池117 high_dd10%:", JSON.stringify(fmt(r.metrics)), "codes:", all.length);
