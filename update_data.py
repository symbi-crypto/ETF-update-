# -*- coding: utf-8 -*-
"""
update_data.py — ETF轮动系统·免费数据源自动更新（东方财富直连）
=================================================
用东方财富免费接口（push2his.eastmoney.com）拉取全部标的后复权日K，
规范化成现有 data/*.csv 格式，并重建 web_data.json 与单文件 HTML。

默认【增量】更新：读取 data/*.csv 现有最后日期，只拉"最后一天+1 → 今天"，
合并去重后写回；无旧数据时自动全量。用 --full 强制全量（首次初始化/校准）。

依赖：仅标准库 + pandas（export_data.py / build_web.py 需要）。
网络要求：可访问 push2his.eastmoney.com，且请求需携带 UA+Referer 头
 （东财对缺头的自动请求会断开连接）。
 在 GitHub Actions runner 上已验证可用；豆包云环境对 eastmoney 不可达。

用法：
    python3 update_data.py            # 增量更新（默认 2017-01-01 起补，到今日）
    python3 update_data.py --full     # 全量重建（覆盖 data/*.csv）
"""
import json
import os
import sys
import time
import datetime
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
os.makedirs(DATA_DIR, exist_ok=True)

# 统一 csv 列（与 fetch_data.py / engine.load_ohlc 约定一致）
HEADER = "date,open,high,low,close,volume,amount\n"

# 东财行情接口固定参数
UT = "fa5fd1943c7b386f172d6893dbfba10b"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/120.0 Safari/537.36"),
    "Referer": "https://quote.eastmoney.com/",
    "Accept": "*/*",
}


