# -*- coding: utf-8 -*-
"""
fetch_data.py — ETF轮动系统·数据层
=========================================
将 Wind Alice（万得金融数据插件）返回的原始行情 JSON 规范化为本地 CSV 缓存。

Wind Alice 取数方式（在对话中让助手调用 MCP 工具 mcp__wind_alice__get_fund_kline）：
    windcode = "510300.SH", period = "10"(日K), aftype = "1"(后复权),
    begin_date / end_date 覆盖回测预热期，如 2017-01-01 ~ 2026-09-30, count = 0(全部)
指数走弱期判断数据用 mcp__wind_alice__get_index_kline 同上取数。

取回结果请保存为 data/raw/<标的代码>.json（指数加 index_ 前缀），
再运行本脚本生成 data/<代码>.csv。

用法：
    python3 fetch_data.py            # 规范化 data/raw/*.json -> data/*.csv
"""
import json
import os
import re

RAW_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "raw")
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

COL_MAP = {"OPEN": "open", "MATCH": "close", "HIGH": "high",
           "LOW": "low", "VOLUME": "volume", "TURNOVER": "amount",
           "CHANGEHANDRATE": "turnover_rate", "AVPRICE": "avg_price"}


def parse_time(s: str) -> str:
    """'2017-01-03T00:00:00.000+02:00' -> '2017-01-03'"""
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else s


def normalize(raw_path: str, out_path: str) -> int:
    with open(raw_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    data = payload.get("data") or {}
    columns = [c["name"] for c in data.get("columns", [])]
    rows = data.get("rows", [])
    if not columns or not rows:
        print(f"  [跳过] {os.path.basename(raw_path)}: 无数据行")
        return 0
    idx = {name: i for i, name in enumerate(columns)}
    lines = ["date,open,high,low,close,volume,amount,turnover"]
    n = 0
    for r in rows:
        date = parse_time(str(r[idx["TIME"]])) if "TIME" in idx else ""
        try:
            open_ = r[idx["OPEN"]] if "OPEN" in idx else None
            high = r[idx["HIGH"]] if "HIGH" in idx else None
            low = r[idx["LOW"]] if "LOW" in idx else None
            close = r[idx["MATCH"]] if "MATCH" in idx else None
            volume = r[idx["VOLUME"]] if "VOLUME" in idx else None
            amount = r[idx["TURNOVER"]] if "TURNOVER" in idx else None
            turnover = r[idx["CHANGEHANDRATE"]] if "CHANGEHANDRATE" in idx else None
        except IndexError:
            continue
        if close is None or str(close).strip() == "" or str(close) == "null":
            continue  # 丢弃未成交/未收盘的残缺行
        lines.append(",".join([
            date,
            _f(open_), _f(high), _f(low), _f(close), _f(volume), _f(amount),
            _f(turnover),
        ]))
        n += 1
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return n


def _f(v) -> str:
    if v is None or str(v).strip() == "" or str(v) == "null":
        return ""
    return str(v)


def main():
    files = sorted(os.listdir(RAW_DIR))
    total = 0
    for fn in files:
        if not fn.endswith(".json"):
            continue
        code = fn[:-5]
        raw = os.path.join(RAW_DIR, fn)
        out = os.path.join(DATA_DIR, code + ".csv")
        n = normalize(raw, out)
        if n:
            print(f"  {code}: {n} 行 -> data/{code}.csv")
            total += n
    print(f"完成，共规范化 {total} 行行情数据。")


if __name__ == "__main__":
    main()
