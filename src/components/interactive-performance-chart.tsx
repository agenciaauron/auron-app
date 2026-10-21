'use client'

import { MouseEvent, useRef, useState } from 'react'

type SeriesPoint = {
  date: Date
  value: number
}

type Props = {
  currentSeries: SeriesPoint[]
  metricLabel: string
  currency?: boolean
}

type TooltipPosition = {
  x: number
  y: number
  flip: boolean
}

// Uma coluna por dia. Cor validada para daltonismo sobre o fundo ink-950.
const BAR_COLOR = '#9b72f8'
const BAR_ACTIVE = '#c4b5fd'
const GRID_COLOR = '#26223a'
const AXIS_TEXT = '#736d8f'

const width = 1000
const height = 260
const paddingLeft = 44
const paddingRight = 8
const paddingTop = 16
const paddingBottom = 32
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
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    })
  }

  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function formatTick(value: number, currency: boolean) {
  const compact = value.toLocaleString('pt-BR', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  })
  return currency ? `R$ ${compact}` : compact
}

// Topo "redondo" do eixo: 1, 2, 5 × 10ⁿ, com 4 divisões.
function niceScale(max: number) {
  if (max <= 4) return { top: 4, step: 1 }
  const target = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= target) ?? target
  return { top: step * 4, step }
}

// Coluna com 4px de raio no topo e base reta.
function columnPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M ${x} ${y + h} V ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h} Z`
}

export function InteractivePerformanceChart({
  currentSeries,
  metricLabel,
  currency = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null)

  const count = Math.max(currentSeries.length, 1)
  const slot = plotWidth / count
  const barWidth = Math.min(22, Math.max(slot * 0.62, 3))

  const dataMax = Math.max(0, ...currentSeries.map((item) => item.value))
  const { top, step } = niceScale(dataMax)
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step)

  const centerX = (index: number) => paddingLeft + slot * (index + 0.5)
  const yFor = (value: number) => paddingTop + plotHeight - (value / top) * plotHeight

  const labelIndexes = currentSeries.length
    ? Array.from(
        new Set([0, Math.floor((currentSeries.length - 1) / 2), currentSeries.length - 1])
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

    const index = Math.floor((svgPointer.x - paddingLeft) / slot)
    setHoveredIndex(clamp(index, 0, currentSeries.length - 1))

    const containerRect = containerRef.current?.getBoundingClientRect()
    if (containerRect) {
      setTooltipPosition({
        x: event.clientX - containerRect.left,
        y: event.clientY - containerRect.top,
        flip: event.clientX - containerRect.left > containerRect.width * 0.75,
      })
    }
  }

  function handleMouseLeave() {
    setHoveredIndex(null)
    setTooltipPosition(null)
  }

  const hoveredData = hoveredIndex === null ? null : currentSeries[hoveredIndex]

  return (
    <div className="mt-2">
      <div ref={containerRef} className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full select-none"
          role="img"
          aria-label={`${metricLabel} por dia`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={paddingLeft}
                x2={width - paddingRight}
                y1={yFor(tick)}
                y2={yFor(tick)}
                stroke={GRID_COLOR}
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 10}
                y={yFor(tick) + 4}
                textAnchor="end"
                fill={AXIS_TEXT}
                fontSize="11"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatTick(tick, currency)}
              </text>
            </g>
          ))}

          {hoveredIndex !== null && (
            <rect
              x={paddingLeft + slot * hoveredIndex}
              y={paddingTop}
              width={slot}
              height={plotHeight}
              fill="#ffffff"
              opacity="0.03"
            />
          )}

          {currentSeries.map((item, index) => {
            const barHeight = (item.value / top) * plotHeight
            const active = hoveredIndex === index
            return (
              <path
                key={item.date.toISOString()}
                d={columnPath(centerX(index) - barWidth / 2, yFor(item.value), barWidth, barHeight)}
                fill={active ? BAR_ACTIVE : BAR_COLOR}
                opacity={hoveredIndex === null || active ? 1 : 0.55}
              />
            )
          })}

          {labelIndexes.map((index) => {
            const item = currentSeries[index]
            if (!item) return null
            const anchor =
              index === 0 ? 'start' : index === currentSeries.length - 1 ? 'end' : 'middle'
            const x =
              index === 0
                ? paddingLeft
                : index === currentSeries.length - 1
                  ? width - paddingRight
                  : centerX(index)

            return (
              <text
                key={item.date.toISOString()}
                x={x}
                y={height - 8}
                textAnchor={anchor}
                fill={AXIS_TEXT}
                fontSize="11"
              >
                {item.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </text>
            )
          })}
        </svg>

        {hoveredData && tooltipPosition && (
          <div
            className="pointer-events-none absolute z-30 min-w-[180px] rounded-xl border border-ink-700 bg-ink-900/95 px-3.5 py-3 shadow-2xl shadow-black/40 backdrop-blur"
            style={{
              left: tooltipPosition.x,
              top: tooltipPosition.y,
              transform: tooltipPosition.flip ? 'translate(-110%, -50%)' : 'translate(16px, -50%)',
            }}
          >
            <p className="text-xs text-ink-400">
              {hoveredData.date.toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: '2-digit',
                month: 'long',
              })}
            </p>
            <div className="mt-2 flex items-center justify-between gap-4 text-sm">
              <span className="flex items-center gap-2 text-ink-300">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: BAR_COLOR }} />
                {metricLabel}
              </span>
              <span className="font-semibold tabular text-ink-50">
                {formatValue(hoveredData.value, currency)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
