const fs = require("fs");
const D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_extract.json", "utf-8"));
global.D = D; global.POOL = D.pool;
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const codes = ["510300.SH","510500.SH","159915.SZ","510050.SH","512100.SH","588000.SH"];
const res = W.backtestGrid(D, { codes, initial_capital: 1000000, mgmt: "B", period_n: 12, period_unit: "周",
  commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0 });
const m = res.metrics;
console.log("B6:", JSON.stringify({total:(m.total_return*100).toFixed(2)+"%", cagr:(m.cagr*100).toFixed(2)+"%", mdd:(m.max_dd*100).toFixed(2)+"%", sharpe:m.sharpe.toFixed(2), trades:m.n_trades, health:res.health.length, vol:(m.vol*100).toFixed(1)+"%", win:(m.win_rate*100).toFixed(1)+"%"}));
// 末尾 10 天持仓状态
const nav = res.nav, dates = res.dates;
const n = nav.length;
console.log("nav last 10:", dates.slice(n-10).map((d,i)=>d+":"+nav[n-10+i].toFixed(0)).join(" | "));
// 所有标的后段 active？
const active = Object.keys(D.series).length;
// 检查结尾 nav 是否走平：末尾 20 个交易日标准差
const last20 = nav.slice(n-20);
const avg = last20.reduce((a,b)=>a+b,0)/last20.length;
const sd = Math.sqrt(last20.reduce((a,b)=>a+(b-avg)*(b-avg),0)/last20.length);
console.log("last20 sd:", sd.toFixed(2), "avg:", avg.toFixed(0));
// 日收益极值
let mx=0,mn=0,mi=0;
for(let i=1;i<n;i++){ if(!(nav[i]>0)||!(nav[i-1]>0)) continue; const dr=nav[i]/nav[i-1]-1; if(dr>mx){mx=dr;mi=i;} if(dr<mn)mn=dr; }
console.log("drMax:", (mx*100).toFixed(1)+"% @", dates[mi], "| drMin:", (mn*100).toFixed(1)+"%");
// health 最后 5 条
console.log("health last:", JSON.stringify(res.health.slice(-5)));
