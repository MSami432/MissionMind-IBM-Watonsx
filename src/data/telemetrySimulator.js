/**
 * telemetrySimulator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates realistic, real-time mock telemetry for a deep-space spacecraft.
 * Runs entirely in the browser — no backend required for data simulation.
 *
 * Architecture
 * ┌─────────────────────────────────────────────────────────────┐
 * │  createTelemetrySimulator(options)                          │
 * │    └─ returns { start, stop, getSnapshot, getHistory,      │
 * │                 onTick, subscribe }                         │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Each tick produces a TelemetryFrame:
 * {
 *   timestamp  : ISO string,
 *   missionTime: seconds elapsed,
 *   sensors    : { [id]: SensorReading },
 *   anomalies  : AnomalyEvent[],
 *   systemStatus: 'NOMINAL' | 'CAUTION' | 'CRITICAL'
 * }
 *
 * SensorReading  : { id, label, value, unit, min, max, nominal, status, trend }
 * AnomalyEvent   : { id, sensorId, type, severity, value, delta, message, timestamp }
 */

// ─── Sensor definitions ────────────────────────────────────────────────────────

/**
 * Each entry describes the physical envelope for a sensor.
 * `drift` controls how fast the value wanders between ticks (random walk σ).
 * `anomalyWeight` biases how often this sensor is chosen for an anomaly.
 */
export const SENSOR_DEFS = {
  temperature: {
    id:            'temperature',
    label:         'Hull Temperature',
    unit:          '°C',
    nominal:       22,
    min:           -60,
    max:           120,
    cautionLow:    -10,
    cautionHigh:   45,
    criticalLow:   -30,
    criticalHigh:  80,
    drift:         0.4,
    anomalyWeight: 3,   // high — classic space anomaly
  },
  battery: {
    id:            'battery',
    label:         'Battery Level',
    unit:          '%',
    nominal:       87,
    min:           0,
    max:           100,
    cautionLow:    30,
    cautionHigh:   100,
    criticalLow:   15,
    criticalHigh:  100,
    drift:         0.15,
    anomalyWeight: 2,
  },
  oxygen: {
    id:            'oxygen',
    label:         'O₂ Partial Pressure',
    unit:          'kPa',
    nominal:       21.1,
    min:           0,
    max:           35,
    cautionLow:    17,
    cautionHigh:   25,
    criticalLow:   13,
    criticalHigh:  30,
    drift:         0.08,
    anomalyWeight: 2,
  },
  radiation: {
    id:            'radiation',
    label:         'Radiation Dose Rate',
    unit:          'μGy/h',
    nominal:       2.5,
    min:           0,
    max:           500,
    cautionLow:    0,
    cautionHigh:   50,
    criticalLow:   0,
    criticalHigh:  200,
    drift:         0.3,
    anomalyWeight: 3,   // solar-flare events
  },
  fuel: {
    id:            'fuel',
    label:         'Fuel Remaining',
    unit:          '%',
    nominal:       72,
    min:           0,
    max:           100,
    cautionLow:    20,
    cautionHigh:   100,
    criticalLow:   10,
    criticalHigh:  100,
    drift:         0.05,   // fuel only decreases (slow)
    anomalyWeight: 1,
  },
  thrustVector: {
    id:            'thrustVector',
    label:         'Thrust Vector Δ',
    unit:          '°',
    nominal:       0,
    min:           -5,
    max:           5,
    cautionLow:    -2,
    cautionHigh:   2,
    criticalLow:   -4,
    criticalHigh:  4,
    drift:         0.1,
    anomalyWeight: 1,
  },
  signalStrength: {
    id:            'signalStrength',
    label:         'Signal Strength',
    unit:          'dBm',
    nominal:       -65,
    min:           -120,
    max:           -30,
    cautionLow:    -95,
    cautionHigh:   -30,
    criticalLow:   -110,
    criticalHigh:  -30,
    drift:         0.6,
    anomalyWeight: 1,
  },
}

// ─── Anomaly type catalogue ────────────────────────────────────────────────────

