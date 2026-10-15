# -*- coding: utf-8 -*-
import json, time
from playwright.sync_api import sync_playwright
BASE = "file:///home/user/Doubao/chats/38444992708406018/wufu_etf_system/web_live/index.html"
EXE = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
out = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EXE)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))
    pg.goto(BASE, wait_until="load", timeout=120000)
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    pg.evaluate("localStorage.clear(); location.reload();")
    pg.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    # 关键元素计算色值
    out["colors"] = pg.evaluate("(() => { var cs = getComputedStyle(document.body); var s1 = document.querySelector('.s1card') ? getComputedStyle(document.querySelector('.s1card')) : null; var inp = document.querySelector('input[type=number], input[type=text], select') ? getComputedStyle(document.querySelector('input[type=number]') || document.querySelector('input[type=text]') || document.querySelector('select')) : null; var btn = document.querySelector('.btn, button[class]') ? getComputedStyle(document.querySelector('.btn') || document.querySelector('button')) : null; var bd = document.querySelector('#poolBox') ? getComputedStyle(document.querySelector('#poolBox')) : null; return { bodyBg: cs.backgroundColor, bodyColor: cs.color, cardBg: s1 ? s1.backgroundColor : null, inputBg: inp ? inp.backgroundColor : null, inputBorder: inp ? inp.borderColor : null, inputColor: inp ? inp.color : null, btnColor: btn ? btn.color : null, poolBorder: bd ? bd.borderColor : null }; })()")
    # 残留旧色值检查（DOM 扫描）
    out["residual"] = pg.evaluate("(() => { var html = document.documentElement.outerHTML; var olds = ['#0F172A','#1E293B','#111827','#334155','#E2E8F0','#CBD5E1','#94A3B8','#64748B','#38BDF8','56,189,248']; var found = []; olds.forEach(function (o) { if (html.indexOf(o) >= 0) found.push(o); }); return found; })()")
    # 移动端无溢出
    pg2 = b.new_page(viewport={"width": 390, "height": 844})
    pg2.goto(BASE, wait_until="load", timeout=120000)
    pg2.wait_for_function("document.getElementById('poolBox').children.length > 0", timeout=30000)
    time.sleep(2)
    out["mobile390"] = pg2.evaluate("(() => { var sw = document.documentElement.scrollWidth; return { scrollW: sw, noOverflow: sw <= 390 }; })()")
    out["errs"] = errs[:5]
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
