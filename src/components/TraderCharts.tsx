import { useMemo } from 'react'
import type { DataApiActivity, DataApiTrade } from '../lib/polymarketDataApi'
import {
  buildEquityCurveFromActivity,
  buildHoldingTimeDistribution,
  buildTradeTimeHeatmap,
} from '../lib/analytics'
import { formatDateTime, formatUsd } from '../lib/format'
import { ChartCard } from './ChartCard'
import { EChart } from './EChart'

const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function TraderCharts(props: {
  trades: DataApiTrade[]
  activity: DataApiActivity[]
  height?: number
}) {
  const height = props.height ?? 320

  const heatmapData = useMemo(() => buildTradeTimeHeatmap(props.trades), [props.trades])
  const holding = useMemo(() => buildHoldingTimeDistribution(props.trades), [props.trades])
  const equity = useMemo(() => buildEquityCurveFromActivity(props.activity), [props.activity])

  const heatmapOption = useMemo(() => {
    const values = heatmapData.map((c) => [c.hour, c.day, c.value])
    const max = heatmapData.reduce((acc, c) => Math.max(acc, c.value), 0)
    return {
      tooltip: {
        formatter: (p: { value: [number, number, number] }) => {
          const [hour, day, value] = p.value
          return `${dayLabels[day]} ${hour}:00<br/>交易数：${value}`
        },
      },
      grid: { left: 60, right: 20, top: 40, bottom: 50 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => String(i)),
        name: '小时',
      },
      yAxis: {
        type: 'category',
        data: dayLabels,
        name: '星期',
      },
      visualMap: {
        min: 0,
        max: Math.max(1, max),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 10,
      },
      series: [
        {
          type: 'heatmap',
          data: values,
          emphasis: { itemStyle: { borderColor: '#333', borderWidth: 1 } },
        },
      ],
    }
  }, [heatmapData])

  const holdingOption = useMemo(() => {
    return {
      tooltip: {
        formatter: (p: { name: string; value: number }) => `${p.name}<br/>次数：${p.value}`,
      },
      grid: { left: 40, right: 20, top: 30, bottom: 40 },
      xAxis: {
        type: 'category',
        data: holding.map((b) => b.label),
      },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: holding.map((b) => b.count),
          itemStyle: { color: '#3b82f6' },
        },
      ],
    }
  }, [holding])

  const equityOption = useMemo(() => {
    const x = equity.map((p) => formatDateTime(p.ts))
    const y = equity.map((p) => p.balanceUsd)
    const last = equity.at(-1)?.balanceUsd ?? 0
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: Array<{ axisValue: string; data: number }>) => {
          const p = params[0]
          return `${p.axisValue}<br/>累计净流入：${formatUsd(p.data)}`
        },
      },
      grid: { left: 60, right: 20, top: 30, bottom: 40 },
      xAxis: { type: 'category', data: x, axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'line',
          data: y,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: last >= 0 ? '#16a34a' : '#dc2626' },
          areaStyle: { opacity: 0.08 },
        },
      ],
    }
  }, [equity])

  return (
    <div className="chartsGrid">
      <ChartCard title="交易热力图（星期 x 小时）">
        {props.trades.length === 0 ? (
          <div className="empty">暂无交易数据</div>
        ) : (
          <EChart option={heatmapOption} height={height} />
        )}
      </ChartCard>
      <ChartCard title="持仓周期分布（按买入→卖出撮合）">
        {props.trades.length === 0 ? (
          <div className="empty">暂无交易数据</div>
        ) : (
          <EChart option={holdingOption} height={height} />
        )}
      </ChartCard>
      <ChartCard title="资金曲线（Trade 现金流净值）">
        {props.activity.length === 0 ? (
          <div className="empty">暂无活动数据</div>
        ) : (
          <EChart option={equityOption} height={height} />
        )}
      </ChartCard>
    </div>
  )
}
