import type { ReactNode } from 'react'

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

