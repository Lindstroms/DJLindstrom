import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { da } from 'date-fns/locale'
import { kr, today } from '../../lib/finance'
import {
  CATEGORY_LABEL,
  deleteExpense,
  exportExpensesCsv,
  listBookingOptions,
  receiptUrl,
  removeReceipt,
  saveExpense,
  uploadReceipt,
  vatOf,
  type BookingOption,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
} from '../../lib/expenses'

const blank = (): ExpenseInput => ({
  expense_date: today(),
  supplier: '',
  description: '',
  category: 'udstyr',
  amount: 0,
  vat: 0,
  receipt_path: null,
  booking_id: null,
})

export default function Expenses({
  expenses,
  vatRegistered,
  onChanged,
}: {
  expenses: Expense[]
  vatRegistered: boolean
  onChanged: () => void
}) {
  const years = useMemo(() => {
    const ys = new Set(expenses.map((e) => Number(e.expense_date.slice(0, 4))))
    ys.add(new Date().getFullYear())
    return [...ys].sort((a, b) => b - a)
  }, [expenses])
  const [year, setYear] = useState(years[0])
  const [cat, setCat] = useState<'alle' | ExpenseCategory>('alle')
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)

  const inYear = expenses.filter((e) => e.expense_date.startsWith(String(year)))
  const visible = inYear.filter((e) => cat === 'alle' || e.category === cat)
  const sum = (list: Expense[]) => list.reduce((s, e) => s + Number(e.amount), 0)
  const sumVat = (list: Expense[]) => list.reduce((s, e) => s + Number(e.vat), 0)

  if (editing)
    return (
      <ExpenseForm
        expense={editing === 'new' ? null : editing}
        vatRegistered={vatRegistered}
        onDone={(changed) => {
          setEditing(null)
          if (changed) onChanged()
        }}
      />
    )

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="btn !px-4 !py-2 text-sm" onClick={() => setEditing('new')}>
          + Ny udgift
        </button>
        <div className="flex items-center gap-2">
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
          <button className="btn-ghost !px-3 !py-2 text-sm" onClick={() => exportExpensesCsv(expenses, year)}>
            ⬇ CSV
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">Tag et billede af kvitteringen med det samme – så har du dokumentationen, hvis SKAT spørger.</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="card !p-3">
          <p className="text-xs text-zinc-400">Udgifter {year}</p>
          <p className="font-display font-black">{kr(sum(inYear) - sumVat(inYear))}</p>
          <p className="text-[11px] text-zinc-500">ekskl. moms</p>
        </div>
        <div className="card !p-3">
          <p className="text-xs text-zinc-400">Købsmoms</p>
          <p className="font-display font-black">{kr(sumVat(inYear))}</p>
          <p className="text-[11px] text-zinc-500">fradrag</p>
        </div>
        <div className="card !p-3">
          <p className="text-xs text-zinc-400">Mangler bilag</p>
          <p className={`font-display font-black ${inYear.some((e) => !e.receipt_path) ? 'text-amber-300' : ''}`}>
            {inYear.filter((e) => !e.receipt_path).length}
          </p>
          <p className="text-[11px] text-zinc-500">uden kvittering</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['alle', ...Object.keys(CATEGORY_LABEL)] as ('alle' | ExpenseCategory)[]).map((k) => (
          <button key={k} className={`chip !py-1 text-xs ${cat === k ? 'choice-on' : ''}`} onClick={() => setCat(k)}>
            {k === 'alle' ? 'Alle' : CATEGORY_LABEL[k]}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="text-zinc-500">Ingen udgifter her endnu.</p>}
      <ul className="grid grid-cols-1 gap-2">
        {visible.map((e) => (
          <li key={e.id}>
            <button className="card flex w-full items-center gap-3 !p-4 text-left hover:border-zinc-600" onClick={() => setEditing(e)}>
              <span className="text-xl" aria-hidden>
                {CATEGORY_LABEL[e.category].split(' ')[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{[e.supplier, e.description].filter(Boolean).join(' · ') || 'Udgift'}</span>
                <span className="text-xs text-zinc-400">
                  {format(parseISO(e.expense_date), 'd. MMM yyyy', { locale: da })}
                  {e.receipt_path ? ' · 📎 kvittering' : <span className="text-amber-300"> · mangler kvittering</span>}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold">{kr(e.amount)}</span>
                {Number(e.vat) > 0 && <span className="text-[11px] text-zinc-500">heraf moms {kr(e.vat)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ExpenseForm({ expense, vatRegistered, onDone }: { expense: Expense | null; vatRegistered: boolean; onDone: (changed: boolean) => void }) {
  const [f, setF] = useState<ExpenseInput>(() => (expense ? { ...expense } : blank()))
  // Momsen følger beløbet automatisk (20 % af beløb inkl. moms), indtil den rettes i hånden
  const [vatAuto, setVatAuto] = useState(() => !expense || (vatRegistered && Number(expense.vat) === vatOf(Number(expense.amount))))
  const [amountText, setAmountText] = useState(expense ? String(expense.amount).replace('.', ',') : '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bookings, setBookings] = useState<BookingOption[]>([])

  useEffect(() => {
    listBookingOptions().then(setBookings).catch(() => {})
  }, [])

  // Vis eksisterende kvittering via kortlivet signeret link
  useEffect(() => {
    if (file) {
      const u = URL.createObjectURL(file)
      setPreview(u)
      return () => URL.revokeObjectURL(u)
    }
    if (f.receipt_path) receiptUrl(f.receipt_path).then(setPreview).catch(() => setPreview(null))
    else setPreview(null)
  }, [file, f.receipt_path])

  const set = <K extends keyof ExpenseInput>(k: K, v: ExpenseInput[K]) => setF((p) => ({ ...p, [k]: v }))
  const setAmount = (text: string) => {
    setAmountText(text)
    const n = Number(text.replace(/\./g, '').replace(',', '.')) || 0
    setF((p) => ({ ...p, amount: n, vat: vatAuto && vatRegistered ? vatOf(n) : Math.min(p.vat, n) }))
  }

  const isPdf = (file?.type ?? f.receipt_path ?? '').toLowerCase().includes('pdf')

  const save = async () => {
    setError('')
    if (f.amount <= 0) return setError('Angiv beløbet inkl. moms.')
    if (!f.supplier.trim() && !f.description.trim()) return setError('Skriv hvor du har købt det, eller hvad det er.')
    setBusy(true)
    try {
      let receipt_path = f.receipt_path
      if (file) receipt_path = await uploadReceipt(file)
      await saveExpense(expense?.id ?? null, { ...f, supplier: f.supplier.trim(), description: f.description.trim(), receipt_path })
      // Gammel kvittering erstattet eller fjernet → ryd op i storage
      if (expense?.receipt_path && expense.receipt_path !== receipt_path) await removeReceipt(expense.receipt_path)
      onDone(true)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!expense || !confirm('Slet udgiften og kvitteringen?')) return
    setBusy(true)
    try {
      await deleteExpense(expense)
      onDone(true)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <button className="w-fit text-sm text-zinc-400 hover:text-white" onClick={() => onDone(false)}>
        ← Tilbage til udgifter
      </button>
      <h2 className="font-display text-xl font-black">{expense ? 'Ret udgift' : 'Ny udgift'}</h2>

      <section className="card grid grid-cols-1 gap-3">
        <h3 className="font-semibold">Kvittering</h3>
        {preview &&
          (isPdf ? (
            <a href={preview} target="_blank" rel="noreferrer" className="text-accent underline">
              📄 Åbn PDF-kvittering
            </a>
          ) : (
            <a href={preview} target="_blank" rel="noreferrer" className="block w-fit">
              <img src={preview} alt="Kvittering" className="max-h-72 rounded-lg border border-zinc-700 object-contain" />
            </a>
          ))}
        <div className="flex flex-wrap gap-2">
          <label className="btn-ghost cursor-pointer !py-2 text-sm">
            📷 {preview ? 'Skift billede' : 'Tag billede / vælg fil'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const fl = e.target.files?.[0]
                if (fl) setFile(fl)
                e.target.value = ''
              }}
            />
          </label>
          {preview && (
            <button
              className="text-sm text-zinc-400 hover:text-red-400"
              onClick={() => {
                setFile(null)
                set('receipt_path', null)
              }}
            >
              Fjern
            </button>
          )}
        </div>
      </section>

      <section className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="field">
          <span>Dato</span>
          <input type="date" value={f.expense_date} onChange={(e) => set('expense_date', e.target.value)} />
        </label>
        <label className="field">
          <span>Kategori</span>
          <select value={f.category} onChange={(e) => set('category', e.target.value as ExpenseCategory)}>
            {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Leverandør / butik</span>
          <input value={f.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="fx Thomann, Circle K, Spotify" />
        </label>
        <label className="field">
          <span>Hvad er det?</span>
          <input value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="fx Kabler, brændstof, DJ-pool" />
        </label>
        <label className="field">
          <span>Beløb inkl. moms (kr.)</span>
          <input inputMode="decimal" value={amountText} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
        </label>
        <label className="field">
          <span>Heraf moms (kr.)</span>
          <input
            inputMode="decimal"
            value={String(f.vat).replace('.', ',')}
            onChange={(e) => {
              setVatAuto(false)
              set('vat', Math.min(f.amount, Number(e.target.value.replace(',', '.')) || 0))
            }}
          />
        </label>
        {vatRegistered && (
          <div className="flex flex-wrap gap-2 text-xs sm:col-span-2">
            <button
              className={`chip !py-1 ${vatAuto && f.vat > 0 ? 'choice-on' : ''}`}
              onClick={() => {
                setVatAuto(true)
                set('vat', vatOf(f.amount))
              }}
            >
              25 % moms
            </button>
            <button
              className={`chip !py-1 ${f.vat === 0 ? 'choice-on' : ''}`}
              onClick={() => {
                setVatAuto(false)
                set('vat', 0)
              }}
            >
              Uden moms
            </button>
            <span className="self-center text-zinc-500">Uden moms: fx privatkøb, udland, forsikring, parkering hos kommunen.</span>
          </div>
        )}
        <label className="field sm:col-span-2">
          <span>Hører til booking (valgfri)</span>
          <select value={f.booking_id ?? ''} onChange={(e) => set('booking_id', e.target.value || null)}>
            <option value="">– Ingen –</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {format(parseISO(b.event_date), 'd. MMM yyyy', { locale: da })} · {b.customer_name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-zinc-400 sm:col-span-2">
          Ekskl. moms: <b className="text-white">{kr(f.amount - f.vat)}</b> · moms: {kr(f.vat)}
        </p>
      </section>

      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn flex-1" disabled={busy} onClick={save}>
          {busy ? 'Gemmer …' : 'Gem udgift'}
        </button>
        {expense && (
          <button className="btn-ghost !border-red-500/40 text-red-300" disabled={busy} onClick={remove}>
            Slet
          </button>
        )}
      </div>
    </div>
  )
}
