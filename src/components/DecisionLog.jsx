/**
 * DecisionLog.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays the full in-session audit trail of:
 *  • Every AI recommendation raised
 *  • The AI's reasoning (collapsible)
 *  • The human operator's final verdict (APPROVED / REJECTED / PENDING)
 *  • Operator note if provided
 *  • Timestamp and mission time
 *
 * This log is the accountability backbone of the Human-in-the-Loop system.
 * It persists in React state for the session (no backend required).
 *
 * Props:
 *   log   – DecisionLogEntry[] from useDecisionLog
 *   onClear – () => void
 */

import { useState } from 'react'
import {
  ClipboardList, CheckCircle2, XCircle, Clock2, Brain,
  ChevronDown, ChevronUp, Trash2, Shield,
} from 'lucide-react'
import clsx from 'clsx'
import { SENSOR_DEFS } from '../data/telemetrySimulator'

// ── helpers ───────────────────────────────────────────────────────────────────

function missionTimeStr(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0')
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `T+${h}:${m}:${s}`
}

const VERDICT_STYLES = {
  APPROVED: {
    icon:  CheckCircle2,
    color: 'text-accent-green',
    border:'border-accent-green/30',
    bg:    'bg-accent-green/5',
    badge: 'bg-accent-green/10 text-accent-green border-accent-green/30',
  },
  REJECTED: {
    icon:  XCircle,
    color: 'text-accent-red',
    border:'border-accent-red/20',
    bg:    'bg-space-800/40',
    badge: 'bg-accent-red/10 text-accent-red border-accent-red/30',
  },
  PENDING: {
    icon:  Clock2,
    color: 'text-accent-yellow',
    border:'border-accent-yellow/30',
    bg:    'bg-accent-yellow/5',
    badge: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30',
  },
}

const RISK_COLORS = {
  LOW:      'text-accent-green',
  MEDIUM:   'text-accent-yellow',
  HIGH:     'text-accent-red',
  CRITICAL: 'text-accent-red',
}

// ── Single log entry ──────────────────────────────────────────────────────────

function LogEntry({ entry }) {
  const [expanded, setExpanded] = useState(false)
  const vs = VERDICT_STYLES[entry.verdict] ?? VERDICT_STYLES.PENDING
  const VIcon = vs.icon
  const { recommendation, aiSummary, timestamp, missionTime, isSimulated, model, operatorNote } = entry
  const rec = recommendation

  const timeStr  = new Date(timestamp).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false })

  return (
    <div className={clsx(
      'rounded-lg border overflow-hidden transition-all',
      vs.border, vs.bg
    )}>
      {/* Header row */}
      <div
        className="flex items-start gap-3 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <VIcon className={clsx('w-4 h-4 flex-shrink-0 mt-0.5', vs.color)} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            {/* Verdict badge */}
            <span className={clsx(
              'text-[9px] font-bold uppercase tracking-wider border rounded-full px-1.5 py-0.5',
              vs.badge
            )}>
              {entry.verdict}
            </span>
            {/* Risk level */}
            <span className={clsx('text-[10px] font-bold uppercase', RISK_COLORS[rec?.riskLevel])}>
              {rec?.riskLevel ?? '?'} RISK
            </span>
            {/* Confidence */}
            <span className="text-[10px] text-gray-500">
              {rec?.confidence ?? '?'}% confidence
            </span>
            {isSimulated && (
              <span className="text-[9px] text-gray-600 border border-space-500 rounded px-1 py-0.5">
                SIM
              </span>
            )}
          </div>

          {/* Action summary */}
          <p className="text-xs text-gray-300 truncate">{rec?.action ?? 'No action'}</p>
        </div>

        {/* Meta: time */}
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] text-gray-500 font-mono">{timeStr}</p>
          <p className="text-[9px] text-gray-600">{missionTimeStr(missionTime)}</p>
        </div>

        {/* Expand toggle */}
        <button className="text-gray-600 hover:text-gray-400 flex-shrink-0 mt-0.5">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-space-600/50 px-3 py-3 flex flex-col gap-3 text-xs">

          {/* AI summary */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">AI Summary</p>
            <p className="text-gray-300 leading-snug">{aiSummary}</p>
          </div>

          {/* Predictors */}
          {rec?.predictors?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">Predictors</p>
              <div className="flex flex-wrap gap-1.5">
                {rec.predictors.map(id => (
                  <span key={id} className="text-[10px] bg-space-700 border border-space-500 text-gray-400 rounded px-2 py-0.5">
                    {SENSOR_DEFS[id]?.label ?? id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* XAI rationale */}
          {rec?.rationale && (
            <div className="bg-space-900/60 rounded border border-space-600 border-dashed p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Brain className="w-3 h-3 text-accent-cyan/40" />
                <p className="text-[10px] uppercase tracking-widest text-accent-cyan/40">
                  AI Reasoning Chain
                </p>
              </div>
              <p className="text-gray-500 leading-relaxed whitespace-pre-wrap font-mono text-[11px]">
                {rec.rationale}
              </p>
            </div>
          )}

          {/* Time window */}
          {rec?.timeWindow && (
            <p className="text-[10px] text-gray-500">
              <span className="text-gray-400">Predicted escalation:</span> within {rec.timeWindow}
            </p>
          )}

          {/* Operator note */}
          {operatorNote && (
            <div className="bg-space-800 rounded border border-space-500 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                Operator Note
              </p>
              <p className="text-gray-300 leading-snug">{operatorNote}</p>
            </div>
          )}

          {/* Model attribution */}
          <p className="text-[10px] text-gray-600">
            Model: {model} · {isSimulated ? 'Simulated' : 'Live WatsonX'}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DecisionLog({ log, onClear }) {
  const pending  = log.filter(e => e.verdict === 'PENDING').length
  const approved = log.filter(e => e.verdict === 'APPROVED').length
  const rejected = log.filter(e => e.verdict === 'REJECTED').length

  return (
    <div className="bg-space-800/60 border border-space-600 rounded-lg overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-space-600 bg-space-900/60">
        <ClipboardList className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="text-[10px] uppercase tracking-widest text-gray-500 flex-1">
          Human Review — Decision Log
        </span>

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px]">
          {pending > 0 && (
            <span className="text-accent-yellow font-bold">{pending} pending</span>
          )}
          {approved > 0 && (
            <span className="text-accent-green">{approved} approved</span>
          )}
          {rejected > 0 && (
            <span className="text-gray-500">{rejected} rejected</span>
          )}
        </div>

        {log.length > 0 && (
          <button
            onClick={onClear}
            title="Clear decision log"
            className="text-gray-600 hover:text-accent-red transition-colors ml-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Entries ── */}
      <div className="p-3">
        {log.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-600">
            <Shield className="w-8 h-8 opacity-20" />
            <p className="text-xs text-center">
              No decisions logged yet.
              <br />
              AI recommendations will appear here for operator review.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-0.5">
            {log.map(entry => (
              <LogEntry key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
