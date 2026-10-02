import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { da } from 'date-fns/locale'
import QRCode from 'qrcode'
import { kr } from '../lib/finance'
import { liveUrl } from '../lib/live'
import {
  LOCATION_LABEL,
  POWER_LABEL,
  PROGRAM_SUGGESTIONS,
  getPortal,
  saveEventPlan,
  type EventPlan,
  type Portal,
  type PortalDoc,
  type ProgramItem,
} from '../lib/portal'

const dateLong = (d: string) => format(parseISO(d), "EEEE 'd.' d. MMMM yyyy", { locale: da })
const dateShort = (d: string) => format(parseISO(d), 'd. MMM yyyy', { locale: da })

// Kundens side for én booking: status, dokumenter, tidsplan, musik og QR til gæsterne
export default function CustomerPortal() {
  const { token = '' } = useParams()
  const [p, setP] = useState<Portal | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getPortal(token).then(setP).catch((e: Error) => setError(e.message))
  }, [token])

  if (!p) return error ? <p className="card text-center">{error}</p> : <p className="text-zinc-400">Indlæser …</p>

  const event = [p.event_type, p.event_theme].filter(Boolean).join(' – ') || 'Event'
  const closed = p.status === 'afvist' || p.status === 'annulleret'

  return (
    <div className="grid grid-cols-1 gap-5">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Min booking</p>
        <h1 className="mt-2 font-display text-2xl font-black sm:text-3xl">Hej {p.first_name}!</h1>
        <p className="mt-2 text-zinc-300">
          {p.event_icon ?? '🎵'} {event} · {dateLong(p.event_date)}
        </p>
      </header>

      {closed ? (
        <p className="card text-zinc-300">
          {p.status === 'afvist'
            ? 'Jeg kan desværre ikke spille den dag. Tak for din forespørgsel – du er velkommen til at skrive, hvis datoen kan flyttes.'
            : 'Bookingen er annulleret.'}
        </p>
      ) : (
        <Timeline p={p} />
      )}

      <section className="card grid gap-2 text-sm">
        <h2 className="font-semibold">Detaljer</h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          <dt className="text-zinc-400">Tidspunkt</dt>
          <dd>
            kl. {p.start_time.slice(0, 5)} · {Number(p.hours).toLocaleString('da-DK')} timer
          </dd>
          <dt className="text-zinc-400">Adresse</dt>
          <dd>{p.venue_address}</dd>
          {p.guest_count != null && (
            <>
              <dt className="text-zinc-400">Gæster</dt>
              <dd>ca. {p.guest_count}</dd>
            </>
          )}
          <dt className="text-zinc-400">Lyd & lys</dt>
          <dd>{p.packages.length ? p.packages.join(', ') : 'Vi finder den rette løsning sammen'}</dd>
        </dl>
      </section>

      {!closed && <Docs docs={p.docs} />}

      {!closed && <PlanSection token={token} portal={p} />}

      {p.music && (
        <section className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">🎵 Musikønsker</h2>
            <p className="text-sm text-zinc-400">
              {p.music.wishes || p.music.genres
                ? `${p.music.wishes} sang${p.music.wishes === 1 ? '' : 'e'} ønsket${p.music.genres ? ` · ${p.music.genres} genre${p.music.genres === 1 ? '' : 'r'} valgt` : ''}`
                : 'Vælg stemning og genrer, og søg de sange frem, der skal spilles.'}
            </p>
          </div>
          <Link to={`/musik/${token}`} className="btn !px-5 !py-2 text-sm">
            {p.music.wishes || p.music.genres ? 'Ret ønsker' : 'Vælg musik'}
          </Link>
        </section>
      )}

      {p.live_token && p.event_date >= new Date().toLocaleDateString('sv-SE') && <LiveQr liveToken={p.live_token} />}

      {p.review && (
        <section className="card flex flex-wrap items-center justify-between gap-3 border-accent/40">
          <div>
            <h2 className="font-semibold">💜 Tak for festen!</h2>
            <p className="text-sm text-zinc-400">{p.review.done ? 'Tak for din anmeldelse.' : 'Hvordan var det? Det tager et halvt minut.'}</p>
          </div>
          <Link to={`/anmeld/${token}`} className="btn-ghost !py-2 text-sm">
            {p.review.done ? 'Ret anmeldelse' : 'Giv en anmeldelse'}
          </Link>
        </section>
      )}

      <p className="text-center text-sm text-zinc-400">
        Spørgsmål? Skriv til{' '}
        <a className="text-accent" href={`mailto:${p.contact.email}`}>
          {p.contact.email}
        </a>{' '}
        eller ring på{' '}
        <a className="text-accent" href={`tel:${p.contact.phone}`}>
          {p.contact.phone}
        </a>
        .
      </p>
    </div>
  )
}