export const ANOMALY_TYPES = {
  SPIKE:       { id: 'SPIKE',       label: 'Sudden Spike',        severityMultiplier: 1.5 },
  DROP:        { id: 'DROP',        label: 'Sudden Drop',         severityMultiplier: 1.5 },
  DRIFT_HIGH:  { id: 'DRIFT_HIGH',  label: 'Gradual High Drift',  severityMultiplier: 1.0 },
  DRIFT_LOW:   { id: 'DRIFT_LOW',   label: 'Gradual Low Drift',   severityMultiplier: 1.0 },
  FLATLINE:    { id: 'FLATLINE',    label: 'Signal Flatline',     severityMultiplier: 0.8 },
}

// ─── Utility helpers ───────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
const rand  = (lo, hi)    => lo + Math.random() * (hi - lo)
const gauss = (σ = 1)     => {
  // Box-Muller transform — zero-mean Gaussian
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * σ
}

function sensorStatus(value, def) {
  if (value <= def.criticalLow  || value >= def.criticalHigh) return 'CRITICAL'
  if (value <= def.cautionLow   || value >= def.cautionHigh)  return 'CAUTION'
  return 'NOMINAL'
}

function trend(prev, curr) {
  const δ = curr - prev
  if (Math.abs(δ) < 0.01) return 'STABLE'
  return δ > 0 ? 'RISING' : 'FALLING'
}

function chooseWeightedSensor(defs) {
  const entries = Object.values(defs)
  const total   = entries.reduce((s, d) => s + d.anomalyWeight, 0)
  let r = Math.random() * total
  for (const d of entries) {
    r -= d.anomalyWeight
    if (r <= 0) return d
  }
  return entries[entries.length - 1]
}

// ─── Core factory ─────────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {number} [options.tickMs=2000]          – ms between data ticks
 * @param {number} [options.historySize=120]       – max frames kept in memory
 * @param {number} [options.anomalyProbability=0.04] – P(anomaly per tick)
 * @param {number} [options.anomalyDurationTicks=8]  – how long an anomaly persists
 */
