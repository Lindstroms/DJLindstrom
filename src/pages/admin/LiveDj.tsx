import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { da } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { liveUrl, usePolling, type LiveRequest } from '../../lib/live'
import { spotifySearchUrl } from '../../lib/music'
import Login from './Login'

type LiveBooking = {
  id: string
  customer_name: string
  event_date: string
  start_time: string
  status: string
  live_token: string
  live_open: boolean
  event_types: { name: string } | null
}

export default function LiveDj() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!supabase) return <p className="text-zinc-400">Live-ønsker kræver forbindelse til databasen.</p>
  if (session === undefined) return <p className="text-zinc-400">Indlæser …</p>
  if (!session) return <Login />
  return <DjView />
}

function DjView() {
  const { id = '' } = useParams()
  const [booking, setBooking] = useState<LiveBooking | null>(null)
  const [requests, setRequests] = useState<LiveRequest[]>([])
  const [error, setError] = useState('')
  const [qr, setQr] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    supabase!
      .from('bookings')
      .select('id, customer_name, event_date, start_time, status, live_token, live_open, event_types(name)')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else {
          setBooking(data as unknown as LiveBooking)
          QRCode.toDataURL(liveUrl(data.live_token), { width: 800, margin: 2, color: { dark: '#0b0b12', light: '#ffffff' } }).then(setQr)
        }
      })
  }, [id])

  const load = useCallback(async () => {
    const { data, error } = await supabase!
      .from('live_requests')
      .select('*')
      .eq('booking_id', id)
      .order('votes', { ascending: false })
      .order('created_at')
    if (error) setError(error.message)
    else setRequests(data as LiveRequest[])
  }, [id])
  usePolling(load, 4000, [id])

  const setOpen = async (open: boolean) => {
    const { error } = await supabase!.from('bookings').update({ live_open: open }).eq('id', id)
    if (error) setError(error.message)
    else setBooking((b) => (b ? { ...b, live_open: open } : b))
  }

  const setStatus = async (r: LiveRequest, status: LiveRequest['status']) => {
    setRequests((list) => list.map((x) => (x.id === r.id ? { ...x, status } : x)))
    const { error } = await supabase!.from('live_requests').update({ status }).eq('id', r.id)
    if (error) setError(error.message)
    load()
  }

  if (!booking) return error ? <p className="text-red-400">{error}</p> : <p className="text-zinc-400">Indlæser …</p>

  const queued = requests.filter((r) => r.status === 'queued')
  const done = requests.filter((r) => r.status !== 'queued').sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const url = liveUrl(booking.live_token)

  return (
    <div className="grid grid-cols-1 gap-4">
      <Link to="/admin" className="text-sm text-zinc-400 hover:text-white">
        ← Tilbage til admin
      </Link>

      <header className="card grid gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Live-ønsker</p>
          <h1 className="mt-1 font-display text-2xl font-black">
            {booking.event_types?.name} · {booking.customer_name}
          </h1>
          <p className="text-sm text-zinc-400 first-letter:uppercase">
            {format(parseISO(booking.event_date), 'EEEE d. MMMM', { locale: da })} kl. {booking.start_time.slice(0, 5)}
          </p>
        </div>

        {booking.status !== 'bekraeftet' && (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
            Bookingen skal have status "Bekræftet", før gæsterne kan bruge linket.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setOpen(!booking.live_open)}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold transition ${
              booking.live_open ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            <span className={`size-2.5 rounded-full ${booking.live_open ? 'animate-pulse bg-black' : 'bg-zinc-500'}`} />
            {booking.live_open ? 'Åben for ønsker' : 'Lukket for ønsker'}
          </button>
          <button className="btn-ghost !py-2.5 text-sm" onClick={() => setShowQr(true)}>
            ▦ Vis QR-kode
          </button>
          {qr && (
            <a className="btn-ghost !py-2.5 text-sm" href={qr} download="dj-lindstrom-oensk-en-sang.png">
              ⬇ Hent QR
            </a>
          )}
        </div>
        <p className="break-all text-xs text-zinc-500">{url}</p>
      </header>

      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}

      <section className="card">
        <h2 className="step-title !mb-2">
          Kø <span className="text-base font-normal text-zinc-500">({queued.length})</span>
        </h2>
        {queued.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {booking.live_open ? 'Ingen ønsker endnu – vis QR-koden for gæsterne.' : 'Åbn for ønsker, når festen går i gang.'}
          </p>
        ) : (
          <ol className="divide-y divide-zinc-800">
            {queued.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 font-display text-sm font-black text-accent">
                  {r.votes}
                </span>
                {r.artwork_url ? (
                  <img src={r.artwork_url} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-zinc-800">♪</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="truncate text-sm text-zinc-400">
                    {r.artist}
                    <span className="text-zinc-500">
                      {' '}
                      · {r.guest_name ? `${r.guest_name} · ` : ''}
                      {formatDistanceToNowStrict(parseISO(r.created_at), { locale: da })} siden
                    </span>
                  </p>
                </div>
                <a href={spotifySearchUrl(r)} target="_blank" rel="noreferrer" className="hidden shrink-0 text-xs text-emerald-400 sm:inline">
                  Spotify
                </a>
                <button className="icon-btn shrink-0 !size-10 text-emerald-400" onClick={() => setStatus(r, 'played')} aria-label="Spillet">
                  ✓
                </button>
                <button className="icon-btn shrink-0 !size-10 text-red-400" onClick={() => setStatus(r, 'rejected')} aria-label="Afvis">
                  ✕
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {done.length > 0 && (
        <section className="card">
          <button className="flex w-full items-center justify-between text-left" onClick={() => setShowDone(!showDone)}>
            <span className="font-semibold">Spillet / afvist ({done.length})</span>
            <span className="text-zinc-500">{showDone ? '▲' : '▼'}</span>
          </button>
          {showDone && (
            <ul className="mt-2 divide-y divide-zinc-800 text-sm">
              {done.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2">
                  <span>{r.status === 'played' ? '✓' : '✕'}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-300">
                    {r.title} <span className="text-zinc-500">– {r.artist}</span>
                  </span>
                  <button className="shrink-0 text-xs text-accent hover:underline" onClick={() => setStatus(r, 'queued')}>
                    Fortryd
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {showQr && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#0b0b12] p-6" onClick={() => setShowQr(false)}>
          <div className="grid max-w-md justify-items-center gap-6 text-center">
            <p className="font-display text-3xl font-black">
              Ønsk en <span className="text-gradient">sang</span> 🎶
            </p>
            {qr && <img src={qr} alt="QR-kode til live-ønsker" className="w-full max-w-sm rounded-3xl" />}
            <p className="text-lg text-zinc-300">Scan med kameraet og send dit ønske til DJ Lindstrøm</p>
            <p className="text-sm text-zinc-600">Tryk for at lukke</p>
          </div>
        </div>
      )}
    </div>
  )
}
