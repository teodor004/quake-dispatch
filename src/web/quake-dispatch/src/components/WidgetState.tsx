import { ToneIcon } from './StatusBadge'
import './WidgetState.css'

export type WidgetStateKind = 'loading' | 'empty' | 'error' | 'setup'

interface Props {
  kind: WidgetStateKind
  message: string
  /** Reserved height, so the layout does not jump when data arrives. */
  height?: number
}

/** The one placeholder used by every widget: no widget is ever left blank. */
export function WidgetState({ kind, message, height }: Props) {
  return (
    <div className="widget-state" data-kind={kind} style={height ? { minHeight: height } : undefined} role="status">
      {kind === 'loading' && <span className="widget-state-spinner" aria-hidden="true" />}
      {kind === 'error' && <ToneIcon tone="down" />}
      {kind === 'setup' && <ToneIcon tone="unknown" />}
      <span>{message}</span>
    </div>
  )
}
