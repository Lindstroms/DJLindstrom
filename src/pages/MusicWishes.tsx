import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  ENERGY_LABELS,
  GENRES,
  MOMENTS,
  WISH_LABELS,
  addWish,
  getWishlist,
  removeWish,
  saveMusicPrefs,
  searchSongs,
  type Song,
  type Wish,
  type WishKind,
  type Wishlist,
} from '../lib/music'

// Én fælles lydafspiller til 30-sekunders klip
const audio = typeof Audio !== 'undefined' ? new Audio() : null

function usePreview() {
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => {
    if (!audio) return
    const stop = () => setPlaying(null)
    audio.addEventListener('ended', stop)
    audio.addEventListener('pause', stop)
    return () => {
      audio.removeEventListener('ended', stop)
      audio.removeEventListener('pause', stop)
      audio.pause()
    }
  }, [])
  const toggle = (url: string) => {
    if (!audio) return
    if (playing === url) {
      audio.pause()
      return
    }
    audio.src = url
    audio.play().then(() => setPlaying(url)).catch(() => setPlaying(null))
  }
  return { playing, toggle }
}

function SongRow({
  song,
  playing,
  onPlay,
  children,
}: {
  song: Song
  playing: boolean
  onPlay: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={onPlay}
        disabled={!song.preview_url}
        className="group relative size-12 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-zinc-800"
        aria-label={playing ? 'Stop' : `Afspil ${song.title}`}
      >
        {song.artwork_url && <img src={song.artwork_url} alt="" className="size-full object-cover" loading="lazy" />}
        {song.preview_url && (
          <span
            className={`absolute inset-0 grid place-items-center bg-black/50 text-lg text-white transition ${playing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          >
            {playing ? '❚❚' : '▶'}
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{song.title}</p>
        <p className="truncate text-sm text-zinc-400">{song.artist}</p>
      </div>
      {children}
    </div>
  )
}

export default function MusicWishes() {
  const { token = '' } = useParams()
  const [list, setList] = useState<Wishlist | null>(null)
  const [error, setError] = useState('')
  const { playing, toggle } = usePreview()

  const reload = () =>
    getWishlist(token)
      .then(setList)
      .catch((e: Error) => setError(e.message))
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (error && !list)
    return (
      <div className="card text-center">
        <p className="text-4xl">🎧</p>
        <p className="mt-3 font-semibold">{error}</p>
        <p className="mt-1 text-sm text-zinc-400">Tjek at du har brugt hele linket fra mailen.</p>
      </div>
    )
  if (!list) return <p className="text-zinc-400">Indlæser …</p>

  const event = [list.event_type, list.event_theme].filter(Boolean).join(' – ')

  return (
    <div className="grid grid-cols-1 gap-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Musikønsker</p>
        <h1 className="mt-2 font-display text-2xl font-black sm:text-3xl">Hej {list.first_name} 👋</h1>
        <p className="mt-2 text-zinc-300">
          {event} ·{' '}
          <span className="first-letter:uppercase">{format(parseISO(list.event_date), 'EEEE d. MMMM yyyy', { locale: da })}</span> kl.{' '}
          {list.start_time.slice(0, 5)}
        </p>
        <p className="mt-3 text-zinc-400">
          {list.editable
            ? 'Fortæl mig om stemningen, og søg de sange frem, der skal – og ikke må – spilles. Alt gemmes automatisk, og du kan rette helt frem til festen.'
            : 'Festen er låst for ændringer – her kan du se jeres ønsker.'}
        </p>
      </header>

      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}

      <Prefs token={token} list={list} onError={setError} />
      {list.editable && <Search token={token} playing={playing} toggle={toggle} onAdded={reload} onError={setError} existing={list.wishes} />}
      <WishLists token={token} list={list} playing={playing} toggle={toggle} onChanged={reload} onError={setError} />
    </div>
  )
}

// ---------------- Stemning ----------------

function Prefs({ token, list, onError }: { token: string; list: Wishlist; onError: (e: string) => void }) {
  const [genres, setGenres] = useState<string[]>(list.genres)
  const [energy, setEnergy] = useState<number | null>(list.energy)
  const [notes, setNotes] = useState(list.notes ?? '')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const first = useRef(true)

  // Gem automatisk kort efter hver ændring
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaved('saving')
    const t = setTimeout(() => {
      saveMusicPrefs(token, genres, energy, notes)
        .then(() => setSaved('saved'))
        .catch((e: Error) => {
          setSaved('idle')
          onError(e.message)
        })
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genres, energy, notes])

  const ro = !list.editable

  return (
    <section className="card grid gap-5">
      <div className="flex items-center justify-between">
        <h2 className="step-title !mb-0">Stemning</h2>
        <span className="text-xs text-zinc-500">{saved === 'saving' ? 'Gemmer …' : saved === 'saved' ? 'Gemt ✓' : ''}</span>
      </div>

      <div>
        <p className="mb-2 text-sm text-zinc-400">Hvilke genrer skal med? (vælg gerne flere)</p>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => {
            const on = genres.includes(g)
            return (
              <button
                key={g}
                type="button"
                disabled={ro}
                className={`chip ${on ? 'choice-on' : ''}`}
                onClick={() => setGenres(on ? genres.filter((x) => x !== g) : [...genres, g])}
              >
                {g}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-zinc-400">Energiniveau på dansegulvet</span>
          <span className="font-semibold text-accent">{energy ? ENERGY_LABELS[energy] : 'Ikke valgt'}</span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          disabled={ro}
          value={energy ?? 3}
          onChange={(e) => setEnergy(Number(e.target.value))}
          className="w-full accent-[var(--color-accent)]"
          aria-label="Energiniveau"
        />
        <div className="mt-1 flex justify-between text-xs text-zinc-500">
          <span>Hyggeligt</span>
          <span>Fuld fart</span>
        </div>
      </div>

      <label className="field">
        <span>Andet jeg skal vide om musikken?</span>
        <textarea
          rows={3}
          disabled={ro}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="fx 'Mange ældre gæster til middagen – fest fra kl. 22'"
        />
      </label>
    </section>
  )
}

// ---------------- Søgning ----------------

function Search({
  token,
  playing,
  toggle,
  onAdded,
  onError,
  existing,
}: {
  token: string
  playing: string | null
  toggle: (url: string) => void
  onAdded: () => void
  onError: (e: string) => void
  existing: Wish[]
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [moment, setMoment] = useState('')

  useEffect(() => {
    setPicked(null)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const t = setTimeout(() => {
      searchSongs(q.trim(), ctrl.signal)
        .then(setResults)
        .catch((e: Error) => e.name !== 'AbortError' && onError(e.message))
        .finally(() => setLoading(false))
    }, 350)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const already = (s: Song) => existing.find((w) => w.title === s.title && w.artist === s.artist)

  const add = async (s: Song, kind: WishKind) => {
    try {
      await addWish(token, s, kind, kind === 'must' ? moment : undefined)
      setPicked(null)
      setMoment('')
      onAdded()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <section className="card">
      <h2 className="step-title">Find sange</h2>
      <div className="relative">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Søg på sang eller kunstner …"
          className="w-full rounded-full border border-zinc-700 bg-zinc-950 py-3 pl-11 pr-4 text-base outline-none focus:border-accent"
          aria-label="Søg efter sang"
        />
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">🔍</span>
      </div>

      {loading && <p className="mt-3 text-sm text-zinc-500">Søger …</p>}
      {!loading && q.trim().length >= 2 && results.length === 0 && <p className="mt-3 text-sm text-zinc-500">Ingen resultater.</p>}

      <div className="mt-2 divide-y divide-zinc-800">
        {results.map((s, i) => {
          const has = already(s)
          return (
            <div key={`${s.title}-${s.artist}-${i}`}>
              <SongRow song={s} playing={playing === s.preview_url} onPlay={() => s.preview_url && toggle(s.preview_url)}>
                {has ? (
                  <span className="shrink-0 text-xs text-zinc-500">{WISH_LABELS[has.kind]} ✓</span>
                ) : (
                  <button
                    type="button"
                    className={`icon-btn shrink-0 !size-9 text-lg ${picked === i ? 'border-accent text-accent' : ''}`}
                    onClick={() => setPicked(picked === i ? null : i)}
                    aria-label={`Tilføj ${s.title}`}
                  >
                    {picked === i ? '×' : '+'}
                  </button>
                )}
              </SongRow>
              {picked === i && (
                <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl bg-zinc-950/70 p-3">
                  <div className="grid grid-cols-3 gap-2">
                    <button className="btn !px-2 !py-2 text-sm" onClick={() => add(s, 'must')}>
                      ⭐ Skal spilles
                    </button>
                    <button className="btn-ghost !px-2 !py-2 text-sm" onClick={() => add(s, 'wish')}>
                      👍 Ønske
                    </button>
                    <button className="btn-ghost !px-2 !py-2 text-sm text-red-300" onClick={() => add(s, 'nope')}>
                      🚫 Må ikke
                    </button>
                  </div>
                  <input
                    list="moments"
                    value={moment}
                    onChange={(e) => setMoment(e.target.value)}
                    placeholder="Hvornår? fx Første dans (kun for 'Skal spilles')"
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <datalist id="moments">
        {MOMENTS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <p className="mt-3 text-xs text-zinc-500">Søgning og 30 sek. lydklip via iTunes/Deezer.</p>
    </section>
  )
}

// ---------------- Lister ----------------

function WishLists({
  token,
  list,
  playing,
  toggle,
  onChanged,
  onError,
}: {
  token: string
  list: Wishlist
  playing: string | null
  toggle: (url: string) => void
  onChanged: () => void
  onError: (e: string) => void
}) {
  const remove = async (id: string) => {
    try {
      await removeWish(token, id)
      onChanged()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <>
      {(['must', 'wish', 'nope'] as WishKind[]).map((kind) => {
        const items = list.wishes.filter((w) => w.kind === kind)
        return (
          <section key={kind} className="card">
            <h2 className="step-title !mb-1">
              {kind === 'must' ? '⭐' : kind === 'wish' ? '👍' : '🚫'} {WISH_LABELS[kind]}{' '}
              <span className="text-base font-normal text-zinc-500">({items.length})</span>
            </h2>
            {items.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {kind === 'must'
                  ? 'Fx første dans, indmarch eller jeres sang.'
                  : kind === 'wish'
                    ? 'Sange I gerne vil høre i løbet af aftenen.'
                    : 'Sange der absolut ikke skal spilles.'}
              </p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {items.map((w) => (
                  <SongRow key={w.id} song={w} playing={playing === w.preview_url} onPlay={() => w.preview_url && toggle(w.preview_url)}>
                    {w.moment && <span className="max-w-[7rem] shrink-0 truncate rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">{w.moment}</span>}
                    {list.editable && (
                      <button className="icon-btn shrink-0 text-zinc-400 hover:text-red-400" onClick={() => remove(w.id)} aria-label={`Fjern ${w.title}`}>
                        ×
                      </button>
                    )}
                  </SongRow>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
