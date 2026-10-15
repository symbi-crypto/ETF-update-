const fs = require("fs");
global.D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_extract.json", "utf-8"));
global.POOL = global.D.pool;
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const D = global.D;
// 主引擎 backtest 导出名？
const keys = Object.keys(W).join(",");
console.log("api:", keys);
if (W.backtest) {
  // 2标周度再平衡 50/50
  const r = W.backtest(D, { mode: "rebalance", codes: ["510300.SH","511990.SH"], weights: [0.5,0.5], rebal_period_n: 1, rebal_period_unit: "周", initial_capital: 1000000, commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0 });
  const m = r.metrics || r;
  console.log("2标周度再平衡:", JSON.stringify({total: (m.total_return*100).toFixed(2)+"%", x: (m.excess_return!==undefined? m.excess_return: "-"), mdd: (m.max_dd*100).toFixed(2)+"%", sharpe: m.sharpe, n: m.n_trades}));
}
