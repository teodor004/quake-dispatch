import { ACCEL_UNIT } from '../config'
import type { DeviceState } from '../lib/derive'
import { deviceKindLabel, formatAgo, formatNumber, formatTime } from '../lib/format'
import type { Device, Telemetry } from '../types'
import { ArmLabel } from './ArmLabel'
import { StatusLabel } from './StatusLabel'
import './DeviceTable.css'

interface Props {
  devices: Device[]
  latestById: Map<string, Telemetry>
  stateById: Map<string, DeviceState>
  selectedId: string | null
  serverNow: number
  onSelect: (id: string) => void
}

export function DeviceTable({ devices, latestById, stateById, selectedId, serverNow, onSelect }: Props) {
  return (
    <div className="table-wrap">
      <table className="table device-table">
        <thead>
          <tr>
            <th scope="col">Dispozitiv</th>
            <th scope="col">Tip</th>
            <th scope="col">Locație</th>
            <th scope="col">Stare</th>
            <th scope="col" className="num">
              Accelerație ({ACCEL_UNIT})
            </th>
            <th scope="col" className="num">
              Giroscop (rad/s)
            </th>
            <th scope="col">Ultima actualizare (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => {
            const t = latestById.get(d.id)
            const state = stateById.get(d.id) ?? 'offline'
            const selected = d.id === selectedId
            return (
              <tr
                key={d.id}
                data-state={state}
                data-selected={selected || undefined}
                onClick={() => onSelect(d.id)}
              >
                <td>
                  <button
                    type="button"
                    className="device-table-name"
                    id={`device-row-${d.id}`}
                    aria-pressed={selected}
                  >
                    {d.name}
                  </button>
                </td>
                <td>{deviceKindLabel[d.kind]}</td>
                <td>{d.locality}</td>
                <td>
                  <span className="device-table-state">
                    <StatusLabel state={state} />
                    {d.online && d.arming && <ArmLabel arming={d.arming} />}
                  </span>
                </td>
                <td className="num device-table-accel">{t ? formatNumber(t.accelMagnitude, 2) : '–'}</td>
                <td className="num">{t?.gyro ? formatNumber(t.gyro.rms, 3) : '–'}</td>
                <td className="device-table-seen">
                  {d.lastSeenAt ? (
                    <>
                      {formatTime(d.lastSeenAt)}
                      <span className="secondary">{formatAgo(d.lastSeenAt, serverNow)}</span>
                    </>
                  ) : (
                    <span className="secondary">niciun mesaj</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
