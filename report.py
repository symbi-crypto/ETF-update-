# -*- coding: utf-8 -*-
"""
report.py — ETF轮动系统·报告生成
======================================
将 run_backtest 的结果装配成：
  output/ETF轮动回测报告.html   交互式ECharts报告
  output/equity_curve.csv          净值/回撤序列
  output/rotation_records.csv      调仓记录
  output/monthly_returns.csv       月度收益
  output/metrics.json              核心指标

用法：
    from report import build_report
    build_report(cfg, result)   # 默认输出到 output/
"""
import csv
import json
import math
import os
from datetime import datetime
from string import Template

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, "output")
TEMPLATE = os.path.join(ROOT, "templates", "report.html")

ASSET_COLORS = [
    "#0E7490", "#2563EB", "#7C3AED", "#DB2777", "#EA580C",
    "#B45309", "#65A30D", "#059669", "#0891B2", "#4F46E5",
    "#9333EA", "#E11D48", "#F97316", "#CA8A04", "#16A34A",
    "#0D9488", "#6366F1", "#A21CAF",
]


def _fmt_pct(v, digits=2):
    return f"{v*100:.{digits}f}%"


def _ts(date_str: str) -> int:
    return int(datetime.strptime(date_str, "%Y-%m-%d").timestamp() * 1000)


def _sample(series, max_n=900):
    n = len(series)
    if n <= max_n:
        return series
    stride = math.ceil(n / max_n)
    return series[::stride]


