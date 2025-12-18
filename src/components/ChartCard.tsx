import type { ReactNode } from 'react'

/** 图表卡片容器：统一标题区与内容区布局。 */
export function ChartCard(props: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="cardHeader">
        <h2 className="cardTitle">{props.title}</h2>
        <div className="cardRight">{props.right}</div>
      </div>
      <div className="cardBody">{props.children}</div>
    </section>
  )
}
