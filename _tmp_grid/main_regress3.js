const fs = require("fs");
global.D = JSON.parse(fs.readFileSync("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/data_full.json", "utf-8"));
global.POOL = global.D.pool;
const W = require("/home/user/Doubao/chats/38444992708406018/wufu_etf_system/_tmp_grid/engine_standalone.js");
const D = global.D;
function mk(codes, extra) {
  return Object.assign({
    codes: codes, cooldown_days: 0,
    factors: [{ kind: "roc", window: 20, weight: 0.1, direction: 1, usage: "rank" }],
    top_n: 0, rank_n: 1, rank_m: 1, standardize: "robust",
    buy_add: [], sell_conds: [], hold_conds: [],
    mode: "rotation", rebalance_mode: "weekly", rebalance_interval: 1, rebalance_anchor: "mon",
    annualize_factor: 252, score_floor: 0, r2_filter_mode: "normal_only",
    mm_on: false, mm_bench: [], mm_mode: "any", mm_window: 20, mm_enter_days: 3, mm_exit_days: 3,
    mm_action: "cut", mm_cut_pct: 50,
    st_on: false, st_window: 20, st_small_codes: [], st_large_codes: [],
    use_regime_filter: false, use_real_pool: true, use_idx: false,
    commission_rate: 0.00025, slippage_rate: 0.0005, min_commission: 0, tiered_slippage: false,
    initial_capital: 1000000, benchmark: "H00300.CSI"
  }, extra);
}
function fmt(m) { return { total: (m.total_return*100).toFixed(2)+"%", exc: (m.excess_return!==undefined?(m.excess_return*100).toFixed(2)+"%":"-"), mdd: (m.max_dd*100).toFixed(2)+"%", sh: m.sharpe.toFixed(2), n: m.n_trades }; }
const all = D.pool.filter(p=>/^[0-9]{6}\.(SH|SZ)$/.test(p.code)).map(p=>p.code);
// 锚点1：全池117 + high_dd10%（期望 -23.05%）
let r = W.backtest(D, mk(all, { sell_conds: [{ type: "high_dd", value: 10 }] }));
console.log("全池117+high_dd10%:", JSON.stringify(fmt(r.metrics)), "| 期望 total≈-23.05%");
// 锚点2：2标周度再平衡 50/50（期望 34.95%/+3.05%/-23.15%/0.16/529）
r = W.backtest(D, mk(["510300.SH","511990.SH"], { mode: "rebalance", reb_weights: {"510300.SH":0.5,"511990.SH":0.5}, reb_codes:["510300.SH","511990.SH"], reb_weight_mode:"fixed", rebalance_mode:"weekly", rebalance_interval:1, rebalance_anchor:"mon" }));
console.log("2标周度再平衡:", JSON.stringify(fmt(r.metrics)), "| 期望 34.95%/+3.05%/-23.15%/0.16/529");
// 锚点3：8宽基周度等权（期望 61.13%/+4.91%/-44.94%/0.24/529）
const c8 = ["510300.SH","510050.SH","510500.SH","159915.SZ","512100.SH","588000.SH","588080.SH","563300.SH"].filter(c => D.pool.some(p=>p.code===c));
const w8 = {}; c8.forEach(c => w8[c] = 1/c8.length);
r = W.backtest(D, mk(c8, { mode: "rebalance", reb_weights: w8, reb_codes: c8, reb_weight_mode: "fixed", rebalance_mode: "weekly", rebalance_interval: 1, rebalance_anchor: "mon" }));
console.log("8宽基周度等权:", JSON.stringify(fmt(r.metrics)), "| 期望 61.13%/+4.91%/-44.94%/0.24/529, codes:", c8.length);
