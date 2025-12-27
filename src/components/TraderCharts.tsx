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

/** 交易员图表组：热力图、持仓周期分布、资金曲线。 */
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
          itemStyle: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
          },
          emphasis: {
            itemStyle: {
              borderColor: 'rgba(255, 255, 255, 0.8)',
              borderWidth: 2,
              shadowBlur: 4,
              shadowColor: 'rgba(0, 0, 0, 0.2)',
            },
          },
        },
      ],
    }
  }, [heatmapData])

  const holdingOption = useMemo(() => {
    return {
      tooltip: {
        formatter: (p: { name: string; value: number }) => `${p.name}<br/>次数：${p.value}`,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc' },
      },
      grid: { left: 40, right: 20, top: 30, bottom: 40, borderColor: 'transparent' },
      xAxis: {
        type: 'category',
        data: holding.map((b) => b.label),
        axisLine: { lineStyle: { color: '#94a3b8' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.1)' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          type: 'bar',
          data: holding.map((b) => b.count),
          itemStyle: {
            color: '#3b82f6',
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    }
  }, [holding])

  const equityOption = useMemo(() => {
    const x = equity.map((p) => formatDateTime(p.ts))
    const y = equity.map((p) => p.balanceUsd)
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: Array<{ axisValue: string; data: number }>) => {
          const p = params[0]
          return `${p.axisValue}<br/>累计净流入：${formatUsd(p.data)}`
        },
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc' },
      },
      grid: { left: 60, right: 20, top: 30, bottom: 40, borderColor: 'transparent' },
      xAxis: {
        type: 'category',
        data: x,
        axisLabel: { hideOverlap: true, color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#94a3b8' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.1)' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          type: 'line',
          data: y,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3, color: '#10b981' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(16, 185, 129, 0.4)' },
                { offset: 1, color: 'rgba(16, 185, 129, 0)' },
              ],
            },
          },
        },
      ],
    }
  }, [equity])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartCard title="交易热力图（星期 x 小时）">
          {props.trades.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">暂无交易数据</div>
          ) : (
            <EChart option={heatmapOption} height={height} />
          )}
        </ChartCard>
        <ChartCard title="持仓周期分布（按买入→卖出撮合）">
          {props.trades.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">暂无交易数据</div>
          ) : (
            <EChart option={holdingOption} height={height} />
          )}
        </ChartCard>
      </div>
      <ChartCard title="累计净现金流（TRADE，近似）">
        {props.activity.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">暂无活动数据</div>
        ) : (
          <EChart option={equityOption} height={height} />
        )}
      </ChartCard>
    </div>
  )
}
