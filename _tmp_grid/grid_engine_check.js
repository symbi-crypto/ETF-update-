const fs = require("fs");
global.D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_full.json", "utf-8"));
global.POOL = global.D.pool;
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const D = global.D;
const i = D.calendar.length - 1;
console.log("末日:", D.calendar[i], "idx:", i);

// 1) gridParams 默认（volWin 默认60，行为与旧版一致）
const p0 = W.gridParams("510300.SH", i, 1000000/5, 0.00075);
console.log("默认 volWin=60:", JSON.stringify({lower:p0.lower, upper:p0.upper, step:p0.step, nLev:p0.nLevels, perL:p0.perLevelAmt, base:p0.baseAmt, cur:p0.cur}));

// 2) volWin=120 重算格距（应变化）
const p1 = W.gridParams("510300.SH", i, 1000000/5, 0.00075, 120);
console.log("volWin=120:", JSON.stringify({step:p1.step, nLev:p1.nLevels}));

// 3) backtestGrid 2标（默认 triggerBase=当前价中心锚）+ 手算档位
const codes = ["510300.SH","159915.SZ"];
const res = W.backtestGrid(D, {codes: codes, initial_capital: 1000000, mgmt:"B", period_n:12, period_unit:"周", commission_rate:0.00025, slippage_rate:0.0005, min_commission:0});
console.log("2标网格 metrics:", res ? JSON.stringify({total:res.metrics.total_return, cagr:res.metrics.cagr, dd:res.metrics.max_dd, shp:res.metrics.sharpe, trades:res.metrics.n_trades}) : "NULL");
// 档位验证：用引擎导出的 gridParams 手算 510300 档位（startIdx=GRID_LOOK+60=310）
const startIdx = 310;
const g = W.gridParams("510300.SH", startIdx, 1000000/2, 0.00075);
console.log("startIdx=310 参数:", JSON.stringify({lower:g.lower, upper:g.upper, step:g.step, nLev:g.nLevels, cur:g.cur}));
if (g) {
  const nL = g.nLevels, nD = Math.floor((nL-1)/2);
  const levs = [];
  for (let k=0;k<nL;k++) levs.push(+(g.cur + (k-nD)*g.step).toFixed(3));
  console.log("中心锚档位(基准=" + g.cur + ", nLev=" + nL + "):", levs);
  console.log("对称检查: 低于基准", levs.filter(v=>v<g.cur).length, "条, 高于", levs.filter(v=>v>g.cur).length, "条");
}
// 4) 无前视检查：档位基于 startIdx 收盘（已实现数据）
