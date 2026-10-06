# -*- coding: utf-8 -*-
"""
update_data.py — ETF轮动系统·免费数据源自动更新
=================================================
用 AKShare（东方财富免费接口）拉取全部标的后复权日K，规范化成现有
data/*.csv 格式，并重建 web_data.json 与单文件 HTML。

依赖：pip install akshare
网络要求：可访问东方财富接口（push2his.eastmoney.com）。
  注意：豆包云环境网络对 eastmoney.com 不可达，请在本机电脑、自有服务器
  或 GitHub Actions 上运行；本机正常联网即可。

用法：
    python3 update_data.py [起始日期]   # 默认 2017-01-01；可指定如 2016-06-01
"""
import json
import os
import sys
import time

import pandas as pd

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
os.makedirs(DATA_DIR, exist_ok=True)

# 统一 csv 列（与 fetch_data.py / engine.load_ohlc 约定一致）
HEADER = "date,open,high,low,close,volume,amount\n"


def load_config():
    with open(os.path.join(ROOT, "config.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def etf_symbol(code: str) -> str:
    """'510300.SH' -> '510300'（akshare 纯数字代码）"""
    return code.split(".")[0]


def idx_symbol(code: str) -> str:
    """'index_000300.SH' -> '000300'（akshare 指数代码，去前缀与交易所）"""
    base = code.split(".")[0]
    return base.replace("index_", "")


def norm_row(date, o, h, l, c, vol, amt):
    """规范化一行，返回 csv 行文本；成交量为手→份（×100）以匹配现有口径"""
    try:
        o, h, l, c = float(o), float(h), float(l), float(c)
        vol = float(vol) * 100.0   # 手 -> 份
        amt = float(amt)           # 元
    except (TypeError, ValueError):
        return None
    if c is None or c <= 0:
        return None
    def f(v):
        return f"{v:.3f}" if abs(v) - int(abs(v)) != 0 or abs(v) >= 1 else f"{v:.3f}"
    # 保持现有 csv 数值格式（3 位小数，volume/amount 按需）
    def fmt(v, dec=0):
        return f"{v:.{dec}f}" if dec else str(int(round(v)))
    return ",".join([date, fmt(o, 3), fmt(h, 3), fmt(l, 3), fmt(c, 3),
                     str(int(round(vol))), str(int(round(amt)))])


def fetch_etf(code: str, start: str, end: str):
    """拉取单只 ETF 后复权日K -> 返回 list[行] 或 None"""
    import akshare as ak
    sym = etf_symbol(code)
    df = ak.fund_etf_hist_em(symbol=sym, period="daily",
                             start_date=start, end_date=end, adjust="hfq")
    if df is None or df.empty:
        return None
    # 东财列：日期 开盘 收盘 最高 最低 成交量 成交额 ...
    rows = []
    for _, r in df.iterrows():
        line = norm_row(str(r["日期"]), r["开盘"], r["最高"], r["最低"],
                        r["收盘"], r["成交量"], r["成交额"])
        if line:
            rows.append(line)
    return rows


def fetch_index(code: str, start: str, end: str):
    """拉取单只指数日K（指数不复权）-> list[行] 或 None"""
    import akshare as ak
    sym = idx_symbol(code)
    df = ak.index_zh_a_hist(symbol=sym, period="daily",
                            start_date=start, end_date=end)
    if df is None or df.empty:
        return None
    rows = []
    for _, r in df.iterrows():
        line = norm_row(str(r["日期"]), r["开盘"], r["最高"], r["最低"],
                        r["收盘"], r["成交量"], r["成交额"])
        if line:
            rows.append(line)
    return rows


def write_csv(code: str, rows: list):
    out = os.path.join(DATA_DIR, code + ".csv")
    with open(out, "w", encoding="utf-8") as f:
        f.write(HEADER)
        f.write("\n".join(rows) + "\n")
    return len(rows)


def main():
    start = sys.argv[1] if len(sys.argv) > 1 else "2017-01-01"
    end = sys.argv[2] if len(sys.argv) > 2 else time.strftime("%Y-%m-%d")
    cfg = load_config()
    pool = cfg["pool"]
    regime = list(cfg["regime_indices"].keys())
    bench = cfg["benchmark"]["index"]
    targets = [(p["code"], "etf") for p in pool] + \
              [(c, "index") for c in regime] + [(bench, "index")]

    ok = fail = 0
    for code, kind in targets:
        try:
            if kind == "etf":
                rows = fetch_etf(code, start.replace("-", ""), end.replace("-", ""))
            else:
                rows = fetch_index(code, start.replace("-", ""), end.replace("-", ""))
            if not rows:
                print(f"  [空] {code}: 无数据")
                fail += 1
                continue
            n = write_csv(code, rows)
            print(f"  [OK] {code}: {n} 行 ({rows[0].split(',')[0]} ~ {rows[-1].split(',')[0]})")
            ok += 1
        except Exception as e:
            print(f"  [ERR] {code}: {str(e)[:100]}")
            fail += 1
        time.sleep(0.2)  # 限频保护

    print(f"\n拉取完成：{ok} 成功 / {fail} 失败")
    if fail:
        print("存在失败标的，请检查网络（本机应可访问 eastmoney.com）或单独重试。")
    else:
        print("全部成功，开始重建网页版…")
        import subprocess
        subprocess.check_call([sys.executable, "export_data.py"], cwd=ROOT)
        subprocess.check_call([sys.executable, "build_web.py"], cwd=ROOT)
        print("重建完成。输出：output/ETF动量轮动回测系统.html")


if __name__ == "__main__":
    main()
