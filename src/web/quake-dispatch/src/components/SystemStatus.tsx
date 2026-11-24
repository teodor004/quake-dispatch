import type { ReactNode } from 'react'
import { useNow } from '../hooks/useNow'
import type { DashboardView } from '../lib/derive'
import { derivePipelineStatus, type PipelineNode, type SensorsNode } from '../lib/pipeline'
import type { SystemStatus as Status } from '../types'
import './SystemStatus.css'

interface Props {
  status: Status | null
  view: DashboardView | null
  apiConfigured: boolean
  failingSince: number | null
  error: Error | null
}

/** Requirement 3: is the pipeline healthy? Senzori → DynamoDB → API backend. */
export function SystemStatus({ status, view, apiConfigured, failingSince, error }: Props) {
  // Re-evaluated every second, so "fără răspuns de X s" keeps counting between polls.
  const now = useNow(1000)
  const p = derivePipelineStatus({
    apiConfigured,
    status,
    lastReceivedAt: view?.lastReceivedAt ?? null,
    error,
    failingSince,
    now,
  })

  return (
    <section className="pipeline" aria-labelledby="h-system">
      <h2 id="h-system" className="visually-hidden">
        Starea sistemului
      </h2>
      <div className="pipeline-flow">
        <Node
          label="Senzori"
          node={p.sensors}
          icon={<PhoneIcon />}
          value={<SensorsValue node={p.sensors} />}
          detail={p.sensors.arming && <ArmingDetail {...p.sensors.arming} />}
        />
        <Link active={p.links.sensorsToDb} />
        <Node label="DynamoDB" node={p.db} icon={<DatabaseIcon />} />
        <Link active={p.links.dbToApi} />
        <Node label="API backend" node={p.api} icon={<ServerIcon />} />
      </div>

      {!apiConfigured && (
        <p className="pipeline-notice">
          API-ul nu este configurat. Setează VITE_EVENTS_URL în .env.local ca să vezi date.
        </p>
      )}
    </section>
  )
}

function Node({
  label,
  node,
  icon,
  value,
  detail,
}: {
  label: string
  node: PipelineNode
  icon: ReactNode
  /** Richer markup for the value or detail; the plain text from `node` otherwise. */
  value?: ReactNode
  detail?: ReactNode
}) {
  return (
    <div className="pipeline-node" role="group" aria-label={node.ariaLabel} data-tone={node.tone} title={node.title}>
      <span className="pipeline-circle" aria-hidden="true">
        {icon}
        <span className="pipeline-badge" />
      </span>
      <span className="pipeline-label">{label}</span>
      <span className="pipeline-value">{value ?? node.value}</span>
      <span className="pipeline-detail">{detail || node.detail}</span>
    </div>
  )
}

function SensorsValue({ node }: { node: SensorsNode }) {
  return (
    <>
      <strong>{node.online ?? '?'}</strong>
      <span className="pipeline-of"> / {node.total ?? '?'}{node.online !== null && ' online'}</span>
    </>
  )
}

function ArmingDetail({ armed, unarmed }: { armed: number; unarmed: number }) {
  return (
    <>
      <span data-arm="armed">{armed} armate</span>
      {' · '}
      <span data-arm="unarmed">{unarmed} nearmate</span>
    </>
  )
}

function Link({ active }: { active: boolean }) {
  return (
    <span className="pipeline-link" data-active={active || undefined} aria-hidden="true">
      {active && (
        <>
          <span className="pipeline-dot" />
          <span className="pipeline-dot" />
          <span className="pipeline-dot" />
        </>
      )}
    </span>
  )
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="pipeline-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

function PhoneIcon() {
  return (
    <Icon>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </Icon>
  )
}

function DatabaseIcon() {
  return (
    <Icon>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
      <path d="M4.5 5.5v13c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-13" />
      <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
    </Icon>
  )
}

function ServerIcon() {
  return (
    <Icon>
      <rect x="3.5" y="3.5" width="17" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="17" height="7" rx="1.5" />
      <path d="M7.5 7h.01M7.5 17h.01" />
    </Icon>
  )
}