// ---------------- Status ----------------

function Timeline({ p }: { p: Portal }) {
  const today = new Date().toLocaleDateString('sv-SE')
  const step =
    p.status === 'ny' ? 0 : p.status === 'tilbud_sendt' ? 1 : p.status === 'bekraeftet' && p.event_date >= today ? 2 : 4
  const steps = ['Forespørgsel', 'Tilbud', 'Bekræftet', 'Festen']
  const text = [
    'Tak for din forespørgsel – du får et tilbud inden for 24 timer.',
    'Tilbuddet er klar. Acceptér det for at reservere datoen.',
    'Datoen er din! Udfyld tidsplanen og musikønskerne, når I er klar.',
    'Tak for en fed aften! 🎉',
  ][Math.min(step, 3)]

  return (
    <section className="card grid gap-4">
      <ol className="grid grid-cols-4 gap-1" aria-label="Status">
        {steps.map((s, i) => (
          <li key={s} className="grid justify-items-center gap-1.5 text-center">
            <span
              className={`grid size-8 place-items-center rounded-full text-sm font-bold ${
                i < step ? 'bg-accent text-black' : i === step ? 'bg-accent text-black ring-4 ring-accent/30' : 'bg-zinc-800 text-zinc-500'
              }`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? '✓' : i + 1}
            </span>
            <span className={`text-[11px] sm:text-xs ${i <= step ? 'text-white' : 'text-zinc-500'}`}>{s}</span>
          </li>
        ))}
      </ol>
      <p className="text-center text-sm text-zinc-300">{text}</p>
    </section>
  )
}

// ---------------- Tilbud & faktura ----------------

function docState(d: PortalDoc): { label: string; tone: string } {
  const today = new Date().toLocaleDateString('sv-SE')
  if (d.type === 'tilbud') {
    if (d.status === 'sendt') return d.valid_until && d.valid_until < today ? { label: 'Udløbet', tone: 'bg-zinc-800 text-zinc-400' } : { label: 'Afventer dit svar', tone: 'bg-accent text-black' }
    if (d.status === 'accepteret') return { label: 'Accepteret ✓', tone: 'bg-emerald-500 text-black' }
    return { label: 'Afvist', tone: 'bg-zinc-800 text-zinc-400' }
  }
  if (d.type === 'kreditnota') return { label: 'Kreditnota', tone: 'bg-zinc-800 text-zinc-300' }
  if (d.status === 'betalt') return { label: 'Betalt ✓', tone: 'bg-emerald-500 text-black' }
  if (d.status === 'krediteret') return { label: 'Krediteret', tone: 'bg-zinc-800 text-zinc-400' }
  if (d.due_date && d.due_date < today) return { label: 'Forfalden', tone: 'bg-red-500 text-white' }
  return { label: d.due_date ? `Betal senest ${dateShort(d.due_date)}` : 'Til betaling', tone: 'bg-amber-400 text-black' }
}

const DOC_NAME = { tilbud: 'Tilbud', faktura: 'Faktura', kreditnota: 'Kreditnota' } as const

