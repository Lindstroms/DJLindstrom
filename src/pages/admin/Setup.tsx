import { useCallback, useEffect, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { da } from 'react-day-picker/locale'
import { format, parseISO, startOfToday } from 'date-fns'
import { da as daFns } from 'date-fns/locale'
import 'react-day-picker/style.css'
import { supabase } from '../../lib/supabase'
import type { EventTheme, EventType, SoundPackage } from '../../lib/types'

type Blocked = { date: string; reason: string | null }

// Oversætter databasefejl til noget Viktor kan handle på
function friendly(message: string) {
  if (message.includes('violates foreign key constraint'))
    return 'Den bruges af en eller flere forespørgsler og kan ikke slettes. Skjul den i stedet.'
  if (message.includes('duplicate key')) return 'Findes allerede.'
  return message
}

function useTable<T extends { id?: string }>(table: string, order = 'sort_order') {
  const [rows, setRows] = useState<T[] | null>(null)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    const { data, error } = await supabase!.from(table).select('*').order(order)
    if (error) setError(friendly(error.message))
    else setRows(data as T[])
  }, [table, order])

  useEffect(() => {
    reload()
  }, [reload])

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    setError('')
    const { error } = await p
    if (error) setError(friendly(error.message))
    await reload()
    return !error
  }

  return {
    rows,
    error,
    reload,
    update: (id: string, patch: Partial<T>) => run(supabase!.from(table).update(patch as Record<string, unknown>).eq('id', id)),
    insert: (row: Partial<T>) => run(supabase!.from(table).insert(row as Record<string, unknown>)),
    remove: (id: string) => run(supabase!.from(table).delete().eq('id', id)),
  }
}

// Bytter sort_order med naboen og normaliserer til 10, 20, 30 …
async function move<T extends { id: string }>(rows: T[], index: number, dir: -1 | 1, table: string, reload: () => void) {
  const j = index + dir
  if (j < 0 || j >= rows.length) return
  const order = rows.map((r) => r.id)
  ;[order[index], order[j]] = [order[j], order[index]]
  await Promise.all(order.map((id, i) => supabase!.from(table).update({ sort_order: (i + 1) * 10 }).eq('id', id)))
  reload()
}

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

export default function Setup() {
  const [section, setSection] = useState<'events' | 'packages' | 'dates' | 'calendar' | 'general'>('events')
  const tabs = [
    ['events', 'Event-typer'],
    ['packages', 'Lyd & lys'],
    ['dates', 'Blokerede datoer'],
    ['calendar', 'Kalender'],
    ['general', 'Generelt'],
  ] as const

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <button key={k} className={`chip ${section === k ? 'choice-on' : ''}`} onClick={() => setSection(k)}>
            {label}
          </button>
        ))}
      </div>
      {section === 'events' && <EventTypes />}
      {section === 'packages' && <Packages />}
      {section === 'dates' && <BlockedDates />}
      {section === 'calendar' && <CalendarFeed />}
      {section === 'general' && <General />}
    </div>
  )
}

function ErrorBox({ error }: { error: string }) {
  return error ? <p className="mb-3 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p> : null
}

function ActiveToggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'}`}
      title={active ? 'Vises for kunder – klik for at skjule' : 'Skjult for kunder – klik for at vise'}
    >
      {active ? 'Synlig' : 'Skjult'}
    </button>
  )
}

function MoveButtons({ onUp, onDown, first, last }: { onUp: () => void; onDown: () => void; first: boolean; last: boolean }) {
  return (
    <span className="flex gap-1">
      <button type="button" className="icon-btn" onClick={onUp} disabled={first} aria-label="Flyt op">
        ↑
      </button>
      <button type="button" className="icon-btn" onClick={onDown} disabled={last} aria-label="Flyt ned">
        ↓
      </button>
    </span>
  )
}

// ---------------- Event-typer + temaer ----------------

