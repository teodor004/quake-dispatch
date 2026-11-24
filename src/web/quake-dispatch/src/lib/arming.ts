/** Backend reason codes (ingest.py, preprocess.py, process.py) in plain words. */
const reasonText: Record<string, string> = {
  TILT_CHANGE: 'telefonul a fost înclinat',
  INTRA_BATCH_TILT: 'telefonul a fost înclinat',
  BASELINE_TILT_DRIFT: 'telefonul și-a schimbat poziția',
  HIGH_GYRO: 'telefonul a fost mișcat',
  GYRO_RMS_HIGH: 'telefonul a fost mișcat',
  GYRO_PEAK_HIGH: 'telefonul a fost mișcat',
  HUMAN_HANDLING: 'telefonul este manevrat',
  ACC_RMS_HIGH: 'vibrații puternice',
  ACC_PGA_HIGH: 'vibrații puternice',
  PERSISTENT_DISTURBANCE: 'vibrații care nu se opresc',
  NO_GYRO: 'nu trimite date de la giroscop',
  NO_ACC: 'nu trimite date de la accelerometru',
}

export function describeDisarm(reason: string | null): string | null {
  if (!reason) return null
  const parts = [...new Set(reason.split(',').map((r) => reasonText[r.trim()] ?? r.trim()))]
  return parts.join(', ')
}
