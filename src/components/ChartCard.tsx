import type { ReactNode } from 'react'

/** 图表卡片容器：统一标题区与内容区布局。 */
export function ChartCard(props: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 m-0">{props.title}</h2>
        <div className="text-xs text-slate-500 dark:text-slate-400 opacity-75">{props.right}</div>
      </div>
      <div className="min-h-[40px]">{props.children}</div>
    </section>
  )
}
