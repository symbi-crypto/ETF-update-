# -*- coding: utf-8 -*-
"""
export_data.py — 导出网页版嵌入数据
====================================
将 data/*.csv 压缩为单文件 JSON（共享日历 + open/close 数组），
供交互式网页版内嵌使用，控制体积 ≤ 2MB。
"""
import json
import os

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "output", "web_data.json")

from engine import load_ohlc, load_config, _load_unadj_nav
from datetime import datetime, timedelta


def interp_nav(nv_dict, calendar):
    """月末单位净值线性插值为交易日序列（首点前/末点后前值填充）"""
    if not nv_dict:
        return [None] * len(calendar)
    dts = sorted(nv_dict.keys())
    vals = [nv_dict[k] for k in dts]
    d0 = [datetime.strptime(x, "%Y-%m-%d") for x in dts]
    out = []
    for dt in calendar:
        x = datetime.strptime(dt, "%Y-%m-%d")
        if x > d0[-1]:
            out.append(None)
        elif x <= d0[0]:
            out.append(vals[0])
        elif x == d0[-1]:
            out.append(vals[-1])
        else:
            # 二分找前一个净值点
            lo, hi = 0, len(d0) - 1
            while hi - lo > 1:
                mid = (lo + hi) // 2
                if d0[mid] <= x:
                    lo = mid
                else:
                    hi = mid
            a, b = d0[lo], d0[hi]
            w = (x - a).total_seconds() / (b - a).total_seconds() if b > a else 0.0
            out.append(vals[lo] + (vals[hi] - vals[lo]) * w)
    return out


def load_unadj(code):
    d = _load_unadj_nav(code, "unadj")
    if d is None:
        return None
    # _load_unadj_nav 只返回单值列；这里需要 open+close → 独立读
    import os
    path = os.path.join(DATA_DIR, "unadj", code + ".csv")
    if not os.path.exists(path):
        return None
    out = {}
    with open(path, encoding="utf-8") as f:
        header = f.readline().strip().split(",")
        for line in f:
            parts = line.strip().split(",")
            if len(parts) < len(header):
                continue
            try:
                out[parts[0]] = {"open": float(parts[1]), "close": float(parts[4])}
            except (ValueError, IndexError):
                pass
    return out


def load_nav(code):
    return _load_unadj_nav(code, "nav")


def main():
    cfg = load_config()
    pool = cfg["pool"]
    bench_idx = cfg["benchmark"]["index"]
    regime = list(cfg["regime_indices"].keys())
    end = cfg["backtest"]["end_date"]

    # 共享日历 = 基准指数全部交易日（截断到 end_date）
    bd = load_ohlc(bench_idx)
    calendar = sorted(d for d in bd.keys() if d <= end)

    series, index = {}, {}
    for p in pool:
        d = load_ohlc(p["code"])
        uo = load_unadj(p["code"])
        nv = load_nav(p["code"])
        opens, closes, highs, lows, vols, amts, tvs = [], [], [], [], [], [], []
        r_op, r_cl, navs = [], [], []
        for dt in calendar:
            rec = d.get(dt)
            opens.append(round(rec["open"], 3) if rec and rec["open"] is not None else None)
            closes.append(round(rec["close"], 3) if rec and rec["close"] is not None else None)
            highs.append(round(rec["high"], 3) if rec and rec["high"] is not None else None)
            lows.append(round(rec["low"], 3) if rec and rec["low"] is not None else None)
            vols.append(round(rec["volume"] / 1e4) if rec and rec["volume"] is not None else None)   # 万手（整数）
            amts.append(round(rec["amount"] / 1e4) if rec and rec["amount"] is not None else None)     # 万元（整数）
            tvs.append(round(rec["turnover"], 4) if rec and rec.get("turnover") is not None else None)  # 换手率（%）
            r_op.append(round(uo[dt]["open"], 4) if uo and dt in uo and uo[dt].get("open") is not None else None)
            r_cl.append(round(uo[dt]["close"], 4) if uo and dt in uo and uo[dt].get("close") is not None else None)
        _navs_seq = interp_nav(nv, calendar) if nv else [None] * len(calendar)
        for k2 in range(len(calendar)):
            navs.append(round(_navs_seq[k2], 4) if _navs_seq[k2] is not None else None)
        series[p["code"]] = {
            "open": [v if v is not None else -1 for v in opens],
            "close": [v if v is not None else -1 for v in closes],
            "high": [v if v is not None else -1 for v in highs],
            "low": [v if v is not None else -1 for v in lows],
            "volume": [v if v is not None else -1 for v in vols],
            "amount": [v if v is not None else -1 for v in amts],
            "turnover": [v if v is not None else -1 for v in tvs],
            "raw_open": [v if v is not None else -1 for v in r_op],
            "raw_close": [v if v is not None else -1 for v in r_cl],
        }
    # 附加序列（如货币ETF 511880）：仅供前端展示（现金替代份额），不进 pool、不参与回测
    for p in cfg.get("extra_series", []):
        d = load_ohlc(p["code"])
        uo = load_unadj(p["code"])
        opens, closes, highs, lows, vols, amts, tvs = [], [], [], [], [], [], []
        r_op, r_cl = [], []
        for dt in calendar:
            rec = d.get(dt)
            opens.append(round(rec["open"], 3) if rec and rec["open"] is not None else None)
            closes.append(round(rec["close"], 3) if rec and rec["close"] is not None else None)
            highs.append(round(rec["high"], 3) if rec and rec["high"] is not None else None)
            lows.append(round(rec["low"], 3) if rec and rec["low"] is not None else None)
            vols.append(round(rec["volume"] / 1e4) if rec and rec["volume"] is not None else None)
            amts.append(round(rec["amount"] / 1e4) if rec and rec["amount"] is not None else None)
            tvs.append(round(rec["turnover"], 4) if rec and rec.get("turnover") is not None else None)
            r_op.append(round(uo[dt]["open"], 4) if uo and dt in uo and uo[dt].get("open") is not None else None)
            r_cl.append(round(uo[dt]["close"], 4) if uo and dt in uo and uo[dt].get("close") is not None else None)
        series[p["code"]] = {
            "open": [v if v is not None else -1 for v in opens],
            "close": [v if v is not None else -1 for v in closes],
            "high": [v if v is not None else -1 for v in highs],
            "low": [v if v is not None else -1 for v in lows],
            "volume": [v if v is not None else -1 for v in vols],
            "amount": [v if v is not None else -1 for v in amts],
            "turnover": [v if v is not None else -1 for v in tvs],
            "raw_open": [v if v is not None else -1 for v in r_op],
            "raw_close": [v if v is not None else -1 for v in r_cl],
        }
        print(f"  附加序列 {p['code']} {p['name']} 已嵌入（仅供展示）")
    for ic in regime + [bench_idx]:
        d = load_ohlc(ic)
        index[ic] = [round(d[dt]["close"], 2) if dt in d else -1 for dt in calendar]

    data = {
        "calendar": calendar,
        "pool": [{"code": p["code"], "name": p["name"], "group": p["group"]} for p in pool],
        "overseas": cfg["overseas_pool"],
        "regime": regime,
        "indexNames": [{"code": k, "name": v} for k, v in cfg["regime_indices"].items()],
        "benchmark": bench_idx,
        "series": series,
        "index": index,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(OUT) / 1024 / 1024
    n = len(calendar)
    print(f"导出 {OUT}")
    print(f"  日历 {n} 个交易日 | 标的 {len(pool)} 只 | 指数 {len(index)} 条 | 体积 {size:.2f} MB")


if __name__ == "__main__":
    main()
