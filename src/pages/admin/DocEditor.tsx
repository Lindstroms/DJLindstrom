import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  DOC_TITLES,
  STATUS_LABEL,
  VAT,
  calcTotals,
  createFollowUp,
  deleteDraft,
  docLabel,
  docUrl,
  finalizeDoc,
  getDoc,
  getFinanceSettings,
  isOverdue,
  kr,
  listPackages,
  packageLine,
  saveDraft,
  sendDoc,
  setPaid,
  setQuoteStatus,
  type CatalogPackage,
  type Doc,
  type DocLine,
  type FinanceSettings,
} from '../../lib/finance'
import RequireAdmin from './RequireAdmin'

export default function DocEditorPage() {
  return (
    <RequireAdmin>
      <DocEditor />
    </RequireAdmin>
  )
}

const dateDa = (d: string | null) => (d ? format(parseISO(d), 'd. MMMM yyyy', { locale: da }) : '–')

// Priser vises/indtastes inkl. moms som standard (det er sådan private kunder tænker)
function usePriceMode() {
  const [incl, setIncl] = useState(() => {
    try {
      return localStorage.getItem('djl-prices-ex-vat') !== '1'
    } catch {
      return true
    }
  })
  const toggle = (v: boolean) => {
    setIncl(v)
    try {
      localStorage.setItem('djl-prices-ex-vat', v ? '0' : '1')
    } catch {
      /* ignoreres */
    }
  }
  return [incl, toggle] as const
}

function DocEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [lines, setLines] = useState<DocLine[]>([])
  const [settings, setSettings] = useState<FinanceSettings | null>(null)
  const [packages, setPackages] = useState<CatalogPackage[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [saved, setSaved] = useState(false)
  const [inclVat, setInclVat] = usePriceMode()

  const load = useCallback(async () => {
    try {
      const [{ doc, lines }, s, pk] = await Promise.all([getDoc(id), getFinanceSettings(), listPackages()])
      setDoc(doc)
      setLines(lines)
      setSettings(s)
      setPackages(pk)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])
  useEffect(() => {
    load()
  }, [load])

  if (!doc || !settings) return error ? <p className="text-red-400">{error}</p> : <p className="text-zinc-400">Indlæser …</p>

  const draft = doc.status === 'kladde'
  const factor = settings.vat_registered && inclVat ? 1 + VAT : 1
  const totals = draft ? calcTotals(lines, settings.vat_registered) : { subtotal: doc.subtotal, vat: doc.vat, total: doc.total }

  const set = <K extends keyof Doc>(k: K, v: Doc[K]) => {
    setDoc({ ...doc, [k]: v })
    setSaved(false)
  }
  const setLine = (i: number, patch: Partial<DocLine>) => {
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
    setSaved(false)
  }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const save = () =>
    saveDraft(
      doc.id,
      {
        customer_name: doc.customer_name,
        customer_company: doc.customer_company || null,
        customer_address: doc.customer_address || null,
        customer_email: doc.customer_email,
        customer_cvr: doc.customer_cvr || null,
        delivery_date: doc.delivery_date || null,
        note: doc.note || null,
      },
      lines.filter((l) => l.description.trim() || Number(l.unit_price) !== 0),
    )

  const issueAndSend = () =>
    run('send', async () => {
      await save()
      if (
        !confirm(
          `${DOC_TITLES[doc.type]} på ${kr(totals.total)} udstedes og sendes til ${doc.customer_email}.\n\nEt udstedt dokument får et fast nummer og kan ikke ændres bagefter. Fortsæt?`,
        )
      )
        return
      const d = await finalizeDoc(doc.id)
      setDoc(d)
      await sendDoc(doc.id)
      await load()
    })

  const followUp = (type: 'faktura' | 'kreditnota') =>
    run(type, async () => {
      const newId = await createFollowUp(doc, lines, type)
      navigate(`/admin/dok/${newId}`)
    })

  return (
    <div className="grid grid-cols-1 gap-4 pb-16">
      <Link to="/admin" state={{ tab: 'finance' }} className="text-sm text-zinc-400 hover:text-white">
        ← Økonomi
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black">{docLabel(doc)}</h1>
          <p className="text-sm text-zinc-400">
            {STATUS_LABEL[doc.status]}
            {isOverdue(doc) && <span className="text-red-400"> · forfalden</span>}
            {doc.reminder_count > 0 && ` · ${doc.reminder_count} rykker${doc.reminder_count > 1 ? 'e' : ''} sendt`}
          </p>
        </div>
        {!draft && (
          <a href={docUrl(doc.public_token)} target="_blank" rel="noreferrer" className="btn-ghost text-sm">
            Kundevisning / PDF ↗
          </a>
        )}
      </header>

      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}

      {/* Kunde */}
      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Kunde</h2>
        <Field label="Navn *" value={doc.customer_name} disabled={!draft} onChange={(v) => set('customer_name', v)} />
        <Field label="Firma" value={doc.customer_company ?? ''} disabled={!draft} onChange={(v) => set('customer_company', v)} />
        <Field label="E-mail *" type="email" value={doc.customer_email} disabled={!draft} onChange={(v) => set('customer_email', v)} />
        <Field label="CVR / EAN" value={doc.customer_cvr ?? ''} disabled={!draft} onChange={(v) => set('customer_cvr', v)} />
        <label className="field sm:col-span-2">
          <span>Adresse {doc.type !== 'tilbud' && '*'}</span>
          <textarea
            rows={2}
            value={doc.customer_address ?? ''}
            disabled={!draft}
            onChange={(e) => set('customer_address', e.target.value)}
            placeholder={'Vej og nr.\nPostnr. og by'}
          />
        </label>
      </section>

      {/* Linjer */}
      <section className="card grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Linjer</h2>
          {draft && settings.vat_registered && (
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input type="checkbox" className="accent-[var(--color-accent)]" checked={inclVat} onChange={(e) => setInclVat(e.target.checked)} />
              Indtast priser inkl. moms
            </label>
          )}
        </div>
        {lines.map((l, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] gap-2 rounded-xl border border-zinc-800 p-3 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_8rem_auto]"
          >
            <textarea
              rows={2}
              className="col-span-4 min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 sm:col-span-1"
              value={l.description}
              disabled={!draft}
              onChange={(e) => setLine(i, { description: e.target.value })}
              placeholder="Beskrivelse"
              aria-label="Beskrivelse"
            />
            <input
              type="number"
              step="0.5"
              className="w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-right"
              value={l.quantity}
              disabled={!draft}
              onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
              aria-label="Antal"
            />
            <input
              className="w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2"
              value={l.unit}
              disabled={!draft}
              onChange={(e) => setLine(i, { unit: e.target.value })}
              aria-label="Enhed"
            />
            <input
              type="number"
              step="0.01"
              className="w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-right"
              value={Math.round(Number(l.unit_price) * factor * 100) / 100}
              disabled={!draft}
              onChange={(e) => setLine(i, { unit_price: Math.round((Number(e.target.value) / factor) * 10000) / 10000 })}
              aria-label={`Pris ${factor > 1 ? 'inkl.' : 'ekskl.'} moms`}
            />
            {draft ? (
              <button className="icon-btn self-center text-red-400" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Fjern linje">
                ×
              </button>
            ) : (
              <span className="self-center text-right text-sm text-zinc-400">{kr(l.quantity * l.unit_price)}</span>
            )}
          </div>
        ))}
        {draft && (
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="cursor-pointer rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm font-semibold"
              value=""
              onChange={(e) => {
                const p = packages.find((x) => x.id === e.target.value)
                if (p) {
                  setLines([...lines, { ...packageLine(p), sort: lines.length }])
                  setSaved(false)
                }
              }}
              aria-label="Tilføj lyd og lys"
            >
              <option value="">+ Tilføj lyd & lys …</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.price != null ? ` – ${kr(Number(p.price))}` : ' – (ingen pris)'}
                  {p.active ? '' : ' (skjult)'}
                </option>
              ))}
            </select>
            <button
              className="btn-ghost text-sm"
              onClick={() => setLines([...lines, { sort: lines.length, description: '', quantity: 1, unit: 'stk.', unit_price: 0 }])}
            >
              + Tilføj tom linje
            </button>
          </div>
        )}
        <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-400">Subtotal ekskl. moms</dt>
          <dd className="text-right">{kr(totals.subtotal)}</dd>
          {settings.vat_registered && (
            <>
              <dt className="text-zinc-400">Moms 25 %</dt>
              <dd className="text-right">{kr(totals.vat)}</dd>
            </>
          )}
          <dt className="font-semibold">I alt</dt>
          <dd className="text-right font-display text-lg font-black">{kr(totals.total)}</dd>
        </dl>
      </section>

      {/* Datoer og note */}
      <section className="card grid gap-3 sm:grid-cols-2">
        <Field label="Leveringsdato (eventdato)" type="date" value={doc.delivery_date ?? ''} disabled={!draft} onChange={(v) => set('delivery_date', v)} />
        {!draft && (
          <div className="grid gap-1 text-sm">
            <span className="text-zinc-400">Udstedt</span>
            <span>{dateDa(doc.issue_date)}</span>
            {doc.type === 'faktura' && <span className="text-zinc-400">Forfald: <span className="text-white">{dateDa(doc.due_date)}</span></span>}
            {doc.type === 'tilbud' && <span className="text-zinc-400">Gyldigt til: <span className="text-white">{dateDa(doc.valid_until)}</span></span>}
          </div>
        )}
        {draft && (
          <p className="self-end text-xs text-zinc-500">
            {doc.type === 'faktura' && `Forfald sættes til ${settings.payment_terms_days} dage efter udstedelse.`}
            {doc.type === 'tilbud' && `Tilbuddet gælder ${settings.quote_valid_days} dage fra udstedelse.`}
          </p>
        )}
        <label className="field sm:col-span-2">
          <span>Note til kunden</span>
          <textarea rows={2} value={doc.note ?? ''} disabled={!draft} onChange={(e) => set('note', e.target.value)} />
        </label>
      </section>

      {/* Handlinger */}
      <section className="flex flex-wrap gap-2">
        {draft && (
          <>
            <button className="btn" disabled={!!busy} onClick={issueAndSend}>
              {busy === 'send' ? 'Sender …' : `Udsted og send ${DOC_TITLES[doc.type].toLowerCase()}`}
            </button>
            <button
              className="btn-ghost"
              disabled={!!busy}
              onClick={() =>
                run('save', async () => {
                  await save()
                  setSaved(true)
                  await load()
                })
              }
            >
              {busy === 'save' ? 'Gemmer …' : saved ? 'Gemt ✓' : 'Gem kladde'}
            </button>
            <button
              className="btn-ghost text-red-300"
              disabled={!!busy}
              onClick={() =>
                confirm('Slet kladden?') &&
                run('delete', async () => {
                  await deleteDraft(doc.id)
                  navigate('/admin', { state: { tab: 'finance' } })
                })
              }
            >
              Slet kladde
            </button>
          </>
        )}

        {!draft && (
          <button className="btn-ghost" disabled={!!busy} onClick={() => run('resend', () => sendDoc(doc.id))}>
            {busy === 'resend' ? 'Sender …' : 'Send igen'}
          </button>
        )}
        {doc.type === 'tilbud' && doc.status === 'sendt' && (
          <>
            <button className="btn-ghost" disabled={!!busy} onClick={() => run('acc', async () => (await setQuoteStatus(doc.id, 'accepteret'), load()))}>
              Markér accepteret
            </button>
            <button className="btn-ghost" disabled={!!busy} onClick={() => run('rej', async () => (await setQuoteStatus(doc.id, 'afvist'), load()))}>
              Markér afvist
            </button>
          </>
        )}
        {doc.type === 'tilbud' && ['sendt', 'accepteret'].includes(doc.status) && (
          <button className="btn" disabled={!!busy} onClick={() => followUp('faktura')}>
            Lav faktura ud fra tilbud
          </button>
        )}
        {doc.type === 'faktura' && doc.status === 'sendt' && (
          <button className="btn" disabled={!!busy} onClick={() => run('paid', async () => (await setPaid(doc.id, true), load()))}>
            Markér som betalt
          </button>
        )}
        {doc.type === 'faktura' && doc.status === 'betalt' && (
          <button className="btn-ghost" disabled={!!busy} onClick={() => run('unpaid', async () => (await setPaid(doc.id, false), load()))}>
            Fortryd betalt
          </button>
        )}
        {doc.type === 'faktura' && ['sendt', 'betalt'].includes(doc.status) && (
          <button className="btn-ghost text-red-300" disabled={!!busy} onClick={() => followUp('kreditnota')}>
            Lav kreditnota
          </button>
        )}
      </section>

      {!draft && doc.paid_at && <p className="text-sm text-emerald-400">Betalt {dateDa(doc.paid_at.slice(0, 10))}</p>}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  disabled?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
