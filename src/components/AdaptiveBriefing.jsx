/**
 * AdaptiveBriefing.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the AI-generated mission briefing in two modes:
 *
 *  ● OPERATOR BRIEF  – dense, technical, predictive analytics + XAI
 *    recommendations. Includes the HumanReviewCheckpoint for any action the
 *    model recommends.
 *
 *  ● PUBLIC DIGEST   – jargon-free, inspiring narrative for the general public.
 *
 * AI text comes from useAIBriefing (→ aiService.js → WatsonX proxy / fallback).
 * The operator's review decision is surfaced via onRecommendation → App.jsx.
 *
 * Props:
 *   frame              – latest TelemetryFrame
 *   anomalyLog         – AnomalyEvent[] most-recent first
 *   aiStatus           – 'live' | 'fallback' | 'checking'
 *   onRecommendation   – (briefing, frame) => string  returns pendingId
 *   pendingEntries     – Map<pendingId, verdict>  from useDecisionLog
 *   onApprove          – (pendingId, note) => void
 *   onReject           – (pendingId, note) => void
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  FileText, Globe, RefreshCw, Cpu, Loader,
  AlertTriangle, CheckCircle, Brain,
} from 'lucide-react'
import clsx from 'clsx'
import { SENSOR_DEFS } from '../data/telemetrySimulator'
import { useAIBriefing } from '../hooks/useAIBriefing'
import HumanReviewCheckpoint from './HumanReviewCheckpoint'

// ─── Helpers (shared with operator fallback table) ─────────────────────────────

function missionTimeStr(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0')
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

const STATUS_CHIP = {
  NOMINAL:  'bg-accent-green/10  text-accent-green  border-accent-green/30',
  CAUTION:  'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30',
  CRITICAL: 'bg-accent-red/10   text-accent-red    border-accent-red/40',
}

function StatusChip({ status }) {
  return (
    <span className={clsx(
      'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border font-bold',
      STATUS_CHIP[status] ?? STATUS_CHIP.NOMINAL
    )}>
      {status}
    </span>
  )
}

function TrendArrow({ trend }) {
  if (trend === 'RISING')  return <span className="text-accent-yellow text-xs">↑</span>
  if (trend === 'FALLING') return <span className="text-accent-cyan   text-xs">↓</span>
  return <span className="text-gray-600 text-xs">—</span>
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function SkeletonLine({ w = 'w-full', dim = false }) {
  return (
    <div className={clsx(
      'h-2.5 rounded animate-pulse-slow',
      w,
      dim ? 'bg-space-600/40' : 'bg-space-600/70'
    )} />
  )
}

function BriefingSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-accent-cyan/30 animate-pulse-slow" />
        <SkeletonLine w="w-48" />
      </div>
      {[1,2,3].map(i => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-space-600 bg-space-800/40 p-3">
          <SkeletonLine w="w-32" dim />
          <SkeletonLine />
          <SkeletonLine w="w-5/6" />
          <SkeletonLine w="w-4/6" dim />
        </div>
      ))}
    </div>
  )
}

// ─── Operator Brief — AI-driven layout ────────────────────────────────────────

function OperatorBriefAI({ briefing, frame, pendingEntries, onApprove, onReject, pendingId }) {
  if (!briefing || !frame) return <BriefingSkeleton />
  const { sensors, missionTime, timestamp, systemStatus } = frame

  const sensorRows = useMemo(() => Object.values(sensors).map(s => ({
    id:      s.id,
    label:   s.label,
    value:   s.value.toFixed(2),
    unit:    s.unit,
    status:  s.status,
    trend:   s.trend,
    nominal: SENSOR_DEFS[s.id]?.nominal,
    delta:   (s.value - (SENSOR_DEFS[s.id]?.nominal ?? s.value)).toFixed(2),
  })), [sensors])

  const resolvedVerdict = pendingId ? (pendingEntries?.get(pendingId) ?? null) : null

  return (
    <div className="flex flex-col gap-5 font-mono text-xs p-4">

      {/* Telemetry header */}
      <div className="border-b border-space-600 pb-3 flex flex-wrap gap-x-6 gap-y-1 text-gray-500">
        <span><span className="text-gray-400">MISSION TIME</span>&nbsp;&nbsp;{missionTimeStr(missionTime)}</span>
        <span><span className="text-gray-400">TIMESTAMP</span>&nbsp;&nbsp;{new Date(timestamp).toUTCString()}</span>
        <span><span className="text-gray-400">STATUS</span>&nbsp;&nbsp;<StatusChip status={systemStatus} /></span>
        {briefing.isSimulated && <span className="text-accent-yellow/60">[SIMULATED AI]</span>}
      </div>

      {/* AI summary headline */}
      {briefing.summary && (
        <div className="flex items-start gap-2 bg-space-700/40 rounded border border-space-500 px-3 py-2.5">
          <Brain className="w-3.5 h-3.5 text-accent-cyan flex-shrink-0 mt-0.5" />
          <p className="text-gray-200 leading-snug text-[11px]">{briefing.summary}</p>
        </div>
      )}

      {/* AI sections (predictive analytics, anomaly summary, etc.) */}
      {briefing.sections?.map((sec, i) => (
        <div key={i}>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">■ {sec.heading}</p>
          <p className="text-gray-300 leading-relaxed">{sec.body}</p>
        </div>
      ))}

      {/* Subsystem table */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
          ■ Live Subsystem Telemetry
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-gray-600 text-[10px] uppercase tracking-wider border-b border-space-600">
                <th className="text-left py-1.5 pr-3 font-normal">Sensor</th>
                <th className="text-right py-1.5 px-2 font-normal">Value</th>
                <th className="text-right py-1.5 px-2 font-normal">Δ Nom</th>
                <th className="text-center py-1.5 px-2 font-normal">Trend</th>
                <th className="text-center py-1.5 pl-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {sensorRows.map(row => (
                <tr key={row.id} className={clsx(
                  'border-b transition-colors',
                  row.status === 'CRITICAL' ? 'border-accent-red/20 bg-accent-red/5'
                  : row.status === 'CAUTION' ? 'border-accent-yellow/10 bg-accent-yellow/5'
                  : 'border-space-700'
                )}>
                  <td className="py-1.5 pr-3">
                    <span className={clsx(
                      row.status === 'CRITICAL' ? 'text-accent-red'
                      : row.status === 'CAUTION' ? 'text-accent-yellow'
                      : 'text-gray-400'
                    )}>{row.label}</span>
                  </td>
                  <td className="text-right px-2 tabular-nums">
                    <span className={clsx(
                      'font-bold',
                      row.status === 'CRITICAL' ? 'text-accent-red'
                      : row.status === 'CAUTION' ? 'text-accent-yellow'
                      : 'text-gray-300'
                    )}>{row.value}</span>
                    <span className="text-gray-600 ml-1">{row.unit}</span>
                  </td>
                  <td className={clsx(
                    'text-right px-2 tabular-nums',
                    parseFloat(row.delta) > 0 ? 'text-accent-yellow'
                    : parseFloat(row.delta) < 0 ? 'text-accent-cyan'
                    : 'text-gray-600'
                  )}>
                    {parseFloat(row.delta) > 0 ? '+' : ''}{row.delta}
                  </td>
                  <td className="text-center px-2"><TrendArrow trend={row.trend} /></td>
                  <td className="text-center pl-2"><StatusChip status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Human Review Checkpoint ── */}
      {briefing.recommendation && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            ■ Human Review Checkpoint
          </p>
          <HumanReviewCheckpoint
            recommendation={briefing.recommendation}
            aiSummary={briefing.summary}
            isSimulated={briefing.isSimulated}
            pendingId={pendingId}
            resolvedVerdict={resolvedVerdict}
            onApprove={note => onApprove?.(pendingId, note)}
            onReject={note  => onReject?.(pendingId, note)}
          />
        </div>
      )}

      {/* Shift-handoff footer */}
      <div className="border-t border-space-600 pt-3 text-gray-600">
        <p>SHIFT HANDOFF NOTE: Review all CAUTION+ events. Next scheduled comm window in 00:45:00.</p>
        <p className="text-gray-700 mt-0.5">
          {briefing.isSimulated
            ? 'Generated by XAI Mission Control — Granite fallback (proxy offline)'
            : `Generated by ${briefing.model} via WatsonX · ${briefing.generatedAt}`
          }
        </p>
      </div>
    </div>
  )
}

