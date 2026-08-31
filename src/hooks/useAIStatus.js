/**
 * useAIStatus.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Polls /api/health to determine whether the WatsonX proxy is reachable and
 * credentials are configured.
 *
 * Returns: { aiStatus: 'live'|'fallback'|'checking', model, check }
 *   check() – manually re-trigger the probe (e.g. on retry button click)
 */

import { useState, useEffect, useCallback } from 'react'

const DEFAULT_MODEL = 'ibm/granite-13b-chat-v2'

export function useAIStatus() {
  const [aiStatus, setAIStatus] = useState('checking')
  const [model,    setModel]    = useState(DEFAULT_MODEL)

  const check = useCallback(async () => {
    setAIStatus('checking')
    try {
      const res  = await fetch('/api/health', { signal: AbortSignal.timeout(3000) })
      const data = await res.json()
      if (res.ok && data.credsSset) {
        setAIStatus('live')
        setModel(DEFAULT_MODEL)
      } else {
        setAIStatus('fallback')
      }
    } catch {
      setAIStatus('fallback')
    }
  }, [])

  useEffect(() => {
    check()
    // Re-probe every 30 s in case the proxy comes up later
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [check])

  return { aiStatus, model, check }
}
