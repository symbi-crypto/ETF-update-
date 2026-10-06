# -*- coding: utf-8 -*-
"""
run.py — ETF动量轮动系统入口
==================================
用法：
    python3 run.py                          # 读取 config.json 全池回测并生成报告
    python3 run.py --config path/config.json # 自定义配置文件

按不同标的回测（三种方式）：
    python3 run.py --symbols 510300.SH,159915.SZ          # 按代码/名称指定标的
    python3 run.py --groups "A股宽基,海外避险"             # 按组筛选标的池
    python3 run.py --compare-groups                        # 每个标的组分别回测并对比

常用参数：
    --label 名称          输出带标签（报告名后缀；CSV等写入 output/<标签>/，避免互相覆盖）
    --no-sensitivity      跳过参数敏感性扫描（多次对比回测时更快）

系统构成：
    config.json       标的池 / 动量参数 / 成本 / 回测区间 / 敏感性网格（全部可调整）
    engine.py         斜率动量轮动回测引擎（动量得分=年化斜率×R²，次日开盘换仓）
    report.py         生成交互式HTML报告 + CSV/JSON
    fetch_data.py     规范化 Wind Alice 行情 JSON -> data/*.csv
    data/             行情缓存（后复权日K）
    output/           报告与结果
"""
import argparse
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import load_config, run_backtest, DATA_DIR
from report import build_report


def select_pool(cfg, symbols=None, groups=None):
    """按 --symbols（代码/名称）或 --groups（组名）筛选标的池，返回筛选后的 pool 条目列表"""
    pool = cfg["pool"]
    if symbols:
        tokens = [t.strip() for t in symbols.split(",") if t.strip()]
        matched, seen = [], set()
        for tok in tokens:
            hit = next((p for p in pool if p["code"] == tok or p["name"] == tok), None)
            if hit is None and os.path.exists(os.path.join(DATA_DIR, tok + ".csv")):
                hit = {"code": tok, "name": tok, "group": "自定义"}  # data/ 已有缓存的代码可直接加入
            if hit is None:
                avail = "、".join([f"{p['name']}({p['code']})" for p in pool])
                raise SystemExit(
                    f"未找到标的「{tok}」（也不在 data/ 缓存中）。可用标的：{avail}")
            if hit["code"] not in seen:
                seen.add(hit["code"])
                matched.append(hit)
        return matched
    if groups:
        gset = {g.strip() for g in groups.split(",") if g.strip()}
        matched = [p for p in pool if p["group"] in gset]
        if not matched:
            avail = "、".join(sorted({p["group"] for p in pool}))
            raise SystemExit(f"组「{groups}」无匹配标的。可用组：{avail}")
        return matched
    return pool


def adapt_cfg(cfg, pool):
    """基于筛选后的池构造运行配置：overseas_pool 取交集，走弱期模式/兜底自动降级"""
    new_cfg = copy.deepcopy(cfg)
    new_cfg["pool"] = pool
    codes = {p["code"] for p in pool}
    overseas = [c for c in cfg["overseas_pool"] if c in codes]
    new_cfg["overseas_pool"] = overseas
    if new_cfg["strategy"]["weak_period_mode"] == "overseas_pool" and not overseas:
        print("  [提示] 当前池不含海外避险标的，走弱期模式自动降级为 cash（空仓避险）")
        new_cfg["strategy"]["weak_period_mode"] = "cash"
    if new_cfg["strategy"]["fallback_when_no_signal"] == "bond" and "511010.SH" not in codes:
        print("  [提示] 当前池不含国债ETF(511010)，无信号兜底自动降级为 cash（空仓）")
        new_cfg["strategy"]["fallback_when_no_signal"] = "cash"
    return new_cfg


