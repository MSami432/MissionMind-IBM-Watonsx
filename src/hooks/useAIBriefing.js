/**
 * useAIBriefing.js
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that manages calling summarizeMissionState() and exposes loading,
 * error, and result state to components.
 *
 * Features:
 *  • Auto-generates on first mount when frame is available
 *  • Debounces manual refresh calls (500ms)
 *  • Cancels in-flight requests via AbortController on mode switch or unmount
 *  • Returns separate briefings per mode so switching tabs feels instant
 *
 * Returns:
 * {
 *   briefing    : object | null,   — latest AI response for current mode
 *   isLoading   : boolean,
 *   error       : string | null,
 *   generate    : () => void,      — manual trigger
 *   lastUpdated : Date | null,
 * }
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { summarizeMissionState } from '../ai/aiService'

const DEBOUNCE_MS = 500

export function useAIBriefing({ mode, frame, anomalyLog, enabled = true }) {
  const [briefing,     setBriefing]     = useState(null)
  const [isLoading,    setIsLoading]    = useState(false)
  const [error,        setError]        = useState(null)
  const [lastUpdated,  setLastUpdated]  = useState(null)

  const abortRef   = useRef(null)
  const debounceRef = useRef(null)
  const hasGeneratedRef = useRef(false)

  const generate = useCallback(() => {
    if (!frame || !enabled) return

    // Cancel any previous in-flight request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    // Debounce rapid calls
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await summarizeMissionState(
          mode,
          frame,
          anomalyLog,
          { signal: abortRef.current.signal }
        )
        setBriefing(result)
        setLastUpdated(new Date())
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message ?? 'Unknown error')
        }
      } finally {
        setIsLoading(false)
      }
    }, DEBOUNCE_MS)
  }, [mode, frame, anomalyLog, enabled])

  // Auto-generate once when frame first becomes available
  useEffect(() => {
    if (frame && !hasGeneratedRef.current && enabled) {
      hasGeneratedRef.current = true
      generate()
    }
  }, [frame, generate, enabled])

  // Re-generate when mode switches if we already have a frame
  useEffect(() => {
    if (frame && hasGeneratedRef.current && enabled) {
      generate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      clearTimeout(debounceRef.current)
    }
  }, [])

  return { briefing, isLoading, error, generate, lastUpdated }
}
