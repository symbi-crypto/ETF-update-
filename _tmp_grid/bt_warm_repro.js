// node 复现：warm_start 场景
const fs = require("fs");
const src = fs.readFileSync("engine_full.js", "utf-8");
const M = { exports: {} };
const vm = require("vm");
const ctx = { module: M, exports: M.exports, global: { } };
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const WufuEngine = M.exports;
const D = JSON.parse(fs.readFileSync("data_full.json", "utf-8"));
const s = JSON.parse(fs.readFileSync("strategy_dump.json", "utf-8"));

function tryRun(label, p) {
  try {
    const t0 = Date.now();
    const r = WufuEngine.backtest(D, p);
    console.log(label, "OK", (Date.now() - t0) + "ms", "trades:", (r.trades || []).length, "total:", r.metrics && r.metrics.total_return);
  } catch (e) {
    console.log(label, "THROW:", e.message);
  }
}
// 1. 默认（warm=start=2016-06-01）→ 原行为（应 OK，8.04%）
const p1 = JSON.parse(JSON.stringify(s));
p1.warm_start = p1.start_date;
tryRun("默认2016-06-01", p1);
// 2. 详情页改 2026-09-01（warm 保持 2016-06-01）→ 新行为应 OK（有交易）
const p2 = JSON.parse(JSON.stringify(s));
p2.start_date = "2026-09-01";
p2._warm_start = "2016-06-01";
p2.warm_start = "2016-06-01";
tryRun("改2026-09-01", p2);
// 3. 改 2026-12-01（晚于数据末）→ throw 新文案
const p3 = JSON.parse(JSON.stringify(s));
p3.start_date = "2026-12-01";
p3.warm_start = "2016-06-01";
tryRun("改2026-12-01", p3);
// 4. 老策略无 warm_start → 默认=start_date（原行为）
const p4 = JSON.parse(JSON.stringify(s));
delete p4.warm_start; delete p4._warm_start;
tryRun("老策略无warm", p4);
