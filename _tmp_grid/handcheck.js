const fs = require("fs");
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_extract.json", "utf-8"));
global.D = D; global.POOL = D.pool;

// ---- 合成 40 天序列：横盘 10 元 → 跌至 8.0 → 回升至 9.4 ----
// 区间 [8.0,10.0] 2 格（9.0 触发），中间价 9.0；每格 500 元；底仓 = 1000×(10-cur)/(10-8)
const n = 40, close=[], open=[], high=[], low=[], amount=[];
function px(d){ // 价格路径
  if (d < 12) return 10.0 - d*0.06;        // 10.0 → 9.3
  if (d < 16) return 9.3 - (d-12)*0.25;    // 9.05 → 8.3
  if (d < 20) return 8.3 - (d-16)*0.075;   // 8.225 → 8.0
  return 8.0 + (d-20)*0.12;                // 回升 → 10.4
}
for (let d=0; d<n; d++){
  const c = px(d);
  close.push(c); open.push(c); high.push(c+0.05); low.push(c-0.05); amount.push(100000);
}
D.series["TEST.SH"] = { close, open, high, low, amount };
// calendar 40 天
D.calendar = Array.from({length:n}, (_,k)=> "2020-01-" + String(k+1).padStart(2,"0"));
D.pool.push({code:"TEST.SH", name:"测试"});

// 手动构造网格参数（绕开推荐器，直接用两格网格验证成交/份额/现金流）
// 区间 [8.0, 10.0] 2 格：levels=[9.0]，每格 500 元，底仓比例按 (10-cur)/(10-8)
// 用 start_idx=10（第11天横盘 9.4 附近）→ initI=11 开盘建底仓
const invest = 1000, perLevel = 500;
const res = W.backtestGrid(D, { codes:["TEST.SH"], initial_capital: invest, mgmt:"A", period_n: 100, period_unit:"日",
  commission_rate: 0, slippage_rate: 0, min_commission: 0, start_idx: 10 });
// ---- 手算 ----
// 第11天(索引10)收盘 9.4；initI=11 开盘 9.28 → 底仓 = 1000×(10-9.28)/(10-8) = 1000×0.36 = 360 元 → 份额 360/9.28 = 38.7931
// 若 cur=close[10]=9.4：底仓 = 1000×(10-9.4)/2 = 300 → 份额 300/9.28=32.3276（推荐器口径：cur 用决策日收盘）
// 引擎在 start_idx=10 调 gridParams：cur=cArr[10]=9.4；p10/p90 由前250日(实际40天)分位算出——区间不是[8,10]！
// —— 手算需用引擎实际推荐参数。改用验证：先取引擎实际参数，再按引擎规则手算对照。
const gp = W.gridParams("TEST.SH", 10, invest, 0);
console.log("引擎推荐参数:", JSON.stringify({lower: gp.lower.toFixed(2), upper: gp.upper.toFixed(2), step: gp.step.toFixed(3), nLev: gp.nLevels, perLevel: gp.perLevelAmt.toFixed(0), base: gp.baseAmt.toFixed(0), cur: gp.cur.toFixed(2)}));
console.log("网格回测结果:", JSON.stringify({total: (res.metrics.total_return*100).toFixed(2)+"%", trades: res.metrics.n_trades}));
console.log("trades:", JSON.stringify(res.trades));
console.log("nav 末:", res.nav[res.nav.length-1].toFixed(2));
// ---- 手算（按引擎参数与规则逐笔）----
// 规则：底仓 initI 开盘价成交；触发=昨收穿越格位（下穿买/上穿卖）；成交次日开盘；T+1 当日买入不可当日卖
// 依次验证每笔 trades 的份额 = 每格金额/成交价、现金加减 = 份额×价（零成本）
let cash = 0, pos = 0, ok = true;
res.trades.forEach(t => {
  if (t.side === "BUY") { if (Math.abs(t.sh*1000 - t.amt) > 0.5) ok=false; pos += t.sh; cash -= t.amt; }
  else { if (Math.abs(t.sh*1000 - t.amt) > 0.5) ok=false; pos -= t.sh; cash += t.amt; }
});
console.log("现金流守恒(现金+市值=投入):", pos, cash, (pos*close[close.length-1] + cash).toFixed(2), "vs", invest);
