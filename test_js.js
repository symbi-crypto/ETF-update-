// test_js.js — node 下运行 JS 引擎，输出逐日净值供与 Python 对比
// 用法: node test_js.js            —— 默认因子配置
//       node test_js.js anchor     —— 回归锚点（旧多因子 4 因子口径）
//       node test_js.js variant    —— 变体（vol+slope_r2 因子）
const fs = require("fs");
const path = require("path");
const engine = require("./js_engine.js");

const D = JSON.parse(fs.readFileSync(path.join(__dirname, "output", "web_data.json"), "utf-8"));
const modeArg = process.argv[2] || "default";
const FACTORS = {
  default: [
    { kind: "roc", window: 20, weight: 0.20 },
    { kind: "roc", window: 60, weight: 0.25 },
    { kind: "roc", window: 120, weight: 0.15 },
    { kind: "vol", window: 60, weight: 0.15 },
    { kind: "risk_adj", window: 60, weight: 0.15 },
    { kind: "slope_r2", window: 25, weight: 0.10 }
  ],
  wls: [
    { kind: "wslope_r2", window: 25, weight: 1.0 }
  ],
  wlsMix: [
    { kind: "roc", window: 20, weight: 0.4 },
    { kind: "wslope_r2", window: 25, weight: 0.4 },
    { kind: "vol", window: 60, weight: 0.2 }
  ],
  anchor: [
    { kind: "roc", window: 20, weight: 0.25 },
    { kind: "roc", window: 60, weight: 0.35 },
    { kind: "roc", window: 120, weight: 0.25 },
    { kind: "risk_adj", window: 60, weight: 0.15 }
  ],
  variant: [
    { kind: "roc", window: 60, weight: 0.6 },
    { kind: "vol", window: 60, weight: 0.4, direction: -1 }
  ]
};
const EXTRA = {            // 按模式追加的非因子参数
  cooldown:{ cooldown_days: 20 },
  onlyRot: { only_rotation_codes: ["159985.SZ", "159915.SZ"] },
  timingOn:{ use_timing: true, timing_ma_window: 200, timing_indices: ["index_000300.SH"] },
  regIdxSub:{ regime_indices: ["index_000300.SH"] },
  dirMix: { factors: [
    { kind: "roc", window: 20, weight: 0.20, direction: -1 },
    { kind: "roc", window: 60, weight: 0.25 },
    { kind: "roc", window: 120, weight: 0.15 },
    { kind: "vol", window: 60, weight: 0.15, direction: 1 },
    { kind: "risk_adj", window: 60, weight: 0.15 },
    { kind: "slope_r2", window: 25, weight: 0.10 }
  ] },
  pool3: { codes: ["510300.SH","510050.SH","510500.SH"], factors: [
    { kind: "ma_vs_ma_lag", window: 20, window2: 5, window3: 20, weight: 0.10 },
    { kind: "c_vs_ma_lag", window: 5, window2: 20, weight: 0.10 },
    { kind: "rsrs", window: 20, weight: 0.10 }
  ] },
  arith4: { factors: [
    { kind: "roc", window: 20, weight: 0.20, usage: "rank" },
    { kind: "slope_r2", window: 25, weight: 0.20, usage: "rank" },
    { kind: "custom", window: 20, weight: 0.20, usage: "rank",
      formula_parts: [ { kind: "roc", window: 20, coef: 1.0, op: "+" }, { kind: "vol", window: 60, coef: 0.5, op: "×" }, { kind: "risk_adj", window: 60, coef: 0.5, op: "÷" } ] },
    { kind: "c_vs_ma", window: 20, op: "gte", threshold: 0.0, usage: "filter" }
  ] },
  unified: { factors: [
    { kind: "roc", window: 20, weight: 0.20, usage: "rank" },
    { kind: "slope_r2", window: 25, weight: 0.20, usage: "rank" },
    { kind: "custom", window: 20, weight: 0.20, usage: "rank",
      formula_parts: [ { kind: "roc", window: 20, coef: 1.0 }, { kind: "vol", window: 60, coef: 0.5 }, { kind: "rsrs", window: 20, coef: -0.3 } ] },
    { kind: "c_vs_ma", window: 20, op: "gte", threshold: 0.0, usage: "filter" }
  ] },
  newF7: { factors: [
    { kind: "amount", window: 20, weight: 0.15 },
    { kind: "volume", window: 20, weight: 0.15 },
    { kind: "rsrs", window: 20, weight: 0.15 },
    { kind: "c_vs_ma", window: 20, weight: 0.15 },
    { kind: "c_vs_ma_lag", window: 5, window2: 20, weight: 0.15 },
    { kind: "ma_vs_ma", window: 20, window2: 60, weight: 0.15 },
    { kind: "ma_vs_ma_lag", window: 20, window2: 5, window3: 20, weight: 0.10 }
  ] },
  newFactor: { factors: [
    { kind: "turnover", window: 20, weight: 0.25 },
    { kind: "vol_ratio", window: 20, window2: 60, weight: 0.25 },
    { kind: "roc", window: 20, weight: 0.25 },
    { kind: "vol", window: 60, weight: 0.25 }
  ] },
  reb: { mode: "rebalance",
    codes: ["513100.SH", "518880.SH", "511010.SH", "511990.SH"],
    reb_weights: { "513100.SH": 0.25, "518880.SH": 0.25, "511010.SH": 0.25, "511990.SH": 0.25 } },
  idleCash: { codes: ["510300.SH", "510050.SH", "511010.SH"],
    factors: [ { kind: "roc", window: 20, usage: "filter", op: "gte", threshold: 0.5 } ],
    fallback_when_no_signal: "cash" },
  idleBond: { codes: ["510300.SH", "510050.SH", "511010.SH"],
    factors: [ { kind: "roc", window: 20, usage: "filter", op: "gte", threshold: 0.5 } ],
    fallback_when_no_signal: "bond" },
  idleGold: { codes: ["510300.SH", "510050.SH", "518880.SH"],
    factors: [ { kind: "roc", window: 20, usage: "filter", op: "gte", threshold: 0.5 } ],
    fallback_when_no_signal: "gold" },
  idleMoney: { codes: ["510300.SH", "510050.SH", "511990.SH"],
    factors: [ { kind: "roc", window: 20, usage: "filter", op: "gte", threshold: 0.5 } ],
    fallback_when_no_signal: "money" },
  band13: { rank_n: 1, rank_m: 3 },
  band46: { rank_n: 4, rank_m: 6 },
  sellGain10: { rank_n: 1, rank_m: 3, sell_conds: [ { type: "buy_gain", value: 10 } ] },
  sellHighDD8: { rank_n: 1, rank_m: 3, sell_conds: [ { type: "high_dd", value: 8 } ] },
  hold5: { rank_n: 1, rank_m: 3, sell_conds: [ { type: "rank", value: 5 } ], hold_conds: [ { type: "hold_days", value: 5 } ] },
  buyCooldown30: { rank_n: 1, rank_m: 3, buy_add: [ { type: "cooldown", value: 30 } ] },
  buyFactor: { rank_n: 1, rank_m: 3, buy_add: [ { type: "factor", kind: "vol", window: 60, op: "lte", threshold: 0.3 } ] },
  newF7b: { factors: [
    { kind: "amplitude", window: 20, weight: 0.15 },
    { kind: "position", window: 20, weight: 0.15 },
    { kind: "rsi", window: 14, weight: 0.15 },
    { kind: "ma_lag", window: 5, window2: 20, weight: 0.15 },
    { kind: "close", window: 20, weight: 0.10 },
    { kind: "high", window: 20, weight: 0.10 },
    { kind: "ma", window: 20, weight: 0.20 }
  ] }
};
const params = {
  codes: (EXTRA.codes || D.pool.map(p => p.code)),
  filters: [],
  top_n: 3, rebalance_mode: "monthly", rebalance_interval: 1, rebalance_anchor: "first",
  annualize_factor: 252, score_floor: 0,
  use_regime_filter: true, regime_ma_window: 10,
  regime_require_below: 3, regime_require_above: 3,
  weak_period_mode: "overseas_pool", weak_period_use_ma_filter: false,
  fallback_when_no_signal: "cash",
  commission_rate: 0.00025, slippage_rate: 0.0005,
  start_date: "2017-01-01", end_date: "2026-09-30",
  initial_capital: 1000000, risk_free_rate: 0.02,
  overseas_codes: D.overseas,
  factors: FACTORS[modeArg] || FACTORS.default,
  cooldown_days: 0, only_rotation_codes: [],
  regime_indices: D.regime, use_timing: false, timing_ma_window: 200, timing_indices: []
};
Object.assign(params, EXTRA[modeArg] || {});
const res = engine.backtest(D, params);
console.log(JSON.stringify({
  nav: res.nav.map(v => Math.round(v * 1e9) / 1e9),
  metrics: {
    total: res.metrics.total_return, cagr: res.metrics.cagr,
    dd: res.metrics.max_dd, sharpe: res.metrics.sharpe,
    bench_total: res.metrics.benchmark.total, ew_total: res.metrics.equal_weight.total,
    n_trades: res.metrics.n_trades, cum_cost: res.metrics.cum_cost,
    annual: res.metrics.annual
  },
  first_trade: res.trades[0], last_trade: res.trades[res.trades.length - 1]
}));
