# -*- coding: utf-8 -*-
"""
engine.py — ETF动量轮动回测引擎
=====================================
策略逻辑（斜率动量口径，参数全部可在 config.json 调整）：
1) 动量得分：对每个标的后 momentum_window 个交易日的对数收盘价做 OLS 线性回归，
   得分 = 年化斜率 × R²（斜率×annualize_factor；annualize_factor 默认 252）。
2) 过滤：
   - 得分 > score_floor
   - 筛选条件（可选，filters 列表）：如 R² ≥ 阈值、涨幅 ≥ X、波动率 ≤ Y，全部满足才进入候选池
   - 成交量比值（可选）：近5日均量/近20日均量 ≥ 阈值
   - 均线过滤（可选）：收盘价 > MA(n)
3) 走弱期（v5.0 大A判断，可选）：4个指数（沪深300/中小综指/创业板指/中证A500）
   中至少 regime_require_below 个收盘价低于 MA(regime_ma_window) 进入走弱期，
   至少 regime_require_above 个站上 MA 退出；
   走弱期只从 overseas_pool 轮动（weak_period_mode: overseas_pool / cash / full_pool），
   并可启用均线过滤（weak_period_use_ma_filter）。
4) 持仓：按得分降序持有得分最高的 top_n 只（等权）；无信号时按
   fallback_when_no_signal 空仓(cash) 或持国债ETF(bond)。
5) 交易：每隔 rebalance_days 个交易日收盘后决策，次日开盘换仓；
   成本 = (佣金 + 滑点) × 单边换手率，在换仓日开盘计入净值。
6) 回测从 backtest.start_date 起算，此前数据用于动量/均线预热。

用法：
    from engine import run_backtest, load_config
    result = run_backtest(config)   # -> dict，含净值序列/调仓记录/指标/敏感性
"""
import datetime
import json
import math
import os

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
_DATA_CACHE = {}


# ---------------- 数据加载 ----------------

def _week_id(date_str: str) -> str:
    """返回日期所在自然周的周一日期（YYYY-MM-DD），作为周标识；与 JS 端 weekId 同构"""
    y, m, d = int(date_str[:4]), int(date_str[5:7]), int(date_str[8:10])
    dt = datetime.date(y, m, d)
    return (dt - datetime.timedelta(days=dt.weekday())).isoformat()



def _load_unadj_nav(code, sub):
    """读取 data/unadj/{code}.csv 或 data/nav/{code}.csv -> {date: value}（轻量）"""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", sub, code + ".csv")
    if not os.path.exists(path):
        return None
    out = {}
    with open(path, encoding="utf-8") as f:
        header = f.readline().strip().split(",")
        vi = header.index("close") if "close" in header else header.index("nav")
        for line in f:
            parts = line.strip().split(",")
            if len(parts) < 2:
                continue
            try:
                out[parts[0]] = float(parts[vi])
            except (ValueError, IndexError):
                pass
    return out

def load_unadj(code):
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "unadj", code + ".csv")
    if not os.path.exists(path):
        return None
    out = {}
    with open(path, encoding="utf-8") as f:
        header = f.readline().strip().split(",")
        for line in f:
            parts = line.strip().split(",")
            if len(parts) < 5:
                continue
            try:
                out[parts[0]] = {"open": float(parts[1]), "close": float(parts[4])}
            except (ValueError, IndexError):
                pass
    return out

def load_unadj_close(code):
    return _load_unadj_nav(code, "unadj")

def load_nav(code):
    return _load_unadj_nav(code, "nav")

def load_ohlc(code: str):
    """读 data/<code>.csv -> {date: dict(open, high, low, close, volume, amount)}"""
    if code in _DATA_CACHE:
        return _DATA_CACHE[code]
    path = os.path.join(DATA_DIR, code + ".csv")
    if not os.path.exists(path):
        return None
    out = {}
    with open(path, "r", encoding="utf-8") as f:
        header = f.readline().strip().split(",")
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(",")
            rec = {}
            for i, k in enumerate(header):
                v = parts[i] if i < len(parts) else ""
                rec[k] = v if k == "date" else (None if v == "" else float(v))
            out[rec["date"]] = rec
    _DATA_CACHE[code] = out
    return out