def build_report(cfg, res, out_path=None, out_dir=None):
    out_dir = out_dir or OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    out_path = out_path or os.path.join(out_dir, "ETF轮动回测报告.html")
    st = cfg["strategy"]
    bt = cfg["backtest"]
    m = res["metrics"]
    cal = res["calendar"]
    pool = res["pool"]
    pool_names = res["pool_names"]
    n_assets = len(pool)

    # ---- 数据装配 ----
    dates = _sample(cal)
    nav_s, bench_s, ew_s = res["nav"], res["bench_nav"], res["ew_nav"]
    dd_s, bdd_s = res["drawdown"], res["bench_drawdown"]
    idx = {d: i for i, d in enumerate(cal)}
    nav_pts = [[_ts(d), round(float(nav_s[idx[d]]), 5)] for d in dates]
    bench_pts = [[_ts(d), round(float(bench_s[idx[d]]), 5)] for d in dates]
    ew_pts = [[_ts(d), round(float(ew_s[idx[d]]), 5)] for d in dates]
    dd_pts = [[_ts(d), round(float(dd_s[idx[d]]), 5)] for d in dates]
    bdd_pts = [[_ts(d), round(float(bdd_s[idx[d]]), 5)] for d in dates]

    # 走弱期区间
    weak = []
    in_run = False
    for i, d in enumerate(cal):
        if res["regime"][i] == "weak" and not in_run:
            start = d
            in_run = True
        elif res["regime"][i] != "weak" and in_run:
            weak.append([start, cal[i - 1]])
            in_run = False
    if in_run:
        weak.append([start, cal[-1]])

    # 月度热力图
    monthly = m["monthly"]
    years = sorted({k[:4] for k in monthly})
    months = [f"{i:02d}" for i in range(1, 13)]
    cells = []
    abs_max = 0.05
    for y in years:
        for mi in range(12):
            key = f"{y}-{months[mi]}"
            v = monthly.get(key)
            if v is None:
                continue
            cells.append([years.index(y), mi, round(v * 100, 1)])
            abs_max = max(abs_max, abs(v * 100))
    abs_max = max(abs_max * 1.05, 0.10)

    # 持仓时间线（按调仓决策日）
    tdates, tweights = [], []
    for t in res["trades"]:
        w = [0.0] * n_assets
        if t["to"]:
            wt = 1.0 / len(t["to"])
            for c in t["to"]:
                w[pool.index(c)] = wt
        tdates.append(t["decision_date"])
        tweights.append(w)
    tcash = [round(1.0 - sum(w), 4) for w in tweights]

    # 动量得分轨迹（每次调仓Top1-3得分与Top1的R²）
    mom_dates = [t["decision_date"] for t in res["trades"]]
    s1 = [t["top_scores"][0]["score"] if t["top_scores"] else None for t in res["trades"]]
    s2 = [t["top_scores"][1]["score"] if len(t["top_scores"]) > 1 else None for t in res["trades"]]
    s3 = [t["top_scores"][2]["score"] if len(t["top_scores"]) > 2 else None for t in res["trades"]]
    r2 = [t["top_scores"][0]["r2"] if t["top_scores"] else None for t in res["trades"]]

    # 年度
    ylabels = sorted(set(m["annual"]) | set(m["bench_annual"]))
    ystr = [round(m["annual"].get(y, 0.0), 4) for y in ylabels]
    ybench = [round(m["bench_annual"].get(y, 0.0), 4) for y in ylabels]

    # 调仓记录
    trades_out = []
    for t in res["trades"]:
        trades_out.append({
            "decision": t["decision_date"],
            "exec": t["exec_date"],
            "regime": t["regime"],
            "from": "、".join([pool_names[c] for c in t["from"]]) or "—",
            "to": "、".join([pool_names[c] for c in t["to"]]) or "空仓",
            "turnover": round(t["turnover"], 2),
            "cost": t["cost_pct"],
            "top_scores": [{"name": pool_names[s["code"]], "score": s["score"], "r2": s["r2"]}
                           for s in t["top_scores"]],
        })

    # 敏感性
    sens_out = []
    for r in (res["sensitivity"] or []):
        sens_out.append({
            "wscale": r["window_scale"], "topn": r["top_n"], "reb": r["rebalance_mode"],
            "total": r["total"], "cagr": r["cagr"], "dd": r["max_dd"], "sharpe": r["sharpe"],
            "isBase": (r["window_scale"] == 1.0
                       and r["top_n"] == st["top_n"]
                       and r["rebalance_mode"] == st.get("rebalance_mode", "monthly")),
        })

    _flt = st.get("filters") or []
    _flt_names = {"r2": "R²", "roc": "涨幅", "vol": "波动率", "slope_r2": "斜率动量", "wslope_r2": "加权斜率动量", "risk_adj": "风险调整动量"}
    _flt_txt = "；".join(
        f"{_flt_names.get(f.get('kind', 'roc'), f.get('kind', ''))}{f.get('window', 20)}日"
        f"{('≥' if f.get('op', 'gte') != 'lte' else '≤')}{f.get('threshold', 0.0):.2f}"
        for f in _flt) if _flt else "无"
    excess = m["total_return"] - m["benchmark"]["total"]
    DATA = {
        "nav": {"strategy": nav_pts, "bench": bench_pts, "ew": ew_pts},
        "dd": {"strategy": dd_pts, "bench": bdd_pts},
        "weak": weak,
        "month": {"years": years, "months": months, "cells": cells, "absMax": round(abs_max, 2)},
        "hold": {"dates": tdates, "assets": [pool_names[c] for c in pool],
                 "weights": tweights, "cash": tcash},
        "mom": {"dates": mom_dates, "s1": s1, "s2": s2, "s3": s3, "r2": r2},
        "year": {"labels": ylabels, "strategy": ystr, "bench": ybench},
        "assetColors": ASSET_COLORS,
        "config": {"r2": _flt_txt},
        "trades": trades_out,
        "sens": sens_out,
    }

    # ---- 模板填充 ----
    with open(TEMPLATE, "r", encoding="utf-8") as f:
        html = Template(f.read())
    bm, ew_ = m["benchmark"], m["equal_weight"]
    _rm = st.get("rebalance_mode", "monthly")
    _rint = max(1, int(st.get("rebalance_interval", 1)))
    _anc = st.get("rebalance_anchor", "mon" if _rm == "weekly" else "first")
    _anc_txt = {"mon": "周一", "fri": "周五", "first": "月初", "last": "月末"}.get(_anc, "")
    _rm_txt = {"daily": f"每{_rint}个交易日", "weekly": f"每{_rint}周·{_anc_txt}",
               "monthly": f"每{_rint}个月·{_anc_txt}"}.get(_rm, f"每{st.get('rebalance_days', 20)}个交易日")
    repl = {
        "RANGE": f"{cal[0]} ~ {cal[-1]}",
        "NDAYS": f"{m['n_days']}",
        "REBAL": _rm_txt,
        "MWIN": f"{len(st.get('factors', []))}因子",
        "R2": _flt_txt,
        "TOPN": f"{st['top_n']}",
        "STR_CLS": "up" if m["total_return"] >= 0 else "down",
        "STR_TOTAL": _fmt_pct(m["total_return"]),
        "STR_CAGR": _fmt_pct(m["cagr"]),
        "STR_DD": _fmt_pct(m["max_dd"]),
        "STR_SHARPE": f"{m['sharpe']:.2f}",
        "STR_CALMAR": f"{m['calmar']:.2f}",
        "BENCH_TOTAL": _fmt_pct(bm["total"]),
        "BENCH_DD": _fmt_pct(bm["max_dd"]),
        "EW_TOTAL": _fmt_pct(ew_["total"]),
        "STR_VOL": _fmt_pct(m["vol"]),
        "STR_WIN": _fmt_pct(m["win_rate"], 1),
        "STR_PF": f"{m['profit_factor']:.2f}",
        "STR_EXP": _fmt_pct(m["exposure"], 1),
        "STR_TRADES": f"{m['n_trades']}",
        "STR_COST": f"{m['cum_cost'] / 10000:.1f}万",
        "EXC_CLS": "up" if excess >= 0 else "down",
        "EXCESS": f"{excess*100:+.1f}pp",
        "NTRADES": f"{len(trades_out)}",
    }
    html_out = html.substitute(repl).replace("/*__DATA__*/", json.dumps(DATA, ensure_ascii=False))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html_out)

    # ---- CSV / JSON 输出 ----
    with open(os.path.join(out_dir, "equity_curve.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["date", "strategy_nav", "bench_nav", "ew_nav", "strategy_dd", "bench_dd"])
        for i, d in enumerate(cal):
            w.writerow([d, f"{res['nav'][i]:.6f}", f"{res['bench_nav'][i]:.6f}",
                        f"{res['ew_nav'][i]:.6f}", f"{res['drawdown'][i]:.6f}",
                        f"{res['bench_drawdown'][i]:.6f}"])
    with open(os.path.join(out_dir, "rotation_records.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["decision_date", "exec_date", "regime", "from", "to",
                    "top1_score", "top1_r2", "turnover", "cost_pct"])
        for t in res["trades"]:
            tops = t["top_scores"]
            w.writerow([t["decision_date"], t["exec_date"], t["regime"],
                        ";".join(t["from"]) or "-", ";".join(t["to"]) or "-",
                        tops[0]["score"] if tops else "", tops[0]["r2"] if tops else "",
                        t["turnover"], t["cost_pct"]])
    with open(os.path.join(out_dir, "monthly_returns.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["year", "month", "return"])
        for k, v in sorted(m["monthly"].items()):
            w.writerow([k[:4], k[5:7], f"{v:.6f}"])
    with open(os.path.join(out_dir, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=2, default=str)

    print(f"报告已生成: {out_path}")
    print(f"辅助输出: {out_dir}/equity_curve.csv, rotation_records.csv, monthly_returns.csv, metrics.json")
    return out_path


if __name__ == "__main__":
    from engine import load_config, run_backtest
    cfg = load_config()
    res = run_backtest(cfg)
    build_report(cfg, res)
