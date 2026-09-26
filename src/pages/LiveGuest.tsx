import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { searchSongs, type Song } from '../lib/music'
import { getLiveQueue, requestSong, usePolling, voteSong, type LiveItem, type LiveQueue } from '../lib/live'

const MESSAGES = {
  added: 'Dit ønske er sendt til DJ’en! 🎉',
  voted: 'Den var allerede ønsket – din stemme er talt 👍',
  already: 'Du har allerede stemt på den sang',
  blocked: 'Den sang er desværre ikke på listen i aften 😉',
} as const

function Cover({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" loading="lazy" className="size-12 shrink-0 rounded-lg object-cover" />
  ) : (
    <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-zinc-800 text-zinc-500">♪</span>
  )
}

export default function LiveGuest() {
  const { token = '' } = useParams()
  const [data, setData] = useState<LiveQueue | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('djl-guest-name') ?? ''
    } catch {
      return ''
    }
  })
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const load = useCallback(
    () =>
      getLiveQueue(token)
        .then((d) => {
          setData(d)
          setError('')
        })
        .catch((e: Error) => setError(e.message)),
    [token],
  )
  usePolling(load, 5000, [token])

  const flash = (msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }

  const saveName = (v: string) => {
    setName(v)
    try {
      localStorage.setItem('djl-guest-name', v)
    } catch {
      /* ignoreres */
    }
  }

  const request = async (song: Song) => {
    try {
      flash(MESSAGES[await requestSong(token, song, name)])
      load()
    } catch (e) {
      flash((e as Error).message)
    }
  }

  const vote = async (item: LiveItem) => {
    try {
      flash(MESSAGES[await voteSong(token, item.id)])
      load()
    } catch (e) {
      flash((e as Error).message)
    }
  }

  if (!data)
    return error ? (
      <div className="card text-center">
        <p className="text-4xl">🎧</p>
        <p className="mt-3 font-semibold">{error}</p>
        <p className="mt-1 text-sm text-zinc-400">Scan QR-koden igen, eller spørg DJ’en.</p>
      </div>
    ) : (
      <p className="text-zinc-400">Indlæser …</p>
    )

  return (
    <div className="grid grid-cols-1 gap-5 pb-24">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">{data.event_type ?? 'Live'}</p>
        <h1 className="mt-2 font-display text-3xl font-black">
          Ønsk en <span className="text-gradient">sang</span> 🎶
        </h1>
        <p className="mt-2 text-zinc-400">Søg din sang og send den til DJ’en – eller giv 👍 til de andres ønsker.</p>
      </header>

      {!data.open && (
        <div className="card border-amber-500/40 bg-amber-500/10 text-center text-amber-200">
          Der er ikke åbent for ønsker lige nu – prøv igen om lidt.
        </div>
      )}

      {data.open && <GuestSearch name={name} onName={saveName} onRequest={request} />}

      <section className="card">
        <h2 className="step-title !mb-2">
          Ønskekøen <span className="text-base font-normal text-zinc-500">({data.queue.length})</span>
        </h2>
        {data.queue.length === 0 ? (
          <p className="text-sm text-zinc-500">Ingen ønsker endnu – vær den første!</p>
        ) : (
          <ol className="divide-y divide-zinc-800">
            {data.queue.map((item, i) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span className="w-5 shrink-0 text-center font-display text-sm font-bold text-zinc-500">{i + 1}</span>
                <Cover url={item.artwork_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.title}</p>
                  <p className="truncate text-sm text-zinc-400">
                    {item.artist}
                    {item.guest_name && <span className="text-zinc-500"> · ønsket af {item.guest_name}</span>}
                  </p>
                </div>
                <button
                  onClick={() => vote(item)}
                  disabled={item.voted || !data.open}
                  className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    item.voted ? 'border-accent bg-accent/15 text-accent' : 'border-zinc-700 hover:border-accent'
                  }`}
                  aria-label={`Stem på ${item.title}`}
                >
                  👍 {item.votes}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {data.played.length > 0 && (
        <section className="card opacity-70">
          <h2 className="step-title !mb-2 text-base">Spillet for nylig</h2>
          <ul className="grid gap-1 text-sm">
            {data.played.map((p) => (
              <li key={p.id} className="truncate text-zinc-400">
                ✓ {p.title} <span className="text-zinc-600">– {p.artist}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-2xl bg-accent px-5 py-3 text-center font-semibold text-black shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  )
}

function GuestSearch({ name, onName, onRequest }: { name: string; onName: (v: string) => void; onRequest: (s: Song) => Promise<void> }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const t = setTimeout(() => {
      searchSongs(q.trim(), ctrl.signal)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 350)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  const key = (s: Song) => `${s.title}|${s.artist}`

  return (
    <section className="card grid grid-cols-1 gap-3">
      <div className="relative">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Søg på sang eller kunstner …"
          className="w-full rounded-full border border-zinc-700 bg-zinc-950 py-3.5 pl-11 pr-4 text-base outline-none focus:border-accent"
          aria-label="Søg efter sang"
        />
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">🔍</span>
      </div>
      <input
        value={name}
        onChange={(e) => onName(e.target.value)}
        maxLength={40}
        placeholder="Dit navn (valgfrit)"
        className="rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-accent"
      />

      {loading && <p className="text-sm text-zinc-500">Søger …</p>}
      {results.length > 0 && (
        <ul className="divide-y divide-zinc-800">
          {results.map((s, i) => (
            <li key={`${key(s)}-${i}`} className="flex items-center gap-3 py-2">
              <Cover url={s.artwork_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.title}</p>
                <p className="truncate text-sm text-zinc-400">{s.artist}</p>
              </div>
              <button
                className="btn shrink-0 !px-4 !py-2 text-sm"
                disabled={sent.has(key(s))}
                onClick={async () => {
                  await onRequest(s)
                  setSent(new Set(sent).add(key(s)))
                }}
              >
                {sent.has(key(s)) ? 'Sendt ✓' : 'Ønsk'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
