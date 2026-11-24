import { describeDisarm } from '../lib/arming'
import type { Arming } from '../types'
import './ArmLabel.css'

/** Armed / unarmed tag shown next to the online state. */
export function ArmLabel({ arming }: { arming: Arming }) {
  if (arming.state === 'armed') {
    return (
      <span
        className="arm-label"
        data-arm="armed"
        title="Telefonul stă nemișcat și participă la detectarea cutremurelor."
      >
        Armat
      </span>
    )
  }

  const { staticSec, armingSec } = arming
  const inProgress = armingSec > 0 && staticSec > 0 && staticSec < armingSec
  const reason = describeDisarm(arming.disarmReason)
  const title = [
    'Telefonul nu participă la detectare.',
    reason && `Motiv: ${reason}.`,
    armingSec > 0 && `Se armează după ${armingSec} s în care stă nemișcat.`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className="arm-label" data-arm="unarmed" title={title}>
      Nearmat
      {inProgress && (
        <span className="arm-label-progress">
          {' '}
          · {staticSec}/{armingSec} s
        </span>
      )}
    </span>
  )
}
