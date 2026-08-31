/**
 * HumanReviewCheckpoint.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the AI recommendation card with:
 *  • Full XAI reasoning chain
 *  • Confidence meter + risk level badge
 *  • Predicted time window before escalation
 *  • Contributing sensor "predictor" chips
 *  • APPROVE / REJECT buttons with optional operator note
 *  • Post-decision confirmation state
 *
 * This component enforces Human-in-the-Loop authority:
 *  → The AI may recommend, but only the human operator executes.
 *
 * Props:
 *   recommendation – object from AI response (or null)
 *   aiSummary      – headline string
 *   isSimulated    – boolean (affects badge colouring)
 *   onApprove      – (note: string) => void
 *   onReject       – (note: string) => void
 *   pendingId      – string | null  (null = already resolved)
 *   resolvedVerdict– 'APPROVED'|'REJECTED'|null
 */

import { useState } from 'react'
import {
  ShieldCheck, ShieldX, Brain, Clock, AlertTriangle,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Info,
} from 'lucide-react'
import clsx from 'clsx'
import { SENSOR_DEFS } from '../data/telemetrySimulator'

// ── Risk level styles ──────────────────────────────────────────────────────────

const RISK_STYLES = {
  LOW:      { badge: 'bg-accent-green/10  text-accent-green  border-accent-green/30',  bar: 'bg-accent-green'  },
  MEDIUM:   { badge: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30', bar: 'bg-accent-yellow' },
  HIGH:     { badge: 'bg-accent-red/10    text-accent-red    border-accent-red/30',    bar: 'bg-accent-red'    },
  CRITICAL: { badge: 'bg-accent-red/20    text-accent-red    border-accent-red/60 animate-pulse-slow', bar: 'bg-accent-red animate-pulse-slow' },
}

// ── Confidence meter ──────────────────────────────────────────────────────────

function ConfidenceMeter({ value }) {
  const pct   = Math.max(0, Math.min(100, value))
  const color = pct >= 75 ? 'bg-accent-green'
              : pct >= 50 ? 'bg-accent-yellow'
              :             'bg-accent-red'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-space-600 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={clsx('text-xs font-bold tabular-nums w-9 text-right', color)}>
        {pct}%
      </span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HumanReviewCheckpoint({
  recommendation,
  aiSummary,
  isSimulated,
  onApprove,
  onReject,
  pendingId,
  resolvedVerdict,
}) {
  const [showRationale, setShowRationale] = useState(false)
  const [note,          setNote]          = useState('')
  const [confirming,    setConfirming]    = useState(null)  // 'approve' | 'reject'

  if (!recommendation) return null

  const { action, rationale, confidence, riskLevel, timeWindow, predictors } = recommendation
  const riskStyle  = RISK_STYLES[riskLevel] ?? RISK_STYLES.MEDIUM
  const isResolved = Boolean(resolvedVerdict)

  function handleApprove() {
    if (confirming === 'approve') {
      onApprove?.(note)
      setConfirming(null)
      setNote('')
    } else {
      setConfirming('approve')
    }
  }

  function handleReject() {
    if (confirming === 'reject') {
      onReject?.(note)
      setConfirming(null)
      setNote('')
    } else {
      setConfirming('reject')
    }
  }

  // ── Post-resolution read-only view ──────────────────────────────────────────
  if (isResolved) {
    const isApproved = resolvedVerdict === 'APPROVED'
    return (
      <div className={clsx(
        'rounded-lg border p-4 flex items-start gap-3',
        isApproved
          ? 'border-accent-green/30 bg-accent-green/5'
          : 'border-gray-600       bg-space-800/40'
      )}>
        {isApproved
          ? <CheckCircle2 className="w-4 h-4 text-accent-green flex-shrink-0 mt-0.5" />
          : <XCircle      className="w-4 h-4 text-gray-500     flex-shrink-0 mt-0.5" />
        }
        <div className="min-w-0">
          <p className={clsx('text-xs font-bold uppercase tracking-wider', isApproved ? 'text-accent-green' : 'text-gray-500')}>
            Recommendation {resolvedVerdict}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{action}</p>
        </div>
      </div>
    )
  }

  // ── Active recommendation card ──────────────────────────────────────────────
  return (
    <div className={clsx(
      'rounded-lg border flex flex-col overflow-hidden',
      riskLevel === 'CRITICAL' ? 'border-accent-red/60 shadow-[0_0_24px_rgba(248,113,113,0.2)]'
      : riskLevel === 'HIGH'   ? 'border-accent-red/30'
      : riskLevel === 'MEDIUM' ? 'border-accent-yellow/40'
      :                          'border-space-600'
    )}>

      {/* ── Header ── */}
      <div className={clsx(
        'flex items-center gap-2 px-4 py-2.5 border-b',
        riskLevel === 'CRITICAL' ? 'bg-accent-red/10 border-accent-red/30'
        : riskLevel === 'HIGH'   ? 'bg-accent-red/5  border-accent-red/20'
        : riskLevel === 'MEDIUM' ? 'bg-accent-yellow/5 border-accent-yellow/20'
        : 'bg-space-800/60 border-space-600'
      )}>
        <Brain className={clsx(
          'w-4 h-4 flex-shrink-0',
          riskLevel === 'CRITICAL' || riskLevel === 'HIGH' ? 'text-accent-red'
          : riskLevel === 'MEDIUM' ? 'text-accent-yellow'
          : 'text-accent-cyan'
        )} />
        <span className="text-[10px] uppercase tracking-widest text-gray-400 flex-1">
          AI Recommendation — Awaiting Human Decision
        </span>
        {isSimulated && (
          <span className="text-[9px] text-accent-yellow/60 border border-accent-yellow/20 rounded px-1.5 py-0.5">
            SIMULATED
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4">

        {/* ── Risk badge + confidence ── */}
        <div className="flex items-center gap-3">
          <span className={clsx(
            'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border',
            riskStyle.badge
          )}>
            {riskLevel} RISK
          </span>
          {timeWindow && (
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <Clock className="w-3 h-3" />
              Escalates in ~{timeWindow}
            </span>
          )}
        </div>

        {/* ── Confidence meter ── */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
            AI Confidence
          </p>
          <ConfidenceMeter value={confidence} />
        </div>

        {/* ── Recommended action ── */}
        <div className="bg-space-700/60 rounded-lg p-3 border border-space-500">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
            Recommended Action
          </p>
          <p className="text-sm text-gray-200 leading-snug">{action}</p>
        </div>

        {/* ── Contributing sensors (predictors) ── */}
        {predictors?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
              Key Predictors
            </p>
            <div className="flex flex-wrap gap-1.5">
              {predictors.map(id => {
                const def = SENSOR_DEFS[id]
                return (
                  <span
                    key={id}
                    className="text-[10px] bg-space-700 border border-space-500 text-gray-300 rounded px-2 py-0.5"
                  >
                    {def?.label ?? id}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* ── XAI reasoning toggle ── */}
        <button
          onClick={() => setShowRationale(v => !v)}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-accent-cyan/70 hover:text-accent-cyan transition-colors"
        >
          <Info className="w-3 h-3" />
          {showRationale ? 'Hide' : 'Show'} AI Reasoning Chain
          {showRationale ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showRationale && (
          <div className="bg-space-900/60 rounded-lg p-3 border border-space-600 border-dashed">
            <p className="text-[10px] uppercase tracking-widest text-accent-cyan/50 mb-2">
              ■ Explainable AI — Reasoning Chain
            </p>
            <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap font-mono">
              {rationale}
            </p>
          </div>
        )}

        {/* ── Human-in-the-loop warning ── */}
        <div className="flex items-start gap-2 bg-space-700/40 rounded border border-space-600 px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-accent-yellow flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-gray-500 leading-snug">
            <span className="text-accent-yellow font-bold">Human authority required.</span>{' '}
            This AI recommendation does not execute automatically. A qualified operator must
            review and approve before any action is taken.
          </p>
        </div>

        {/* ── Operator note input (shown when confirming) ── */}
        {confirming && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">
              Operator Note (optional)
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Rationale for your decision…"
              rows={2}
              className="bg-space-900 border border-space-500 rounded px-2.5 py-2 text-xs text-gray-300
                         placeholder-gray-600 resize-none focus:outline-none focus:border-accent-cyan/50
                         font-mono transition-colors"
            />
          </div>
        )}

        {/* ── Approve / Reject buttons ── */}
        <div className="flex gap-2.5">
          <button
            onClick={handleApprove}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border font-bold text-xs uppercase tracking-wider transition-all',
              confirming === 'approve'
                ? 'bg-accent-green text-space-900 border-accent-green'
                : 'border-accent-green/40 text-accent-green hover:bg-accent-green/10'
            )}
          >
            <ShieldCheck className="w-4 h-4" />
            {confirming === 'approve' ? 'Confirm Approve' : 'Approve'}
          </button>
          <button
            onClick={handleReject}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border font-bold text-xs uppercase tracking-wider transition-all',
              confirming === 'reject'
                ? 'bg-accent-red text-white border-accent-red'
                : 'border-accent-red/40 text-accent-red hover:bg-accent-red/10'
            )}
          >
            <ShieldX className="w-4 h-4" />
            {confirming === 'reject' ? 'Confirm Reject' : 'Reject'}
          </button>
          {confirming && (
            <button
              onClick={() => setConfirming(null)}
              className="px-3 py-2.5 rounded-lg border border-space-500 text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
