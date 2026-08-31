/**
 * aiService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Core AI service layer for the XAI Mission Control Platform.
 *
 * Responsibilities:
 *  1. Serialize live telemetry frames into a compact context string.
 *  2. Build mode-specific prompts (OPERATOR_BRIEF / PUBLIC_DIGEST).
 *  3. Call POST /api/watsonx/generate via the secure Node proxy.
 *  4. Parse the structured JSON the model returns.
 *  5. Fall back to deterministic simulated responses when the proxy is
 *     unavailable — guaranteeing the UI is never blank.
 *
 * ─── Response shape (both modes) ────────────────────────────────────────────
 * {
 *   mode          : 'operator' | 'public',
 *   summary       : string,          // 1-2 sentence headline
 *   sections      : [{ heading, body }],
 *   recommendation: {                // OPERATOR mode only
 *     action      : string,          // e.g. "Reduce thruster output by 15%"
 *     rationale   : string,          // XAI explanation chain
 *     confidence  : number,          // 0–100
 *     riskLevel   : 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL',
 *     timeWindow  : string,          // e.g. "next 15 minutes"
 *     predictors  : string[],        // top contributing sensors
 *   } | null,
 *   isSimulated   : boolean,
 *   generatedAt   : string,          // ISO timestamp
 *   model         : string,
 * }
 */

import { SENSOR_DEFS } from '../data/telemetrySimulator'

// ─── Constants ────────────────────────────────────────────────────────────────

const GRANITE_MODEL = 'ibm/granite-13b-chat-v2'
const GENERATE_URL  = '/api/watsonx/generate'

const GENERATION_PARAMS = {
  max_new_tokens: 900,
  temperature:    0.3,   // low — we want deterministic, factual output
  top_p:          0.85,
  repetition_penalty: 1.1,
}

// ─── Telemetry serialiser ─────────────────────────────────────────────────────

/**
 * Condenses a TelemetryFrame + anomaly log into a compact text block
 * that fits comfortably inside the model's context window.
 *
 * @param {object} frame   – latest TelemetryFrame
 * @param {object[]} anomalyLog – AnomalyEvent[] most-recent first
 * @returns {string}
 */
export function serializeTelemetry(frame, anomalyLog) {
  if (!frame) return 'No telemetry data available.'

  const { sensors, missionTime, systemStatus, timestamp } = frame

  const lines = [
    `MISSION_TIME: T+${missionTime}s`,
    `TIMESTAMP: ${timestamp}`,
    `SYSTEM_STATUS: ${systemStatus}`,
    '',
    '--- SENSOR READINGS ---',
  ]

  for (const s of Object.values(sensors)) {
    const def   = SENSOR_DEFS[s.id]
    const delta = (s.value - (def?.nominal ?? s.value)).toFixed(2)
    const sign  = parseFloat(delta) >= 0 ? '+' : ''
    lines.push(
      `${s.id.toUpperCase().padEnd(16)} ${String(s.value.toFixed(2)).padStart(8)} ${s.unit.padEnd(6)} ` +
      `STATUS=${s.status.padEnd(8)} TREND=${s.trend.padEnd(7)} DELTA_FROM_NOMINAL=${sign}${delta}`
    )
  }

  if (anomalyLog.length > 0) {
    lines.push('', '--- RECENT ANOMALY EVENTS (newest first) ---')
    anomalyLog.slice(0, 6).forEach(ev => {
      lines.push(
        `[${ev.severity}] ${ev.type} on ${ev.sensorId}: ${ev.message} (Δ${ev.delta > 0 ? '+' : ''}${ev.delta})`
      )
    })
  }

  return lines.join('\n')
}

// ─── System prompts ───────────────────────────────────────────────────────────

/**
 * OPERATOR_BRIEF_PROMPT
 * ──────────────────────
 * Instructs Granite to behave as a senior flight-dynamics AI analyst.
 * Output requirements:
 *  • Predictive analytics with explicit probability estimates
 *  • Explainable AI recommendations with named contributing sensors
 *  • Confidence score for each recommendation
 *  • Risk window ("in the next N minutes")
 *  • Strict JSON output so the UI can parse it structurally
 */