function EventTypes() {
  const types = useTable<EventType>('event_types')
  const themes = useTable<EventTheme>('event_themes')
  const [openId, setOpenId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const add = async () => {
    if (!newName.trim()) return
    const max = Math.max(0, ...(types.rows ?? []).map((t) => t.sort_order))
    if (await types.insert({ name: newName.trim(), icon: '🎵', sort_order: max + 10 })) setNewName('')
  }

  if (!types.rows) return <p className="text-zinc-400">Indlæser …</p>

  return (
    <div className="grid gap-3">
      <ErrorBox error={types.error || themes.error} />
      {types.rows.map((t, i) => {
        const open = openId === t.id
        const own = (themes.rows ?? []).filter((th) => th.event_type_id === t.id)
        return (
          <div key={t.id} className="card !p-0 overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpenId(open ? null : t.id)}>
                <span className="text-2xl">{t.icon}</span>
                <span className="min-w-0">
                  <span className={`block truncate font-semibold ${t.active ? '' : 'text-zinc-500 line-through'}`}>{t.name}</span>
                  <span className="text-xs text-zinc-400">
                    {Number(t.min_hours)}–{Number(t.max_hours)} timer
                    {own.length > 0 && ` · ${own.length} temaer`}
                    {t.price != null && ` · ${Number(t.price)} kr.`}
                  </span>
                </span>
              </button>
              <MoveButtons
                first={i === 0}
                last={i === types.rows!.length - 1}
                onUp={() => move(types.rows!, i, -1, 'event_types', types.reload)}
                onDown={() => move(types.rows!, i, 1, 'event_types', types.reload)}
              />
              <ActiveToggle active={t.active} onChange={(v) => types.update(t.id, { active: v })} />
            </div>

            {open && (
              <div className="grid gap-4 border-t border-zinc-800 p-4">
                <div className="grid grid-cols-[5rem_1fr] gap-3">
                  <label className="field">
                    <span>Ikon</span>
                    <input defaultValue={t.icon ?? ''} maxLength={4} onBlur={(e) => types.update(t.id, { icon: e.target.value || null })} />
                  </label>
                  <label className="field">
                    <span>Navn</span>
                    <input defaultValue={t.name} onBlur={(e) => e.target.value.trim() && types.update(t.id, { name: e.target.value.trim() })} />
                  </label>
                </div>
                <label className="field">
                  <span>Beskrivelse (vises for kunden)</span>
                  <input defaultValue={t.description ?? ''} onBlur={(e) => types.update(t.id, { description: e.target.value || null })} />
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <label className="field">
                    <span>Min. timer</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      defaultValue={Number(t.min_hours)}
                      onBlur={(e) => types.update(t.id, { min_hours: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Maks. timer</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      defaultValue={Number(t.max_hours)}
                      onBlur={(e) => types.update(t.id, { max_hours: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Pris fra (kr.)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      defaultValue={t.price ?? ''}
                      onBlur={(e) => types.update(t.id, { price: numOrNull(e.target.value) })}
                    />
                  </label>
                </div>

                <Themes eventTypeId={t.id} themes={own} table={themes} />

                <div className="flex justify-end">
                  <button
                    className="text-sm text-red-400 hover:underline"
                    onClick={() => confirm(`Slet "${t.name}"?`) && types.remove(t.id)}
                  >
                    Slet event-type
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div className="card flex gap-2">
        <input
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5"
          placeholder="Ny event-type, fx Konfirmation"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn" onClick={add} disabled={!newName.trim()}>
          Tilføj
        </button>
      </div>
    </div>
  )
}

function Themes({
  eventTypeId,
  themes,
  table,
}: {
  eventTypeId: string
  themes: EventTheme[]
  table: ReturnType<typeof useTable<EventTheme>>
}) {
  const [name, setName] = useState('')
  const add = async () => {
    if (!name.trim()) return
    const max = Math.max(0, ...themes.map((t) => t.sort_order))
    if (await table.insert({ event_type_id: eventTypeId, name: name.trim(), sort_order: max + 10 })) setName('')
  }

  return (
    <div>
      <p className="mb-2 text-sm text-zinc-400">Temaer (valgfrit – kunden kan vælge ét)</p>
      <div className="flex flex-wrap gap-2">
        {themes.map((th) => (
          <span
            key={th.id}
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${th.active ? 'border-zinc-600' : 'border-zinc-800 text-zinc-500 line-through'}`}
          >
            <button onClick={() => table.update(th.id, { active: !th.active })} title={th.active ? 'Skjul' : 'Vis'}>
              {th.name}
            </button>
            <button
              className="ml-1 text-zinc-500 hover:text-red-400"
              onClick={() => confirm(`Slet temaet "${th.name}"?`) && table.remove(th.id)}
              aria-label={`Slet ${th.name}`}
            >
              ×
            </button>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <input
            className="w-36 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm"
            placeholder="+ nyt tema"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Klik på et tema for at skjule/vise det.</p>
    </div>
  )
}

// ---------------- Lydpakker ----------------

function Packages() {
  const pk = useTable<SoundPackage>('sound_packages')
  const [newName, setNewName] = useState('')

  const add = async () => {
    if (!newName.trim()) return
    const max = Math.max(0, ...(pk.rows ?? []).map((p) => p.sort_order))
    if (await pk.insert({ name: newName.trim(), sort_order: max + 10 })) setNewName('')
  }

  if (!pk.rows) return <p className="text-zinc-400">Indlæser …</p>

  return (
    <div className="grid gap-3">
      <ErrorBox error={pk.error} />
      {pk.rows.map((p, i) => (
        <div key={p.id} className="card grid grid-cols-1 gap-3">
          <div className="flex items-center gap-2">
            <input
              className={`min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-semibold ${p.active ? '' : 'text-zinc-500 line-through'}`}
              defaultValue={p.name}
              onBlur={(e) => e.target.value.trim() && pk.update(p.id, { name: e.target.value.trim() })}
              aria-label="Navn"
            />
            <MoveButtons
              first={i === 0}
              last={i === pk.rows!.length - 1}
              onUp={() => move(pk.rows!, i, -1, 'sound_packages', pk.reload)}
              onDown={() => move(pk.rows!, i, 1, 'sound_packages', pk.reload)}
            />
            <ActiveToggle active={p.active} onChange={(v) => pk.update(p.id, { active: v })} />
          </div>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <label className="field">
              <span>Beskrivelse</span>
              <input defaultValue={p.description ?? ''} onBlur={(e) => pk.update(p.id, { description: e.target.value || null })} />
            </label>
            <label className="field">
              <span>Pris (kr.)</span>
              <input
                type="number"
                inputMode="numeric"
                defaultValue={p.price ?? ''}
                onBlur={(e) => pk.update(p.id, { price: numOrNull(e.target.value) })}
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button className="text-sm text-red-400 hover:underline" onClick={() => confirm(`Slet "${p.name}"?`) && pk.remove(p.id)}>
              Slet
            </button>
          </div>
        </div>
      ))}

      <div className="card flex gap-2">
        <input
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5"
          placeholder="Ny lydpakke eller tilvalg"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn" onClick={add} disabled={!newName.trim()}>
          Tilføj
        </button>
      </div>
    </div>
  )
}

// ---------------- Blokerede datoer ----------------

function BlockedDates() {
  const [rows, setRows] = useState<Blocked[] | null>(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')

  const reload = useCallback(async () => {
    const { data, error } = await supabase!.from('blocked_dates').select('*').order('date')
    if (error) setError(error.message)
    else setRows(data as Blocked[])
  }, [])
  useEffect(() => {
    reload()
  }, [reload])

  const toggle = async (day: Date) => {
    const date = format(day, 'yyyy-MM-dd')
    setError('')
    const exists = rows?.some((r) => r.date === date)
    const { error } = exists
      ? await supabase!.from('blocked_dates').delete().eq('date', date)
      : await supabase!.from('blocked_dates').insert({ date, reason: reason.trim() || null })
    if (error) setError(friendly(error.message))
    reload()
  }

  if (!rows) return <p className="text-zinc-400">Indlæser …</p>
  const today = format(startOfToday(), 'yyyy-MM-dd')
  const upcoming = rows.filter((r) => r.date >= today)

  return (
    <div className="grid gap-3">
      <ErrorBox error={error} />
      <div className="card">
        <p className="mb-3 text-sm text-zinc-400">
          Klik på en dato for at blokere den (så kunder ikke kan vælge den). Klik igen for at åbne den.
        </p>
        <label className="field mb-2">
          <span>Årsag (valgfri, kun synlig for dig)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="fx Ferie, Eksamen" />
        </label>
        <div className="flex justify-center">
          <DayPicker
            mode="multiple"
            locale={da}
            selected={rows.map((r) => parseISO(r.date))}
            onDayClick={toggle}
            disabled={{ before: startOfToday() }}
            startMonth={startOfToday()}
            showOutsideDays
          />
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="card">
          <h3 className="mb-2 font-semibold">Kommende blokerede datoer</h3>
          <ul className="grid gap-1 text-sm">
            {upcoming.map((r) => (
              <li key={r.date} className="flex items-center justify-between gap-2">
                <span className="first-letter:uppercase">
                  {format(parseISO(r.date), 'EEEE d. MMMM yyyy', { locale: daFns })}
                  {r.reason && <span className="text-zinc-400"> – {r.reason}</span>}
                </span>
                <button className="text-zinc-500 hover:text-red-400" onClick={() => toggle(parseISO(r.date))} aria-label="Fjern">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------- Generelt ----------------

function General() {
  const [showPrices, setShowPrices] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase!
      .from('settings')
      .select('show_prices')
      .single()
      .then(({ data, error }) => (error ? setError(error.message) : setShowPrices(data.show_prices)))
  }, [])

  const save = async (v: boolean) => {
    setShowPrices(v)
    const { error } = await supabase!.from('settings').update({ show_prices: v }).eq('id', true)
    if (error) {
      setError(error.message)
      setShowPrices(!v)
    }
  }

  if (showPrices === null) return error ? <ErrorBox error={error} /> : <p className="text-zinc-400">Indlæser …</p>

  return (
    <div className="card grid gap-3">
      <ErrorBox error={error} />
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 size-5 accent-[var(--color-accent)]" checked={showPrices} onChange={(e) => save(e.target.checked)} />
        <span>
          <span className="block font-semibold">Vis priser for kunder</span>
          <span className="text-sm text-zinc-400">
            Viser "fra"-pris på event-typer og pris på lydpakker i booking-flowet. Kun elementer med en udfyldt pris vises med
            pris.
          </span>
        </span>
      </label>
    </div>
  )
}

// ---------------- Kalender-abonnement ----------------

const FEED_URL = 'vubxctebuwiftamiskxs.supabase.co/functions/v1/calendar-feed?token='

function CalendarFeed() {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase!
      .from('settings')
      .select('calendar_token')
      .single()
      .then(({ data, error }) => (error ? setError(error.message) : setToken(data.calendar_token)))
  }, [])

  const regenerate = async () => {
    if (!confirm('Lav et nyt link? Det gamle link holder op med at virke, og kalenderen skal tilføjes igen på telefonen.')) return
    const bytes = crypto.getRandomValues(new Uint8Array(24))
    const next = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    const { error } = await supabase!.from('settings').update({ calendar_token: next }).eq('id', true)
    if (error) setError(error.message)
    else setToken(next)
  }

  const copy = async () => {
    await navigator.clipboard.writeText('https://' + FEED_URL + token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!token) return error ? <ErrorBox error={error} /> : <p className="text-zinc-400">Indlæser …</p>

  return (
    <div className="grid gap-3">
      <ErrorBox error={error} />
      <div className="card grid gap-4">
        <div>
          <h3 className="font-semibold">Abonnér på dine jobs i iPhone-kalenderen</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Bekræftede og afholdte jobs vises automatisk i kalenderen – med kunde, telefon, adresse og noter. iPhone henter
            ændringer løbende (typisk inden for en time).
          </p>
        </div>
        <a className="btn text-center" href={'webcal://' + FEED_URL + token}>
          📅 Abonnér på iPhone
        </a>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-400">
          <li>Åbn denne side i Safari på iPhonen og tryk på knappen ovenfor.</li>
          <li>Tryk <b>Abonner</b> og derefter <b>Tilføj</b>.</li>
          <li>
            Virker knappen ikke: kopiér linket og tilføj det under <i>Indstillinger → Kalender → Konti → Tilføj konto → Andet →
            Tilføj abonnent-kalender</i>.
          </li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost text-sm" onClick={copy}>
            {copied ? 'Kopieret ✓' : 'Kopiér link'}
          </button>
          <button className="btn-ghost text-sm text-red-300" onClick={regenerate}>
            Lav nyt link
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Linket giver adgang til kundeoplysninger – del det ikke. Er det kommet ud, så tryk "Lav nyt link".
        </p>
      </div>
    </div>
  )
}
