import { useEffect, useRef } from 'react'
import type { ECharts } from 'echarts'

/** ECharts 轻封装：负责初始化、响应容器尺寸变化，以及更新 option。 */
export function EChart(props: { option: unknown; height: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ECharts | null>(null)
  const optionRef = useRef<unknown>(props.option)

  useEffect(() => {
    optionRef.current = props.option
  }, [props.option])

  useEffect(() => {
    if (!containerRef.current) return

    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let localChart: ECharts | null = null

    void (async () => {
      const echarts = await import('echarts')
      if (disposed || !containerRef.current) return

      const chart = echarts.init(containerRef.current)
      localChart = chart
      chartRef.current = chart

      resizeObserver = new ResizeObserver(() => chart.resize())
      resizeObserver.observe(containerRef.current)

      chart.setOption(optionRef.current as never, { notMerge: true, lazyUpdate: true, silent: false })
      chart.resize()
    })()

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      resizeObserver = null
      chartRef.current = null
      localChart?.dispose()
      localChart = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.resize()
  }, [props.height])

  return <div ref={containerRef} style={{ width: '100%', height: props.height }} />
}