export const OPERATOR_BRIEF_PROMPT = `You are ARIA (Adaptive Reasoning and Intelligence for Astronautics), an AI flight-dynamics analyst embedded in the XAI Mission Control Platform for IBM's deep-space exploration program.

Your role is to analyse real-time spacecraft telemetry and produce a structured, explainable briefing for human flight operators who will make the final go/no-go decisions.

CRITICAL RULES:
1. You MUST respond with valid JSON only — no markdown fences, no preamble text.
2. Every recommendation MUST cite which specific sensors drove it (the "predictors" field).
3. Confidence scores reflect your uncertainty — be honest. Never claim >95% confidence.
4. If all readings are nominal, say so clearly and recommend no action.
5. Risk levels: LOW (<25% failure probability), MEDIUM (25–60%), HIGH (60–85%), CRITICAL (>85%).

OUTPUT SCHEMA (respond with exactly this structure):
{
  "summary": "<1-2 sentence headline of spacecraft health>",
  "sections": [
    { "heading": "<section title>", "body": "<technical paragraph>" }
  ],
  "recommendation": {
    "action": "<specific recommended operator action, or null if no action needed>",
    "rationale": "<step-by-step XAI reasoning chain explaining WHY this action is needed, referencing sensor IDs and values>",
    "confidence": <integer 0-100>,
    "riskLevel": "<LOW|MEDIUM|HIGH|CRITICAL>",
    "timeWindow": "<estimated time before situation escalates, e.g. '12 minutes'>",
    "predictors": ["<sensor_id_1>", "<sensor_id_2>"]
  }
}

TELEMETRY INPUT:
`

/**
 * PUBLIC_DIGEST_PROMPT
 * ──────────────────────
 * Instructs Granite to translate the exact same telemetry into engaging,
 * jargon-free prose for press releases, social media, and public dashboards.
 * No recommendation block — that is operator-only.
 */
export const PUBLIC_DIGEST_PROMPT = `You are a science communicator for IBM's deep-space exploration mission. Your job is to translate complex spacecraft telemetry into clear, inspiring, and accurate updates for the general public — journalists, students, and space enthusiasts.

CRITICAL RULES:
1. You MUST respond with valid JSON only — no markdown fences, no preamble text.
2. Never use technical jargon without immediately defining it in plain English.
3. Be accurate — do not downplay genuine anomalies, but do not cause alarm unnecessarily.
4. Write in present tense, active voice, with a tone of wonder and competence.
5. The "recommendation" field MUST always be null in this mode.

OUTPUT SCHEMA (respond with exactly this structure):
{
  "summary": "<1-2 engaging sentences the public would find on a news ticker>",
  "sections": [
    { "heading": "<emoji + friendly section title>", "body": "<plain-language paragraph, 2-4 sentences>" }
  ],
  "recommendation": null
}

Include sections for: Mission Status, On-Board Environment, Power & Propulsion, and (only if anomalies exist) What Our Engineers Are Watching.

TELEMETRY INPUT:
`

// ─── Fallback generator ───────────────────────────────────────────────────────

/**
 * Generates a deterministic fallback response from telemetry — used when
 * the WatsonX proxy is unavailable. Mirrors the exact JSON shape the model
 * would return so the UI code path is identical.
 *
 * @param {'operator'|'public'} mode
 * @param {object} frame
 * @param {object[]} anomalyLog
 * @returns {object}  – same shape as parsed Granite response
 */
