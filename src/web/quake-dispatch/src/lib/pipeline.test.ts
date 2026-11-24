import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/types'
import type { SystemStatus } from '../types'
import { derivePipelineStatus, type PipelineInput } from './pipeline'

const NOW = Date.parse('2026-11-21T12:00:00Z')

const status: SystemStatus = {
  generatedAt: new Date(NOW).toISOString(),
  devicesTotal: 13,
  devicesOnline: 11,
  devicesArmed: 9,
  devicesUnarmed: 2,
  messagesPerSecond: 3.2,
  responseMs: 142,
  latencyP50Ms: null,
  latencyP95Ms: null,
  triggerThreshold: 1,
}

function derive(over: Partial<PipelineInput> = {}) {
  return derivePipelineStatus({
    apiConfigured: true,
    status,
    lastReceivedAt: NOW - 2_000,
    error: null,
    failingSince: null,
    now: NOW,
    ...over,
  })
}

const dbUnavailable = new ApiError('Baza de date nu răspunde.', 503, 'db_unavailable')
const noAnswer = new ApiError('API-ul nu poate fi contactat.')

describe('derivePipelineStatus', () => {
  it('everything working: green nodes, both links flowing', () => {
    const p = derive()
    expect(p.sensors).toMatchObject({
      tone: 'ok',
      online: 11,
      total: 13,
      arming: { armed: 9, unarmed: 2 },
      ariaLabel: 'Senzori: 11 din 13 online, 9 armate, 2 nearmate',
    })
    expect(p.db).toMatchObject({ tone: 'ok', value: 'Online', detail: '3,2 scrieri/s' })
    expect(p.api).toMatchObject({ tone: 'ok', value: 'Online', detail: 'răspunde în 142 ms' })
    expect(p.links).toEqual({ sensorsToDb: true, dbToApi: true })
  })

  it('no sensor online: red sensors, idle database, API still flowing from the database', () => {
    const p = derive({
      status: { ...status, devicesOnline: 0, devicesArmed: 0, devicesUnarmed: 0, messagesPerSecond: 0 },
      lastReceivedAt: NOW - 5 * 60_000,
    })
    expect(p.sensors).toMatchObject({ tone: 'down', value: '0 / 13 online', detail: '0 armate · 0 nearmate' })
    expect(p.db).toMatchObject({ tone: 'warn', value: 'Online, inactivă', detail: 'fără scrieri noi' })
    expect(p.api.tone).toBe('ok')
    expect(p.links).toEqual({ sensorsToDb: false, dbToApi: false })
  })

  it('stale readings count as no new writes even with a rate from the last minute', () => {
    expect(derive({ lastReceivedAt: NOW - 45_000 }).db.tone).toBe('warn')
  })

  it('503 db_unavailable: database offline, API up without data, sensors unknown', () => {
    const p = derive({ error: dbUnavailable, failingSince: NOW - 4_000 })
    expect(p.db).toMatchObject({ tone: 'down', value: 'Offline', detail: 'eroare db_unavailable' })
    expect(p.api).toMatchObject({ tone: 'warn', value: 'Online, fără date', detail: 'citirile eșuează' })
    expect(p.sensors).toMatchObject({ tone: 'unknown', online: null, total: 13, value: '? / 13' })
    expect(p.links).toEqual({ sensorsToDb: false, dbToApi: false })
  })

  it('API not answering: API offline, database unknown with a tooltip', () => {
    const p = derive({ error: noAnswer, failingSince: NOW - 12_000 })
    expect(p.api).toMatchObject({ tone: 'down', value: 'Offline', detail: 'fără răspuns de 12 secunde' })
    expect(p.db).toMatchObject({
      tone: 'unknown',
      value: 'Necunoscut',
      detail: 'API-ul nu răspunde',
      title: 'API-ul nu răspunde, starea bazei de date nu poate fi verificată',
    })
    expect(p.sensors).toMatchObject({ tone: 'unknown', detail: 'nu se poate verifica' })
  })

  it('other HTTP errors are the API failing, not the database', () => {
    const p = derive({ error: new ApiError('500', 500, 'bug'), failingSince: NOW - 1_000 })
    expect(p.api.tone).toBe('down')
    expect(p.db.tone).toBe('unknown')
  })

  it('before the first answer everything is unknown and nothing flows', () => {
    const p = derive({ status: null, lastReceivedAt: null })
    expect([p.sensors.tone, p.db.tone, p.api.tone]).toEqual(['unknown', 'unknown', 'unknown'])
    expect(p.sensors.value).toBe('? / ?')
    expect(p.links).toEqual({ sensorsToDb: false, dbToApi: false })
  })

  it('without arming states the sensors line says so', () => {
    const p = derive({ status: { ...status, devicesArmed: null, devicesUnarmed: null } })
    expect(p.sensors).toMatchObject({ arming: null, detail: 'stări de armare indisponibile' })
  })
})
