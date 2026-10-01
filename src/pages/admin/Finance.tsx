import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  DOC_TITLES,
  STATUS_LABEL,
  createBlank,
  exportCsv,
  getFinanceSettings,
  isOverdue,
  kr,
  listDocs,
  saveFinanceSettings,
  type Doc,
  type DocStatus,
  type DocType,
  type FinanceSettings,
} from '../../lib/finance'

const STATUS_COLOR: Record<DocStatus, string> = {
  kladde: 'bg-zinc-800 text-zinc-300',
  sendt: 'bg-amber-400 text-black',
  accepteret: 'bg-emerald-500 text-black',
  afvist: 'bg-zinc-800 text-zinc-500',
  betalt: 'bg-emerald-500 text-black',
  krediteret: 'bg-zinc-700 text-zinc-300',
}

export default function Finance() {
  const [view, setView] = useState<'overview' | 'docs' | 'settings'>('overview')
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => listDocs().then(setDocs).catch((e: Error) => setError(e.message)), [])
  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['overview', 'Overblik'],
            ['docs', 'Tilbud & fakturaer'],
            ['settings', 'Indstillinger'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={`chip ${view === k ? 'choice-on' : ''}`} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
      </div>
      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}
      {view === 'settings' ? (
        <Settings />
      ) : !docs ? (
        <p className="text-zinc-400">Indlæser …</p>
      ) : view === 'overview' ? (
        <Overview docs={docs} onOpenDocs={() => setView('docs')} />
      ) : (
        <DocList docs={docs} />
      )}
    </div>
  )
}

// ---------------- Overblik ----------------