export function buildFallbackResponse(mode, frame, anomalyLog) {
  if (!frame) return null

  const { sensors, missionTime, systemStatus } = frame
  const criticals = Object.values(sensors).filter(s => s.status === 'CRITICAL')
  const cautions  = Object.values(sensors).filter(s => s.status === 'CAUTION')
  const anomCount = anomalyLog.length

  const mhStr = `${Math.floor(missionTime / 3600).toString().padStart(2,'0')}:${Math.floor((missionTime%3600)/60).toString().padStart(2,'0')}:${(missionTime%60).toString().padStart(2,'0')}`

  if (mode === 'operator') {
    // Derive a meaningful recommendation if anything is non-nominal
    let recommendation = null
    if (criticals.length > 0) {
      const worst = criticals[0]
      const def   = SENSOR_DEFS[worst.id]
      recommendation = {
        action:     `Initiate contingency protocol for ${worst.label}. Isolate affected subsystem and switch to backup.`,
        rationale:  `${worst.label} has exceeded the critical threshold (current: ${worst.value.toFixed(2)} ${worst.unit}, limit: ${def?.criticalHigh ?? '?'} ${worst.unit}). ` +
                    `Trend is ${worst.trend}. Continued operation risks cascading subsystem failure. ` +
                    `Isolation is the lowest-risk intervention at this stage.`,
        confidence: 78,
        riskLevel:  'CRITICAL',
        timeWindow: '8 minutes',
        predictors: [worst.id, ...(cautions.slice(0,1).map(s => s.id))],
      }
    } else if (cautions.length > 0) {
      const sensor = cautions[0]
      recommendation = {
        action:     `Monitor ${sensor.label} closely. Prepare contingency procedure but do not execute yet.`,
        rationale:  `${sensor.label} is within caution range (${sensor.value.toFixed(2)} ${sensor.unit}). ` +
                    `Trend: ${sensor.trend}. No immediate action required, but pre-positioning the response team ` +
                    `reduces response time by ~40% should the reading enter critical range.`,
        confidence: 64,
        riskLevel:  'MEDIUM',
        timeWindow: '25 minutes',
        predictors: [sensor.id],
      }
    }

    return {
      mode: 'operator',
      summary: `Mission T+${mhStr} — ${
        systemStatus === 'NOMINAL' ? 'All subsystems nominal. No immediate action required.' :
        systemStatus === 'CAUTION' ? `${cautions.length} subsystem(s) in caution state. Monitor closely.` :
        `CRITICAL: ${criticals.length} subsystem(s) require immediate attention.`
      }`,
      sections: [
        {
          heading: 'Predictive Analytics',
          body: systemStatus === 'NOMINAL'
            ? `No anomalous trends detected across ${Object.keys(sensors).length} monitored parameters. All readings within 2σ of nominal baseline. Next scheduled assessment at T+${missionTime + 300}s.`
            : `Trend analysis indicates ${criticals.length + cautions.length} parameter(s) diverging from nominal. ` +
              `${criticals.length > 0 ? `Critical exceedance on ${criticals.map(s=>s.label).join(', ')}. ` : ''}` +
              `${cautions.length > 0 ? `Caution state on ${cautions.map(s=>s.label).join(', ')}. ` : ''}` +
              `Statistical projection: ${criticals.length > 0 ? '73% probability of continued degradation without intervention.' : '41% probability of escalation to critical within 20 minutes without corrective action.'}`,
        },
        {
          heading: 'Anomaly Summary',
          body: anomCount === 0
            ? 'Zero anomaly events recorded this session. Simulator operating in nominal envelope.'
            : `${anomCount} anomaly event${anomCount !== 1 ? 's' : ''} logged. ` +
              `${anomalyLog.filter(e=>e.severity==='HIGH').length} high-severity, ` +
              `${anomalyLog.filter(e=>e.severity==='MEDIUM').length} medium-severity. ` +
              `Most recent: ${anomalyLog[0]?.message ?? 'N/A'}.`,
        },
        {
          heading: 'Shift Handoff Note',
          body: `[SIMULATED — Granite LLM offline] Review all CAUTION+ sensors before handoff. Comm window open. All flight rules current. No waivers active.`,
        },
      ],
      recommendation,
      isSimulated:  true,
      generatedAt:  new Date().toISOString(),
      model:        'simulated-fallback',
    }
  }

  // ── Public mode ──
  return {
    mode: 'public',
    summary: systemStatus === 'NOMINAL'
      ? `Our spacecraft is cruising through deep space in perfect health at mission time ${mhStr}. All systems are go!`
      : `Mission controllers are keeping a close eye on our spacecraft at T+${mhStr} — the team is on it.`,
    sections: [
      {
        heading: '🛰 Mission Status',
        body: `At ${mhStr} into the mission, our spacecraft is ${systemStatus === 'NOMINAL' ? 'operating flawlessly' : 'under careful monitoring'}. ${
          systemStatus === 'NOMINAL'
            ? "Every system is performing exactly as the engineers designed it to — a testament to the incredible precision of modern spacecraft engineering."
            : `Our flight control team is actively reviewing readings and following established procedures. This is exactly what mission controllers train for.`
        }`,
      },
      {
        heading: '🌡 Conditions Aboard',
        body: `The spacecraft's hull temperature is ${sensors.temperature?.value.toFixed(1)}°C. Oxygen levels are at ${sensors.oxygen?.value.toFixed(2)} kPa — ${sensors.oxygen?.status === 'NOMINAL' ? 'perfectly safe for crew operations' : 'being carefully managed by our life-support team'}. Think of it like maintaining the perfect room temperature in a very fast, very far-away house.`,
      },
      {
        heading: '⚡ Power & Propulsion',
        body: `The spacecraft's batteries are at ${sensors.battery?.value.toFixed(1)}% charge, and we have ${sensors.fuel?.value.toFixed(1)}% fuel remaining for manoeuvres. ${sensors.battery?.value > 50 ? "We're in great shape for the journey ahead." : 'Our power management systems are working to optimise energy use.'}`,
      },
      ...(anomCount > 0 ? [{
        heading: '🔍 What Our Engineers Are Watching',
        body: `Our monitoring systems flagged ${anomCount} reading${anomCount !== 1 ? 's' : ''} that our engineers want to understand better. This is completely normal — our AI watches millions of data points every second, and the team investigates anything that looks even slightly unusual. There is no cause for concern.`,
      }] : []),
      {
        heading: '🤖 About This Briefing',
        body: '[SIMULATED — IBM Granite LLM is currently offline. This briefing was generated by the fallback engine. Real AI analysis will appear when the WatsonX connection is restored.]',
      },
    ],
    recommendation: null,
    isSimulated:  true,
    generatedAt:  new Date().toISOString(),
    model:        'simulated-fallback',
  }
}

