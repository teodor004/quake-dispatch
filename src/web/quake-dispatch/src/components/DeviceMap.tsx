import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { DeviceState } from '../lib/derive'
import { deviceKindLabel, formatDateTime, formatNumber } from '../lib/format'
import { formatIntensity } from '../lib/intensity'
import { usePalette } from '../lib/palette'
import type { Device, Event } from '../types'
import './DeviceMap.css'

interface Props {
  devices: Device[]
  stateById: Map<string, DeviceState>
  selectedId: string | null
  activeEvent: Event | null
  /** Past earthquakes, drawn at their estimated epicenter. */
  events: Event[]
  onSelect: (id: string) => void
}

const ROMANIA: [[number, number], [number, number]] = [
  [43.6, 20.2],
  [48.3, 29.8],
]

export default function DeviceMap({ devices, stateById, selectedId, activeEvent, events, onSelect }: Props) {
  const palette = usePalette()
  const withoutGps = devices.filter((d) => !d.location).length
  const past = events.filter((e) => e.status === 'ended' && e.epicenter)
  const fillFor: Record<DeviceState, string> = {
    above: palette.alert,
    online: palette.online,
    offline: palette.surface,
  }
  return (
    <div className="device-map">
      <MapContainer
        bounds={ROMANIA}
        boundsOptions={{ padding: [4, 4] }}
        zoomSnap={0.25}
        scrollWheelZoom
        wheelPxPerZoomLevel={120}
        className="device-map-canvas"
        attributionControl
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={18}
        />
        <KeepSized />

        {past.map((e) => (
          <CircleMarker
            key={e.id}
            center={[e.epicenter!.lat, e.epicenter!.lon]}
            radius={9}
            pathOptions={{ color: palette.alert, weight: 2, fillColor: palette.alert, fillOpacity: 0.15 }}
          >
            <Tooltip direction="top" offset={[0, -8]} className="device-map-tip">
              <strong>{e.region ?? 'Zonă nedeterminată'}</strong>
              <br />
              {formatDateTime(e.startedAt)} UTC
              <br />
              {formatIntensity(e.peakAccel)}, PGA {formatNumber(e.peakAccel, 2)} m/s²
            </Tooltip>
          </CircleMarker>
        ))}

        {activeEvent?.epicenter && (
          <>
            <CircleMarker
              center={[activeEvent.epicenter.lat, activeEvent.epicenter.lon]}
              radius={22}
              interactive={false}
              pathOptions={{ color: palette.alert, weight: 2, dashArray: '5 4', fill: false }}
            />
            <CircleMarker
              center={[activeEvent.epicenter.lat, activeEvent.epicenter.lon]}
              radius={4}
              interactive={false}
              pathOptions={{ color: palette.alert, weight: 0, fillColor: palette.alert, fillOpacity: 1 }}
            />
          </>
        )}

        {devices.map((d) => {
          if (!d.location) return null
          const state = stateById.get(d.id) ?? 'offline'
          const selected = d.id === selectedId
          return (
            <CircleMarker
              key={d.id}
              center={[d.location.lat, d.location.lon]}
              radius={selected ? 10 : 7}
              pathOptions={{
                color: selected ? palette.ink : state === 'offline' ? palette.offline : palette.surface,
                weight: selected ? 3 : 2,
                fillColor: fillFor[state],
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSelect(d.id) }}
            >
              <Tooltip direction="top" offset={[0, -8]} className="device-map-tip">
                <strong>{d.name}</strong> {d.locality}
                <br />
                {deviceKindLabel[d.kind]}, {state === 'offline' ? 'offline' : state === 'above' ? 'peste prag' : 'online'}
                <br />
                <span className="device-map-tip-hint">{selected ? 'Profil deschis' : 'Click pentru detalii'}</span>
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>

      <ul className="device-map-legend">
        <li>
          <span className="dot" data-state="online" /> Online
        </li>
        <li>
          <span className="dot" data-state="above" /> Peste prag
        </li>
        <li>
          <span className="dot" data-state="offline" /> Offline
        </li>
        {withoutGps > 0 && (
          <li>
            {withoutGps} {withoutGps === 1 ? 'senzor' : 'senzori'} fără GPS, doar în tabel
          </li>
        )}
        {past.length > 0 && (
          <li>
            <span className="device-map-legend-past" /> Cutremur anterior
          </li>
        )}
        {activeEvent?.epicenter && (
          <li>
            <span className="device-map-legend-epi" /> Epicentru estimat
          </li>
        )}
      </ul>
    </div>
  )
}

/** Leaflet measures its container once; re-measure when the layout changes (e.g. the side panel opens). */
function KeepSized() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [map])
  return null
}
