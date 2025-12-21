# Polymarket 交易员分析（纯前端）

一个纯前端的 Polymarket 交易员分析工具：输入 EVM 地址即可拉取公开数据，查看交易/持仓/资金流水统计、可视化图表，并支持跟单回测与从“点击开始”起的实时跟踪模拟。

## 核心功能

### 分析页（`/analyze`、`/trader/:user/:tab?`）

- 地址输入与跳转：支持 `0x...` 地址输入，“分析”进入详情，“观察”加入观察列表
- Tabs 模块：
  - 概览：关键指标、交易员画像（偏好/活跃时段等）与图表
  - 持仓：当前持仓表（来自 Data API positions）
  - 交易：成交列表（trades），含交易金额等关键列
  - 流水：活动列表（activity），用于近似资金曲线/成交额统计
  - 跟单：跟单模拟器（回测 + 实时起算）
- 新交易提示：检测到近 5 分钟内的新成交时，会通过顶部 Toast 提醒，并支持“已读”清零

### 观察列表（`/watchlist`）

- 管理观察地址集合（最多 20 个），并在后台轮询更新本地缓存
- 内置排行榜视图：基于本地缓存计算交易次数、成交额、收益等汇总指标
- 手动刷新与错误提示：便于在网络波动或 API 限流时快速重试
- 新交易提醒：观察列表中任一地址出现近 5 分钟内新成交时触发 Toast（可伴随提示音）

### 发现页（`/discover`）

- 基于“全局最近成交”聚合热门交易员（按近似成交额排序）
- 支持一键加入观察列表并跳转到该交易员详情页

## 跟单模拟（Copy Trade Simulator）

该模块用于“用历史成交序列模拟跟随交易”的结果展示与对比，核心包括：

- 跟单方式：
  - 按比例：用交易员的成交 `size` 乘以比例得到跟随数量（UI 用百分比 `0–100` 表示）
  - 固定金额：每笔按固定 USDC 金额换算成数量（按成交价反推数量）
- 回测时间：
  - 支持自定义起止时间
  - 支持快捷选择：近 1 日 / 近 1 周 / 近 1 月
- 实时起算（Live）：点击“开始跟单”后，从点击时刻起纳入新成交（结合轮询数据）
- 跳过原因：资金不足、无效价格/数量等会记录为跳过原因便于复盘
- 报告导出：可生成可复制的 HTML 报告（便于粘贴到文档/聊天工具）

> 说明：模拟以“现金 + 持仓按最新价估值”的方式计算权益；属于近似回测，不等同于真实撮合与滑点环境。

## 模块与代码结构

### 路由与页面

- `src/main.tsx`：入口，注入 `BrowserRouter`
- `src/App.tsx`：根组件，提供 `AppStateProvider` 与懒加载路由
- `src/routes/AppShell.tsx`：应用布局壳（顶部信息、导航、Toast 通知）
- `src/routes/AnalyzePage.tsx`：分析页（多 Tab、拉取交易员数据、实时新交易提示）
- `src/routes/WatchlistPage.tsx`：观察列表页（本地汇总、刷新、跳转）
- `src/routes/DiscoverPage.tsx`：发现页（热门交易员聚合）

### 数据获取与缓存

- `src/lib/polymarketDataApi.ts`：封装 Polymarket Data API / Gamma API 请求（带超时/Abort）
- `src/hooks/useTraderData.ts`：拉取单个交易员 trades/activity/positions，合并去重并写入 `localStorage`
- `src/hooks/useWatchlistPolling.ts`：对观察列表多地址轮询更新，写入 `localStorage`
- `src/lib/storage.ts`：`localStorage` JSON 读写与去重合并工具

### 统计与可视化

- `src/lib/analytics.ts`：汇总指标与图表数据构建（热力图、持仓周期分布、权益曲线、画像推断）
- `src/components/TraderCharts.tsx`：交易员图表组（ECharts）
- `src/components/EChart.tsx`、`src/components/ChartCard.tsx`：ECharts 封装与通用卡片

### 跟单模拟引擎

- `src/lib/copyTradeSim.ts`：模拟计算核心（BigInt 定点数计算、部分成交、跳过原因等）
- `src/components/CopyTradeSimulator.tsx`：模拟器 UI（条件设置、回测/实时、报表导出、结果表格）
- `src/lib/copyTradeSim.test.ts`：模拟器逻辑的单元测试（Node Test Runner）

### 数据流概览（从页面到渲染）

- 页面组件（Analyze/Watchlist/Discover）触发数据请求或轮询
- Hooks（`useTraderData` / `useWatchlistPolling` / `useTopTraders`）调用 `polymarketDataApi` 拉取数据
- `mergeUniqueByKey` 对 trades/activity 做去重合并，并写入 `localStorage` 做缓存
- 组件层（表格/图表/模拟器）从 Hook 状态或缓存读取数据，计算派生指标并渲染

## 使用说明

### 快速开始

```bash
npm install
npm run dev
```

浏览器打开终端输出的本地地址（通常为 `http://localhost:5173/`）。

### 地址与分享链接

- 直接进入交易员详情：`/trader/<address>/overview`
- 也支持查询参数直达：`/analyze?user=<address>`（会被写入本地选中态）

