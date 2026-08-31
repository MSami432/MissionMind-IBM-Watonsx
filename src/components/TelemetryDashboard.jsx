/**
 * TelemetryDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Main telemetry view.  Renders:
 *   • System status banner (NOMINAL / CAUTION / CRITICAL)
 *   • Grid of SensorCards (intelligent noise reduction applied)
 *   • Multi-line time-series chart for selected sensors (Recharts)
 *   • Live anomaly event log
 *
 * Props
 *   frame      – latest TelemetryFrame from useTelemetry
 *   history    – TelemetryFrame[] rolling window
 *   anomalyLog – AnomalyEvent[] most-recent first
 */

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import { Activity, AlertTriangle, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import clsx from 'clsx'
import SensorCard from './SensorCard'
import { SENSOR_DEFS } from '../data/telemetrySimulator'

// ── Constants ─────────────────────────────────────────────────────────────────

// Which sensors appear in the main time-series chart (subset for readability)
const CHART_SENSORS = ['temperature', 'battery', 'radiation', 'oxygen']

const CHART_COLORS = {
  temperature: '#22d3ee',   // cyan
  battery:     '#4ade80',   // green
  radiation:   '#f87171',   // red
  oxygen:      '#a78bfa',   // violet
  fuel:        '#facc15',   // yellow
  thrustVector:'#fb923c',   // orange
  signalStrength: '#818cf8',// indigo
}

const STATUS_BANNER = {
  NOMINAL: {
    bg:    'bg-accent-green/10 border-accent-green/30',
    text:  'text-accent-green',
    icon:  CheckCircle,
    label: 'ALL SYSTEMS NOMINAL',
  },
  CAUTION: {
    bg:    'bg-accent-yellow/10 border-accent-yellow/40',
    text:  'text-accent-yellow',
    icon:  AlertCircle,
    label: 'SYSTEM CAUTION',
  },
  CRITICAL: {
    bg:    'bg-accent-red/10 border-accent-red/50 animate-pulse-slow',
    text:  'text-accent-red',
    icon:  AlertTriangle,
    label: 'CRITICAL ALERT',
  },
}

// ── Custom Recharts tooltip ────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-space-700 border border-space-500 rounded-lg p-2.5 text-xs font-mono shadow-xl">
      <p className="text-gray-400 mb-1.5">T+{label}s</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 leading-5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-gray-300 w-28">{SENSOR_DEFS[p.dataKey]?.label ?? p.dataKey}</span>
          <span className="font-bold tabular-nums" style={{ color: p.color }}>
            {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
            &nbsp;{SENSOR_DEFS[p.dataKey]?.unit ?? ''}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Anomaly log entry ─────────────────────────────────────────────────────────

function AnomalyLogEntry({ event }) {
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const severityStyle = {
    HIGH:   'text-accent-red   border-accent-red/40   bg-accent-red/5',
    MEDIUM: 'text-accent-yellow border-accent-yellow/40 bg-accent-yellow/5',
    LOW:    'text-accent-cyan  border-accent-cyan/20  bg-accent-cyan/5',
  }[event.severity] ?? 'text-gray-400 border-space-600 bg-space-800'

  return (
    <div className={clsx('rounded border px-2.5 py-1.5 text-xs font-mono leading-snug', severityStyle)}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="font-bold uppercase tracking-wider">{event.severity}</span>
        <span className="text-gray-500">{time}</span>
      </div>
      <p className="text-gray-300">{event.message}</p>
    </div>
  )
}

// ── Sensor chart toggle pills ──────────────────────────────────────────────────

function SensorToggle({ sensorId, active, onToggle }) {
  const def = SENSOR_DEFS[sensorId]
  return (
    <button
      onClick={() => onToggle(sensorId)}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border transition-all',
        active
          ? 'border-transparent text-space-900 font-bold'
          : 'border-space-600 text-gray-500 hover:border-space-500'
      )}
      style={active ? { background: CHART_COLORS[sensorId] } : {}}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: CHART_COLORS[sensorId] }} />
      {def?.label ?? sensorId}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TelemetryDashboard({ frame, history, anomalyLog }) {
  const [visibleSensors, setVisibleSensors] = useState(new Set(CHART_SENSORS))

  function toggleSensor(id) {
    setVisibleSensors(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Derive per-sensor spark data from history ────────────────────────────
  const sparkData = useMemo(() => {
    const result = {}
    Object.keys(SENSOR_DEFS).forEach(id => {
      result[id] = history.map(f => f.sensors[id]?.value ?? null).filter(v => v !== null)
    })
    return result
  }, [history])

  // ── Flatten history for Recharts ─────────────────────────────────────────
  const chartData = useMemo(() =>
    history.map(f => {
      const row = { t: f.missionTime }
      CHART_SENSORS.forEach(id => { row[id] = f.sensors[id]?.value ?? null })
      // also include extras if toggled on
      Object.keys(SENSOR_DEFS).forEach(id => {
        if (!CHART_SENSORS.includes(id)) row[id] = f.sensors[id]?.value ?? null
      })
      return row
    }),
  [history])

  if (!frame) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600 font-mono text-sm">
        <Activity className="w-5 h-5 mr-2 animate-spin" /> Awaiting telemetry…
      </div>
    )
  }

  const { sensors, systemStatus } = frame
  const bannerCfg = STATUS_BANNER[systemStatus] ?? STATUS_BANNER.NOMINAL
  const BannerIcon = bannerCfg.icon

  // Sort sensors: anomalous first, then alphabetical
  const sortedSensorIds = Object.keys(sensors).sort((a, b) => {
    const pa = { CRITICAL: 0, CAUTION: 1, NOMINAL: 2 }[sensors[a].status] ?? 2
    const pb = { CRITICAL: 0, CAUTION: 1, NOMINAL: 2 }[sensors[b].status] ?? 2
    return pa - pb
  })

  return (
    <div className="flex flex-col gap-5">

      {/* ── System status banner ── */}
      <div className={clsx(
        'flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-mono',
        bannerCfg.bg
      )}>
        <BannerIcon className={clsx('w-4 h-4 flex-shrink-0', bannerCfg.text,
          systemStatus === 'CRITICAL' && 'animate-blink'
        )} />
        <span className={clsx('font-bold tracking-widest uppercase text-xs', bannerCfg.text)}>
          {bannerCfg.label}
        </span>
        <span className="ml-auto text-gray-500 text-xs flex items-center gap-1">
          <Clock className="w-3 h-3" />
          T+{frame.missionTime}s
        </span>
        {anomalyLog.length > 0 && (
          <span className="bg-accent-red/20 text-accent-red border border-accent-red/40 text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wider">
            {anomalyLog.length} event{anomalyLog.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Sensor cards grid ── */}
      {/* Noise-reduction note: NOMINAL cards are 75% opacity via SensorCard internals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {sortedSensorIds.map(id => (
          <SensorCard
            key={id}
            sensor={sensors[id]}
            sparkData={sparkData[id] ?? []}
          />
        ))}
      </div>

      {/* ── Time-series chart ── */}
      <div className="bg-space-800/60 border border-space-600 rounded-lg p-4">
        {/* Header + sensor toggles */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[10px] uppercase tracking-widest text-gray-500 mr-1">
            Chart
          </span>
          {Object.keys(SENSOR_DEFS).map(id => (
            <SensorToggle
              key={id}
              sensorId={id}
              active={visibleSensors.has(id)}
              onToggle={toggleSensor}
            />
          ))}
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2a4a" />
            <XAxis
              dataKey="t"
              tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={{ stroke: '#1a2a4a' }}
              tickFormatter={v => `T+${v}s`}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#4b5563', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={{ stroke: '#1a2a4a' }}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', color: '#6b7280' }}
              formatter={v => SENSOR_DEFS[v]?.label ?? v}
            />
            {Object.keys(SENSOR_DEFS).map(id =>
              visibleSensors.has(id) ? (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stroke={CHART_COLORS[id]}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              ) : null
            )}
            {/* Mark nominal reference — only for temperature as an example */}
            {visibleSensors.has('temperature') && (
              <ReferenceLine
                y={SENSOR_DEFS.temperature.nominal}
                stroke="#22d3ee22"
                strokeDasharray="4 4"
                label={{ value: 'NOM', fill: '#22d3ee44', fontSize: 9, fontFamily: 'monospace' }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Anomaly event log ── */}
      <div className="bg-space-800/60 border border-space-600 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-[10px] uppercase tracking-widest text-gray-500">
            Anomaly Event Log
          </span>
          {anomalyLog.length > 0 && (
            <span className="ml-auto text-gray-600 text-[10px]">
              {anomalyLog.length} recorded
            </span>
          )}
        </div>

        {anomalyLog.length === 0 ? (
          <p className="text-gray-600 text-xs text-center py-4 font-mono">
            No anomalies detected — monitoring…
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto
                          scrollbar-thin scrollbar-thumb-space-600 scrollbar-track-transparent">
            {anomalyLog.map(ev => (
              <AnomalyLogEntry key={ev.id} event={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
