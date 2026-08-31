/**
 * proxy.js  –  Secure WatsonX API Proxy
 * ─────────────────────────────────────────────────────────────────────────────
 * This Express server runs locally (or on a trusted host) and acts as the ONLY
 * process that ever sees WATSONX_API_KEY / WATSONX_PROJECT_ID. The React
 * frontend never touches those values; it calls /api/* and this proxy injects
 * the credentials server-side before forwarding to IBM Cloud.
 *
 * Security measures applied:
 *  • helmet      – sets secure HTTP headers
 *  • cors         – restricts CORS to the Vite dev origin (configurable)
 *  • rate-limit   – caps requests per IP to prevent key abuse
 *  • No credentials are ever echoed back in a response
 *  • .env is read server-side only; never imported by any frontend module
 *
 * Start: node proxy.js
 * Port:  3001 (change via PORT env var)
 */

import 'dotenv/config'
import express          from 'express'
import cors             from 'cors'
import helmet           from 'helmet'
import { rateLimit }    from 'express-rate-limit'
import fetch            from 'node-fetch'

// ─── Config validation ────────────────────────────────────────────────────────

const REQUIRED_ENV = ['WATSONX_API_KEY', 'WATSONX_PROJECT_ID']
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.warn(
    `[proxy] ⚠  Missing env vars: ${missing.join(', ')}.\n` +
    `         Copy .env.example → .env and fill in real values.\n` +
    `         WatsonX endpoints will return 503 until credentials are set.`
  )
}

const {
  WATSONX_API_KEY    = '',
  WATSONX_PROJECT_ID = '',
  WATSONX_REGION     = 'us-south',
  PORT               = '3001',
  ALLOWED_ORIGIN     = 'http://localhost:5173',
} = process.env

// IBM Cloud IAM token endpoint
const IAM_TOKEN_URL  = 'https://iam.cloud.ibm.com/identity/token'
// WatsonX.ai inference base URL (region-aware)
const WATSONX_BASE   = `https://${WATSONX_REGION}.ml.cloud.ibm.com/ml/v1`

// ─── Express setup ────────────────────────────────────────────────────────────

const app = express()

app.use(helmet())
app.use(express.json({ limit: '32kb' }))
app.use(cors({
  origin:      ALLOWED_ORIGIN,
  methods:     ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}))

// Rate limit: 60 requests / 1 minute per IP
app.use('/api', rateLimit({
  windowMs:  60 * 1000,
  max:       60,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests — slow down.' },
}))

// ─── IAM token cache ──────────────────────────────────────────────────────────
// IBM IAM tokens expire after 1 hour; cache them to avoid hammering the endpoint.

let _tokenCache = { token: null, expiresAt: 0 }

async function getIAMToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token
  }

  if (!WATSONX_API_KEY) throw new Error('WATSONX_API_KEY not set')

  const res = await fetch(IAM_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey:     WATSONX_API_KEY,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`IAM token request failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  // Cache until 5 minutes before expiry
  _tokenCache = {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  }
  return _tokenCache.token
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * Frontend liveness check — safe to expose, returns no secrets.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    status:    'ok',
    region:    WATSONX_REGION,
    credsSset: Boolean(WATSONX_API_KEY && WATSONX_PROJECT_ID),
  })
})

/**
 * POST /api/watsonx/generate
 * Proxies a text-generation request to WatsonX.ai.
 *
 * Request body (from frontend):
 * {
 *   model_id : string,          // e.g. "ibm/granite-13b-chat-v2"
 *   input    : string,          // the prompt
 *   parameters: {               // optional overrides
 *     max_new_tokens : number,
 *     temperature    : number,
 *     ...
 *   }
 * }
 *
 * The proxy injects project_id and the Authorization header — the frontend
 * never sees or sends these.
 */
app.post('/api/watsonx/generate', async (req, res) => {
  if (!WATSONX_API_KEY || !WATSONX_PROJECT_ID) {
    return res.status(503).json({ error: 'WatsonX credentials not configured on server.' })
  }

  const { model_id, input, parameters = {} } = req.body

  if (!model_id || !input) {
    return res.status(400).json({ error: '`model_id` and `input` are required.' })
  }

  try {
    const token = await getIAMToken()

    const watsonxRes = await fetch(
      `${WATSONX_BASE}/text/generation?version=2023-05-29`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          model_id,
          input,
          project_id: WATSONX_PROJECT_ID,
          parameters: {
            max_new_tokens: 512,
            temperature:    0.7,
            top_p:          0.9,
            ...parameters,
          },
        }),
      }
    )

    const data = await watsonxRes.json()

    if (!watsonxRes.ok) {
      console.error('[proxy] WatsonX error:', data)
      return res.status(watsonxRes.status).json({ error: data?.errors?.[0]?.message ?? 'WatsonX request failed.' })
    }

    // Forward only the model response — never the raw token or project_id
    return res.json({
      generated_text: data?.results?.[0]?.generated_text ?? '',
      stop_reason:    data?.results?.[0]?.stop_reason    ?? '',
      model_id:       data?.model_id                     ?? model_id,
    })

  } catch (err) {
    console.error('[proxy] Unexpected error:', err.message)
    return res.status(500).json({ error: 'Internal proxy error.' })
  }
})

/**
 * POST /api/watsonx/stream  (SSE streaming — scaffold for Task 3+)
 * Returns a Server-Sent Events stream from WatsonX text generation.
 * Currently returns 501 until implemented.
 */
app.post('/api/watsonx/stream', (_req, res) => {
  res.status(501).json({ error: 'Streaming endpoint not yet implemented.' })
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(Number(PORT), () => {
  console.log(`[proxy] 🛰  WatsonX proxy running on http://localhost:${PORT}`)
  console.log(`[proxy]    Allowed origin : ${ALLOWED_ORIGIN}`)
  console.log(`[proxy]    Region         : ${WATSONX_REGION}`)
  console.log(`[proxy]    Credentials    : ${WATSONX_API_KEY ? '✓ set' : '✗ MISSING'}`)
})