def load_config(path=None):
    path = path or os.path.join(ROOT, "config.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------- 斜率动量 ----------------

def momentum_metrics(closes: np.ndarray, annualize: int = 252):
    """对数收盘价线性回归 -> (得分, R², 斜率, 年化斜率)"""
    n = len(closes)
    if n < 3:
        return 0.0, 0.0, 0.0, 0.0
    y = np.log(np.asarray(closes, dtype=float))
    x = np.arange(n, dtype=float)
    xm = x.mean()
    ym = y.mean()
    sxx = ((x - xm) ** 2).sum()
    sxy = ((x - xm) * (y - ym)).sum()
    slope = sxy / sxx if sxx > 0 else 0.0
    intercept = ym - slope * xm
    yhat = slope * x + intercept
    ss_res = ((y - yhat) ** 2).sum()
    ss_tot = ((y - ym) ** 2).sum()
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    annualized = slope * annualize
    return annualized * r2, float(r2), float(slope), float(annualized)


def weighted_momentum_metrics(closes: np.ndarray, annualize: int = 252):
    """对数收盘价加权线性回归（权重=交易日位置线性递增、近期权重更大）-> (得分, R², 斜率, 年化斜率)
    加权最小二乘：min Σ w_i·(y_i-ŷ_i)²，w_i = i+1（最后一天权重最大）。"""
    n = len(closes)
    if n < 3:
        return 0.0, 0.0, 0.0, 0.0
    y = np.log(np.asarray(closes, dtype=float))
    x = np.arange(n, dtype=float)
    w = np.arange(1, n + 1, dtype=float)          # 线性递增权重
    wsum = w.sum()
    xw = (w * x).sum() / wsum
    yw = (w * y).sum() / wsum
    den = (w * (x - xw) ** 2).sum()
    slope = (w * (x - xw) * (y - yw)).sum() / den if den > 0 else 0.0
    intercept = yw - slope * xw
    yhat = slope * x + intercept
    ss_res = (w * (y - yhat) ** 2).sum()
    ss_tot = (w * (y - yw) ** 2).sum()
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    annualized = slope * annualize
    return annualized * r2, float(r2), float(slope), float(annualized)


def rolling_ma(arr: np.ndarray, i: int, n: int):
    """截至 i 日（含）的 n 日均线；数据不足或含 NaN 返回 NaN"""
    if i + 1 < n:
        return np.nan
    seg = arr[i - n + 1: i + 1]
    if np.isnan(seg).any():
        return np.nan
    return float(seg.mean())


# ---------------- 回测主流程 ----------------

def run_backtest(cfg: dict, quiet: bool = False) -> dict:
    st = cfg["strategy"]
    cost = cfg["costs"]
    bt = cfg["backtest"]

    pool = [p["code"] for p in cfg["pool"]]
    # 支持 strategy.codes 子集（网页勾选标的）；未设置则全池
    sel_codes = st.get("codes")
    if sel_codes:
        code_set = set(pool)
        pool = [c for c in sel_codes if c in code_set]
    # 空仓时持有标的（fallback）：非现金目标标的纳入数据/权重空间（不入候选池，仅作兜底持仓——即使未勾选也能持有）
    idle_map = {"cash": None, "gold": "518880.SH", "bond": "511010.SH", "money": "511990.SH"}
    idle_c = idle_map.get(st.get("fallback_when_no_signal"))
    if st.get("mode") != "rebalance" and idle_c and idle_c not in pool:
        pool = pool + [idle_c]
    pool_names = {p["code"]: p["name"] for p in cfg["pool"]}
    overseas = set(cfg["overseas_pool"])
    bench_idx = cfg["benchmark"]["index"]

    # 1) 载入数据
    data = {}
    for code in pool + [bench_idx] + list(cfg["regime_indices"].keys()):
        d = load_ohlc(code)
        if d is None:
            raise FileNotFoundError(f"缺少行情数据 data/{code}.csv，请先运行 fetch_data.py")
        data[code] = d

    # 未复权价与单位净值（溢价率因子与买入份额用；缺失则相关因子/份额为空）
    raw_opens, raw_closes, navs = {}, {}, {}
    _uo_raw, _uc_raw, _nv_raw = {}, {}, {}
    for code in pool:
        _uo_raw[code] = load_unadj(code)
        _uc_raw[code] = load_unadj_close(code)
        _nv_raw[code] = load_nav(code)

    # 2) 全日历 = 基准指数交易日历（覆盖全部池标的交易日），用于预热
    full_cal = sorted(data[bench_idx].keys())
    end = bt["end_date"]
    full_cal = [d for d in full_cal if d <= end]
    start = bt["start_date"]
    start_pos = next((i for i, d in enumerate(full_cal) if d >= start), 0)
    warmup = max(int(f.get("window", 20)) for f in st.get("factors", [])) if st.get("factors") else st.get("momentum_window", 40)
    if start_pos + warmup + 5 > len(full_cal):
        raise ValueError("回测区间过短，无法完成动量预热")
    n_all = len(full_cal)

    # 按全日历对齐为数组（与 JS 引擎同构；缺失用 None）
    for code in pool:
        uo, uc, nv = _uo_raw.get(code), _uc_raw.get(code), _nv_raw.get(code)
        raw_opens[code] = [float(uo[dt]["open"]) if uo and dt in uo and uo[dt].get("open") is not None else None for dt in full_cal] if uo else None
        raw_closes[code] = [float(uc[dt]) if uc and dt in uc and uc[dt] is not None else None for dt in full_cal] if uc else None
        navs[code] = [float(nv[dt]) if nv and dt in nv and nv[dt] is not None else None for dt in full_cal] if nv else None

    # 3) 预构建每个标的在全日历上的价格序列（未上市前为 NaN）
    closes, opens, volumes, amts, highs, lows = {}, {}, {}, {}, {}, {}
    for code in pool:
        c = np.full(n_all, np.nan)
        o = np.full(n_all, np.nan)
        v = np.full(n_all, np.nan)
        a = np.full(n_all, np.nan)
        h = np.full(n_all, np.nan)
        l = np.full(n_all, np.nan)
        for i, d in enumerate(full_cal):
            rec = data[code].get(d)
            if rec and rec["close"] is not None:
                c[i] = rec["close"]
                if rec["open"] is not None:
                    o[i] = rec["open"]
                v[i] = rec["volume"] if rec["volume"] is not None else np.nan
                a[i] = rec["amount"] if rec["amount"] is not None else np.nan
                if rec["high"] is not None:
                    h[i] = rec["high"]
                if rec["low"] is not None:
                    l[i] = rec["low"]
        closes[code] = c
        opens[code] = o
        volumes[code] = v
        amts[code] = a
        highs[code] = h
        lows[code] = l

    idx_close = {}
    for ic in cfg["regime_indices"]:
        c = np.full(n_all, np.nan)
        for i, d in enumerate(full_cal):
            rec = data[ic].get(d)
            if rec and rec["close"] is not None:
                c[i] = rec["close"]
        idx_close[ic] = c

    # 4) 主循环参数
    score_floor = st.get("score_floor", 0.0)
    ann = st["annualize_factor"]
    cost_per_side = cost["commission_rate"] + cost["slippage_rate"]
    tiered = bool(cost.get("tiered_slippage", False))   # 按标的流动性分档滑点（近20日均成交额，万元）
    base_slip = cost["slippage_rate"]

    def slippage_for(code, i):
        """按近20日平均成交额（万元）分档滑点：≥10亿→3bp / ≥1亿→5bp / ≥5000万→8bp / ≥1000万→15bp / 其余→30bp"""
        if not tiered:
            return base_slip
        a = amts[code]
        seg = a[max(0, i - 19):i + 1]
        seg = seg[~np.isnan(seg)]
        if len(seg) < 5:
            return base_slip
        adv = float(np.mean(seg)) / 1e4                 # CSV amount 为元，统一为万元
        if adv >= 100000:
            return 0.0003
        if adv >= 10000:
            return 0.0005
        if adv >= 5000:
            return 0.0008
        if adv >= 1000:
            return 0.0015
        return 0.0030

    risk_free = bt["risk_free_rate"]
    rf_daily = (1.0 + risk_free) ** (1.0 / ann) - 1.0

    # 调仓周期：daily=每N个交易日 | weekly=每N周(周一或周五) | monthly=每N个月(月初或月末交易日) | quarterly=每N季度(季初或季末交易日) | yearly=每N年(年初或年末交易日) | days=每N交易日(旧兼容)
    rmode = st.get("rebalance_mode", "monthly")
    rint = max(1, int(st.get("rebalance_interval", 1)))
    anchor = st.get("rebalance_anchor", "mon" if rmode == "weekly" else "first")
    if rmode == "daily":
        decision_idx = set(range(start_pos, n_all, rint))
    elif rmode == "weekly":
        decision_idx = set()
        w_seq = -1
        prev_w = None
        for i in range(start_pos, n_all):
            w = _week_id(full_cal[i])
            if w != prev_w:
                prev_w = w
                w_seq += 1
            if w_seq % rint == 0:
                is_first = (i == start_pos or _week_id(full_cal[i - 1]) != w)
                is_last = (i + 1 >= n_all or _week_id(full_cal[i + 1]) != w)
                if (anchor == "fri" and is_last) or (anchor != "fri" and is_first):
                    decision_idx.add(i)
    elif rmode in ("monthly", "quarterly", "yearly"):
        def _period_key(i):
            ds = full_cal[i]
            if rmode == "monthly":
                return ds[:7]
            if rmode == "quarterly":
                return ds[:4] + "-Q" + str((int(ds[5:7]) - 1) // 3 + 1)
            return ds[:4]  # yearly
        decision_idx = set()
        seq = -1
        prev_k = None
        for i in range(start_pos, n_all):
            k = _period_key(i)
            if k != prev_k:
                prev_k = k
                seq += 1
            if seq % rint == 0:
                is_first = (i == start_pos or _period_key(i - 1) != k)
                is_last = (i + 1 >= n_all or _period_key(i + 1) != k)
                if (anchor == "last" and is_last) or (anchor != "last" and is_first):
                    decision_idx.add(i)
    else:
        decision_idx = set(range(start_pos, n_all, max(1, int(st.get("rebalance_days", 20)))))

    n_assets = len(pool)
    w_old = np.zeros(n_assets)
    pending = None                  # (w_new, cost_pct) 决策日收盘设定，次日开盘执行
    nav = 1.0
    cum_cost = 0.0
    regime = "normal"

    nav_series = np.zeros(n_all)
    dd_series = np.zeros(n_all)
    exposure_series = np.zeros(n_all)
    holdings_series = [[] for _ in range(n_all)]
    regime_series = ["normal"] * n_all
    daily_ret = np.zeros(n_all)
    trade_records = []
    peak = 1.0

    # 基准（沪深300指数）与等权池净值
    bclose = np.array([data[bench_idx][d]["close"] for d in full_cal], dtype=float)
    bench_nav = bclose / bclose[0]
    bench_daily = np.zeros(n_all)
    bench_daily[1:] = bench_nav[1:] / bench_nav[:-1] - 1.0

    ew_daily = np.zeros(n_all)
    for i in range(1, n_all):
        rets = []
        for code in pool:
            c1, c0 = closes[code][i], closes[code][i - 1]
            if not (np.isnan(c1) or np.isnan(c0)) and c0 > 0:
                rets.append(c1 / c0 - 1.0)
        ew_daily[i] = np.mean(rets) if rets else 0.0
    ew_nav = np.cumprod(1.0 + ew_daily)

    def volume_ratio(code, i):
        v = volumes[code]
        s_w = st["volume_ratio_window"]
        b_w = st["volume_ratio_base_window"]
        short = v[i - s_w + 1: i + 1]
        base = v[i - b_w + 1: i + 1]
        if len(short) < s_w or np.isnan(short).any() or np.isnan(base).any():
            return None
        bb = base.mean()
        return (short.mean() / bb) if bb > 0 else None

    def _ma(arr, i, w):
        lo = i - w + 1
        if lo < 0:
            return np.nan
        seg = arr[lo:i + 1]
        if np.isnan(seg).any():
            return np.nan
        return float(seg.mean())

    def _ols_slope(xs, ys):
        xs = np.asarray(xs, dtype=float)
        ys = np.asarray(ys, dtype=float)
        mx, my = xs.mean(), ys.mean()
        sxx = ((xs - mx) ** 2).sum()
        if sxx < 1e-12:
            return 0.0
        return float(((xs - mx) * (ys - my)).sum() / sxx)

    def _sum_at(arr, i, w):
        lo = i - w + 1
        if lo < 0:
            return np.nan
        seg = arr[lo:i + 1]
        if np.isnan(seg).any():
            return np.nan
        return float(seg.sum())

    def factor_value(kind, code, i, f):
        w1 = int(f.get("window", 20))
        w2 = int(f.get("window2", 0) or 0)
        w3 = int(f.get("window3", 0) or 0)
        c = closes[code]
        if kind == "custom":
            parts = f.get("formula_parts") or []
            if len(parts) < 2:
                return np.nan
            vals = []
            for p in parts:
                pv = factor_value(p.get("kind", "roc"), code, i,
                                  {"window": p.get("window", 20),
                                   "window2": p.get("window2", 0) or 0,
                                   "window3": p.get("window3", 0) or 0})
                if pv is None or (isinstance(pv, float) and np.isnan(pv)):
                    return np.nan
                vals.append(float(p.get("coef", 0.0)) * pv)
            # 标准四则运算：先乘除（从左到右），后加减（与 JS 同构）
            stack = [vals[0]]
            for i2 in range(1, len(vals)):
                op2 = parts[i2].get("op") or "+"
                vi = vals[i2]
                if op2 in ("×", "*", "x"):
                    stack[-1] = stack[-1] * vi
                elif op2 in ("÷", "/"):
                    if vi == 0:
                        return np.nan
                    stack[-1] = stack[-1] / vi
                elif op2 in ("-", "−"):
                    stack.append(-vi)
                else:
                    stack.append(vi)
            return float(sum(stack))
        if kind == "roc":
            lo = i - w1 + 1
            if lo < 0 or np.isnan(c[lo:i + 1]).any():
                return np.nan
            return float(c[i] / c[lo] - 1.0)
        if kind in ("slope_r2", "wslope_r2", "r2"):
            lo = i - w1 + 1
            if lo < 0 or np.isnan(c[lo:i + 1]).any():
                return np.nan
            s = c[lo:i + 1]
            mm = momentum_metrics(s, ann) if kind in ("slope_r2", "r2") else weighted_momentum_metrics(s, ann)
            return mm[1] if kind == "r2" else mm[0]
        if kind in ("vol", "risk_adj"):
            lo = i - w1 + 1
            if lo < 0 or np.isnan(c[lo:i + 1]).any():
                return np.nan
            s = c[lo:i + 1]
            rets = s[1:] / s[:-1] - 1.0
            vol = np.std(rets, ddof=0) * np.sqrt(ann)
            if kind == "vol":
                return float(vol)
            return float((s[-1] / s[0] - 1.0) / vol) if vol > 0 else 0.0
        if kind == "amount":
            return _sum_at(amts[code], i, w1) / w1
        if kind == "volume":
            return _sum_at(volumes[code], i, w1) / w1
        if kind == "rsrs":
            lo = i - w1 + 1
            if lo < 0 or np.isnan(highs[code][lo:i + 1]).any() or np.isnan(lows[code][lo:i + 1]).any():
                return np.nan
            return _ols_slope(highs[code][lo:i + 1], lows[code][lo:i + 1])
        if kind == "premium":
            rc = raw_closes.get(code) if raw_closes is not None else None
            nv = navs.get(code) if navs is not None else None
            if rc is None or nv is None:
                return np.nan
            s_p, cnt_p = 0.0, 0
            for j3 in range(i - w1 + 1, i + 1):
                pc, pn = rc[j3], nv[j3]
                if pc is None or pn is None or np.isnan(pc) or np.isnan(pn) or pn <= 0:
                    return np.nan
                s_p += (pc / pn - 1.0)
                cnt_p += 1
            return float(s_p / cnt_p * 100.0)
        if kind == "c_vs_ma":
            m1 = _ma(c, i, w1)
            if np.isnan(m1):
                return np.nan
            return float(c[i] / m1 - 1.0)
        if kind == "c_vs_ma_lag":
            m2 = _ma(c, i - w1, w2)
            if np.isnan(m2):
                return np.nan
            return float(c[i] / m2 - 1.0)
        if kind == "ma_vs_ma":
            mn1 = _ma(c, i, w1)
            mm1 = _ma(c, i, w2)
            if np.isnan(mn1) or np.isnan(mm1):
                return np.nan
            return float(mn1 / mm1 - 1.0)
        if kind == "ma_vs_ma_lag":
            mn2 = _ma(c, i, w1)
            mm2 = _ma(c, i - w2, w3)
            if np.isnan(mn2) or np.isnan(mm2):
                return np.nan
            return float(mn2 / mm2 - 1.0)
        if kind == "close":
            return float(c[i])
        if kind == "open":
            o = opens[code]
            return float(o[i]) if not np.isnan(o[i]) else np.nan
        if kind == "high":
            h = highs[code]
            return float(h[i]) if not np.isnan(h[i]) else np.nan
        if kind == "low":
            l = lows[code]
            return float(l[i]) if not np.isnan(l[i]) else np.nan
        if kind == "ma":
            m = _ma(c, i, w1)
            return float(m)
        if kind == "ma_lag":
            m = _ma(c, i - w1, w2)
            return float(m)
        if kind == "amplitude":
            h, l = highs[code][i], lows[code][i]
            if np.isnan(h) or np.isnan(l) or l <= 0:
                return np.nan
            return float((h - l) / l)
        if kind == "position":
            h, l, cl = highs[code][i], lows[code][i], c[i]
            if np.isnan(h) or np.isnan(l) or h <= l:
                return np.nan
            return float((cl - l) / (h - l))
        if kind == "rsi":
            lo = i - w1 + 1
            if lo < 0 or np.isnan(c[lo:i + 1]).any():
                return np.nan
            seg = c[lo:i + 1]
            rets = seg[1:] / seg[:-1] - 1.0
            gains = rets[rets > 0].sum()
            losses = -rets[rets < 0].sum()
            if gains + losses <= 0:
                return np.nan
            return float(100.0 * gains / (gains + losses))
        return np.nan

    def _need_of(f):
        w1 = int(f.get("window", 20))
        w2 = int(f.get("window2", 0) or 0)
        w3 = int(f.get("window3", 0) or 0)
        kd = f.get("kind", "roc")
        if kd == "custom":
            nd = 0
            for pp in (f.get("formula_parts") or []):
                nd = max(nd, _need_of({"kind": pp.get("kind", "roc"), "window": pp.get("window", 20),
                                       "window2": pp.get("window2", 0) or 0, "window3": pp.get("window3", 0) or 0}))
            return nd
        if kd in ("c_vs_ma_lag", "ma_lag"):
            return w1 + w2
        if kd == "ma_vs_ma":
            return max(w1, w2)
        if kd == "ma_vs_ma_lag":
            return max(w1, w2 + w3)
        return w1

    def _holding_weights(mode, codes, i):
        """持有标的相对权重：equal=等权 / inv_vol=逆波动率(1/σ) / risk_parity=近60日协方差等风险贡献迭代。
        只用决策日及之前数据（point-in-time）；返回 {code: p}，Σp=1"""
        n = len(codes)
        if n == 0:
            return {}
        if mode not in ("inv_vol", "risk_parity"):
            return {c: 1.0 / n for c in codes}
        vol = {}
        for c in codes:
            seg = closes[c][max(0, i - 20):i + 1]
            seg = seg[~np.isnan(seg)]
            if len(seg) < 5:
                vol[c] = None
                continue
            r = np.diff(seg) / seg[:-1]
            vol[c] = float(np.std(r, ddof=0))
        okc = [c for c in codes if vol.get(c) is not None and vol[c] > 1e-12]
        if not okc:
            return {c: 1.0 / n for c in codes}

        def _inv_vol_rel():
            inv = {c: 1.0 / vol[c] for c in okc}
            tot = float(sum(inv.values()))
            rel = {c: inv[c] / tot for c in okc}
            if len(okc) < n:
                rem = 1.0 - sum(rel.values())
                miss = [c for c in codes if c not in okc]
                for c in miss:
                    rel[c] = rem / len(miss)
            return rel

        if mode == "inv_vol":
            return _inv_vol_rel()
        # risk_parity：近60日收益协方差，等风险贡献迭代（对角加小量防奇异）
        T = 60
        rets = []
        for c in okc:
            seg = closes[c][max(0, i - T):i + 1]
            seg = seg[~np.isnan(seg)]
            rr = np.diff(seg) / seg[:-1]
            rets.append(rr[-min(T, len(rr)):])
        L = min(len(x) for x in rets)
        if L < 30:
            return _inv_vol_rel()
        R = np.vstack([x[-L:] for x in rets])          # n_ok x L
        cov = np.cov(R, ddof=0) + np.eye(len(okc)) * 1e-8
        w = np.ones(len(okc)) / len(okc)
        for _ in range(100):
            pv = float(w @ cov @ w)
            if pv <= 0:
                break
            rc = w * (cov @ w) / np.sqrt(pv)
            avg = float(rc.mean())
            if avg <= 0:
                break
            w = w * np.sqrt(avg / np.maximum(rc, 1e-12))
            w = w / w.sum()
        rel = {okc[k]: float(w[k]) for k in range(len(okc))}
        if len(okc) < n:
            rem = 1.0 - sum(rel.values())
            miss = [c for c in codes if c not in okc]
            for c in miss:
                rel[c] = rem / len(miss)
        return rel

    def factor_scores(candidates, i):
        """通用多因子动量：factors 列表（每项 {kind, window[, window2, window3], weight[, direction, usage]}），
        仅取 usage=rank（缺省）的因子，逐因子在当日标的全集上做截面稳健 z-score（1%/99% winsorize + median/MAD），
        按 权重×方向 加权求和为得分。
        kind: roc | slope_r2 | wslope_r2 | vol | risk_adj | amount | volume | rsrs | c_vs_ma | c_vs_ma_lag
              | ma_vs_ma | ma_vs_ma_lag | custom（formula_parts=[{kind, window, window2, window3, coef}]，≥3项）
        返回 [(score, r2=nan, code, ann_slope=nan, slope=nan), ...]"""
        all_factors = st.get("factors") or (st.get("multi_factors") or {}).get("factors") or []
        if not all_factors:
            all_factors = [dict(ft, usage="filter") for ft in (st.get("filters") or [])]
        factors = [f for f in all_factors if (f.get("usage") or "rank") == "rank"]
        if not factors:
            return []
        need = 0
        for f in factors:
            need = max(need, _need_of(f))
        need += 1
        raw = {}
        for code in candidates:
            c = closes[code]
            if i + 1 < need or np.isnan(c[i]):
                continue
            vals = {}
            ok = True
            for f in factors:
                kind = f.get("kind", "roc")
                v = factor_value(kind, code, i, f)
                if v is None or (isinstance(v, float) and np.isnan(v)):
                    ok = False
                    break
                kk = kind + ":" + str(int(f.get("window", 20))) + ":" + str(int(f.get("window2", 0) or 0)) + ":" + str(int(f.get("window3", 0) or 0))
                vals[kk] = v
            if not ok:
                continue
            raw[code] = vals
        if not raw:
            return []
        keys = list(raw)
        fkeys = list(raw[keys[0]])
        std_mode = (st.get("standardize") or "robust")          # robust | zscore | rank | none
        zs = {}
        for k in fkeys:
            arr = np.array([raw[x][k] for x in keys])
            if std_mode == "none":
                zs[k] = {x: float(raw[x][k]) for x in keys}
            elif std_mode == "zscore":
                mean_v = float(np.mean(arr))
                sd_v = float(np.std(arr))
                zs[k] = {x: (0.0 if sd_v < 1e-12 else (raw[x][k] - mean_v) / sd_v) for x in keys}
            elif std_mode == "rank":
                sorted_arr = np.sort(arr)
                nv = max(len(keys) - 1, 1)
                zs[k] = {x: float(np.searchsorted(sorted_arr, raw[x][k], "left") / nv) for x in keys}
            else:  # robust（默认，与 JS 同构）
                # 稳健标准化：1%/99% winsorize 后取 median/MAD（×1.4826 折算为 σ），z 用原始值减稳健中心
                lo, hi = np.percentile(arr, 1), np.percentile(arr, 99)
                w = np.clip(arr, lo, hi)
                med = float(np.median(w))
                mad = float(np.median(np.abs(w - med)))
                sd = mad * 1.4826 if mad > 0 else 0.0
                zs[k] = {x: 0.0 if sd < 1e-12 else (raw[x][k] - med) / sd for x in keys}
        scored = []
        for code in keys:
            score = 0.0
            for f in factors:
                k = f.get("kind", "roc") + ":" + str(int(f.get("window", 20))) + ":" + str(int(f.get("window2", 0) or 0)) + ":" + str(int(f.get("window3", 0) or 0))
                direction = f.get("direction", -1.0 if f.get("kind") == "vol" else 1.0)
                score += float(f.get("weight", 0.0)) * direction * zs[k][code]
            if std_mode != "none":
                if abs(score) < 1e-12:
                    score = 0.0        # 浮点噪声归零（与 JS 同构；none 模式保留原始尺度不归零）
                if not (score > score_floor):
                    continue
            if st["use_volume_ratio_filter"]:
                vr = volume_ratio(code, i)
                if vr is None or vr < st["volume_ratio_threshold"]:
                    continue
            if st["use_ma_filter"]:
                m = rolling_ma(closes[code], i, st["ma_filter_window"])
                if np.isnan(m) or closes[code][i] <= m:
                    continue
            if regime == "weak" and st["weak_period_use_ma_filter"]:
                m = rolling_ma(closes[code], i, st["regime_ma_window"])
                if np.isnan(m) or closes[code][i] <= m:
                    continue
            scored.append((score, float("nan"), code, float("nan"), float("nan")))
        return scored

    last_sell = {}                   # 卖出冷却：code -> 最近卖出决策日索引
    pos_meta = {}                    # 持仓状态：code -> {buy_i, buy_px, hi}（卖出/不卖条件用）
    for i in range(n_all):
        # ---- 0) 执行昨日收盘设定的目标（今日开盘成交）----
        executed = False
        if pending is not None:
            w_new, cost_pct = pending
            prev_equity = nav * bt["initial_capital"]
            cum_cost += prev_equity * cost_pct
            r_legs = 0.0
            for k, code in enumerate(pool):
                if w_old[k] > 0:  # 旧持仓：昨收 -> 今开（卖出腿）
                    c0, o1 = closes[code][i - 1], opens[code][i]
                    if not (np.isnan(c0) or np.isnan(o1)) and c0 > 0 and o1 > 0:
                        r_legs += w_old[k] * (o1 / c0 - 1.0)
            for k, code in enumerate(pool):
                if w_new[k] > 0:  # 新持仓：今开 -> 今收（买入腿）
                    o1, c1 = opens[code][i], closes[code][i]
                    if not (np.isnan(o1) or np.isnan(c1)) and o1 > 0:
                        r_legs += w_new[k] * (c1 / o1 - 1.0)
            r = (1.0 - cost_pct) * (1.0 + r_legs) - 1.0   # 成本在开盘扣减，并入当日收益
            w_old = w_new
            pending = None
            executed = True

        # ---- 1) 收盘后决策（次日开盘执行，杜绝前视）----
        if i in decision_idx and i + 1 < n_all:
            # 走弱期判断（带迟滞：进入需 below>=N，退出需 above>=N；指数可自行选择）
            reg_codes = st.get("regime_indices") or list(cfg["regime_indices"].keys())
            below = above = 0
            for ic in reg_codes:
                m = rolling_ma(idx_close[ic], i, st["regime_ma_window"])
                if np.isnan(m):
                    continue
                if idx_close[ic][i] < m:
                    below += 1
                else:
                    above += 1
            if st["use_regime_filter"]:
                if regime == "normal" and below >= st["regime_require_below"]:
                    regime = "weak"
                elif regime == "weak" and above >= st["regime_require_above"]:
                    regime = "normal"

            if regime == "weak" and st["weak_period_mode"] == "overseas_pool":
                candidates = [c for c in pool if c in overseas]
            elif regime == "weak" and st["weak_period_mode"] == "cash":
                candidates = []
            else:
                candidates = pool

            # fallback 标的仅作兜底持仓，不参与候选/排名/筛选
            if idle_c and idle_c in candidates:
                candidates = [c for c in candidates if c != idle_c]

            # 筛选条件：统一因子列表中 usage=filter 的全部满足才进入候选池（每项 {kind, window, op: gte/lte, threshold}）
            all_factors = st.get("factors") or []
            if not all_factors:
                all_factors = [dict(ft, usage="filter") for ft in (st.get("filters") or [])]
            filters = [f for f in all_factors if (f.get("usage") or "rank") == "filter"]
            if filters:
                cand2 = []
                for code in candidates:
                    c = closes[code]
                    if np.isnan(c[i]):
                        continue
                    ok = True
                    for ft in filters:
                        kind = ft.get("kind", "roc")
                        op = ft.get("op", "gte")
                        thr = float(ft.get("threshold", 0.0))
                        val = factor_value(kind, code, i, ft)
                        if val is None or (isinstance(val, float) and np.isnan(val)):
                            ok = False
                            break
                        if (op == "lte" and val > thr) or (op == "gte" and val < thr):
                            ok = False
                            break
                    if ok:
                        cand2.append(code)
                candidates = cand2

            # 卖出冷却：最近 cooldown_days 个交易日内卖出的标的暂缓买入（默认 0 = 不限制）
            cd = int(st.get("cooldown_days") or 0)
            if cd > 0:
                cand3 = []
                for code in candidates:
                    ls = last_sell.get(code)
                    if ls is None or (i - ls) >= cd:
                        cand3.append(code)
                candidates = cand3

            # 因子得分 + 过滤（通用多因子：factors 列表，截面 z-score 加权）
            scored = factor_scores(candidates, i)

            scored.sort(key=lambda x: -x[0])

            w_new = np.zeros(n_assets)
            holding_codes = []
            if st.get("mode") == "rebalance":
                # 再平衡：固定比例（reb_weights，调仓日回归设定权重）或 动态权重（inv_vol/risk_parity，按决策日数据算目标权重再平衡）
                rw = st.get("reb_weights") or {}
                rwm = st.get("reb_weight_mode") or "fixed"
                holding_codes = [c for c in pool if rw.get(c, 0.0) > 0]
                if rwm in ("inv_vol", "risk_parity"):
                    rc = st.get("reb_codes")
                    if rc:
                        holding_codes = [c for c in rc if c in pool]
                    rel_w = _holding_weights(rwm, holding_codes, i)
                    for _c in holding_codes:
                        w_new[pool.index(_c)] = rel_w[_c]
                else:
                    for code_i, code_v in enumerate(pool):
                        wr = rw.get(code_v, 0.0)
                        if wr > 0:
                            w_new[code_i] = float(wr)
                            holding_codes.append(code_v)
            else:
                # ---- 轮动策略：持有排名区间 [N, M] + 三组附加交易条件 ----
                # 排名区间：显式 rank_n/rank_m 优先；旧 top_n 兼容为前 N 名（rank_n=1, rank_m=N）
                if "rank_n" in st and st.get("rank_n") is not None:
                    rank_n = int(st["rank_n"])
                    rank_m = int(st.get("rank_m") or rank_n)
                else:
                    rank_n = 1
                    rank_m = int(st.get("top_n") or 1)
                rank_m = max(rank_m, rank_n)
                buy_add = st.get("buy_add") or []
                sell_conds = st.get("sell_conds") or []
                hold_conds = st.get("hold_conds") or []
                only_r = set(st.get("only_rotation_codes") or [])

                # 排名映射（1-based，含仅轮动标的；候选外代码名次=+∞）
                rank_map = {}
                for _idx0, item in enumerate(scored):
                    rank_map[item[2]] = _idx0 + 1

                def _factor_hit(f, code, i):
                    kind = f.get("kind", "roc")
                    op = f.get("op", "gte")
                    thr = float(f.get("threshold", 0.0))
                    val = factor_value(kind, code, i, f)
                    if val is None or (isinstance(val, float) and np.isnan(val)):
                        return False
                    return val >= thr if op == "gte" else val <= thr

                def _buy_add_hit(f, code, i):
                    t = f.get("type")
                    if t == "rank":
                        rk = rank_map.get(code, 10 ** 9)
                        op = f.get("op", "lte")
                        v = float(f.get("value", 1))
                        return rk <= v if op == "lte" else rk >= v
                    if t == "cooldown":
                        ls = last_sell.get(code)
                        v = float(f.get("value", 0))
                        return ls is None or (i - ls) >= v
                    if t == "factor":
                        return _factor_hit(f, code, i)
                    return True

                def _sell_hit(f, code, i, meta):
                    t = f.get("type")
                    rk = rank_map.get(code, 10 ** 9)
                    v = float(f.get("value", 1))
                    if t == "rank":
                        return rk >= v
                    if t == "hold_days":
                        bi = meta.get("buy_i")
                        return bi is not None and (i - bi) >= v
                    if t == "buy_gain":
                        bp = meta.get("buy_px")
                        return bp is not None and bp > 0 and (closes[code][i] / bp - 1.0) * 100.0 >= v
                    if t == "buy_loss":
                        bp = meta.get("buy_px")
                        return bp is not None and bp > 0 and (closes[code][i] / bp - 1.0) * 100.0 <= -v
                    if t == "high_dd":
                        hp = meta.get("hi")
                        return hp is not None and hp > 0 and (hp - closes[code][i]) / hp * 100.0 >= v
                    if t == "factor":
                        return _factor_hit(f, code, i)
                    return False

                def _hold_hit(f, code, i, meta):
                    t = f.get("type")
                    if t == "hold_days":
                        bi = meta.get("buy_i")
                        return bi is not None and (i - bi) <= float(f.get("value", 1))
                    if t == "factor":
                        return _factor_hit(f, code, i)
                    return False

                # 大盘择时：所选指数全部站上 N 日均线才允许开仓，否则不买入（默认关闭）
                timing_ok = True
                if st.get("use_timing"):
                    n_t = int(st.get("timing_ma_window") or 200)
                    tms = st.get("timing_indices") or []
                    for ic2 in tms:
                        m2 = rolling_ma(idx_close[ic2], i, n_t)
                        if np.isnan(m2) or idx_close[ic2][i] <= m2:
                            timing_ok = False
                            break

                # 卖出判定：轮动卖出基线（跌出排名区间）+ 卖出条件（任一命中）− 不卖条件（任一命中豁免）
                w_target = {}          # code -> 1（占位，权重随后统一）
                sold_now = {}          # 本次已卖出的标的（同一决策日不再买入）
                sell_reason = {}       # code -> [原因]：rank_out=跌出排名区间 / sell_cond=卖出条件触发
                for _k in range(n_assets):
                    if w_old[_k] <= 0:
                        continue
                    _code = pool[_k]
                    _rk = rank_map.get(_code, 10 ** 9)
                    band_out = _rk < rank_n or _rk > rank_m
                    _meta = pos_meta.get(_code, {})
                    sell_hit = any(_sell_hit(cd2, _code, i, _meta) for cd2 in sell_conds)
                    no_sell = any(_hold_hit(cd3, _code, i, _meta) for cd3 in hold_conds)
                    if (band_out or sell_hit) and not no_sell:
                        last_sell[_code] = i     # 卖出记录（决策日索引，冷却用）
                        sold_now[_code] = 1      # 本次不再买入
                        why_s = []
                        if band_out:
                            why_s.append("rank_out")
                        if sell_hit:
                            why_s.append("sell_cond")
                        sell_reason[_code] = why_s
                    else:
                        w_target[_code] = 1      # 保留持仓

                # 买入候选：排名区间内 + 非仅轮动 + 非本次卖出 + 全部买入附加条件满足（择时失败则不买入）
                if timing_ok:
                    for item in scored:
                        _c = item[2]
                        _rk = rank_map[_c]
                        if _rk < rank_n or _rk > rank_m:
                            continue
                        if _c in only_r or _c in sold_now:
                            continue
                        if all(_buy_add_hit(cd4, _c, i) for cd4 in buy_add):
                            w_target.setdefault(_c, 1)

                # 权重：区间内等分 1/(M-N+1)；持有权重模式可换 逆波动率/风险平价（总仓位仍受区间长度约束，不足补持 fallback）
                wt = 1.0 / (rank_m - rank_n + 1)
                hw_mode = st.get("holding_weight") or "equal"
                holding_codes = sorted(w_target.keys())
                idle_map = {"cash": None, "gold": "518880.SH", "bond": "511010.SH", "money": "511990.SH"}
                idle_c = idle_map.get(st["fallback_when_no_signal"])
                if holding_codes:
                    rel_w = _holding_weights(hw_mode, holding_codes, i)
                    total_w = min(1.0, len(holding_codes) * wt)
                    for _c in holding_codes:
                        w_new[pool.index(_c)] = rel_w[_c] * total_w
                    # 候选不足区间长度时：剩余仓位补持 fallback 资产（cash 则仍持现金）
                    n_need = rank_m - rank_n + 1
                    if idle_c and idle_c in pool and len(holding_codes) < n_need:
                        fill = 1.0 - total_w
                        j = pool.index(idle_c)
                        w_new[j] += fill
                        if idle_c not in holding_codes:
                            holding_codes.append(idle_c)
                else:
                    # 空仓时持有标的：cash=空仓 / gold=黄金ETF / bond=国债ETF / money=货币ETF（不在池内则空仓）
                    if idle_c and idle_c in pool:
                        j = pool.index(idle_c)
                        w_new[j] = 1.0
                        holding_codes.append(idle_c)

                # 持仓状态更新（新买入用执行日 i+1 开盘价/高点；继续持有更新高点）
                for _c in holding_codes:
                    if _c in pos_meta:
                        hi_now = highs[_c][i + 1] if i + 1 < n_all and not np.isnan(highs[_c][i + 1]) else closes[_c][i]
                        if not np.isnan(hi_now):
                            pos_meta[_c]["hi"] = max(pos_meta[_c].get("hi", hi_now), hi_now)
                    else:
                        bp = opens[_c][i + 1] if i + 1 < n_all and not np.isnan(opens[_c][i + 1]) else closes[_c][i]
                        hi_now = highs[_c][i + 1] if i + 1 < n_all and not np.isnan(highs[_c][i + 1]) else closes[_c][i]
                        pos_meta[_c] = {"buy_i": i,
                                        "buy_px": float(bp),
                                        "hi": float(hi_now) if not np.isnan(hi_now) else float(bp)}
                for _c in list(pos_meta):
                    if _c not in holding_codes:
                        del pos_meta[_c]

            turnover = float(np.abs(w_new - w_old).sum())
            if tiered:
                # 分档成本：各换手腿按标的分档滑点（卖出/买入腿各自计），佣金固定
                cost_pct = 0.0
                comm = cost["commission_rate"]
                for _k in range(n_assets):
                    dk = w_new[_k] - w_old[_k]
                    if dk > 0:
                        cost_pct += dk * (comm + slippage_for(pool[_k], i))
                    elif dk < 0:
                        cost_pct += -dk * (comm + slippage_for(pool[_k], i))
            else:
                cost_pct = turnover * cost_per_side

            diff_w = w_new - w_old
            cap_k = float(st.get("initial_capital") or 1_000_000)
            sell_amt = float(np.abs(diff_w[diff_w < 0]).sum()) * nav * cap_k
            buy_amt = float(diff_w[diff_w > 0].sum()) * nav * cap_k
            if holding_codes:
                if len(holding_codes) == 1:
                    ex_raw = (raw_opens.get(holding_codes[0]) if raw_opens is not None else None)
                    ex_raw = ex_raw[i + 1] if ex_raw is not None else None
                else:
                    ex_raw = 0.0
                    for hc_ in holding_codes:
                        rr_ = (raw_opens.get(hc_) if raw_opens is not None else None)
                        if rr_ is not None and rr_[i + 1] is not None:
                            ex_raw += float(rr_[i + 1]) / len(holding_codes)
            else:
                ex_raw = None
            buy_shares = round(buy_amt / ex_raw, 2) if (ex_raw and ex_raw > 0) else None
            from_codes_ = [pool[k] for k in range(n_assets) if w_old[k] > 0]
            sold_list = []
            for _fc in from_codes_:
                if _fc not in holding_codes:
                    sold_list.append({"code": _fc, "reasons": sell_reason.get(_fc, ["rank_out"])})
            trade_records.append({
                "decision_date": full_cal[i],
                "exec_date": full_cal[i + 1],
                "regime": regime,
                "from": from_codes_,
                "to": holding_codes,
                "sold": sold_list,
                "top_scores": [{"code": c, "score": round(s, 4),
                                "r2": None if math.isnan(r) else round(r, 4),
                                "annual_slope": None if math.isnan(a) else round(a, 4)}
                               for s, r, c, a, _ in scored[:3]],
                "turnover": round(turnover, 4),
                "cost_pct": round(cost_pct, 6),
                "sell_amount": round(sell_amt, 2),
                "buy_amount": round(buy_amt, 2),
                "buy_shares": buy_shares,
                "hold_unchanged": bool(turnover < 1e-9),
            })
            # 卖出冷却记录：本次不再持有的旧持仓记为卖出（决策日索引）
            for k in range(n_assets):
                if w_old[k] > 0 and w_new[k] == 0:
                    last_sell[pool[k]] = i
            pending = (w_new, cost_pct)

        # ---- 2) 当日收益 ----
        if i == 0:
            nav_series[0] = nav
            regime_series[0] = regime
            continue

        if not executed:
            r = 0.0
            for k, code in enumerate(pool):
                if w_old[k] > 0:
                    c0, c1 = closes[code][i - 1], closes[code][i]
                    if not (np.isnan(c0) or np.isnan(c1)) and c0 > 0:
                        r += w_old[k] * (c1 / c0 - 1.0)

        daily_ret[i] = r
        nav *= (1.0 + r)
        nav_series[i] = nav
        peak = max(peak, nav)
        dd_series[i] = nav / peak - 1.0
        exposure_series[i] = float(w_old.sum())
        holdings_series[i] = [pool[k] for k in range(n_assets) if w_old[k] > 0]
        regime_series[i] = regime

    # ---- 切片到回测区间 ----
    s = start_pos
    cal = full_cal[s:]
    nav_v = nav_series[s:]
    dd_v = dd_series[s:]
    bench_v = bench_nav[s:]
    ew_v = ew_nav[s:]
    daily_r = daily_ret[s:]
    bench_d = bench_daily[s:]
    hold_v = holdings_series[s:]
    reg_v = regime_series[s:]
    exp_v = exposure_series[s:]
    bench_dd = bench_v / np.maximum.accumulate(bench_v) - 1.0

    # ---- 指标 ----
    total_return = float(nav_v[-1] / nav_v[0] - 1.0)
    n_days = len(cal) - 1
    cagr = (nav_v[-1] / nav_v[0]) ** (ann / n_days) - 1.0 if n_days > 0 else 0.0
    rets = daily_r[1:]
    std_r = float(np.std(rets, ddof=1)) if len(rets) > 1 else 0.0
    vol = std_r * math.sqrt(ann)
    sharpe = (float(np.mean(rets) - rf_daily) / std_r * math.sqrt(ann)) if std_r > 0 else 0.0
    max_dd = float(np.min(dd_v))
    calmar = cagr / abs(max_dd) if max_dd < 0 else float("nan")
    win_rate = float(np.sum(rets > 0)) / len(rets) if rets.size else 0.0
    gains = rets[rets > 0].sum()
    losses = -rets[rets < 0].sum()
    profit_factor = float(gains / losses) if losses > 0 else float("inf")
    exposure = float(np.mean(exp_v[1:] > 0))

    def bench_metrics(bnav, bret):
        tr = float(bnav[-1] / bnav[0] - 1.0)
        cg = (bnav[-1] / bnav[0]) ** (ann / n_days) - 1.0
        bdd = float(np.min(bnav / np.maximum.accumulate(bnav) - 1.0))
        br = bret[1:]
        bstd = float(np.std(br, ddof=1)) if len(br) > 1 else 0.0
        return {
            "total": tr, "cagr": cg, "max_dd": bdd,
            "vol": bstd * math.sqrt(ann),
            "sharpe": (float(np.mean(br) - rf_daily) / bstd * math.sqrt(ann)) if bstd > 0 else 0.0,
        }

    years, months = {}, {}
    b_years = {}
    for i in range(1, len(cal)):
        y, m = cal[i][:4], cal[i][:7]
        years.setdefault(y, 1.0); months.setdefault(m, 1.0); b_years.setdefault(y, 1.0)
        years[y] *= (1.0 + daily_r[i])
        months[m] *= (1.0 + daily_r[i])
        b_years[y] *= (1.0 + bench_d[i])

    # ---- 样本内外分割：验证段 = 最近 3 年（研究段 = 之前）----
    v_idx = len(nav_series)
    try:
        yy = int(cal[-1][:4]) - 3
        v_date = str(yy) + cal[-1][4:]
        v_idx = next((j for j, d in enumerate(cal) if d >= v_date), len(nav_series))
    except Exception:
        pass

    def _seg_metrics(a, b):
        if b - a < 5:
            return None
        seg = nav_v[a:b]
        tot = float(seg[-1] / seg[0] - 1.0)
        yrs = (b - a) / ann
        cg = float((seg[-1] / seg[0]) ** (1.0 / yrs) - 1.0) if yrs > 0 and seg[0] > 0 else 0.0
        peak = np.maximum.accumulate(seg)
        mdd = float(np.max(1.0 - seg / peak))
        sr = np.diff(seg) / seg[:-1]
        sd = float(np.std(sr, ddof=0))
        shp = (float(np.mean(sr)) - rf_daily) / sd * math.sqrt(ann) if sd > 0 else 0.0
        return {"total": round(tot, 6), "cagr": round(cg, 6),
                "max_dd": round(mdd, 6), "sharpe": round(shp, 4),
                "n_days": int(b - a)}

    segments = {
        "v_start": cal[v_idx] if v_idx < len(cal) else None,
        # cal/nav_v 均为 start_pos 起切片：研究段取 [0, v_idx)、验证段取 [v_idx, len(cal))
        "study": _seg_metrics(0, v_idx),
        "validation": _seg_metrics(v_idx, len(cal)),
    }

    # ---- 敏感性扫描（因子窗口缩放 × TopN × 调仓周期）----
    sensitivity = None
    if cfg.get("sensitivity", {}).get("enabled"):
        sens = cfg["sensitivity"]
        rows = []
        base = {k: v for k, v in st.items()}
        base_factors = list(st.get("factors", []))
        for ws in sens.get("window_scale", [1.0]):
            for tn in sens["top_n"]:
                for rm in sens.get("rebalance_modes", ["monthly"]):
                    trial = dict(cfg)
                    trial["strategy"] = dict(base)
                    trial["strategy"]["factors"] = [
                        dict(f, window=max(5, int(round(f.get("window", 20) * ws)))) for f in base_factors
                    ]
                    trial["strategy"]["top_n"] = tn
                    trial["strategy"]["rebalance_mode"] = rm
                    trial["strategy"]["rebalance_days"] = st.get("rebalance_days", 20)
                    trial["sensitivity"] = {"enabled": False}  # 嵌套运行不再递归扫描
                    res = run_backtest(trial, quiet=True)
                    m = res["metrics"]
                    rows.append({
                        "window_scale": ws, "top_n": tn, "rebalance_mode": rm,
                        "total": m["total_return"], "cagr": m["cagr"],
                        "max_dd": m["max_dd"], "sharpe": m["sharpe"],
                        "calmar": m["calmar"], "n_trades": m["n_trades"],
                    })
        sensitivity = rows

    return {
        "calendar": cal,
        "nav": nav_v,
        "bench_nav": bench_v,
        "ew_nav": ew_v,
        "drawdown": dd_v,
        "bench_drawdown": bench_dd,
        "daily_ret": daily_r,
        "holdings": hold_v,
        "regime": reg_v,
        "exposure": exp_v,
        "trades": trade_records,
        "pool": pool,
        "pool_names": pool_names,
        "metrics": {
            "total_return": total_return, "cagr": cagr,
            "max_dd": max_dd, "sharpe": sharpe,
            "vol": vol, "calmar": calmar,
            "win_rate": win_rate, "profit_factor": profit_factor,
            "exposure": exposure, "n_days": n_days,
            "n_trades": len(trade_records), "cum_cost": cum_cost,
            "sell_cond_times": sum(1 for _t in trade_records
                                   for _s in _t.get("sold", [])
                                   if "sell_cond" in _s.get("reasons", [])),
            "benchmark": bench_metrics(bench_v, bench_d),
            "equal_weight": bench_metrics(ew_v, _slice_ew(ew_v)),
            "annual": {k: round(v - 1.0, 4) for k, v in sorted(years.items())},
            "bench_annual": {k: round(v - 1.0, 4) for k, v in sorted(b_years.items())},
            "monthly": {k: round(v - 1.0, 6) for k, v in sorted(months.items())},
            "segments": segments,
        },
        "sensitivity": sensitivity,
    }


def _slice_ew(ew_nav):
    """等权池日收益由净值序列反推（供指标计算复用）"""
    ret = np.zeros(len(ew_nav))
    ret[1:] = ew_nav[1:] / ew_nav[:-1] - 1.0
    return ret


def main():
    cfg = load_config()
    res = run_backtest(cfg)
    m = res["metrics"]
    print("ETF动量轮动回测结果")
    print(f"  区间: {res['calendar'][0]} ~ {res['calendar'][-1]}  ({m['n_days']}个交易日)")
    print(f"  累计收益: {m['total_return']:.2%}   年化: {m['cagr']:.2%}")
    print(f"  最大回撤: {m['max_dd']:.2%}   夏普: {m['sharpe']:.2f}   卡玛: {m['calmar']:.2f}")
    print(f"  年化波动: {m['vol']:.2%}   日胜率: {m['win_rate']:.2%}   盈亏比: {m['profit_factor']:.2f}")
    print(f"  调仓次数: {m['n_trades']}   累计成本: {m['cum_cost']:.0f}   仓位暴露: {m['exposure']:.1%}")
    print(f"  基准(沪深300): 累计 {m['benchmark']['total']:.2%} / 年化 {m['benchmark']['cagr']:.2%} / 回撤 {m['benchmark']['max_dd']:.2%}")
    print(f"  等权池基准: 累计 {m['equal_weight']['total']:.2%} / 回撤 {m['equal_weight']['max_dd']:.2%}")


if __name__ == "__main__":
    main()
