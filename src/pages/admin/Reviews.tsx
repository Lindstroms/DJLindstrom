import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { da } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import Stars from '../../components/Stars'
import type { AdminReview } from '../../lib/reviews'

export default function Reviews() {
  const [rows, setRows] = useState<AdminReview[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase!
      .from('reviews')
      .select('*, bookings(customer_name)')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setRows(data as AdminReview[])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const update = async (id: string, patch: Partial<AdminReview>) => {
    const { error } = await supabase!.from('reviews').update(patch).eq('id', id)
    if (error) setError(error.message)
    load()
  }
  const remove = async (r: AdminReview) => {
    if (!confirm(`Slet anmeldelsen fra ${r.display_name}?`)) return
    const { error } = await supabase!.from('reviews').delete().eq('id', r.id)
    if (error) setError(error.message)
    load()
  }

  if (!rows) return error ? <p className="text-red-400">{error}</p> : <p className="text-zinc-400">Indlæser …</p>

  const shown = rows.filter((r) => r.approved && r.consent_publish)
  const avg = shown.length ? shown.reduce((s, r) => s + r.rating, 0) / shown.length : 0
  const pending = rows.filter((r) => !r.approved && r.consent_publish).length

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="card flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-black">{shown.length ? avg.toLocaleString('da-DK', { maximumFractionDigits: 1 }) : '–'}</p>
          <p className="text-sm text-zinc-400">
            {shown.length} vises på forsiden{pending > 0 && <span className="text-accent"> · {pending} venter på godkendelse</span>}
          </p>
        </div>
        <Stars value={Math.round(avg)} size="text-2xl" />
      </div>

      <p className="text-sm text-zinc-500">
        Kunder får automatisk en mail dagen efter festen med et link til at anmelde. Anmeldelser vises først på forsiden, når du har
        godkendt dem.
      </p>

      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}

      {rows.map((r) => (
        <div key={r.id} className={`card grid gap-2 ${r.approved && r.consent_publish ? 'border-emerald-500/40' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Stars value={r.rating} />
              <p className="mt-1 font-semibold">{r.display_name}</p>
              <p className="text-xs text-zinc-500">
                {[r.event_label, r.bookings?.customer_name && `booking: ${r.bookings.customer_name}`, format(parseISO(r.created_at), 'd. MMM yyyy', { locale: da })]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {r.consent_publish ? (
              <button
                onClick={() => update(r.id, { approved: !r.approved })}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${r.approved ? 'bg-emerald-500 text-black' : 'bg-accent text-black'}`}
              >
                {r.approved ? 'Vises ✓' : 'Godkend'}
              </button>
            ) : (
              <span className="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400" title="Kunden har ikke givet lov">
                Kun til dig
              </span>
            )}
          </div>
          {r.text && <p className="whitespace-pre-line text-zinc-300">“{r.text}”</p>}
          <div className="flex justify-end">
            <button className="text-xs text-red-400 hover:underline" onClick={() => remove(r)}>
              Slet
            </button>
          </div>
        </div>
      ))}

      <AddReview onAdded={load} />
    </div>
  )
}

// Tilføj en anmeldelse fra et tidligere job (fx fra en sms eller besked)
function AddReview({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const save = async () => {
    const { error } = await supabase!.from('reviews').insert({
      rating,
      display_name: name.trim(),
      event_label: label.trim() || null,
      text: text.trim() || null,
      consent_publish: true,
      approved: true,
    })
    if (error) return setError(error.message)
    setName('')
    setLabel('')
    setText('')
    setOpen(false)
    onAdded()
  }

  if (!open)
    return (
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        + Tilføj anmeldelse fra tidligere job
      </button>
    )

  return (
    <div className="card grid gap-3">
      <h3 className="font-semibold">Tilføj anmeldelse</h3>
      <p className="text-xs text-zinc-500">Kun anmeldelser du rent faktisk har fået – og har lov til at vise.</p>
      <Stars value={rating} onChange={setRating} size="text-3xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span>Navn *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="fx Mette, 50 års fødselsdag" />
        </label>
        <label className="field">
          <span>Event</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="fx Rund fødselsdag, maj 2026" />
        </label>
      </div>
      <label className="field">
        <span>Tekst</span>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={!name.trim()} onClick={save}>
          Gem og vis
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>
          Annullér
        </button>
      </div>
    </div>
  )
}
