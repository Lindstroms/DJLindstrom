import { supabase } from './supabase'
import type { Booking } from './types'

export type DocType = 'tilbud' | 'faktura' | 'kreditnota'
export type DocStatus = 'kladde' | 'sendt' | 'accepteret' | 'afvist' | 'betalt' | 'krediteret'

export type DocLine = {
  id?: string
  doc_id?: string
  sort: number
  description: string
  quantity: number
  unit: string
  unit_price: number // ekskl. moms
}

export type Doc = {
  id: string
  type: DocType
  number: number | null
  status: DocStatus
  booking_id: string | null
  related_doc_id: string | null
  customer_name: string
  customer_company: string | null
  customer_address: string | null
  customer_email: string
  customer_cvr: string | null
  issue_date: string | null
  due_date: string | null
  valid_until: string | null
  delivery_date: string | null
  note: string | null
  subtotal: number
  vat: number
  total: number
  public_token: string
  sent_at: string | null
  accepted_at: string | null
  paid_at: string | null
  reminder_count: number
  created_at: string
}

export type FinanceSettings = {
  company_name: string
  company_address: string
  company_zip_city: string
  company_phone: string
  company_email: string
  cvr: string
  vat_registered: boolean
  mobilepay_number: string | null
  bank_reg: string | null
  bank_account: string | null
  payment_terms_days: number
  quote_valid_days: number
  next_invoice_number: number
  next_quote_number: number
  doc_footer: string | null
}

export const DOC_TITLES: Record<DocType, string> = { tilbud: 'Tilbud', faktura: 'Faktura', kreditnota: 'Kreditnota' }

export const STATUS_LABEL: Record<DocStatus, string> = {
  kladde: 'Kladde',
  sendt: 'Sendt',
  accepteret: 'Accepteret',
  afvist: 'Afvist',
  betalt: 'Betalt',
  krediteret: 'Krediteret',
}

export const VAT = 0.25

export const kr = (n: number) =>
  `${Number(n).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`

export const docLabel = (d: Pick<Doc, 'type' | 'number'>) => `${DOC_TITLES[d.type]} ${d.number ? `nr. ${d.number}` : '(kladde)'}`

export const isOverdue = (d: Doc) => d.type === 'faktura' && d.status === 'sendt' && !!d.due_date && d.due_date < today()

export const today = () => new Date().toLocaleDateString('sv-SE') // yyyy-mm-dd i lokal tid

export const docUrl = (token: string) => `${location.origin}${location.pathname}#/dok/${token}`

// Samme afrunding som databasen (private.recalc_doc)
export function calcTotals(lines: DocLine[], vatRegistered: boolean) {
  const subtotal = Math.round(lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0) * 100) / 100
  const vat = vatRegistered ? Math.round(subtotal * VAT * 100) / 100 : 0
  return { subtotal, vat, total: subtotal + vat }
}

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data
}

const db = () => supabase!

export async function listDocs(): Promise<Doc[]> {
  return check(await db().from('docs').select('*').order('created_at', { ascending: false })) as Doc[]
}

export async function getDoc(id: string): Promise<{ doc: Doc; lines: DocLine[] }> {
  const [doc, lines] = await Promise.all([
    db().from('docs').select('*').eq('id', id).single(),
    db().from('doc_lines').select('*').eq('doc_id', id).order('sort'),
  ])
  return { doc: check(doc) as Doc, lines: check(lines) as DocLine[] }
}

export async function getFinanceSettings(): Promise<FinanceSettings> {
  return check(
    await db()
      .from('settings')
      .select(
        'company_name, company_address, company_zip_city, company_phone, company_email, cvr, vat_registered, mobilepay_number, bank_reg, bank_account, payment_terms_days, quote_valid_days, next_invoice_number, next_quote_number, doc_footer',
      )
      .single(),
  ) as FinanceSettings
}

export async function saveFinanceSettings(patch: Partial<FinanceSettings>) {
  check(await db().from('settings').update(patch).eq('id', true))
}

type DocFields = Pick<
  Doc,
  'customer_name' | 'customer_company' | 'customer_address' | 'customer_email' | 'customer_cvr' | 'delivery_date' | 'note'
> & Partial<Pick<Doc, 'due_date' | 'valid_until'>>

export async function saveDraft(id: string, fields: DocFields, lines: DocLine[]) {
  check(await db().from('docs').update(fields).eq('id', id))
  // Linjer erstattes samlet (kun muligt mens dokumentet er kladde)
  check(await db().from('doc_lines').delete().eq('doc_id', id))
  if (lines.length) {
    check(
      await db()
        .from('doc_lines')
        .insert(
          lines.map((l, i) => ({
            doc_id: id,
            sort: i,
            description: l.description,
            quantity: l.quantity,
            unit: l.unit,
            unit_price: l.unit_price,
          })),
          { defaultToNull: false },
        ),
    )
  }
}

async function createDoc(doc: Partial<Doc> & { type: DocType }, lines: Omit<DocLine, 'sort'>[]): Promise<string> {
  const created = check(await db().from('docs').insert(doc).select('id').single()) as { id: string }
  if (lines.length)
    check(
      await db()
        .from('doc_lines')
        .insert(
          lines.map(({ description, quantity, unit, unit_price }, i) => ({ description, quantity, unit, unit_price, sort: i, doc_id: created.id })),
          { defaultToNull: false },
        ),
    )
  return created.id
}