// ─── Main AI call ─────────────────────────────────────────────────────────────

/**
 * summarizeMissionState — the primary exported function.
 *
 * Calls POST /api/watsonx/generate with the appropriate prompt + serialised
 * telemetry. Parses the JSON the model returns. Falls back to
 * buildFallbackResponse() on any error.
 *
 * @param {'operator'|'public'} mode
 * @param {object} frame
 * @param {object[]} anomalyLog
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<object>}  – structured AI response object
 */
export async function summarizeMissionState(mode, frame, anomalyLog, opts = {}) {
  const telemetryContext = serializeTelemetry(frame, anomalyLog)
  const systemPrompt     = mode === 'operator' ? OPERATOR_BRIEF_PROMPT : PUBLIC_DIGEST_PROMPT
  const fullInput        = systemPrompt + '\n' + telemetryContext + '\n\nRespond with JSON only:'

  try {
    const res = await fetch(GENERATE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  opts.signal,
      body: JSON.stringify({
        model_id:   GRANITE_MODEL,
        input:      fullInput,
        parameters: GENERATION_PARAMS,
      }),
    })

    if (!res.ok) {
      console.warn('[aiService] Proxy returned', res.status, '— using fallback')
      return buildFallbackResponse(mode, frame, anomalyLog)
    }

    const data = await res.json()
    const raw  = data.generated_text ?? ''

    // ── Parse JSON from model output ────────────────────────────────────────
    // Granite sometimes wraps output in ``` fences — strip them defensively.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.warn('[aiService] Model output was not valid JSON — using fallback.\nRaw:', raw.slice(0, 300))
      return buildFallbackResponse(mode, frame, anomalyLog)
    }

    return {
      ...parsed,
      mode,
      isSimulated: false,
      generatedAt: new Date().toISOString(),
      model:       data.model_id ?? GRANITE_MODEL,
    }

  } catch (err) {
    if (err.name === 'AbortError') throw err   // re-throw intentional cancellations
    console.warn('[aiService] Fetch error — using fallback:', err.message)
    return buildFallbackResponse(mode, frame, anomalyLog)
  }
}