export function createTelemetrySimulator({
  tickMs               = 2000,
  historySize          = 120,
  anomalyProbability   = 0.04,
  anomalyDurationTicks = 8,
} = {}) {

  // ── State ──────────────────────────────────────────────────────────────────
  let missionTime   = 0          // seconds elapsed
  let intervalId    = null
  const history     = []         // TelemetryFrame[]
  const subscribers = new Set()  // (frame) => void

  // Live sensor state (value + previous value for trend)
  const sensorState = Object.fromEntries(
    Object.values(SENSOR_DEFS).map(def => [
      def.id, { value: def.nominal, prev: def.nominal },
    ])
  )

  // Active anomaly injections: { [sensorId]: { type, ticksRemaining, magnitude } }
  const activeAnomalies = {}

  // ── Tick logic ─────────────────────────────────────────────────────────────

  function maybeTriggerAnomaly() {
    if (Math.random() > anomalyProbability) return

    const def      = chooseWeightedSensor(SENSOR_DEFS)
    const typeKeys = Object.keys(ANOMALY_TYPES)
    const aType    = ANOMALY_TYPES[typeKeys[Math.floor(Math.random() * typeKeys.length)]]

    // Don't stack anomalies on the same sensor
    if (activeAnomalies[def.id]) return

    // Magnitude: push value toward / beyond caution boundary
    const range     = def.max - def.min
    const magnitude = rand(0.15, 0.35) * range *
                      (aType.id === 'DROP' || aType.id === 'DRIFT_LOW' ? -1 : 1)

    activeAnomalies[def.id] = {
      sensorId:      def.id,
      type:          aType,
      ticksRemaining: anomalyDurationTicks,
      magnitude,
      startValue:    sensorState[def.id].value,
    }
  }

  function stepSensor(def) {
    const state  = sensorState[def.id]
    const active = activeAnomalies[def.id]

    let δ = gauss(def.drift)  // normal random walk

    if (active) {
      // Inject anomaly bias
      switch (active.type.id) {
        case 'SPIKE':
        case 'DROP':
          // Instantaneous jump then recovery
          δ += active.ticksRemaining === active.ticksRemaining
            ? active.magnitude / 2
            : -active.magnitude / (anomalyDurationTicks - 1)
          break
        case 'DRIFT_HIGH':
        case 'DRIFT_LOW':
          δ += active.magnitude / anomalyDurationTicks
          break
        case 'FLATLINE':
          δ = 0  // freeze the sensor — simulate data loss
          break
      }

      active.ticksRemaining -= 1
      if (active.ticksRemaining <= 0) {
        delete activeAnomalies[def.id]
      }
    } else if (def.id === 'fuel') {
      // Fuel only decreases (slow consumption)
      δ = -Math.abs(gauss(def.drift * 0.3))
    }

    const next = clamp(state.value + δ, def.min, def.max)
    state.prev  = state.value
    state.value = next
  }

  function buildFrame() {
    const now       = new Date()
    const sensors   = {}
    const anomalies = []

    for (const def of Object.values(SENSOR_DEFS)) {
      stepSensor(def)
      const st = sensorState[def.id]
      const status = sensorStatus(st.value, def)

      sensors[def.id] = {
        id:      def.id,
        label:   def.label,
        value:   parseFloat(st.value.toFixed(2)),
        unit:    def.unit,
        min:     def.min,
        max:     def.max,
        nominal: def.nominal,
        status,
        trend:   trend(st.prev, st.value),
      }

      // Emit anomaly event if an injection is active
      const active = activeAnomalies[def.id]
      if (active) {
        const delta = st.value - active.startValue
        anomalies.push({
          id:        `${def.id}-${now.getTime()}`,
          sensorId:  def.id,
          type:      active.type.id,
          typeLabel: active.type.label,
          severity:  status === 'CRITICAL' ? 'HIGH'
                   : status === 'CAUTION'  ? 'MEDIUM'
                                           : 'LOW',
          value:     parseFloat(st.value.toFixed(2)),
          delta:     parseFloat(delta.toFixed(2)),
          message:   `${def.label}: ${active.type.label} detected (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} ${def.unit})`,
          timestamp: now.toISOString(),
        })
      }
    }

    // Overall system status = worst individual sensor status
    const statusPriority = { NOMINAL: 0, CAUTION: 1, CRITICAL: 2 }
    const systemStatus = Object.values(sensors).reduce((worst, s) => {
      return statusPriority[s.status] > statusPriority[worst] ? s.status : worst
    }, 'NOMINAL')

    return {
      timestamp:    now.toISOString(),
      missionTime:  missionTime++,
      sensors,
      anomalies,
      systemStatus,
    }
  }

  function tick() {
    maybeTriggerAnomaly()
    const frame = buildFrame()

    history.push(frame)
    if (history.length > historySize) history.shift()

    subscribers.forEach(fn => fn(frame))
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    /** Start emitting ticks. */
    start() {
      if (intervalId) return
      tick()                                      // emit first frame immediately
      intervalId = setInterval(tick, tickMs)
    },

    /** Stop the simulator. */
    stop() {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    },

    /** Latest frame (or null if not started). */
    getSnapshot() {
      return history.length ? history[history.length - 1] : null
    },

    /** Full history array (read-only copy). */
    getHistory() {
      return [...history]
    },

    /**
     * Subscribe to every tick.
     * @param {(frame: TelemetryFrame) => void} fn
     * @returns {() => void} unsubscribe function
     */
    subscribe(fn) {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },

    /** Manually inject an anomaly for testing. */
    injectAnomaly(sensorId, typeId = 'SPIKE') {
      const def    = SENSOR_DEFS[sensorId]
      const aType  = ANOMALY_TYPES[typeId]
      if (!def || !aType) throw new Error(`Unknown sensor "${sensorId}" or type "${typeId}"`)
      const range     = def.max - def.min
      const magnitude = rand(0.2, 0.4) * range *
                        (typeId === 'DROP' || typeId === 'DRIFT_LOW' ? -1 : 1)
      activeAnomalies[sensorId] = {
        sensorId,
        type: aType,
        ticksRemaining: anomalyDurationTicks,
        magnitude,
        startValue: sensorState[sensorId].value,
      }
    },

    /** Expose sensor definitions for UI labelling. */
    SENSOR_DEFS,
    ANOMALY_TYPES,
  }
}
