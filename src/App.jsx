/**
 * App.jsx  —  XAI Mission Control Platform
 * ─────────────────────────────────────────────────────────────────────────────
 * Top-level layout:
 *
 *  ┌───────────────────────────────────────────────────────┐
 *  │  HEADER  — mission ID, live clock, AI status badge    │
 *  ├─────────────────────────────┬─────────────────────────┤
 *  │                             │                         │
 *  │  TelemetryDashboard         │  AdaptiveBriefing       │
 *  │  (sensor grid + chart +     │  (operator / public     │
 *  │   anomaly log)              │   toggle)               │
 *  │                             │                         │
 *  └─────────────────────────────┴─────────────────────────┘
 *  │  FOOTER  — mission elapsed time, build tag            │
 *  └───────────────────────────────────────────────────────┘
 */

import { useEffect, useState, useCallback } from 'react'
import { Satellite, Radio, Wifi, WifiOff } from 'lucide-react'
import clsx from 'clsx'

import { useTelemetry }    from './hooks/useTelemetry'
import { useAIStatus }     from './hooks/useAIStatus'
import { useDecisionLog }  from './hooks/useDecisionLog'
import TelemetryDashboard  from './components/TelemetryDashboard'
import AdaptiveBriefing    from './components/AdaptiveBriefing'
import AIStatusBadge       from './components/AIStatusBadge'
import DecisionLog         from './components/DecisionLog'

// ── Live UTC clock ─────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState(() => new Date().toUTCString())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toUTCString()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="tabular-nums">{time}</span>
}

// ── Mission elapsed timer ──────────────────────────────────────────────────────

function MissionTimer({ missionTime }) {
  if (missionTime == null) return null
  const h = Math.floor(missionTime / 3600).toString().padStart(2, '0')
  const m = Math.floor((missionTime % 3600) / 60).toString().padStart(2, '0')
  const s = (missionTime % 60).toString().padStart(2, '0')
  return (
    <span className="font-mono text-accent-cyan tabular-nums">
      T+{h}:{m}:{s}
    </span>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────

export default function App() {
  const { frame, history, anomalyLog, isRunning } = useTelemetry({
    tickMs:             2000,
    historySize:        60,
    anomalyProbability: 0.05,
  })
  const { aiStatus, model, check: retryAI } = useAIStatus()
  const { log: decisionLog, addPending, resolve, clear: clearLog } = useDecisionLog()

  const systemStatus = frame?.systemStatus ?? 'NOMINAL'

  // Build a Map<pendingId, verdict> for quick lookup in AdaptiveBriefing
  const pendingEntries = new Map(
    decisionLog.map(e => [e.id, e.verdict === 'PENDING' ? null : e.verdict])
  )

  // Called by AdaptiveBriefing when AI returns a recommendation
  const handleRecommendation = useCallback((briefing, currentFrame) => {
    return addPending(briefing, currentFrame)
  }, [addPending])

  // Called by HumanReviewCheckpoint Approve/Reject buttons
  const handleApprove = useCallback((pendingId, note) => {
    resolve(pendingId, 'APPROVED', note)
  }, [resolve])

  const handleReject = useCallback((pendingId, note) => {
    resolve(pendingId, 'REJECTED', note)
  }, [resolve])

  return (
    <div className="min-h-screen bg-space-950 text-gray-100 font-mono flex flex-col">

      {/* ────────────────────────── HEADER ────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-space-600 bg-space-900/95 backdrop-blur-md">
        <div className="max-w-screen-2xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-3">

          {/* Brand + mission ID */}
          <div className="flex items-center gap-2.5">
            <Satellite className={clsx(
              'w-5 h-5',
              systemStatus === 'CRITICAL' ? 'text-accent-red animate-blink'
              : systemStatus === 'CAUTION' ? 'text-accent-yellow'
              : 'text-accent-cyan'
            )} />
            <div>
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-accent-cyan leading-tight">
                XAI Mission Control
              </p>
              <p className="text-[9px] text-gray-600 leading-tight tracking-widest uppercase">
                Deep Space Telemetry Platform
              </p>
            </div>
          </div>

          {/* Mission ID */}
          <div className="hidden sm:flex items-center gap-1.5 bg-space-700 rounded px-2.5 py-1 text-[10px]">
            <Radio className="w-3 h-3 text-accent-cyan" />
            <span className="text-gray-500">MISSION</span>
            <span className="text-gray-300 tracking-wider">IBM-XAI-001</span>
          </div>

          {/* Live signal indicator */}
          <div className="flex items-center gap-1.5 text-[10px]">
            {isRunning
              ? <><Wifi    className="w-3 h-3 text-accent-green" /><span className="text-accent-green">LIVE</span></>
              : <><WifiOff className="w-3 h-3 text-gray-600" />    <span className="text-gray-600">OFFLINE</span></>
            }
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* UTC clock */}
          <p className="text-[10px] text-gray-600 hidden md:block">
            <LiveClock />
          </p>

          {/* AI status badge */}
          <AIStatusBadge
            status={aiStatus}
            model={aiStatus === 'live' ? model : undefined}
            onRetry={retryAI}
          />
        </div>

        {/* Sub-header: system status bar */}
        <div className={clsx(
          'h-0.5 w-full transition-colors duration-700',
          systemStatus === 'CRITICAL' ? 'bg-accent-red animate-pulse-slow'
          : systemStatus === 'CAUTION' ? 'bg-accent-yellow'
          : 'bg-accent-cyan/30'
        )} />
      </header>

      {/* ────────────────────────── MAIN ──────────────────────────────────── */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-5">
        <div className="flex flex-col xl:flex-row gap-5">

          {/* Left column — Telemetry dashboard (wider) */}
          <div className="flex-1 min-w-0 flex flex-col gap-5">
            <TelemetryDashboard
              frame={frame}
              history={history}
              anomalyLog={anomalyLog}
            />

            {/* Decision Log — below the telemetry dashboard */}
            <DecisionLog
              log={decisionLog}
              onClear={clearLog}
            />
          </div>

          {/* Right column — Adaptive Briefing (fixed width on xl) */}
          <div className="xl:w-[480px] flex-shrink-0">
            <AdaptiveBriefing
              frame={frame}
              anomalyLog={anomalyLog}
              aiStatus={aiStatus}
              onRecommendation={handleRecommendation}
              pendingEntries={pendingEntries}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </div>
        </div>
      </main>

      {/* ────────────────────────── FOOTER ────────────────────────────────── */}
      <footer className="border-t border-space-700 bg-space-900/60 px-4 py-2">
        <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-700">
          <div className="flex items-center gap-3">
            <span>IBM AI Builders Challenge · Theme: Advance Space Exploration</span>
            <span className="border-l border-space-600 pl-3">
              Elapsed: <MissionTimer missionTime={frame?.missionTime} />
            </span>
          </div>
          <span>v0.3.0 · Task 3 Complete · React 19 / Vite / Tailwind / Recharts / WatsonX</span>
        </div>
      </footer>

    </div>
  )
}
