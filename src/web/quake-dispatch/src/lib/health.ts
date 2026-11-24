export type Health = 'online' | 'degraded' | 'offline' | 'unknown'

export const healthText: Record<Health, string> = {
  online: 'Online',
  degraded: 'Degradat',
  offline: 'Offline',
  unknown: 'Necunoscut',
}
