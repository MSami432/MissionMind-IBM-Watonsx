/**
 * AIStatusBadge.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Resilient Graceful Fallback indicator.
 *
 * Displays one of two states:
 *   ● Green  "GRANITE (Live)"      — WatsonX proxy /api/health returned OK
 *   ● Yellow "SIMULATED (Fallback)" — proxy unreachable or credentials missing
 *
 * Props
 *   status  – 'live' | 'fallback' | 'checking'
 *   model   – string, e.g. 'granite-13b-chat-v2'  (shown when live)
 *   onRetry – () => void  optional callback to re-check connectivity
 */

import { Cpu, AlertTriangle, Loader, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

const CONFIGS = {
  live: {
    dot:      'bg-accent-green',
    border:   'border-accent-green/40',
    bg:       'bg-accent-green/10',
    text:     'text-accent-green',
    label:    'GRANITE',
    sublabel: 'Live',
    Icon:     Cpu,
    pulse:    false,
  },
  fallback: {
    dot:      'bg-accent-yellow animate-pulse-slow',
    border:   'border-accent-yellow/40',
    bg:       'bg-accent-yellow/10',
    text:     'text-accent-yellow',
    label:    'SIMULATED',
    sublabel: 'Fallback',
    Icon:     AlertTriangle,
    pulse:    true,
  },
  checking: {
    dot:      'bg-gray-500 animate-pulse-slow',
    border:   'border-gray-600',
    bg:       'bg-space-700',
    text:     'text-gray-400',
    label:    'CHECKING',
    sublabel: '…',
    Icon:     Loader,
    pulse:    false,
  },
}

export default function AIStatusBadge({ status = 'fallback', model, onRetry }) {
  const cfg = CONFIGS[status] ?? CONFIGS.fallback
  const { dot, border, bg, text, label, sublabel, Icon, pulse } = cfg

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs select-none',
        border, bg
      )}
      title={status === 'live'
        ? `Connected to WatsonX${model ? ` — model: ${model}` : ''}`
        : 'WatsonX unavailable — using simulated AI responses'
      }
    >
      {/* Animated dot */}
      <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', dot)} />

      {/* Icon */}
      <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', text,
        status === 'checking' && 'animate-spin'
      )} />

      {/* Label */}
      <span className={clsx('font-bold uppercase tracking-wider', text)}>
        {label}
      </span>
      <span className="text-gray-500">
        ({sublabel})
      </span>

      {/* Model name when live */}
      {status === 'live' && model && (
        <span className="text-gray-500 border-l border-accent-green/20 pl-2">
          {model}
        </span>
      )}

      {/* Retry button when in fallback */}
      {status === 'fallback' && onRetry && (
        <button
          onClick={onRetry}
          title="Re-check WatsonX connection"
          className="ml-0.5 text-gray-600 hover:text-accent-yellow transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
