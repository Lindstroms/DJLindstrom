import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { format, parseISO, startOfToday } from 'date-fns'
import { da } from 'date-fns/locale'
import { supabase, isDemo } from '../../lib/supabase'
import { fetchBookings, updateBooking } from '../../lib/api'
import { downloadIcs } from '../../lib/ics'
import { STATUS_LABELS, type Booking, type BookingStatus } from '../../lib/types'
import Login from './Login'
import Setup from './Setup'

const STATUS_COLORS: Record<BookingStatus, string> = {
  ny: 'bg-accent text-black',
  tilbud_sendt: 'bg-amber-400 text-black',
  bekraeftet: 'bg-emerald-500 text-black',
  afholdt: 'bg-zinc-600 text-white',
  afvist: 'bg-zinc-800 text-zinc-400',
  annulleret: 'bg-zinc-800 text-zinc-400',
}

type Filter = 'aktive' | 'kommende' | 'tidligere' | 'alle'

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(isDemo)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return <p className="text-zinc-400">Indlæser …</p>
  if (!isDemo && !session) return <Login />
  return <AdminShell />
}

function AdminShell() {
  const [tab, setTab] = useState<'bookings' | 'setup'>('bookings')
  return (
    <div>
      <div className="mb-6 flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/70 p-1">
        {(
          [
            ['bookings', 'Forespørgsler'],
            ['setup', 'Opsætning'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 cursor-pointer rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-accent text-black' : 'text-zinc-300'}`}
          >
            {label}
          </button>
        ))}
        {supabase && (
          <button className="cursor-pointer px-3 text-sm text-zinc-400 hover:text-zinc-100" onClick={() => supabase!.auth.signOut()}>
            Log ud
          </button>
        )}
      </div>
      {tab === 'bookings' ? (
        <Dashboard />
      ) : isDemo ? (
        <p className="text-zinc-400">Opsætning kræver forbindelse til databasen.</p>
      ) : (
        <Setup />
      )}
    </div>
  )
}

function Dashboard() {
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('aktive')
  const [openId, setOpenId] = useState<string | null>(null)

  const load = () => fetchBookings().then(setBookings).catch((e: Error) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  const today = format(startOfToday(), 'yyyy-MM-dd')
  const visible = (bookings ?? []).filter((b) => {
    if (filter === 'aktive') return b.event_date >= today && ['ny', 'tilbud_sendt', 'bekraeftet'].includes(b.status)
    if (filter === 'kommende') return b.event_date >= today
    if (filter === 'tidligere') return b.event_date < today
    return true
  })
  const newCount = (bookings ?? []).filter((b) => b.status === 'ny').length

  const patch = async (b: Booking, p: Parameters<typeof updateBooking>[1]) => {
    try {
      await updateBooking(b.id, p)
      setBookings((list) => list!.map((x) => (x.id === b.id ? { ...x, ...p } : x)))
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Forespørgsler</h1>
          <p className="text-sm text-zinc-400">
            {newCount > 0 ? `${newCount} ny${newCount > 1 ? 'e' : ''} venter på svar` : 'Ingen nye forespørgsler'}
          </p>
        </div>
      </header>

      {isDemo && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Demo-tilstand: Supabase er ikke forbundet endnu, så der vises eksempeldata.
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(['aktive', 'kommende', 'tidligere', 'alle'] as Filter[]).map((f) => (
          <button key={f} className={`chip capitalize ${filter === f ? 'choice-on' : ''}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400">{error}</p>}
      {!bookings && !error && <p className="text-zinc-400">Indlæser …</p>}
      {bookings && visible.length === 0 && <p className="text-zinc-400">Ingen forespørgsler her.</p>}

      <ul className="grid gap-3">
        {visible.map((b) => {
          const open = openId === b.id
          const packages = b.booking_packages.map((p) => p.sound_packages?.name).filter(Boolean)
          return (
            <li key={b.id} className="card !p-0 overflow-hidden">
              <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpenId(open ? null : b.id)}>
                <span className="text-2xl">{b.event_types?.icon ?? '🎵'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {b.event_types?.name ?? 'Event'}
                    {b.event_themes && ` – ${b.event_themes.name}`} · {b.customer_name}
                  </span>
                  <span className="text-sm text-zinc-400">
                    {format(parseISO(b.event_date), 'EEE d. MMM yyyy', { locale: da })} kl. {b.start_time.slice(0, 5)} ·{' '}
                    {Number(b.hours).toLocaleString('da-DK')} t
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[b.status]}`}>
                  {STATUS_LABELS[b.status]}
                </span>
              </button>

              {open && (
                <div className="grid gap-4 border-t border-zinc-800 p-4 text-sm">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                    <dt className="text-zinc-400">Kunde</dt>
                    <dd>
                      {b.customer_name}
                      {b.company && ` (${b.company})`}
                    </dd>
                    <dt className="text-zinc-400">Telefon</dt>
                    <dd>
                      <a className="text-accent" href={`tel:${b.phone}`}>
                        {b.phone}
                      </a>
                    </dd>
                    <dt className="text-zinc-400">E-mail</dt>
                    <dd>
                      <a className="text-accent" href={`mailto:${b.email}`}>
                        {b.email}
                      </a>
                    </dd>
                    <dt className="text-zinc-400">Adresse</dt>
                    <dd>{b.venue_address}</dd>
                    {b.guest_count != null && (
                      <>
                        <dt className="text-zinc-400">Gæster</dt>
                        <dd>{b.guest_count}</dd>
                      </>
                    )}
                    <dt className="text-zinc-400">Lyd & lys</dt>
                    <dd>{packages.length ? packages.join(', ') : 'Ønsker rådgivning'}</dd>
                    {b.message && (
                      <>
                        <dt className="text-zinc-400">Besked</dt>
                        <dd className="whitespace-pre-line">{b.message}</dd>
                      </>
                    )}
                    <dt className="text-zinc-400">Modtaget</dt>
                    <dd>{format(parseISO(b.created_at), 'd. MMM yyyy HH:mm', { locale: da })}</dd>
                  </dl>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="field">
                      <span>Status</span>
                      <select value={b.status} onChange={(e) => patch(b, { status: e.target.value as BookingStatus })}>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Tilbudt pris (kr.)</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        defaultValue={b.quoted_price ?? ''}
                        onBlur={(e) => patch(b, { quoted_price: e.target.value ? Number(e.target.value) : null })}
                      />
                    </label>
                    <label className="field sm:col-span-2">
                      <span>Interne noter</span>
                      <textarea
                        rows={3}
                        defaultValue={b.internal_notes ?? ''}
                        onBlur={(e) => patch(b, { internal_notes: e.target.value || null })}
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button className="btn" onClick={() => downloadIcs(b)}>
                      📅 Tilføj til kalender
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
