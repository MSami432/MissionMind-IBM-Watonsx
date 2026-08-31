/**
 * SensorCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays one sensor reading with:
 *  • Intelligent Noise Reduction — NOMINAL sensors are visually de-emphasised
 *  • CAUTION  → yellow border + glow
 *  • CRITICAL → red border + pulsing glow + animated label
 *  • Micro sparkline of the last N values
 *  • Trend arrow (↑ ↓ —)
 */

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip as RechartsTooltip,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Zap } from 'lucide-react'
import clsx from 'clsx'

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  NOMINAL: {
    card:   'border-space-600 bg-space-800/60',
    label:  'text-gray-500',
    value:  'text-gray-400',
    unit:   'text-gray-600',
    glow:   '',
    areaFill: '#22d3ee22',
    areaStroke: '#22d3ee66',
  },
  CAUTION: {
    card:   'border-accent-yellow/60 bg-space-800/80 shadow-[0_0_12px_rgba(250,204,21,0.2)]',
    label:  'text-accent-yellow',
    value:  'text-accent-yellow font-bold',
    unit:   'text-accent-yellow/70',
    glow:   '',
    areaFill: '#facc1522',
    areaStroke: '#facc15aa',
  },
  CRITICAL: {
    card:   'border-accent-red/80 bg-space-800 shadow-[0_0_20px_rgba(248,113,113,0.35)] animate-pulse-slow',
    label:  'text-accent-red',
    value:  'text-accent-red font-bold',
    unit:   'text-accent-red/70',
    glow:   'animate-pulse-slow',
    areaFill: '#f8717133',
    areaStroke: '#f87171',
  },
}

function TrendIcon({ trend, status }) {
  const cls = clsx('w-3.5 h-3.5', {
    'text-gray-600':      trend === 'STABLE'  && status === 'NOMINAL',
    'text-accent-yellow': status === 'CAUTION',
    'text-accent-red':    status === 'CRITICAL',
    'text-accent-cyan':   trend !== 'STABLE'  && status === 'NOMINAL',
  })
  if (trend === 'RISING')  return <TrendingUp  className={cls} />
  if (trend === 'FALLING') return <TrendingDown className={cls} />
  return <Minus className={cls} />
}

function MiniSparkline({ data, status }) {
  const styles = STATUS_STYLES[status] ?? STATUS_STYLES.NOMINAL
  const chartData = data.map((v, i) => ({ i, v }))

  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${status}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={styles.areaStroke} stopOpacity={0.4} />
            <stop offset="95%" stopColor={styles.areaStroke} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={styles.areaStroke}
          fill={`url(#grad-${status})`}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <RechartsTooltip
          content={() => null}   // no tooltip on mini sparkline
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Gauge bar ─────────────────────────────────────────────────────────────────

function GaugeBar({ value, min, max, nominal, status }) {
  const pct    = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const nomPct = Math.max(0, Math.min(100, ((nominal - min) / (max - min)) * 100))

  const barColor = {
    NOMINAL:  'bg-accent-cyan/60',
    CAUTION:  'bg-accent-yellow/80',
    CRITICAL: 'bg-accent-red animate-pulse-slow',
  }[status] ?? 'bg-accent-cyan/60'

  return (
    <div className="relative h-1.5 w-full rounded-full bg-space-600 overflow-visible mt-1">
      {/* nominal marker */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-white/20 rounded-full z-10"
        style={{ left: `${nomPct}%` }}
      />
      {/* fill */}
      <div
        className={clsx('h-full rounded-full transition-all duration-700', barColor)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {import('../data/telemetrySimulator').SensorReading} props.sensor
 * @param {number[]} props.sparkData  – array of recent values for this sensor
 */
export default function SensorCard({ sensor, sparkData = [] }) {
  const { id, label, value, unit, min, max, nominal, status, trend } = sensor
  const styles  = STATUS_STYLES[status] ?? STATUS_STYLES.NOMINAL
  const isAlert = status !== 'NOMINAL'

  const formattedValue = useMemo(() => {
    if (Math.abs(value) >= 100) return value.toFixed(1)
    if (Math.abs(value) >= 10)  return value.toFixed(2)
    return value.toFixed(3)
  }, [value])

  return (
    <div
      className={clsx(
        'relative rounded-lg border p-3 flex flex-col gap-2 transition-all duration-500',
        styles.card,
        // Noise reduction: dim NOMINAL cards slightly when no anomalies exist globally
        !isAlert && 'opacity-75 hover:opacity-100'
      )}
    >
      {/* ── Header row ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {status === 'CRITICAL' && (
            <AlertTriangle className="w-3.5 h-3.5 text-accent-red flex-shrink-0 animate-blink" />
          )}
          {status === 'CAUTION' && (
            <Zap className="w-3.5 h-3.5 text-accent-yellow flex-shrink-0" />
          )}
          <span className={clsx('text-[10px] uppercase tracking-widest truncate', styles.label)}>
            {label}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <TrendIcon trend={trend} status={status} />
          <span className={clsx('text-[9px] uppercase tracking-wider', {
            'text-gray-600':      status === 'NOMINAL',
            'text-accent-yellow': status === 'CAUTION',
            'text-accent-red':    status === 'CRITICAL',
          })}>
            {status}
          </span>
        </div>
      </div>

      {/* ── Value ── */}
      <div className="flex items-baseline gap-1">
        <span className={clsx('text-2xl tabular-nums leading-none transition-colors duration-300', styles.value)}>
          {formattedValue}
        </span>
        <span className={clsx('text-xs', styles.unit)}>{unit}</span>
      </div>

      {/* ── Gauge bar ── */}
      <GaugeBar value={value} min={min} max={max} nominal={nominal} status={status} />

      {/* ── Sparkline ── */}
      {sparkData.length > 2 && (
        <div className="-mx-1">
          <MiniSparkline data={sparkData} status={status} />
        </div>
      )}

      {/* ── CRITICAL overlay pulse ring ── */}
      {status === 'CRITICAL' && (
        <div className="absolute inset-0 rounded-lg pointer-events-none border border-accent-red/40 animate-ping" />
      )}
    </div>
  )
}
