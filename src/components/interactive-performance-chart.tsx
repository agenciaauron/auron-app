'use client'

import { MouseEvent, useMemo, useRef, useState } from 'react'

type SeriesPoint = {
  date: Date
  value: number
}

type Props = {
  currentSeries: SeriesPoint[]
  previousSeries: SeriesPoint[]
  currentLabel: string
  previousLabel: string
  metricLabel: string
  currency?: boolean
}

type Point = {
  x: number
  y: number
}

type TooltipPosition = {
  x: number
  y: number
}

const width = 1000
const height = 320
const paddingLeft = 56
const paddingRight = 24
const paddingTop = 24
const paddingBottom = 42
const plotWidth = width - paddingLeft - paddingRight
const plotHeight = height - paddingTop - paddingBottom

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatValue(value: number, currency: boolean) {
  if (currency) {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
  }

  return value.toLocaleString('pt-BR', {
    maximumFractionDigits: 2,
  })
}

function makeSmoothPath(points: Point[]) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[index + 2] ?? p2

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }

  return path
}

export function InteractivePerformanceChart({
  currentSeries,
  previousSeries,
  currentLabel,
  previousLabel,
  metricLabel,
  currency = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null)

  const pointCount = Math.max(currentSeries.length, previousSeries.length, 2)
  const maxValue = Math.max(
    1,
    ...currentSeries.map((item) => item.value),
    ...previousSeries.map((item) => item.value)
  )

  function xForIndex(index: number) {
    return paddingLeft + (index / Math.max(pointCount - 1, 1)) * plotWidth
  }

  function yForValue(value: number) {
    return paddingTop + plotHeight - (value / maxValue) * plotHeight
  }

  const currentPoints = useMemo(
    () => currentSeries.map((item, index) => ({ x: xForIndex(index), y: yForValue(item.value) })),
    [currentSeries, pointCount, maxValue]
  )

  const previousPoints = useMemo(
    () => previousSeries.map((item, index) => ({ x: xForIndex(index), y: yForValue(item.value) })),
    [previousSeries, pointCount, maxValue]
  )

  const currentPath = useMemo(() => makeSmoothPath(currentPoints), [currentPoints])
  const previousPath = useMemo(() => makeSmoothPath(previousPoints), [previousPoints])

  const areaPath = currentPoints.length
    ? `${currentPath} L ${currentPoints[currentPoints.length - 1].x} ${paddingTop + plotHeight} L ${currentPoints[0].x} ${paddingTop + plotHeight} Z`
    : ''

  const labelIndexes = currentSeries.length
    ? Array.from(
        new Set([
          0,
          Math.floor((currentSeries.length - 1) / 2),
          currentSeries.length - 1,
        ])
      )
    : []

  function handleMouseMove(event: MouseEvent<SVGSVGElement>) {
    if (!currentSeries.length) return

    const svg = event.currentTarget
    const screenMatrix = svg.getScreenCTM()

    if (!screenMatrix) return

    const pointer = svg.createSVGPoint()
    pointer.x = event.clientX
    pointer.y = event.clientY

    const svgPointer = pointer.matrixTransform(screenMatrix.inverse())
    const normalized = (svgPointer.x - paddingLeft) / plotWidth
    const index = Math.round(normalized * Math.max(currentSeries.length - 1, 0))

    setHoveredIndex(clamp(index, 0, currentSeries.length - 1))

    const containerRect = containerRef.current?.getBoundingClientRect()
    if (containerRect) {
      setTooltipPosition({
        x: event.clientX - containerRect.left,
        y: event.clientY - containerRect.top,
      })
    }
  }

  function handleMouseLeave() {
    setHoveredIndex(null)
    setTooltipPosition(null)
  }

  const hoveredPoint = hoveredIndex === null ? null : currentPoints[hoveredIndex]
  const hoveredData = hoveredIndex === null ? null : currentSeries[hoveredIndex]

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-5 text-xs">
        <div className="flex items-center gap-2 text-zinc-400">
          <span className="h-0.5 w-6 rounded-full bg-purple-500" />
          {currentLabel}
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span className="w-6 border-t border-dashed border-zinc-500" />
          {previousLabel}
        </div>
      </div>

      <div ref={containerRef} className="relative">
        <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/70 px-2 py-3">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[320px] w-full select-none"
            role="img"
            aria-label={`Gráfico de ${metricLabel}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="auron-chart-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = paddingTop + plotHeight * ratio
              return (
                <line
                  key={ratio}
                  x1={paddingLeft}
                  x2={width - paddingRight}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-zinc-800/80"
                  strokeWidth="1"
                />
              )
            })}

            <text
              x={paddingLeft - 10}
              y={paddingTop + 4}
              textAnchor="end"
              fill="currentColor"
              className="text-zinc-600"
              fontSize="12"
            >
              {formatValue(maxValue, currency)}
            </text>

            <text
              x={paddingLeft - 10}
              y={paddingTop + plotHeight + 4}
              textAnchor="end"
              fill="currentColor"
              className="text-zinc-600"
              fontSize="12"
            >
              0
            </text>

            {areaPath && <path d={areaPath} fill="url(#auron-chart-area)" />}

            {previousPath && (
              <path
                d={previousPath}
                fill="none"
                stroke="currentColor"
                className="text-zinc-600"
                strokeWidth="2.5"
                strokeDasharray="7 8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {currentPath && (
              <path
                d={currentPath}
                fill="none"
                stroke="#a855f7"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {currentPoints.map((point, index) => {
              const active = hoveredIndex === index
              const hasValue = currentSeries[index]?.value > 0

              return (
                <g key={currentSeries[index]?.date.toISOString() ?? index}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={active ? 9 : hasValue ? 5 : 3}
                    fill={active ? '#a855f7' : '#09090b'}
                    stroke="#a855f7"
                    strokeWidth={active ? 4 : 2}
                    opacity={hasValue || active ? 1 : 0.55}
                    className="transition-all"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="14"
                    fill="transparent"
                  />
                </g>
              )
            })}

            {hoveredPoint && (
              <line
                x1={hoveredPoint.x}
                x2={hoveredPoint.x}
                y1={paddingTop}
                y2={paddingTop + plotHeight}
                stroke="#71717a"
                strokeWidth="1"
                strokeDasharray="4 6"
                opacity="0.6"
              />
            )}

            {labelIndexes.map((index) => {
              const item = currentSeries[index]
              if (!item) return null

              const anchor = index === 0 ? 'start' : index === currentSeries.length - 1 ? 'end' : 'middle'

              return (
                <text
                  key={item.date.toISOString()}
                  x={xForIndex(index)}
                  y={height - 10}
                  textAnchor={anchor}
                  fill="currentColor"
                  className="text-zinc-600"
                  fontSize="12"
                >
                  {item.date.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </text>
              )
            })}
          </svg>
        </div>

        {hoveredPoint && hoveredData && tooltipPosition && (
          <div
            className="pointer-events-none absolute z-30 min-w-[150px] rounded-xl border border-zinc-700 bg-zinc-900/95 px-3.5 py-3 shadow-2xl shadow-black/40 backdrop-blur"
            style={{
              left: tooltipPosition.x,
              top: tooltipPosition.y,
              transform:
                tooltipPosition.x > (containerRef.current?.clientWidth ?? 0) * 0.78
                  ? tooltipPosition.y < 90
                    ? 'translate(-108%, 16px)'
                    : 'translate(-108%, -110%)'
                  : tooltipPosition.y < 90
                    ? 'translate(14px, 16px)'
                    : 'translate(14px, -110%)',
            }}
          >
            <p className="text-xs text-zinc-500">
              {hoveredData.date.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
              })}
            </p>
            <p className="mt-1 text-base font-semibold text-white">
              {formatValue(hoveredData.value, currency)}
            </p>
            <p className="mt-0.5 text-xs text-purple-300">{metricLabel}</p>
          </div>
        )}
      </div>
    </div>
  )
}
