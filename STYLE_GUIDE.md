# Polymarket Trader Analysis - 样式指南

本项目采用 **Tailwind CSS** 作为核心样式引擎，遵循 Utility-First 的设计理念。核心设计目标为**简洁 (Minimalist)**、**内容优先 (Content-First)** 和 **数据驱动 (Data-Driven)**。

## 1. 核心设计系统

### 1.1 色彩系统 (Colors)
我们使用 Tailwind 默认调色板：
- **Slate (灰蓝)**: 用于中性色背景、边框和文本。
- **Blue (蓝)**: 主交互色。
- **Emerald (绿)**: 盈利/正向数据。
- **Red (红)**: 亏损/负向数据/错误。

**基础背景**
- 应用底色: `bg-slate-50 dark:bg-slate-900`
- 卡片/内容表面: `bg-white dark:bg-slate-800`
- 次级背景/表头: `bg-slate-100 dark:bg-slate-700`

**文本颜色**
- 主要文本: `text-slate-900 dark:text-slate-50`
- 次要说明文本: `text-slate-500 dark:text-slate-400`
- 辅助/占位文本: `text-slate-400 dark:text-slate-500`

### 1.2 排版 (Typography)
- **字体**: `font-sans` (Inter) 用于界面，`font-mono` (JetBrains Mono 等) 用于数据/地址。
- **字重**: `font-normal` (400), `font-medium` (500), `font-semibold` (600), `font-bold` (700).

### 1.3 间距与圆角
- **间距**: 统一使用 Tailwind spacing scale (如 `p-4`, `gap-4`, `m-8`).
- **圆角**: 
  - 标准控件: `rounded-md`
  - 卡片/容器: `rounded-xl`
  - 胶囊/标签: `rounded-full`

## 2. 组件样式范式

### 2.1 卡片 (Cards)
使用 `div` 配合边框和阴影类：
```tsx
<div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
  <div className="flex justify-between items-center mb-4">
    <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">标题</h3>
  </div>
  {/* 内容 */}
</div>
```

### 2.2 按钮 (Buttons)
```tsx
// 默认按钮
<button className="px-4 py-2 rounded-md font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
  默认按钮
</button>

// 主要按钮
<button className="px-4 py-2 rounded-md font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">
  主要按钮
</button>
```

### 2.3 数据表格 (Tables)
表格容器应设置圆角和溢出处理：
```tsx
<div className="w-full overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
  <table className="w-full text-sm text-left">
    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
      <tr><th className="px-4 py-3">列名</th></tr>
    </thead>
    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
      <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
        <td className="px-4 py-3">数据</td>
      </tr>
    </tbody>
  </table>
</div>
```

### 2.4 关键指标 (KPIs)
使用 Grid 布局：
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">总盈亏</div>
    <div className="text-2xl font-bold font-mono text-emerald-500">+$1,234.56</div>
  </div>
</div>
```

## 3. 响应式设计
采用 Mobile-First 策略：
- 默认样式适配移动端。
- `md:` (768px): 适配平板/桌面侧边栏布局。
- `lg:` (1024px): 适配大屏网格布局。

## 4. 深色模式 (Dark Mode)
所有涉及颜色的类名都应包含 `dark:` 变体，例如 `bg-white dark:bg-slate-800`。

## 5. 维护指南
- 避免写自定义 CSS 类，尽量使用 Tailwind Utility Classes。
- 如果发现重复的样式组合，可以考虑抽取为 React 组件而不是 CSS 类。
- 保持 `tailwind.config.js` 简洁，仅配置必要的扩展。
