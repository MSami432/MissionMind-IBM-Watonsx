/**
 * useTelemetry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that owns one shared simulator instance for the app lifetime.
 * Returns live frame data, rolling history, and the active anomaly list.
 *
 * Usage:
 *   const { frame, history, anomalyLog, isRunning } = useTelemetry(options)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createTelemetrySimulator } from '../data/telemetrySimulator'

/**
 * @param {object} opts – forwarded to createTelemetrySimulator
 * @param {number} [opts.tickMs=2000]
 * @param {number} [opts.historySize=60]
 * @param {number} [opts.anomalyProbability=0.05]
 * @param {number} [opts.maxAnomalyLog=50]  – max anomaly events kept in the log
 */
export function useTelemetry({
  tickMs             = 2000,
  historySize        = 60,
  anomalyProbability = 0.05,
  maxAnomalyLog      = 50,
} = {}) {
  const simRef    = useRef(null)
  const [frame,      setFrame]      = useState(null)
  const [history,    setHistory]    = useState([])
  const [anomalyLog, setAnomalyLog] = useState([])
  const [isRunning,  setIsRunning]  = useState(false)

  useEffect(() => {
    const sim = createTelemetrySimulator({ tickMs, historySize, anomalyProbability })
    simRef.current = sim

    const unsub = sim.subscribe(f => {
      setFrame(f)
      setHistory(sim.getHistory())

      if (f.anomalies.length > 0) {
        setAnomalyLog(prev => {
          const next = [...f.anomalies, ...prev]
          return next.slice(0, maxAnomalyLog)
        })
      }
    })

    sim.start()
    setIsRunning(true)

    return () => {
      unsub()
      sim.stop()
      setIsRunning(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally stable — simulator is created once

  /** Manually fire an anomaly for demo/testing */
  const injectAnomaly = useCallback((sensorId, typeId) => {
    simRef.current?.injectAnomaly(sensorId, typeId)
  }, [])

  return { frame, history, anomalyLog, isRunning, injectAnomaly }
}