function Docs({ docs }: { docs: PortalDoc[] }) {
  return (
    <section className="card grid gap-3">
      <h2 className="font-semibold">Tilbud & faktura</h2>
      {docs.length === 0 ? (
        <p className="text-sm text-zinc-400">Dit tilbud dukker op her – og på mail – inden for 24 timer.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {docs.map((d) => {
            const s = docState(d)
            return (
              <li key={d.token}>
                <Link
                  to={`/dok/${d.token}`}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800 p-3 hover:border-zinc-600"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold whitespace-nowrap">
                      {DOC_NAME[d.type]} nr. {d.number}
                    </span>
                    <span className="text-xs text-zinc-400">{dateShort(d.issue_date)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold">{kr(d.total)}</span>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.tone}`}>{s.label}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ---------------- Tidsplan & praktisk ----------------

function PlanSection({ token, portal }: { token: string; portal: Portal }) {
  const [plan, setPlan] = useState<EventPlan>(portal.plan ?? {})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(portal.plan_updated_at)
  const [error, setError] = useState('')

  if (!portal.plan_editable) return <PlanView plan={plan} />

  const set = <K extends keyof EventPlan>(k: K, v: EventPlan[K]) => {
    setPlan((p) => ({ ...p, [k]: v || undefined }))
    setDirty(true)
  }
  const program = plan.program ?? []
  const setProgram = (items: ProgramItem[]) => set('program', items)
  const setItem = (i: number, patch: Partial<ProgramItem>) => setProgram(program.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const clean = { ...plan, program: program.filter((x) => x.label.trim()) }
      setSavedAt(await saveEventPlan(token, clean))
      // Vis samme rækkefølge som serveren gemmer (sorteret efter klokkeslæt)
      setPlan({ ...clean, program: [...clean.program].sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99')) })
      setDirty(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const unused = PROGRAM_SUGGESTIONS.filter((s) => !program.some((x) => x.label === s))

  return (
    <section className="card grid grid-cols-1 gap-4">
      <div>
        <h2 className="font-semibold">🗓️ Tidsplan & praktisk</h2>
        <p className="text-sm text-zinc-400">
          Jo mere jeg ved, jo bedre kan jeg ramme stemningen – og være klar, når der skal holdes tale eller danses første dans.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <h3 className="text-sm font-semibold text-zinc-300">Program for aftenen</h3>
        {program.length === 0 && <p className="text-sm text-zinc-500">Tryk på et punkt herunder for at tilføje det.</p>}
        <ul className="grid grid-cols-1 gap-2">
          {program.map((x, i) => (
            <li key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-start gap-2 rounded-xl border border-zinc-800 p-2">
              <input
                type="time"
                aria-label="Klokkeslæt"
                value={x.time ?? ''}
                onChange={(e) => setItem(i, { time: e.target.value || undefined })}
                className="w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm"
              />
              <div className="grid min-w-0 gap-1">
                <input
                  aria-label="Hvad sker der"
                  value={x.label}
                  maxLength={100}
                  onChange={(e) => setItem(i, { label: e.target.value })}
                  className="w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  placeholder="Hvad sker der?"
                />
                <input
                  aria-label="Note"
                  value={x.note ?? ''}
                  maxLength={300}
                  onChange={(e) => setItem(i, { note: e.target.value || undefined })}
                  className="w-full min-w-0 rounded-lg border border-transparent bg-transparent px-3 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-700"
                  placeholder="Note, fx sang til første dans"
                />
              </div>
              <button className="icon-btn" aria-label="Fjern punkt" onClick={() => setProgram(program.filter((_, j) => j !== i))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {unused.map((s) => (
            <button key={s} className="chip !py-1 text-xs" onClick={() => setProgram([...program, { label: s }])}>
              + {s}
            </button>
          ))}
          <button className="chip !py-1 text-xs" onClick={() => setProgram([...program, { label: '' }])}>
            + Andet
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <h3 className="text-sm font-semibold text-zinc-300 sm:col-span-2">Praktisk</h3>
        <label className="field">
          <span>Kontaktperson på dagen</span>
          <input value={plan.contact_name ?? ''} maxLength={100} onChange={(e) => set('contact_name', e.target.value)} placeholder="Navn" />
        </label>
        <label className="field">
          <span>Telefon</span>
          <input type="tel" value={plan.contact_phone ?? ''} maxLength={30} onChange={(e) => set('contact_phone', e.target.value)} />
        </label>
        <label className="field">
          <span>Jeg kan stille op fra kl.</span>
          <input type="time" value={plan.setup_from ?? ''} onChange={(e) => set('setup_from', e.target.value)} />
        </label>
        <label className="field">
          <span>Hvor skal jeg spille?</span>
          <select value={plan.location ?? ''} onChange={(e) => set('location', (e.target.value || undefined) as EventPlan['location'])}>
            <option value="">Vælg …</option>
            {Object.entries(LOCATION_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Er der stikkontakt tæt på pulten?</span>
          <select value={plan.power ?? ''} onChange={(e) => set('power', (e.target.value || undefined) as EventPlan['power'])}>
            <option value="">Vælg …</option>
            {Object.entries(POWER_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="hidden sm:block" />
        <label className="field sm:col-span-2">
          <span>Adgang & parkering</span>
          <textarea
            rows={2}
            maxLength={1000}
            value={plan.access ?? ''}
            onChange={(e) => set('access', e.target.value)}
            placeholder="fx Kør ind ad gården, 1. sal med elevator, parkering foran"
          />
        </label>
        <label className="field sm:col-span-2">
          <span>Andet jeg skal vide</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={plan.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="fx overraskelser, dresscode, hvornår musikken skal være lav"
          />
        </label>
      </div>

      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Gemmer …' : dirty ? 'Gem tidsplan' : 'Gemt ✓'}
        </button>
        {savedAt && !dirty && (
          <span className="text-xs text-zinc-500">Sidst gemt {format(new Date(savedAt), "d. MMM 'kl.' HH:mm", { locale: da })}</span>
        )}
      </div>
      <p className="text-xs text-zinc-500">Du kan rette tidsplanen helt frem til festen. DJ Lindstrøm får automatisk besked.</p>
    </section>
  )
}

export function PlanView({ plan, compact }: { plan: EventPlan; compact?: boolean }) {
  const program = plan.program ?? []
  const rows: [string, string | undefined][] = [
    ['Kontakt på dagen', [plan.contact_name, plan.contact_phone].filter(Boolean).join(', ') || undefined],
    ['Opstilling fra', plan.setup_from && `kl. ${plan.setup_from}`],
    ['Placering', plan.location && LOCATION_LABEL[plan.location]],
    ['Strøm ved pulten', plan.power && POWER_LABEL[plan.power]],
    ['Adgang & parkering', plan.access],
    ['Andet', plan.notes],
  ]
  const filled = rows.filter(([, v]) => v)
  const body = (
    <>
      {program.length > 0 && (
        <ol className="grid gap-1 text-sm">
          {program.map((x, i) => (
            <li key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
              <span className="font-semibold text-accent">{x.time ?? '–'}</span>
              <span>
                {x.label}
                {x.note && <span className="block text-xs text-zinc-400">{x.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {filled.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          {filled.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-zinc-400">{k}</dt>
              <dd className="whitespace-pre-line">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {program.length === 0 && filled.length === 0 && <p className="text-sm text-zinc-500">Ingen tidsplan udfyldt.</p>}
    </>
  )
  if (compact) return <div className="grid gap-3">{body}</div>
  return (
    <section className="card grid gap-3">
      <h2 className="font-semibold">🗓️ Tidsplan & praktisk</h2>
      {body}
    </section>
  )
}

// ---------------- QR til gæsternes sangønsker ----------------

function LiveQr({ liveToken }: { liveToken: string }) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(liveUrl(liveToken), { width: 800, margin: 2, color: { dark: '#0b0b12', light: '#ffffff' } }).then(setQr)
  }, [liveToken])

  return (
    <section className="card grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <h2 className="font-semibold">📱 Gæsternes sangønsker</h2>
        <p className="text-sm text-zinc-400">
          Print QR-koden og stil den på bordene eller ved baren. Gæsterne scanner, ønsker sange og stemmer på hinandens ønsker – direkte til
          min pult.
        </p>
        {qr && (
          <a href={qr} download="sangoensker-qr.png" className="btn-ghost mt-3 inline-block !py-2 text-sm">
            ⬇ Hent QR-kode
          </a>
        )}
      </div>
      {qr && <img src={qr} alt="QR-kode til sangønsker" className="mx-auto w-40 rounded-xl bg-white p-1" />}
    </section>
  )
}
