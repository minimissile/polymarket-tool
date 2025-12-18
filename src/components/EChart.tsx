import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

/** ECharts 轻封装：负责初始化、响应容器尺寸变化，以及更新 option。 */
export function EChart(props: { option: unknown; height: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = echarts.init(containerRef.current)
    chartRef.current = chart

    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      chartRef.current = null
      chart.dispose()
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setOption(props.option as never, { notMerge: true, lazyUpdate: true, silent: false })
    chart.resize()
  }, [props.option])

  return <div ref={containerRef} style={{ width: '100%', height: props.height }} />
}