def run_one(cfg, label=None, do_sensitivity=True):
    """执行一次回测并输出报告；label 非空时输出到 output/<label>/ 并给报告加后缀"""
    nf = len(cfg['strategy'].get('factors', []))
    _rm = cfg['strategy'].get('rebalance_mode', 'monthly')
    _rint = max(1, int(cfg['strategy'].get('rebalance_interval', 1)))
    _anc = cfg['strategy'].get('rebalance_anchor', 'mon' if _rm == 'weekly' else 'first')
    _anc_txt = {'mon': '周一', 'fri': '周五', 'first': '月初', 'last': '月末'}.get(_anc, '')
    _reb_txt = {"daily": f"每{_rint}个交易日", "weekly": f"每{_rint}周·{_anc_txt}",
                "monthly": f"每{_rint}个月·{_anc_txt}"}.get(
        _rm, f"每{cfg['strategy'].get('rebalance_days', 20)}个交易日")
    print(f"  标的池 {len(cfg['pool'])} 只 | 排名因子 {nf} | 筛选条件 {len(cfg['strategy'].get('filters') or [])} 条 | "
          f"Top{cfg['strategy']['top_n']} | "
          f"{_reb_txt}调仓")
    if not do_sensitivity:
        cfg = copy.deepcopy(cfg)
        cfg["sensitivity"] = {"enabled": False}
    print("开始回测" + ("" if do_sensitivity else "（跳过敏感性扫描）") + "...")
    res = run_backtest(cfg)
    m = res["metrics"]
    print(f"  累计 {m['total_return']:.2%}  年化 {m['cagr']:.2%}  最大回撤 {m['max_dd']:.2%}  "
          f"夏普 {m['sharpe']:.2f}  卡玛 {m['calmar']:.2f}  "
          f"基准(沪深300) {m['benchmark']['total']:.2%}")
    if label:
        out_dir = os.path.join(OUT_DIR, label)
        out_path = os.path.join(out_dir, f"ETF轮动回测报告_{label}.html")
        build_report(cfg, res, out_path=out_path, out_dir=out_dir)
    else:
        build_report(cfg, res)
    return res


def run_compare(cfg, do_sensitivity):
    """按组分别回测并打印对比表"""
    groups, seen = [], set()
    for p in cfg["pool"]:
        if p["group"] not in seen:
            seen.add(p["group"])
            groups.append(p["group"])
    results = []
    for g in groups:
        sub = adapt_cfg(cfg, [p for p in cfg["pool"] if p["group"] == g])
        res = run_one(sub, label=g, do_sensitivity=do_sensitivity)
        results.append((g, len(sub["pool"]), res))
    # 全池
    full = copy.deepcopy(cfg)
    if not do_sensitivity:
        full["sensitivity"] = {"enabled": False}
    print("  全池对比回测：")
    res = run_one(cfg if do_sensitivity else full, label="全部", do_sensitivity=do_sensitivity)
    results.append(("全部", len(cfg["pool"]), res))

    print("\n==================== 不同标的组合回测对比 ====================")
    print(f"{'标的池':<10}{'数量':>4}{'累计':>10}{'年化':>9}{'最大回撤':>10}{'夏普':>7}{'基准(HS300)':>11}")
    for g, n, r in results:
        m = r["metrics"]
        print(f"{g:<10}{n:>4}{m['total_return']:>10.2%}{m['cagr']:>9.2%}"
              f"{m['max_dd']:>10.2%}{m['sharpe']:>7.2f}{m['benchmark']['total']:>11.2%}")
    print("===============================================================")
    print("报告已输出到 output/<组名>/ 目录；另含各组 equity_curve.csv / rotation_records.csv 等。")


def main():
    parser = argparse.ArgumentParser(description="ETF动量轮动回测系统")
    parser.add_argument("--config", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json"))
    parser.add_argument("--symbols", help="指定标的（代码或名称，逗号分隔），如 --symbols 510300.SH,创业板ETF")
    parser.add_argument("--groups", help="按组筛选标的池（逗号分隔），如 --groups A股宽基,海外避险")
    parser.add_argument("--label", help="本次运行标签：报告名加后缀，CSV等输出到 output/<标签>/ 目录")
    parser.add_argument("--no-sensitivity", action="store_true", help="跳过参数敏感性扫描")
    parser.add_argument("--compare-groups", action="store_true", help="每个标的组分别回测并输出对比表")
    args = parser.parse_args()

    cfg = load_config(args.config)
    print(f"载入配置: {args.config}")
    print(f"  回测区间 {cfg['backtest']['start_date']} ~ {cfg['backtest']['end_date']}")

    if args.symbols and args.groups:
        raise SystemExit("--symbols 与 --groups 不能同时使用")

    if args.compare_groups:
        run_compare(cfg, do_sensitivity=not args.no_sensitivity)
        print("完成。")
        return

    pool = select_pool(cfg, args.symbols, args.groups)
    sub = adapt_cfg(cfg, pool)
    run_one(sub, label=args.label, do_sensitivity=not args.no_sensitivity)
    print("完成。")


OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")

if __name__ == "__main__":
    main()
