# 网格引擎系统侧核查笔记（web_live/index.html，git 0edce84）

## 1. 区间确定（gridParams @7892048）
- 观察窗口 volWin（默认 60 日，可配，最少 20）收盘价**去极值分位数**（gridQMode：P2-P98 默认 / P5-95 / P10-90）取 lower/upper
- mid = (lower+upper)/2；步长 stepRatio = max(σ60日收益率, 日均振幅) 兜底 2%
- 格数 nLev = clamp(round((upper-lower)/(stepRatio*mid)), 5, 10)（按波动自适应 5-10 档，用户可覆盖）
- step = (upper-lower)/nLev；perLevelAmt = invest/nLev（等额资金/格）
- **baseAmt = invest（=每标的投入额）** ← 底仓资金=全部投入，非半仓
- banBuy：step/mid < 1% → 整网格停买（卖出不受影响）
- 注意：区间只在建仓/体检重锚定时用网格价格计算；**levels 实际以 triggerBase（默认=建仓日收盘后复权价 g.cur）为中心对称铺开**：levels[li] = tb + (li-nD)*step，nD=floor((nLev-1)/2)。即实际买卖格位围绕"当前价"，而非均匀铺满 [lower,upper]

## 2. 触发与成交（backtestGrid @7894485）
- 前收 close（后复权）→ 当日 high/low 穿越格位判定：pc2>lv && ll<=lv → 下穿买入；pc2<lv && hh>=lv → 上穿卖出（"来回穿越可多次触发"）
- **次日开盘成交**（s.oa=后复权 open；无开盘则用收盘兜底），T+1：今日买入不可卖（todayBuy）
- 信号/成交/估值**全后复权口径**（注释 @7885700 明示）；raw_open 未复权仅用于展示字段 raw_px
- 破网风控：收盘跌破 lower → sellOnly（只出不进）
- 单日跨多格：每格各触发一笔（跳空穿 3 格=3 笔买入/卖出）

## 3. 买卖数量
- 底仓：sh = baseAmt/px（后复权价）→ **满仓买入，cash≈0**（除成本）→ 无"网格预留现金"
- 网格买入：buySh = perLevelAmt/lv；现金不足 → 缩量（need>cash → buySh=cash/...）
- 网格卖出：sellSh = pos/(levels.length+1)（卖出时持仓均分）
- 份额**非整手**：sh 保留 2 位小数（碎股可成交），渲染层 lotShares 才取整百——引擎记账与显示口径不一致
- 成本：双边滑点（买 +(slip+comm)、卖 -(slip)）＋ 单边 minComm（佣金低于最低按最低收）；底仓也计

## 4. 体检式管理（mgmt B，默认）
- 周期末（periodDays）用当日数据判 gridScore（四维均分 0.25×震荡度/波动空间/区间覆盖/触发频率；硬门槛：上市<250 天、波动<8%或>55%、ADX>40）
- 合格 → 重锚定区间（gridParams 用当前市值重算）+ 继续；不合格：区间内→清仓撤换（次日开盘执行），区间外→只出不进（绝不在低位割肉）
- 补位：释放资金（freeCash）均分给评分≥60 的空位，次日开盘建新网格底仓
- 组合恒 Top N（TOPN）

## 5. 收益统计
- nav 估值日 startIdx+1..endIdx：navV = freeCash + idle份额×close + Σ(pos×后复权close + cash)
- total = finalNav/invest - 1；cagr = (final/invest)^(1/years)-1，years=(endIdx-startIdx)/252
- maxDD 从 invest 起；sharpe/vol 日收益年化；win_rate=日胜率
- 空仓资金（remain/freeCash/idle 无）**零收益**
- holdings：avgCost = Σ(买入价×份)/Σ份（后复权买入价），cur=末日后复权 close；盈亏显示 = cur/avgCost-1

## 6. 潜在失真点（待与外部对照后定级）
D1. 底仓满仓、无网格预留现金 → 下跌格没钱买（缩量或 0）→ 网格"低吸"失效；上涨卖出释放现金后才有钱买回 → 行为≈"满仓持有+波段卖出"
D2. 全后复权口径：分红按"再投资"计入市值但现金未进账 → 净值系统性偏高（分红越多的标的越明显）；同时网格位用后复权价 → 除息日未复权跳空不触发（与实盘不同）
D3. 买卖数量非整手（碎股）→ 可执行性失真（低价 ETF 尤其）；引擎与渲染层整手口径不一致
D4. 单日跨多格按每格全量成交 → 真实单根 K 线路径不可知，跳空穿越多格在实盘也都会成交但资金约束不同；现金不足时缩量处理偏乐观/悲观不定
D5. levels 以当前价为中心而非铺满区间 → 区间 lower/upper 仅作体检/破网风控边界，与"区间网格"语义不同（用户可能误读）
D6. 区间非每日滚动（固定至体检周期）→ 与主流"滚动窗口"差异，但可接受（体检重锚定替代）
D7. 边界外：涨破上界只出不进不清仓（vs 主流突破上界清仓止盈）→ 单边上涨收益保留但回撤风险高
D8. 空仓/自由现金零收益（vs 主流部分计活期）→ 保守偏低
D9. 年化分母=总投入（vs 番茄土豆沙"平均资金占用"）→ 网格实际占用资金少时高估/低估年化（取决于口径）
D10. 触发用 high/low 穿越（盘中近似）→ 与收盘触发比更贴近实盘，方向偏差小；但无回踩确认（vs 佐罗回踩 0.3-1%）→ 触发偏多、成本偏高
D11. 体检评分/重锚定/撤换为系统特色（vs 主流固定网格不动）→ 策略层面差异，不属回测失真
