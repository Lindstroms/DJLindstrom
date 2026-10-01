import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { da } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { DOC_TITLES, kr, type Doc, type DocLine } from '../lib/finance'

type Company = {
  name: string
  address: string
  zip_city: string
  phone: string
  email: string
  cvr: string
  vat_registered: boolean
  mobilepay_number: string | null
  bank_reg: string | null
  bank_account: string | null
  footer: string | null
}
type Data = { doc: Doc; lines: DocLine[]; related_number: number | null; company: Company }

const dateDa = (d: string | null) => (d ? format(parseISO(d), 'd. MMMM yyyy', { locale: da }) : '')
const todayIso = () => new Date().toLocaleDateString('sv-SE')

// Offentlig visning af tilbud/faktura/kreditnota (link fra mail). Kan printes/gemmes som PDF.
export default function DocView() {
  const { token = '' } = useParams()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  const load = () =>
    supabase!
      .rpc('get_public_doc', { p_token: token })
      .then(({ data, error }) => (error ? setError(error.message) : setData(data as Data)))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const accept = async () => {
    setAccepting(true)
    setError('')
    const { error } = await supabase!.rpc('accept_quote', { p_token: token })
    setAccepting(false)
    if (error) setError(error.message)
    else {
      setAccepted(true)
      load()
    }
  }

  if (!data)
    return (
      <div className="mx-auto max-w-xl p-6">
        {error ? <p className="card text-center">{error}</p> : <p className="text-zinc-400">Indlæser …</p>}
      </div>
    )

  const { doc, lines, company: c } = data
  const title = DOC_TITLES[doc.type]
  const canAccept = doc.type === 'tilbud' && doc.status === 'sendt' && (!doc.valid_until || doc.valid_until >= todayIso())

  return (
    <div className="doc-page mx-auto max-w-3xl px-4 py-8">
      {/* Handlinger (skjules ved print) */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-display font-black tracking-[0.2em]">
          DJ <span className="text-accent">LINDSTRØM</span>
        </p>
        <button className="btn-ghost !py-2 text-sm" onClick={() => window.print()}>
          Print / gem som PDF
        </button>
      </div>

      {doc.type === 'tilbud' && (
        <div className="no-print mb-4">
          {canAccept && !accepted && (
            <div className="card flex flex-wrap items-center justify-between gap-3 border-accent/50">
              <p>
                Klar til at booke? Acceptér tilbuddet, så er datoen reserveret til jer.
                <span className="block text-sm text-zinc-400">Gælder til og med {dateDa(doc.valid_until)}.</span>
              </p>
              <button className="btn btn-glow" disabled={accepting} onClick={accept}>
                {accepting ? 'Accepterer …' : 'Acceptér tilbud'}
              </button>
            </div>
          )}
          {(accepted || doc.status === 'accepteret') && (
            <p className="card border-emerald-500/50 text-emerald-300">
              ✓ Tilbuddet er accepteret – tak! Du får en bekræftelse på mail med link til at fortælle om musikønsker.
            </p>
          )}
          {doc.status === 'sendt' && !canAccept && (
            <p className="card text-amber-200">Tilbuddet er udløbet. Kontakt {c.email} for et nyt.</p>
          )}
        </div>
      )}
      {error && <p className="no-print mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}

      {/* Selve dokumentet */}
      <article className="paper rounded-2xl bg-white p-6 text-zinc-900 shadow-2xl sm:p-10">
        <header className="flex flex-wrap justify-between gap-6">
          <div className="text-sm text-zinc-500">
            <p className="text-lg font-bold text-zinc-900">{c.name}</p>
            <p className="text-fuchsia-600">DJ Lindstrøm</p>
            <p className="mt-2">{c.address}</p>
            <p>{c.zip_city}</p>
            <p>CVR: {c.cvr}</p>
            <p>Tlf.: {c.phone}</p>
            <p>{c.email}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-black uppercase text-fuchsia-600">{title}</p>
            <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-4 text-sm">
              <dt className="text-zinc-500">Nr.</dt>
              <dd className="font-semibold">{doc.number}</dd>
              <dt className="text-zinc-500">Dato</dt>
              <dd className="font-semibold">{dateDa(doc.issue_date)}</dd>
              {doc.type === 'faktura' && (
                <>
                  <dt className="text-zinc-500">Forfald</dt>
                  <dd className="font-semibold">{dateDa(doc.due_date)}</dd>
                </>
              )}
              {doc.type === 'tilbud' && (
                <>
                  <dt className="text-zinc-500">Gyldigt til</dt>
                  <dd className="font-semibold">{dateDa(doc.valid_until)}</dd>
                </>
              )}
              {doc.delivery_date && (
                <>
                  <dt className="text-zinc-500">Leveringsdato</dt>
                  <dd className="font-semibold">{dateDa(doc.delivery_date)}</dd>
                </>
              )}
              {doc.type === 'kreditnota' && data.related_number && (
                <>
                  <dt className="text-zinc-500">Vedr. faktura</dt>
                  <dd className="font-semibold">{data.related_number}</dd>
                </>
              )}
            </dl>
          </div>
        </header>

        <section className="mt-8 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{doc.type === 'tilbud' ? 'Tilbud til' : 'Faktureres til'}</p>
          {doc.customer_company && <p className="font-semibold">{doc.customer_company}</p>}
          <p className={doc.customer_company ? '' : 'font-semibold'}>{doc.customer_name}</p>
          {doc.customer_address && <p className="whitespace-pre-line">{doc.customer_address}</p>}
          {doc.customer_cvr && <p>CVR: {doc.customer_cvr}</p>}
          <p>{doc.customer_email}</p>
        </section>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-100 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-2 py-2 font-semibold">Beskrivelse</th>
                <th className="px-2 py-2 text-right font-semibold">Antal</th>
                <th className="hidden px-2 py-2 font-semibold sm:table-cell print:table-cell">Enhed</th>
                <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell print:table-cell">Pris</th>
                <th className="px-2 py-2 text-right font-semibold">Beløb</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-zinc-100 align-top">
                  <td className="px-2 py-2 whitespace-pre-line">{l.description}</td>
                  <td className="px-2 py-2 text-right">{Number(l.quantity).toLocaleString('da-DK')}</td>
                  <td className="hidden px-2 py-2 sm:table-cell print:table-cell">{l.unit}</td>
                  <td className="hidden px-2 py-2 text-right whitespace-nowrap sm:table-cell print:table-cell">{kr(l.unit_price)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{kr(Math.round(l.quantity * l.unit_price * 100) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto mt-4 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-zinc-500">Subtotal ekskl. moms</dt>
          <dd className="text-right">{kr(doc.subtotal)}</dd>
          {c.vat_registered && (
            <>
              <dt className="text-zinc-500">Moms 25 %</dt>
              <dd className="text-right">{kr(doc.vat)}</dd>
            </>
          )}
          <dt className="border-t border-zinc-300 pt-1 font-bold">{doc.type === 'kreditnota' ? 'Krediteret i alt DKK' : 'I alt DKK'}</dt>
          <dd className="border-t border-zinc-300 pt-1 text-right font-bold">{kr(doc.total)}</dd>
        </dl>

        {doc.type === 'faktura' && (
          <section className="mt-8 rounded-xl bg-fuchsia-50 p-4 text-sm">
            <p className="font-semibold">Betaling</p>
            {c.mobilepay_number && (
              <p className="mt-1">
                <b>MobilePay:</b> {c.mobilepay_number} – skriv <b>"Faktura {doc.number}"</b> i beskeden
              </p>
            )}
            {c.bank_reg && c.bank_account && (
              <p className="mt-1">
                <b>Bankoverførsel:</b> Reg.nr. {c.bank_reg}, kontonr. {c.bank_account} – angiv fakturanr. {doc.number}
              </p>
            )}
            <p className="mt-1">
              Beløbet {kr(doc.total)} betales senest <b>{dateDa(doc.due_date)}</b>.
            </p>
            {doc.status === 'betalt' && <p className="mt-2 font-semibold text-emerald-700">✓ Betalt – tak!</p>}
          </section>
        )}

        {doc.note && <p className="mt-6 whitespace-pre-line text-sm text-zinc-600">{doc.note}</p>}
        {c.footer && <p className="mt-4 whitespace-pre-line text-xs text-zinc-500">{c.footer}</p>}
        {!c.vat_registered && <p className="mt-4 text-xs text-zinc-500">Ikke momsregistreret</p>}

        <footer className="mt-10 border-t border-zinc-200 pt-3 text-center text-xs text-zinc-400">
          {c.name} · CVR {c.cvr} · {c.email} · Tlf. {c.phone}
        </footer>
      </article>
    </div>
  )
}
