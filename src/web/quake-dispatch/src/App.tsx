import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api, apiConfigured } from './api'
import { DevicePanel } from './components/DevicePanel'
import { DeviceTable } from './components/DeviceTable'
import { EventsTable } from './components/EventsTable'
import { HistoryChart } from './components/HistoryChart'
import { LatestValues } from './components/LatestValues'
import { StatusHeader } from './components/StatusHeader'
import { SystemStatus } from './components/SystemStatus'
import { TriggerTimeline } from './components/TriggerTimeline'
import { WidgetState } from './components/WidgetState'
import { POLL_INTERVAL_MS, QUAKE_MIN_DEVICES } from './config'
import { usePolling } from './hooks/usePolling'
import { deriveView } from './lib/derive'
import { waitingState } from './lib/waiting'
import './App.css'

// Leaflet is the heaviest dependency; load it after the first paint.
const DeviceMap = lazy(() => import('./components/DeviceMap'))

const HASH_KEY = 'dispozitiv'
function readHash() {
  return new URLSearchParams(window.location.hash.slice(1)).get(HASH_KEY)
}

export default function App() {
  const snapshot = usePolling((signal) => api.getSnapshot(signal), {
    intervalMs: POLL_INTERVAL_MS,
    enabled: apiConfigured,
  })
  const [selectedId, setSelectedId] = useState<string | null>(readHash)

  // The open profile lives in the URL (#dispozitiv=p-01), so it can be linked and survives a reload.
  useEffect(() => {
    const hash = selectedId ? `#${HASH_KEY}=${encodeURIComponent(selectedId)}` : ''
    if (window.location.hash !== hash) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
    }
  }, [selectedId])

  useEffect(() => {
    const onHash = () => setSelectedId(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const closeProfile = useCallback(() => setSelectedId(null), [])

  const data = snapshot.data
  const view = data ? deriveView(data) : null
  const selected = view && selectedId ? view.deviceById.get(selectedId) : undefined
  const wait = waitingState(apiConfigured, snapshot.error)

  return (
    <div className="app" data-drawer={selected ? true : undefined}>
      <StatusHeader
        activeEvent={view?.activeEvent ?? null}
        calmText={
          view
            ? 'Nicio activitate seismică'
            : !apiConfigured
              ? 'Fără sursă de date'
              : snapshot.error
                ? 'Fără conexiune la API'
                : 'Se conectează la rețea'
        }
      />

      <main className="dashboard">
        <h1 className="visually-hidden">quake-dispatch, monitorizarea rețelei de senzori seismici</h1>

        {/* 1. Latest values */}
        <LatestValues
          view={view}
          apiConfigured={apiConfigured}
          error={snapshot.error}
          updatedAt={snapshot.updatedAt}
        />

        {/* 3. System state, kept right under the values it qualifies */}
        <SystemStatus
          status={data?.status ?? null}
          view={view}
          apiConfigured={apiConfigured}
          failingSince={snapshot.failingSince}
          error={snapshot.error}
        />

        {/* 2. History */}
        <div className="dashboard-grid">
          <HistoryChart
            view={view}
            liveHistory={data?.history ?? null}
            apiConfigured={apiConfigured}
            error={snapshot.error}
          />

          <section className="panel area-map" aria-labelledby="h-map">
            <div className="panel-head">
              <h2 id="h-map" className="panel-title">
                Harta rețelei
              </h2>
              {view && (
                <p className="panel-note">
                  {view.devices.length} senzori ·{' '}
                  {view.events.filter((e) => e.epicenter).length} epicentre ·{' '}
                  <strong className="panel-hint">apasă un senzor pentru detalii</strong>
                </p>
              )}
            </div>
            <div className="panel-body area-map-body">
              {view ? (
                <Suspense fallback={<WidgetState kind="loading" message="Se încarcă harta" height={400} />}>
                  <DeviceMap
                    devices={view.devices}
                    stateById={view.stateById}
                    selectedId={selectedId}
                    activeEvent={view.activeEvent}
                    events={view.events}
                    onSelect={setSelectedId}
                  />
                </Suspense>
              ) : (
                <WidgetState kind={wait.kind} message={wait.message} height={400} />
              )}
            </div>
          </section>

          <section className="panel area-events" aria-labelledby="h-events">
            <div className="panel-head">
              <h2 id="h-events" className="panel-title">
                Cutremure detectate
              </h2>
              <p className="panel-note">Confirmate de cel puțin {QUAKE_MIN_DEVICES} senzori · ultimele 10</p>
            </div>
            {view ? (
              view.events.length > 0 ? (
                <EventsTable events={view.events} serverNow={view.serverNow} />
              ) : (
                <div className="panel-body">
                  <WidgetState kind="empty" message="Rețeaua nu a confirmat încă niciun cutremur." />
                </div>
              )
            ) : (
              <div className="panel-body">
                <WidgetState kind={wait.kind} message={wait.message} height={160} />
              </div>
            )}
          </section>

          <section className="panel area-timeline" aria-labelledby="h-timeline">
            <div className="panel-head">
              <h2 id="h-timeline" className="panel-title">
                Depășiri ale pragului
              </h2>
              <p className="panel-note">pe senzor, ultimele 50</p>
            </div>
            <div className="panel-body area-timeline-body">
              {view ? (
                <TriggerTimeline
                  triggers={view.triggers}
                  events={view.events}
                  deviceById={view.deviceById}
                  serverNow={view.serverNow}
                  onSelectDevice={setSelectedId}
                />
              ) : (
                <WidgetState kind={wait.kind} message={wait.message} height={160} />
              )}
            </div>
          </section>

          <section className="panel area-devices" aria-labelledby="h-devices">
            <div className="panel-head">
              <h2 id="h-devices" className="panel-title">
                Dispozitive
              </h2>
              {data && (
                <p className="panel-note">
                  apasă pe un dispozitiv pentru detalii
                </p>
              )}
            </div>
            {view ? (
              view.devices.length > 0 ? (
                <DeviceTable
                  devices={view.devices}
                  latestById={view.latestById}
                  stateById={view.stateById}
                  selectedId={selectedId}
                  serverNow={view.serverNow}
                  onSelect={setSelectedId}
                />
              ) : (
                <div className="panel-body">
                  <WidgetState kind="empty" message="Niciun dispozitiv înregistrat încă." />
                </div>
              )
            ) : (
              <div className="panel-body">
                <WidgetState kind={wait.kind} message={wait.message} height={160} />
              </div>
            )}
          </section>
        </div>
      </main>

      {view && selected && (
        <div className="drawer">
          <DevicePanel
            device={selected}
            telemetry={view.latestById.get(selected.id)}
            state={view.stateById.get(selected.id) ?? 'offline'}
            triggers={view.triggers}
            events={view.events}
            deviceById={view.deviceById}
            threshold={view.threshold}
            serverNow={view.serverNow}
            onClose={closeProfile}
          />
        </div>
      )}
    </div>
  )
}