def load_config():
    with open(os.path.join(ROOT, "config.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def secid(code: str) -> str:
    """'510300.SH' / 'index_000300.SH' -> 东财 secid（市场.代码）"""
    base = code.split(".")[0].replace("index_", "")
    # 沪市：6/5/9 开头股票或 ETF，000/880 中证指数；其余判深市
    if base.startswith(("6", "5", "9")) or base.startswith(("000", "880")):
        return "1." + base
    return "0." + base


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
    def fmt(v, dec=0):
        return f"{v:.{dec}f}" if dec else str(int(round(v)))
    return ",".join([date, fmt(o, 3), fmt(h, 3), fmt(l, 3), fmt(c, 3),
                     str(int(round(vol))), str(int(round(amt)))])


def fetch_em(code: str, start: str, end: str):
    """东财后复权日K -> list[行] 或 None（用 curl 携带完整请求头；失败重试 3 次）
    注：东财 WAF 会断开 Python urllib 的 TLS 指纹，必须用 curl 子进程。"""
    import subprocess
    sid = secid(code)
    url = ("https://push2his.eastmoney.com/api/qt/stock/kline/get?"
           f"secid={sid}"
           "&fields1=f1,f2,f3,f4,f5,f6"
           "&fields2=f51,f52,f53,f54,f55,f56,f57"
           "&klt=101&fqt=2"                      # 日线、后复权
           f"&beg={start}&end={end}&ut={UT}")
    cmd = ["curl", "-s", "-m", "15",
           "-A", HEADERS["User-Agent"],
           "-H", "Referer: https://quote.eastmoney.com/",
           "-H", "Accept: */*",
           url]
    for attempt in range(4):
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if out.returncode != 0:
                raise RuntimeError(f"curl exit {out.returncode}")
            d = json.loads(out.stdout)
            kl = (d or {}).get("data", {}).get("klines")
            if not kl:
                return None
            rows = []
            for line in kl:
                p = line.split(",")
                if len(p) < 7:
                    continue
                # 东财顺序：日期,开盘,收盘,最高,最低,成交量,成交额
                date, o, c, h, l, vol, amt = p[0], p[1], p[3], p[2], p[4], p[5], p[6]
                r = norm_row(date, o, h, l, c, vol, amt)
                if r:
                    rows.append(r)
            return rows
        except Exception as e:
            if attempt == 3:
                print(f"  [东财失败] {code}: {str(e)[:80]}")
                return None
            # 错峰重试：递增间隔，避开东财限流窗口
            time.sleep([2.0, 4.0, 8.0][attempt])


def write_csv(code: str, rows: list):
    out = os.path.join(DATA_DIR, code + ".csv")
    with open(out, "w", encoding="utf-8") as f:
        f.write(HEADER)
        f.write("\n".join(rows) + "\n")
    return len(rows)


def load_existing(code):
    """读现有 csv -> (最后日期 'YYYY-MM-DD' 或 None, 旧数据行列表)"""
    p = os.path.join(DATA_DIR, code + ".csv")
    if not os.path.exists(p):
        return None, []
    rows = []
    with open(p, encoding="utf-8") as f:
        lines = f.read().strip().splitlines()
    for ln in lines[1:]:
        if ln.strip():
            rows.append(ln.strip())
    last = rows[-1].split(",")[0] if rows else None
    return last, rows


def next_day(yyyymmdd):
    d = datetime.datetime.strptime(yyyymmdd, "%Y%m%d")
    return (d + datetime.timedelta(days=1)).strftime("%Y%m%d")


def merge_rows(old_rows, new_rows):
    """按日期合并去重（新数据覆盖同日旧数据），升序返回。"""
    d = {}
    for r in old_rows:
        d[r.split(",")[0]] = r
    for r in new_rows:
        d[r.split(",")[0]] = r
    return [d[k] for k in sorted(d)]


def main():
    full = "--full" in sys.argv or "--seed" in sys.argv
    start = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "2017-01-01"
    end = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else time.strftime("%Y-%m-%d")
    cfg = load_config()
    pool = cfg["pool"]
    regime = list(cfg["regime_indices"].keys())
    bench = cfg["benchmark"]["index"]
    targets = [(p["code"], "etf") for p in pool] + \
              [(c, "index") for c in regime] + [(bench, "index")]

    start_yyyymmdd = start.replace("-", "")
    end_yyyymmdd = end.replace("-", "")
    ok = fail = 0
    fail_codes = []
    for code, _kind in targets:
        if full:
            rows = fetch_em(code, start_yyyymmdd, end_yyyymmdd)
            if not rows:
                print(f"  [空] {code}: 无数据")
                fail += 1
                fail_codes.append(code)
                continue
            n = write_csv(code, rows)
            print(f"  [全量OK] {code}: {n} 行 ({rows[0].split(',')[0]} ~ {rows[-1].split(',')[0]})")
            ok += 1
        else:
            last, old = load_existing(code)
            s = next_day(last.replace("-", "")) if last else start_yyyymmdd
            new = fetch_em(code, s, end_yyyymmdd)
            if not new:
                print(f"  [无更新] {code}: 保留 {len(old)} 行（截至 {last}）")
                ok += 1
                continue
            merged = merge_rows(old, new)
            n = write_csv(code, merged)
            print(f"  [增量OK] {code}: {n} 行 (新增 {len(new)}, {len(old)}->{n})")
            ok += 1
        time.sleep(1.5)  # 加大间隔，规避东财密集请求限流

    # 单轮补拉：持久断连的标的再补一轮即可（多轮只增等待、收益极小）
    remaining = fail_codes
    for round_no in range(1):
        if not remaining:
            break
        print(f"\n补拉第{round_no + 1}轮（剩余 {len(remaining)} 只）…")
        still = []
        for code in remaining:
            time.sleep(2.0)
            if full:
                rows = fetch_em(code, start_yyyymmdd, end_yyyymmdd)
            else:
                last, old = load_existing(code)
                s = next_day(last.replace("-", "")) if last else start_yyyymmdd
                rows = fetch_em(code, s, end_yyyymmdd)
                if rows:
                    rows = merge_rows(old, rows)
            if rows:
                n = write_csv(code, rows)
                print(f"  [补OK] {code}: {n} 行")
                ok += 1
                fail -= 1
            else:
                print(f"  [补失败] {code}")
                still.append(code)
        remaining = still

    print(f"\n拉取完成：{ok} 成功 / {fail} 失败")
    if ok == 0:
        print("全部标的失败，不重建网页。")
        sys.exit(1)
    print("开始重建网页…")
    import subprocess
    subprocess.check_call([sys.executable, "export_data.py"], cwd=ROOT)
    subprocess.check_call([sys.executable, "build_web.py"], cwd=ROOT)
    print("重建完成。输出：output/ETF动量轮动回测系统.html")


if __name__ == "__main__":
    main()
