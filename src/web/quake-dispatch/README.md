# quake-dispatch, dashboard

Dashboard-ul rețelei de detectare a cutremurelor. Telefoanele Android trimit accelerometru, giroscop, GPS și baterie prin AWS IoT Core → Lambda → DynamoDB; dashboard-ul citește API-ul la fiecare 2 secunde.

## Pornire

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # verificare tipuri + build de producție în dist/
```

Fără `VITE_EVENTS_URL` sau `VITE_API_URL`, dashboard-ul arată structura goală și un mesaj de configurare.

`#dispozitiv=<id>` în URL deschide direct profilul unui dispozitiv.

## Sursa de date acum: `GET /events`

Backend-ul are deocamdată un singur endpoint de citire. În `.env.local`:

```
VITE_EVENTS_URL=https://u90us4gdu6.execute-api.eu-central-1.amazonaws.com/events
```

Dashboard-ul îl apelează cu `fetch()` la fiecare 2 secunde (`POLL_INTERVAL_MS` în `src/config.ts`), fără suprapuneri și cu pauză când tab-ul e ascuns. Răspunsul e o listă de citiri brute (`device_id`, `timestamp`, `value` = |a| cu gravitație), așa că `src/api/events.ts` calculează în browser:

- accelerația fără gravitație: |value − 9,81|
- dispozitivele (online dacă au trimis în ultimele 30 s), poziția din `metadata.location` dacă există
- depășirile de prag (≥ 1,0 m/s²) și cutremurele (≥ 3 dispozitive în 10 s)
- istoricul, dintr-un buffer în memorie de 2 ore care se umple cât timp pagina e deschisă (endpoint-ul dă doar 50 de citiri)

Pragurile sunt în `src/config.ts`. Giroscopul apare ca RMS și vârf pe ultima fereastră procesată (`gyro_rms`, `gyro_peak`), adică valorile după care backend-ul armează sau dezarmează telefonul. Latența, pe care endpoint-ul nu o trimite, apare ca „nu e raportată”.

## Conectare la API-ul REST complet (viitor)

Copiază `.env.example` în `.env.local` și setează:

```
VITE_API_URL=https://<id>.execute-api.<regiune>.amazonaws.com/prod
```

### Rute așteptate

Toate răspund cu JSON; formele exacte sunt în `src/types.ts`. Orele sunt ISO 8601 în UTC, accelerațiile în m/s² fără gravitație.

| Rută | Răspuns |
|---|---|
| `GET /devices` | `Device[]` |
| `GET /telemetry/latest` | `Telemetry[]`, ultimul mesaj al fiecărui dispozitiv |
| `GET /telemetry/history?windowSec=300[&deviceId=]` | `AccelPoint[]`, maximul pe fiecare secundă |
| `GET /triggers?limit=50` | `Trigger[]`, cele mai recente primele |
| `GET /events?limit=20` | `Event[]` |
| `GET /status` | `SystemStatus` (include pragul de declanșare) |

API Gateway trebuie să permită CORS pentru originea dashboard-ului.

## Ce afișează

1. **Valori curente** (sus, fără scroll): accelerația maximă din rețea acum (normal / ridicat de la 50% din prag / alertă de la prag), ultimul cutremur cu intensitatea estimată, locația lui, ora ultimei citiri stocate și vechimea ei.
2. **Istoric**: graficul accelerației pe 5 min / 1 h / 24 h / 7 zile cu cutremurele marcate, tabelul sortabil al cutremurelor, harta cu senzorii și epicentrele.
3. **Starea sistemului**: o bară în formă de flux, Senzori → DynamoDB → API backend, cu liniile animate cât timp datele circulă. Fiecare widget are stări de încărcare, gol și eroare.

**Intensitatea** e estimată din PGA (scara Mercalli, Wald et al. 1999), în `src/lib/intensity.ts`. Backend-ul nu trimite magnitudine.

**Starea DynamoDB** vine din răspunsul API: `503 { "error": "db_unavailable" }` → baza de date e căzută; răspuns reușit → citirile merg; citiri noi în ultimele 30 s → scrierile merg. Regulile sunt în `src/lib/pipeline.ts` (`derivePipelineStatus`), cu teste în `pipeline.test.ts` (`npm test`).

## Date mock

Tot ce e simulat e în `src/api/mock.ts`, marcat `MOCK:`, iar în interfață apare cu eticheta **Date demo**.

| Ce | Sursa acum | Cum se înlocuiește |
|---|---|---|
| Istoric 5 min | real, din snapshot | – |
| Istoric 1 h | real, `windowSec=3600`, agregat pe 10 s în browser | – |
| Istoric 24 h, 7 zile | fond simulat + cutremurele reale din `/events` | un endpoint agregat, de ex. `GET /telemetry/history?windowSec=86400&bucketSec=300`; apoi `source: 'api'` în `HISTORY_RANGES` (`src/config.ts`) |

## Structură

```
src/
  types.ts           contractul de date: Device, Telemetry, Trigger, Event
  config.ts          unitate, interval de polling, fereastra graficelor
  api/               singurul strat de date (client REST)
  hooks/usePolling   polling fără suprapuneri, oprit când tab-ul e ascuns
  lib/               formatare ro-RO în UTC, date derivate, paleta pentru grafice
  api/mock.ts        date simulate, până există endpoint-urile reale
  components/        LatestValues, SystemStatus, HistoryChart, EventsTable, DeviceMap,
                     DeviceTable, TriggerTimeline, DevicePanel (sertar), WidgetState
```
