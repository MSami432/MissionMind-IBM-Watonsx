/**
 * useDecisionLog.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the in-session Human Review decision log.
 *
 * Each log entry shape:
 * {
 *   id          : string,          – uuid-like key
 *   timestamp   : ISO string,
 *   missionTime : number,
 *   mode        : 'operator',
 *   recommendation: { action, rationale, confidence, riskLevel, timeWindow, predictors },
 *   aiSummary   : string,          – the summary headline from the AI
 *   verdict     : 'APPROVED' | 'REJECTED' | 'PENDING',
 *   operatorNote: string,          – free-text note entered at review time
 *   isSimulated : boolean,
 *   model       : string,
 * }
 */

import { useState, useCallback } from 'react'

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function useDecisionLog() {
  const [log, setLog] = useState([])

  /**
   * Add a new PENDING entry when the AI raises a recommendation.
   * Returns the entry id so the caller can later resolve it.
   */
  const addPending = useCallback((briefing, frame) => {
    if (!briefing?.recommendation) return null
    const entry = {
      id:             uid(),
      timestamp:      new Date().toISOString(),
      missionTime:    frame?.missionTime ?? 0,
      mode:           'operator',
      recommendation: briefing.recommendation,
      aiSummary:      briefing.summary ?? '',
      verdict:        'PENDING',
      operatorNote:   '',
      isSimulated:    briefing.isSimulated ?? true,
      model:          briefing.model ?? 'unknown',
    }
    setLog(prev => [entry, ...prev])
    return entry.id
  }, [])

  /**
   * Resolve a PENDING entry with APPROVED or REJECTED + an optional note.
   */
  const resolve = useCallback((id, verdict, operatorNote = '') => {
    setLog(prev => prev.map(e =>
      e.id === id ? { ...e, verdict, operatorNote } : e
    ))
  }, [])

  /** Remove all entries (e.g. new mission start). */
  const clear = useCallback(() => setLog([]), [])

  return { log, addPending, resolve, clear }
}
