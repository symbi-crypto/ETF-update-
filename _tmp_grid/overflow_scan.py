# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 390, "height": 844})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out = {}
    def scan(tag):
        return pg.evaluate("((tag) => { var de = document.documentElement; var w = de.scrollWidth; var bad = []; document.querySelectorAll('div,table,section,aside,main,form').forEach(function (el) { var r = el.getBoundingClientRect(); if (r.right > 400 || r.left < -10) { var id = el.id || el.className || el.tagName; if (bad.length < 8 && (el.scrollWidth > el.clientWidth + 2 || r.width > 392)) bad.push({ id: String(id).slice(0,40), left: Math.round(r.left), right: Math.round(r.right), sw: el.scrollWidth, cw: el.clientWidth, ow: el.offsetWidth }); } }); return { tag: tag, scrollW: w, vw: window.innerWidth, overflow: w > 392, bad: bad }; })('" + tag + "')")
    # 轮动 step1
    out["rot_step1"] = scan("rot_step1")
    # 轮动 step2（进下一步）
    pg.evaluate("(() => { document.querySelectorAll('#poolBox .pick').forEach(function (cb) { var c = cb.getAttribute('data-c'); if (c === '510300.SH' || c === '159915.SZ') cb.click(); }); })()")
    time.sleep(0.5)
    pg.click("#nextBtn")
    time.sleep(2)
    out["rot_step2"] = scan("rot_step2")
    pg.click("#backBtn")
    time.sleep(1)
    # 再平衡
    pg.click("#tabRebalance")
    time.sleep(2)
    out["reb"] = scan("reb")
    # 网格 step1
    pg.click("#tabGrid")
    time.sleep(2)
    out["grid_step1"] = scan("grid_step1")
    pg.evaluate("(() => { var t = document.getElementById('gridThr'); if (t) t.value = 50; document.getElementById('gridScoreBtn').click(); })()")
    try:
        pg.wait_for_function("document.getElementById('gridScoreTable').innerHTML.indexOf('适配度评分') >= 0", timeout=45000)
    except Exception as e:
        out["grid_err"] = str(e)[:120]
    time.sleep(1)
    out["grid_step1_scored"] = scan("grid_step1_scored")
    pg.evaluate("(() => { var nb = document.getElementById('gridNextBtn'); if (nb) nb.click(); })()")
    time.sleep(1.5)
    out["grid_step2"] = scan("grid_step2")
    # 我的策略
    pg.click("#tabStrategies")
    time.sleep(3)
    out["strategies"] = scan("strategies")
    # 策略详情（轮动T9 若存在则打开）
    have = pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); return rows.length; })()")
    if have:
        pg.evaluate("(() => { var rows = document.querySelectorAll('#stListV .srow'); if (rows.length) rows[0].click(); })()")
        time.sleep(4)
        out["strategy_detail"] = scan("strategy_detail")
    # 相关性
    pg.click("#tabCorr")
    time.sleep(3)
    out["corr"] = scan("corr")
    # 策略组合
    pg.click("#tabCombo")
    time.sleep(3)
    out["combo"] = scan("combo")
    # 因子IC
    pg.click("#tabIc")
    time.sleep(3)
    out["ic"] = scan("ic")
    out["errs"] = errs[:8]
    b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