export const exVat = (incl: number) => Math.round((incl / (1 + VAT)) * 10000) / 10000

export type CatalogPackage = { id: string; name: string; description: string | null; price: number | null; active: boolean }

// Lydpakker og tilvalg fra Opsætning (priser er inkl. moms)
export async function listPackages(): Promise<CatalogPackage[]> {
  return check(await db().from('sound_packages').select('id, name, description, price, active').order('sort_order')) as CatalogPackage[]
}

export const packageLine = (p: CatalogPackage): Omit<DocLine, 'sort'> => ({
  description: p.name,
  quantity: 1,
  unit: 'stk.',
  unit_price: p.price != null ? exVat(Number(p.price)) : 0,
})

// Nyt tilbud/faktura ud fra en booking (priser i booking/katalog er inkl. moms)
export async function createFromBooking(
  b: Booking,
  type: DocType,
  catalogPrices: Record<string, number | null> = {},
  packages: CatalogPackage[] = [],
) {
  const date = new Date(b.event_date + 'T12:00:00').toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })
  const event = [b.event_types?.name, b.event_themes?.name].filter(Boolean).join(' – ') || 'Event'
  const main = b.quoted_price ?? catalogPrices[b.event_type_id] ?? 0
  const lines: Omit<DocLine, 'sort'>[] = [
    {
      description: `DJ – ${event}, ${date} kl. ${b.start_time.slice(0, 5)} (${Number(b.hours).toLocaleString('da-DK')} timer)`,
      quantity: 1,
      unit: 'stk.',
      unit_price: exVat(Number(main)),
    },
    // Lyd & lys som kunden valgte i booking-flowet
    ...b.booking_packages
      .map((bp) => packages.find((p) => p.name === bp.sound_packages?.name))
      .filter((p): p is CatalogPackage => !!p)
      .map(packageLine),
  ]
  return createDoc(
    {
      type,
      booking_id: b.id,
      customer_name: b.customer_name,
      customer_company: b.company,
      customer_email: b.email,
      delivery_date: b.event_date,
    },
    lines,
  )
}

export async function createBlank(type: DocType) {
  return createDoc({ type }, [{ description: '', quantity: 1, unit: 'stk.', unit_price: 0 }])
}

// Faktura ud fra tilbud, eller kreditnota ud fra faktura – kopierer kunde og linjer
export async function createFollowUp(source: Doc, sourceLines: DocLine[], type: DocType) {
  return createDoc(
    {
      type,
      booking_id: source.booking_id,
      related_doc_id: source.id,
      customer_name: source.customer_name,
      customer_company: source.customer_company,
      customer_address: source.customer_address,
      customer_email: source.customer_email,
      customer_cvr: source.customer_cvr,
      delivery_date: source.delivery_date,
    },
    sourceLines.map(({ description, quantity, unit, unit_price }) => ({ description, quantity, unit, unit_price })),
  )
}

export async function deleteDraft(id: string) {
  check(await db().from('docs').delete().eq('id', id))
}

export async function finalizeDoc(id: string): Promise<Doc> {
  return check(await db().rpc('finalize_doc', { p_id: id })) as Doc
}

export async function sendDoc(id: string) {
  const { error } = await db().functions.invoke('doc-mail', { body: { doc_id: id, kind: 'send' } })
  if (error) {
    let msg = error.message
    try {
      msg = await (error as { context?: Response }).context?.text() ?? msg
    } catch {
      /* behold standardbesked */
    }
    throw new Error(`Dokumentet er udstedt, men mailen kunne ikke sendes: ${msg}`)
  }
}

export async function setPaid(id: string, paid: boolean) {
  check(await db().from('docs').update({ status: paid ? 'betalt' : 'sendt', paid_at: paid ? new Date().toISOString() : null }).eq('id', id))
}

export async function setQuoteStatus(id: string, status: 'accepteret' | 'afvist') {
  check(await db().from('docs').update({ status, accepted_at: status === 'accepteret' ? new Date().toISOString() : null }).eq('id', id))
}

export function exportCsv(docs: Doc[], year: number) {
  const rows = docs
    .filter((d) => d.status !== 'kladde' && d.type !== 'tilbud' && d.issue_date?.startsWith(String(year)))
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const sign = (d: Doc) => (d.type === 'kreditnota' ? -1 : 1)
  const n = (x: number) => x.toFixed(2).replace('.', ',')
  const lines = [
    ['Nummer', 'Type', 'Dato', 'Forfald', 'Kunde', 'Firma', 'Ekskl. moms', 'Moms', 'I alt', 'Status', 'Betalt'].join(';'),
    ...rows.map((d) =>
      [
        d.number,
        DOC_TITLES[d.type],
        d.issue_date,
        d.due_date ?? '',
        `"${d.customer_name.replace(/"/g, '""')}"`,
        `"${(d.customer_company ?? '').replace(/"/g, '""')}"`,
        n(sign(d) * d.subtotal),
        n(sign(d) * d.vat),
        n(sign(d) * d.total),
        STATUS_LABEL[d.status],
        d.paid_at ? d.paid_at.slice(0, 10) : '',
      ].join(';'),
    ),
  ]
  // BOM så Excel læser æøå korrekt
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `fakturaer-${year}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