### 本地缓存与隐私

- 本项目不需要任何 API Key；仅调用公开 API
- 数据缓存于浏览器 `localStorage`，便于刷新后保留与降低请求频率
- 如需清理缓存：浏览器 DevTools → Application → Local Storage → 删除 `pmta.*` 前缀项

### 配置指南（常见可调项）

- 分析页轮询间隔：`src/routes/AnalyzePage.tsx` 通过 `useTraderData(..., { pollMs: 12_000 })` 控制
- 观察列表轮询间隔：`src/state/appState.tsx` 通过 `useWatchlistPolling(..., { pollMs: 45_000 })` 控制
- 本地缓存 Key（`localStorage`）：
  - 选中地址：`pmta.selectedUser`
  - 地址输入框最近值：`pmta.lastAddressInput`
  - 观察列表：`pmta.watchlist`
  - 排行榜排序：`pmta.leaderboard.sortBy`
  - 新交易已读时间：`pmta.selectedUser.lastSeenTradeTsByUser`
  - 数据缓存（按地址）：`pmta.cache.trades.<user>`、`pmta.cache.activity.<user>`、`pmta.cache.positions.<user>`
- Toast 通知事件：页面通过 `window.dispatchEvent(new CustomEvent('pmta:notify', ...))` 触发全局提示

## 内部 API 文档（数据源封装）

### `src/lib/polymarketDataApi.ts`

所有方法均为 `GET`，默认超时 `12_000ms`，支持传入 `AbortSignal`。

- `getTradesByUser(user, params?, options?)`
  - `params.limit/offset/market/takerOnly`
  - 返回：`DataApiTrade[]`
- `getRecentTrades(params?, options?)`
  - 用于发现页聚合热门交易员
  - 返回：`DataApiTrade[]`
- `getActivityByUser(user, params?, options?)`
  - 返回：`DataApiActivity[]`
- `getPositionsByUser(user, params?, options?)`
  - 支持排序与 `sizeThreshold`
  - 返回：`DataApiPosition[]`
- `getGammaMarketBySlug(slug, options?)`
  - 返回：`GammaMarket`

## 示例代码

### 拉取某地址最近成交

```ts
import { getTradesByUser } from './src/lib/polymarketDataApi'

/**
 * 示例：拉取某个交易员最近成交并输出条数。
 */
export async function exampleFetchTrades(user: string) {
  const trades = await getTradesByUser(user.toLowerCase(), { limit: 80, takerOnly: true })
  return trades.length
}
```

### 跟单模拟（引擎调用）

```ts
import { simulateCopyTrades } from './src/lib/copyTradeSim'
import type { DataApiTrade } from './src/lib/polymarketDataApi'

/**
 * 示例：用固定金额模式对历史成交做跟单回测。
 */
export function exampleSimulateFixedNotional(trades: DataApiTrade[]) {
  return simulateCopyTrades(trades, {
    initialCapitalUsd: 1000,
    followMode: 'fixed',
    followNotionalUsd: 25,
    startTs: 0,
    endTs: 0,
    allowPartialFills: true,
  })
}
```

## 截图（建议补充）

建议在仓库中补充以下截图，并在此处用标准 Markdown 引用：

- 分析页概览（含图表）
- 成交列表与交易金额列
- 跟单模拟器（条件设置 + 回测结果 + 跳过原因）
- 观察列表（排行榜与刷新状态）
- 发现页（热门交易员列表）

## 脚本与依赖

### 常用脚本（`package.json`）

- `npm run dev`：本地开发（Vite）
- `npm run build`：类型检查 + 构建（`tsc -b && vite build`）
- `npm run preview`：本地预览构建产物
- `npm run lint`：ESLint
- `npm run test`：单元测试（`node --test --experimental-strip-types`）

### 主要依赖

- React 19、React Router DOM 7
- ECharts 6
- Tailwind CSS 3

### 系统要求（建议）

- macOS / Linux / Windows 均可
- Node.js：建议使用较新版本（需支持 `node --test` 与 `--experimental-strip-types`）
- 浏览器：现代 Chromium / Firefox / Safari（需要 `fetch`、`AbortSignal` 等标准能力）

## 版本变更记录

### Unreleased

- 跟单模拟支持“固定金额/按比例”两种跟随方式
- 回测时间增加近 1 日 / 近 1 周 / 近 1 月快捷选择
- 跟单比例口径明确为百分比 `0–100`
- 盈亏热力图调整为白→蓝配色
- 支持从点击“开始跟单”时刻起的实时起算
- 成交列表展示“交易金额（USDC）”
- 条件设置区域做了更紧凑的分组与移动端适配

## 已知问题

- Data API 返回字段可能随时间变化；若出现解析异常请优先检查 `DataApi*` 类型定义
- 权益曲线与成交额为“近似口径”，不含滑点、手续费与撮合细节
- 公开 API 可能存在限流/偶发错误：页面会提示错误并允许手动刷新

## 贡献指南

- 代码风格：参考仓库内 `STYLE_GUIDE.md`，并保持与现有文件一致的命名/结构
- 提交前建议本地执行：
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- 新增功能默认补齐：错误处理、加载态、空数据态、可访问性（禁用态/`aria-*`）、移动端适配