// ─── Public Digest — AI-driven layout ─────────────────────────────────────────

function PublicDigestAI({ briefing }) {
  if (!briefing) return <BriefingSkeleton />

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Summary headline */}
      {briefing.summary && (
        <div className="bg-space-700/40 rounded border border-space-500 px-4 py-3">
          <p className="text-sm text-gray-100 leading-relaxed font-bold">{briefing.summary}</p>
        </div>
      )}

      {briefing.sections?.map(({ heading, body }, i) => {
        const isPlaceholder = body?.includes('[SIMULATED') || body?.includes('[AI Note')
        return (
          <div key={i} className={clsx(
            'rounded-lg p-4 border',
            isPlaceholder
              ? 'border-space-600 bg-space-800/40 border-dashed'
              : 'border-space-600 bg-space-800/60'
          )}>
            <h3 className={clsx('text-sm font-bold mb-2', isPlaceholder ? 'text-gray-500' : 'text-gray-200')}>
              {heading}
            </h3>
            <p className={clsx('text-sm leading-relaxed', isPlaceholder ? 'text-gray-600 italic' : 'text-gray-300')}>
              {body}
            </p>
          </div>
        )
      })}

      {briefing.isSimulated && (
        <p className="text-[10px] text-gray-600 text-center">
          Fallback mode — Granite LLM offline. Connect WatsonX proxy for live AI summaries.
        </p>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function AdaptiveBriefing({
  frame,
  anomalyLog,
  aiStatus,
  onRecommendation,
  pendingEntries,
  onApprove,
  onReject,
}) {
  const [mode, setMode] = useState('operator')

  const { briefing, isLoading, generate, lastUpdated } = useAIBriefing({
    mode,
    frame,
    anomalyLog,
    enabled: true,
  })

  // Track the pending log entry id for the current briefing's recommendation
  const pendingIdRef = useRef(null)

  // When briefing arrives with a recommendation, register it in the decision log
  useEffect(() => {
    if (briefing?.recommendation && onRecommendation && frame) {
      const id = onRecommendation(briefing, frame)
      if (id) pendingIdRef.current = id
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefing?.summary])   // only when a new briefing arrives (summary changes)

  return (
    <div className="bg-space-800/60 border border-space-600 rounded-lg overflow-hidden flex flex-col">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-space-600 bg-space-900/60 flex-shrink-0">
        <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="text-[10px] uppercase tracking-widest text-gray-500 flex-1">
          Adaptive Mission Briefing
        </span>

        {/* Last-updated time */}
        {lastUpdated && !isLoading && (
          <span className="text-[9px] text-gray-600 hidden sm:block">
            Updated {lastUpdated.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false })}
          </span>
        )}

        {/* Mode toggle */}
        <div className="flex items-center bg-space-700 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setMode('operator')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all',
              mode === 'operator'
                ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30'
                : 'text-gray-500 hover:text-gray-300'
            )}
          >
            <Cpu className="w-3 h-3" />
            Operator
          </button>
          <button
            onClick={() => setMode('public')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all',
              mode === 'public'
                ? 'bg-accent-violet/20 text-accent-violet border border-accent-violet/30'
                : 'text-gray-500 hover:text-gray-300'
            )}
          >
            <Globe className="w-3 h-3" />
            Public
          </button>
        </div>

        {/* Refresh */}
        <button
          onClick={generate}
          disabled={isLoading}
          title="Re-generate briefing"
          className="text-gray-600 hover:text-accent-cyan disabled:text-gray-700 transition-colors p-1 rounded"
        >
          {isLoading
            ? <Loader className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />
          }
        </button>
      </div>

      {/* ── Mode description pill ── */}
      <div className="px-4 pt-3 flex-shrink-0">
        <p className={clsx(
          'inline-flex items-center gap-1.5 text-[10px] rounded-full px-2.5 py-1 border',
          mode === 'operator'
            ? 'text-accent-cyan/70 border-accent-cyan/20 bg-accent-cyan/5'
            : 'text-accent-violet/70 border-accent-violet/20 bg-accent-violet/5'
        )}>
          {mode === 'operator' ? (
            <><Cpu className="w-2.5 h-2.5" /> Predictive analytics + XAI recommendations — for flight operators</>
          ) : (
            <><Globe className="w-2.5 h-2.5" /> Plain-language summary — for press, educators &amp; public</>
          )}
        </p>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && !briefing ? (
          <BriefingSkeleton />
        ) : mode === 'operator' ? (
          <OperatorBriefAI
            briefing={briefing}
            frame={frame}
            pendingEntries={pendingEntries}
            onApprove={onApprove}
            onReject={onReject}
            pendingId={pendingIdRef.current}
          />
        ) : (
          <PublicDigestAI briefing={briefing} />
        )}
      </div>

    </div>
  )
}
