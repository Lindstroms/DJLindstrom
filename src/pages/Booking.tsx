import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DayPicker } from 'react-day-picker'
import { da } from 'react-day-picker/locale'
import { format, parseISO, startOfToday } from 'date-fns'
import { da as daFns } from 'date-fns/locale'
import 'react-day-picker/style.css'
import { submitBookingRequest } from '../lib/api'
import type { Catalog } from '../lib/types'

const STEPS = ['Event', 'Dato & tid', 'Lyd & lys', 'Oplysninger', 'Send']

const START_TIMES = Array.from({ length: 34 }, (_, i) => {
  const minutes = 7 * 60 + i * 30 // 07:00 – 23:30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

type Form = {
  eventTypeId: string
  themeId: string
  date: Date | undefined
  startTime: string
  hours: number
  packageIds: string[]
  name: string
  company: string
  email: string
  phone: string
  address: string
  guests: string
  message: string
  consent: boolean
}

const emptyForm: Form = {
  eventTypeId: '',
  themeId: '',
  date: undefined,
  startTime: '20:00',
  hours: 4,
  packageIds: [],
  name: '',
  company: '',
  email: '',
  phone: '',
  address: '',
  guests: '',
  message: '',
  consent: false,
}

const kr = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 })

// preselect: event-type valgt fra forsiden (nonce gør, at samme type kan vælges igen)
export default function Booking({ catalog, preselect }: { catalog: Catalog; preselect?: { id: string; nonce: number } }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form>(emptyForm)
  const [sending, setSending] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const topRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  // Ved skift af trin: rul toppen af flowet i syne (vigtigt på mobil)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const top = topRef.current?.getBoundingClientRect().top ?? 0
    if (top < 0) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [step])

  useEffect(() => {
    if (!preselect) return
    const t = catalog.eventTypes.find((x) => x.id === preselect.id)
    if (!t) return
    chooseEventType(t.id)
    setStep(catalog.themes.some((th) => th.event_type_id === t.id) ? 0 : 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  const eventType = catalog?.eventTypes.find((t) => t.id === form.eventTypeId)
  const themes = catalog?.themes.filter((t) => t.event_type_id === form.eventTypeId) ?? []
  const theme = themes.find((t) => t.id === form.themeId)
  const blocked = useMemo(() => (catalog?.blockedDates ?? []).map((d) => parseISO(d)), [catalog])

  const hourOptions = useMemo(() => {
    if (!eventType) return []
    const opts: number[] = []
    for (let h = Number(eventType.min_hours); h <= Number(eventType.max_hours); h += 0.5) opts.push(h)
    return opts
  }, [eventType])

  function chooseEventType(id: string) {
    const t = catalog.eventTypes.find((x) => x.id === id)!
    setForm((f) => ({
      ...f,
      eventTypeId: id,
      themeId: '',
      hours: Math.min(Math.max(f.hours, Number(t.min_hours)), Number(t.max_hours)),
    }))
  }

  const togglePackage = (id: string) =>
    set('packageIds', form.packageIds.includes(id) ? form.packageIds.filter((p) => p !== id) : [...form.packageIds, id])

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())
  const canContinue = [
    !!form.eventTypeId,
    !!form.date && !!form.startTime && !!form.hours,
    true,
    !!form.name.trim() && emailOk && !!form.phone.trim() && !!form.address.trim(),
    form.consent,
  ][step]

  const submit = async () => {
    setSending(true)
    setSubmitError('')
    try {
      await submitBookingRequest({
        event_type_id: form.eventTypeId,
        event_theme_id: form.themeId || null,
        event_date: format(form.date!, 'yyyy-MM-dd'),
        start_time: form.startTime,
        hours: form.hours,
        venue_address: form.address.trim(),
        guest_count: form.guests ? Number(form.guests) : null,
        customer_name: form.name.trim(),
        company: form.company.trim() || null,
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: form.message.trim() || null,
        package_ids: form.packageIds,
      })
      navigate('/tak')
    } catch (e) {
      setSubmitError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div ref={topRef} className="scroll-mt-24">

      {/* Fremskridt */}
      <ol className="mb-6 flex gap-1.5" aria-label="Trin">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? 'bg-accent' : 'bg-zinc-800'}`} />
            <span className={`mt-1.5 hidden text-xs sm:block ${i === step ? 'text-zinc-100' : 'text-zinc-500'}`}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      <section className="card">
        {step === 0 && (
          <>
            <h2 className="step-title">Hvilken slags event?</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {catalog.eventTypes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => chooseEventType(t.id)}
                  className={`choice flex flex-col items-start text-left ${form.eventTypeId === t.id ? 'choice-on' : ''}`}
                >
                  <span className="text-2xl">{t.icon}</span>
                  <span className="mt-1 font-semibold">{t.name}</span>
                  {t.description && <span className="text-xs text-zinc-400">{t.description}</span>}
                  {catalog.showPrices && t.price != null && (
                    <span className="mt-1 text-xs text-accent">fra {kr(t.price)}</span>
                  )}
                </button>
              ))}
            </div>

            {themes.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 font-semibold">Tema (valgfrit)</h3>
                <div className="flex flex-wrap gap-2">
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => set('themeId', form.themeId === t.id ? '' : t.id)}
                      className={`chip ${form.themeId === t.id ? 'choice-on' : ''}`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="step-title">Hvornår er festen?</h2>
            <div className="flex justify-center">
              <DayPicker
                mode="single"
                locale={da}
                selected={form.date}
                onSelect={(d) => set('date', d)}
                disabled={[{ before: startOfToday() }, ...blocked]}
                startMonth={startOfToday()}
                showOutsideDays
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="field">
                <span>Starttidspunkt</span>
                <select value={form.startTime} onChange={(e) => set('startTime', e.target.value)}>
                  {START_TIMES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Antal timer der skal spilles</span>
                <select value={form.hours} onChange={(e) => set('hours', Number(e.target.value))}>
                  {hourOptions.map((h) => (
                    <option key={h} value={h}>
                      {h.toLocaleString('da-DK')} timer
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="step-title">Lyd og lys</h2>
            <p className="-mt-2 mb-4 text-sm text-zinc-400">
              Vælg det du ønsker – er du i tvivl, så spring over, så rådgiver vi dig i tilbuddet.
            </p>
            <div className="grid gap-3">
              {catalog.packages.map((p) => {
                const on = form.packageIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePackage(p.id)}
                    className={`choice flex items-center gap-3 text-left ${on ? 'choice-on' : ''}`}
                    aria-pressed={on}
                  >
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded border ${on ? 'border-accent bg-accent text-black' : 'border-zinc-600'}`}
                    >
                      {on && '✓'}
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold">{p.name}</span>
                      {p.description && <span className="text-sm text-zinc-400">{p.description}</span>}
                    </span>
                    {catalog.showPrices && p.price != null && <span className="text-sm text-accent">{kr(p.price)}</span>}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="step-title">Dine oplysninger</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field">
                <span>Navn *</span>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
              </label>
              <label className="field">
                <span>Firma</span>
                <input value={form.company} onChange={(e) => set('company', e.target.value)} autoComplete="organization" />
              </label>
              <label className="field">
                <span>E-mail *</span>
                <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
              </label>
              <label className="field">
                <span>Telefon *</span>
                <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
              </label>
              <label className="field sm:col-span-2">
                <span>Adresse for eventet *</span>
                <input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Sted, vej, postnr. og by" />
              </label>
              <label className="field">
                <span>Forventet antal gæster</span>
                <input type="number" min={0} inputMode="numeric" value={form.guests} onChange={(e) => set('guests', e.target.value)} />
              </label>
              <label className="field sm:col-span-2">
                <span>Besked / musikønsker</span>
                <textarea rows={4} value={form.message} onChange={(e) => set('message', e.target.value)} />
              </label>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="step-title">Tjek og send</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-zinc-400">Event</dt>
              <dd>
                {eventType?.icon} {eventType?.name}
                {theme && ` – ${theme.name}`}
              </dd>
              <dt className="text-zinc-400">Dato</dt>
              <dd className="first-letter:uppercase">{form.date && format(form.date, 'EEEE d. MMMM yyyy', { locale: daFns })}</dd>
              <dt className="text-zinc-400">Tid</dt>
              <dd>
                kl. {form.startTime}, {form.hours.toLocaleString('da-DK')} timer
              </dd>
              <dt className="text-zinc-400">Lyd & lys</dt>
              <dd>
                {form.packageIds.length
                  ? catalog.packages.filter((p) => form.packageIds.includes(p.id)).map((p) => p.name).join(', ')
                  : 'Rådgiv mig'}
              </dd>
              <dt className="text-zinc-400">Kontakt</dt>
              <dd>
                {form.name}
                {form.company && `, ${form.company}`}
                <br />
                {form.email} · {form.phone}
              </dd>
              <dt className="text-zinc-400">Adresse</dt>
              <dd>{form.address}</dd>
              {form.guests && (
                <>
                  <dt className="text-zinc-400">Gæster</dt>
                  <dd>{form.guests}</dd>
                </>
              )}
              {form.message && (
                <>
                  <dt className="text-zinc-400">Besked</dt>
                  <dd className="whitespace-pre-line">{form.message}</dd>
                </>
              )}
            </dl>
            <label className="mt-6 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
                checked={form.consent}
                onChange={(e) => set('consent', e.target.checked)}
              />
              <span className="text-zinc-300">
                Jeg accepterer, at DJ Lindstrom gemmer mine oplysninger for at kunne sende et tilbud og håndtere
                bookingen. Oplysningerne deles ikke med andre.
              </span>
            </label>
            {submitError && <p className="mt-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{submitError}</p>}
          </>
        )}
      </section>

      <nav className="mt-6 flex justify-between gap-3">
        <button type="button" className="btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          Tilbage
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn" disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
            Videre
          </button>
        ) : (
          <button type="button" className="btn" disabled={!canContinue || sending} onClick={submit}>
            {sending ? 'Sender …' : 'Send forespørgsel'}
          </button>
        )}
      </nav>
    </div>
  )
}
