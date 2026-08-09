import { useEffect, useRef } from 'react'
import { createChart, type Time, CandlestickSeries, type SeriesMarker } from 'lightweight-charts'

export type CandlestickData = {
  time: Time
  open: number
  high: number
  low: number
  close: number
}

export type PriceLine = {
  price: number
  color: string
  lineWidth?: 1 | 2 | 3 | 4
  lineStyle?: 0 | 1 | 2 | 3 | 4
  title?: string
}

export type Marker = SeriesMarker<Time>

type TradingViewChartProps = {
  data: CandlestickData[]
  priceLines?: PriceLine[]
  markers?: Marker[]
  height?: number
}

/** TradingView Lightweight Charts 封装组件：支持 K线图、自定义价格线与标记点。 */
export function TradingViewChart(props: TradingViewChartProps) {
  const { data, priceLines = [], markers = [], height = 400 } = props
  const chartContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    // 创建图表
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#94a3b8',
      },
      width: chartContainerRef.current.clientWidth,
      height,
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.1)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.1)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.3)',
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.3)',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    // 创建 K线图系列
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      // 自定义自动缩放逻辑：确保所有价格线都在可视范围内
      autoscaleInfoProvider: (original) => {
        const res = original()
        if (res && priceLines.length > 0) {
          let { minValue, maxValue } = res.priceRange
          priceLines.forEach((line) => {
            if (line.price < minValue) minValue = line.price
            if (line.price > maxValue) maxValue = line.price
          })
          // 稍微扩展范围，避免线紧贴边缘
          const range = maxValue - minValue
          // 只有当有有效范围时才应用 padding
          if (range > 0) {
              // 这里的修改是直接更新对象的属性
             res.priceRange.minValue = minValue
             res.priceRange.maxValue = maxValue
          }
        }
        return res
      },
    })

    // 设置数据
    if (data.length > 0) {
      candlestickSeries.setData(data)
    }

    // 添加价格线
    priceLines.forEach((line) => {
      candlestickSeries.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: line.lineWidth ?? 2,
        lineStyle: line.lineStyle ?? 2,
        axisLabelVisible: true,
        title: line.title ?? '',
      })
    })

    // 响应式调整
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [data, priceLines, markers, height])

  return (
    <div
      ref={chartContainerRef}
      className="w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700"
    />
  )
}