function Overview({ docs, onOpenDocs }: { docs: Doc[]; onOpenDocs: () => void }) {
  const years = useMemo(() => {
    const ys = new Set(docs.filter((d) => d.issue_date).map((d) => Number(d.issue_date!.slice(0, 4))))
    ys.add(new Date().getFullYear())
    return [...ys].sort((a, b) => b - a)
  }, [docs])
  const [year, setYear] = useState(years[0])
  const navigate = useNavigate()

  const issued = docs.filter((d) => d.status !== 'kladde' && d.issue_date?.startsWith(String(year)))
  const invoices = issued.filter((d) => d.type === 'faktura')
  const credits = issued.filter((d) => d.type === 'kreditnota')
  const revenue = invoices.reduce((s, d) => s + d.subtotal, 0) - credits.reduce((s, d) => s + d.subtotal, 0)

  // Udestående gælder alle år
  const open = docs.filter((d) => d.type === 'faktura' && d.status === 'sendt')
  const overdue = open.filter(isOverdue)
  const quotesOpen = docs.filter((d) => d.type === 'tilbud' && d.status === 'sendt')
  const toInvoice = docs.filter(
    (d) => d.type === 'tilbud' && d.status === 'accepteret' && !docs.some((x) => x.related_doc_id === d.id && x.type === 'faktura'),
  )

  const quarters = [1, 2, 3, 4].map((q) => {
    const inQ = (d: Doc) => Math.floor((Number(d.issue_date!.slice(5, 7)) - 1) / 3) + 1 === q
    const sales = invoices.filter(inQ).reduce((s, d) => s + d.subtotal, 0) - credits.filter(inQ).reduce((s, d) => s + d.subtotal, 0)
    const vat = invoices.filter(inQ).reduce((s, d) => s + d.vat, 0) - credits.filter(inQ).reduce((s, d) => s + d.vat, 0)
    return { q, sales, vat }
  })

  // Omsætning pr. måned (simpel søjlegraf)
  const months = Array.from({ length: 12 }, (_, m) => {
    const inM = (d: Doc) => Number(d.issue_date!.slice(5, 7)) === m + 1
    return invoices.filter(inM).reduce((s, d) => s + d.subtotal, 0) - credits.filter(inM).reduce((s, d) => s + d.subtotal, 0)
  })
  const max = Math.max(1, ...months)

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-center justify-between gap-2">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
          aria-label="År"
        >
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <button className="btn-ghost text-sm" onClick={() => exportCsv(docs, year)}>
          ⬇ Eksportér {year} (CSV)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={`Omsætning ${year}`} value={kr(revenue)} hint="ekskl. moms" />
        <Kpi label="Udestående" value={kr(open.reduce((s, d) => s + d.total, 0))} hint={`${open.length} faktura${open.length === 1 ? '' : 'er'}`} />
        <Kpi
          label="Forfaldent"
          value={kr(overdue.reduce((s, d) => s + d.total, 0))}
          hint={`${overdue.length} faktura${overdue.length === 1 ? '' : 'er'}`}
          alert={overdue.length > 0}
        />
        <Kpi label="Åbne tilbud" value={String(quotesOpen.length)} hint={kr(quotesOpen.reduce((s, d) => s + d.total, 0))} />
      </div>

      {toInvoice.length > 0 && (
        <div className="card border-accent/40">
          <h3 className="font-semibold">Klar til fakturering</h3>
          <ul className="mt-2 grid gap-1 text-sm">
            {toInvoice.map((d) => (
              <li key={d.id}>
                <button className="text-left text-accent hover:underline" onClick={() => navigate(`/admin/dok/${d.id}`)}>
                  Tilbud nr. {d.number} · {d.customer_name} · {kr(d.total)} →
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3 className="mb-3 font-semibold">Omsætning pr. måned ({year}, ekskl. moms)</h3>
        <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Omsætning pr. måned">
          {months.map((v, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-accent/80"
                  style={{ height: `${(Math.max(0, v) / max) * 100}%`, minHeight: v > 0 ? 3 : 0 }}
                  title={`${format(new Date(year, i, 1), 'MMMM', { locale: da })}: ${kr(v)}`}
                />
              </div>
              <span className="text-[10px] text-zinc-500">{format(new Date(year, i, 1), 'MMM', { locale: da }).slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="mb-2 font-semibold">Moms pr. kvartal ({year})</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1 font-normal">Kvartal</th>
              <th className="py-1 text-right font-normal">Salg ekskl. moms</th>
              <th className="py-1 text-right font-normal">Salgsmoms</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map(({ q, sales, vat }) => (
              <tr key={q} className="border-t border-zinc-800">
                <td className="py-1.5">{q}. kvartal</td>
                <td className="py-1.5 text-right">{kr(sales)}</td>
                <td className="py-1.5 text-right">{kr(vat)}</td>
              </tr>
            ))}
            <tr className="border-t border-zinc-700 font-semibold">
              <td className="py-1.5">Hele året</td>
              <td className="py-1.5 text-right">{kr(quarters.reduce((s, q) => s + q.sales, 0))}</td>
              <td className="py-1.5 text-right">{kr(quarters.reduce((s, q) => s + q.vat, 0))}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-zinc-500">
          Salgsmoms ud fra udstedte fakturaer minus kreditnotaer. Købsmoms (udgifter) er ikke med endnu. Tjek altid momsangivelsen
          i TastSelv.
        </p>
      </div>

      <button className="btn-ghost" onClick={onOpenDocs}>
        Se alle tilbud & fakturaer →
      </button>
    </div>
  )
}

function Kpi({ label, value, hint, alert }: { label: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <div className={`card !p-4 ${alert ? 'border-red-500/50' : ''}`}>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className={`mt-1 font-display text-lg font-black ${alert ? 'text-red-400' : ''}`}>{value}</p>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

// ---------------- Dokumentliste ----------------

function DocList({ docs }: { docs: Doc[] }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'alle' | DocType | 'ubetalt'>('alle')
  const [creating, setCreating] = useState(false)

  const visible = docs.filter((d) =>
    filter === 'alle' ? true : filter === 'ubetalt' ? d.type === 'faktura' && d.status === 'sendt' : d.type === filter,
  )

  const create = async (type: DocType) => {
    setCreating(true)
    try {
      navigate(`/admin/dok/${await createBlank(type)}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn !px-4 !py-2 text-sm" disabled={creating} onClick={() => create('tilbud')}>
          + Nyt tilbud
        </button>
        <button className="btn !px-4 !py-2 text-sm" disabled={creating} onClick={() => create('faktura')}>
          + Ny faktura
        </button>
      </div>
      <p className="text-xs text-zinc-500">Tip: Lav tilbud og fakturaer direkte fra en booking – så udfyldes kunde og linjer automatisk.</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['alle', 'Alle'],
            ['tilbud', 'Tilbud'],
            ['faktura', 'Fakturaer'],
            ['ubetalt', 'Ubetalte'],
            ['kreditnota', 'Kreditnotaer'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`chip !py-1 text-xs ${filter === k ? 'choice-on' : ''}`} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="text-zinc-500">Ingen dokumenter her endnu.</p>}
      <ul className="grid gap-2">
        {visible.map((d) => (
          <li key={d.id}>
            <button className="card flex w-full items-center gap-3 !p-4 text-left hover:border-zinc-600" onClick={() => navigate(`/admin/dok/${d.id}`)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {DOC_TITLES[d.type]} {d.number ? `nr. ${d.number}` : ''} · {d.customer_name || 'Uden kunde'}
                </span>
                <span className="text-xs text-zinc-400">
                  {d.issue_date ? format(parseISO(d.issue_date), 'd. MMM yyyy', { locale: da }) : 'Ikke udstedt'}
                  {d.type === 'faktura' && d.due_date && d.status === 'sendt' && ` · forfald ${format(parseISO(d.due_date), 'd. MMM', { locale: da })}`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold">{kr(d.type === 'kreditnota' ? -d.total : d.total)}</span>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isOverdue(d) ? 'bg-red-500 text-white' : STATUS_COLOR[d.status]
                  }`}
                >
                  {isOverdue(d) ? 'Forfalden' : STATUS_LABEL[d.status]}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------- Indstillinger ----------------

function Settings() {
  const [s, setS] = useState<FinanceSettings | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getFinanceSettings().then(setS).catch((e: Error) => setError(e.message))
  }, [])

  if (!s) return error ? <p className="text-red-400">{error}</p> : <p className="text-zinc-400">Indlæser …</p>

  const set = <K extends keyof FinanceSettings>(k: K, v: FinanceSettings[K]) => {
    setS({ ...s, [k]: v })
    setSaved(false)
  }
  const save = async () => {
    setError('')
    try {
      await saveFinanceSettings({
        ...s,
        mobilepay_number: s.mobilepay_number?.trim() || null,
        bank_reg: s.bank_reg?.trim() || null,
        bank_account: s.bank_account?.trim() || null,
        doc_footer: s.doc_footer?.trim() || null,
      })
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const input = (k: keyof FinanceSettings, label: string, type = 'text') => (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={(s[k] as string | number | null) ?? ''}
        onChange={(e) => set(k, (type === 'number' ? Number(e.target.value) : e.target.value) as never)}
      />
    </label>
  )

  return (
    <div className="grid grid-cols-1 gap-4">
      <section className="card grid gap-3 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Virksomhed (vises på tilbud og fakturaer)</h3>
        {input('company_name', 'Navn')}
        {input('cvr', 'CVR-nr.')}
        {input('company_address', 'Adresse')}
        {input('company_zip_city', 'Postnr. og by')}
        {input('company_phone', 'Telefon')}
        {input('company_email', 'E-mail')}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="accent-[var(--color-accent)]" checked={s.vat_registered} onChange={(e) => set('vat_registered', e.target.checked)} />
          Momsregistreret (25 % moms på fakturaer)
        </label>
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Betaling</h3>
        {input('mobilepay_number', 'MobilePay-nummer (vises først)')}
        <div />
        {input('bank_reg', 'Reg.nr.')}
        {input('bank_account', 'Kontonr.')}
        {input('payment_terms_days', 'Betalingsfrist (dage)', 'number')}
        {input('quote_valid_days', 'Tilbud gælder (dage)', 'number')}
        <label className="field sm:col-span-2">
          <span>Tekst nederst på dokumenter (valgfri)</span>
          <textarea rows={2} value={s.doc_footer ?? ''} onChange={(e) => set('doc_footer', e.target.value)} />
        </label>
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Nummerering</h3>
        {input('next_invoice_number', 'Næste faktura-/kreditnotanr.', 'number')}
        {input('next_quote_number', 'Næste tilbudsnr.', 'number')}
        <p className="text-xs text-zinc-500 sm:col-span-2">
          Har du allerede udstedt fakturaer andre steder, så fortsæt nummereringen herfra. Numre må ikke springes over eller
          genbruges.
        </p>
      </section>

      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}
      <button className="btn" onClick={save}>
        {saved ? 'Gemt ✓' : 'Gem indstillinger'}
      </button>
    </div>
  )
}
