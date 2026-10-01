// Tilbud, fakturaer og kreditnotaer: PDF + mail.
//   kind 'send'      – admin sender et udstedt dokument (kræver admin-login)
//   kind 'reminder'  – dagligt job: venlig rykker for forfalden faktura
//   kind 'accepted'  – kunden har accepteret et tilbud → besked til Viktor
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1'

const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'DJ Lindstrøm <booking@fam-lindstrom.dk>'
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? 'viktor@fam-lindstrom.dk'
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://lindstroms.github.io/DJLindstrom/'
const resendKey = () => Deno.env.get('RESEND_API_KEY') ?? Deno.env.get('resend_api_key')

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

type Doc = Record<string, any>
type Line = { description: string; quantity: number; unit: string; unit_price: number; sort: number }
type Settings = Record<string, any>

const TITLES: Record<string, string> = { tilbud: 'Tilbud', faktura: 'Faktura', kreditnota: 'Kreditnota' }

const kr = (n: number) =>
  `${Number(n).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`
const num = (n: number) => Number(n).toLocaleString('da-DK', { maximumFractionDigits: 2 })
const dateDa = (d: string | null) =>
  d ? new Date(d + 'T12:00:00Z').toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Copenhagen' }) : ''
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// Standardskrifterne i PDF understøtter kun WinAnsi (Latin-1 m.m.) – fjern andre tegn (fx emojis)
const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
const pdfText = (s: unknown) =>
  [...String(s ?? '')]
    .map((ch) => {
      const c = ch.codePointAt(0)!
      if (ch === '\t') return ' '
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_EXTRA.includes(ch)) return ch
      return ''
    })
    .join('')

async function loadDoc(id: string) {
  const [{ data: doc }, { data: lines }, { data: s }] = await Promise.all([
    db.from('docs').select('*').eq('id', id).maybeSingle(),
    db.from('doc_lines').select('*').eq('doc_id', id).order('sort'),
    db.from('settings').select('*').limit(1).single(),
  ])
  let related: number | null = null
  if (doc?.related_doc_id) {
    const { data } = await db.from('docs').select('number').eq('id', doc.related_doc_id).maybeSingle()
    related = data?.number ?? null
  }
  return { doc: doc as Doc | null, lines: (lines ?? []) as Line[], s: s as Settings, related }
}

// ---------------- PDF ----------------

async function makePdf(doc: Doc, lines: Line[], s: Settings, related: number | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.07, 0.07, 0.1)
  const gray = rgb(0.42, 0.42, 0.46)
  const accent = rgb(0.75, 0.15, 0.83)
  const W = 595.28
  const H = 841.89
  const M = 50
  const title = TITLES[doc.type]
  pdf.setTitle(`${title} ${doc.number} – ${s.company_name}`)
  pdf.setAuthor(s.company_name)

  let page: PDFPage = pdf.addPage([W, H])
  let y = H - M

  const text = (t: string, x: number, yy: number, size = 10, f: PDFFont = font, color = ink) =>
    page.drawText(pdfText(t), { x, y: yy, size, font: f, color })
  const right = (t: string, xRight: number, yy: number, size = 10, f: PDFFont = font, color = ink) => {
    const tt = pdfText(t)
    page.drawText(tt, { x: xRight - f.widthOfTextAtSize(tt, size), y: yy, size, font: f, color })
  }
  const wrap = (t: string, width: number, size: number, f: PDFFont = font) => {
    const out: string[] = []
    for (const para of pdfText(t).split('\n')) {
      let cur = ''
      for (const word of para.split(' ')) {
        const next = cur ? `${cur} ${word}` : word
        if (f.widthOfTextAtSize(next, size) > width && cur) {
          out.push(cur)
          cur = word
        } else cur = next
      }
      out.push(cur)
    }
    return out
  }
  const footer = () => {
    const f = [s.company_name, `CVR ${s.cvr}`, s.company_email, `Tlf. ${s.company_phone}`].filter(Boolean).join('  ·  ')
    const tt = pdfText(f)
    page.drawText(tt, { x: (W - font.widthOfTextAtSize(tt, 8)) / 2, y: 28, size: 8, font, color: gray })
  }
  const ensure = (needed: number) => {
    if (y - needed < 90) {
      footer()
      page = pdf.addPage([W, H])
      y = H - M
    }
  }

  // Afsender
  text(s.company_name, M, y, 16, bold)
  text('DJ Lindstrøm', M, y - 16, 9, font, accent)
  const sender = [s.company_address, s.company_zip_city, `CVR: ${s.cvr}`, `Tlf.: ${s.company_phone}`, s.company_email]
  sender.forEach((l, i) => text(l, M, y - 34 - i * 12, 9, font, gray))

  // Titel og nøgletal
  right(title.toUpperCase(), W - M, y - 4, 22, bold, accent)
  const meta: [string, string][] = [[`${title} nr.`, String(doc.number)], ['Dato', dateDa(doc.issue_date)]]
  if (doc.type === 'faktura') meta.push(['Forfaldsdato', dateDa(doc.due_date)])
  if (doc.type === 'tilbud') meta.push(['Gyldigt til', dateDa(doc.valid_until)])
  if (doc.delivery_date) meta.push(['Leveringsdato', dateDa(doc.delivery_date)])
  if (doc.type === 'kreditnota' && related) meta.push(['Vedrører faktura', String(related)])
  meta.forEach(([k, v], i) => {
    right(k, W - M - 110, y - 30 - i * 13, 9, font, gray)
    right(v, W - M, y - 30 - i * 13, 9, bold)
  })

  // Kunde
  y -= 120
  text(doc.type === 'tilbud' ? 'Tilbud til' : 'Faktureres til', M, y, 8, bold, gray)
  const cust = [
    doc.customer_company,
    doc.customer_name,
    ...String(doc.customer_address ?? '').split(/\n|,\s*/).filter(Boolean),
    doc.customer_cvr ? `CVR: ${doc.customer_cvr}` : '',
    doc.customer_email,
  ].filter(Boolean) as string[]
  cust.forEach((l, i) => text(l, M, y - 14 - i * 12, 10, i === 0 ? bold : font))
  y -= 30 + cust.length * 12

  // Linjer
  const cols = { desc: M, qtyRight: 318, unit: 328, priceRight: 455, amount: W - M }
  const header = () => {
    page.drawRectangle({ x: M - 6, y: y - 6, width: W - 2 * M + 12, height: 20, color: rgb(0.95, 0.94, 0.97) })
    text('Beskrivelse', cols.desc, y, 8, bold, gray)
    right('Antal', cols.qtyRight, y, 8, bold, gray)
    text('Enhed', cols.unit, y, 8, bold, gray)
    right('Pris', cols.priceRight, y, 8, bold, gray)
    right('Beløb', cols.amount, y, 8, bold, gray)
    y -= 24
  }
  header()
  for (const l of lines) {
    const descLines = wrap(l.description, cols.qtyRight - cols.desc - 40, 10)
    ensure(descLines.length * 13 + 10)
    descLines.forEach((d, i) => text(d, cols.desc, y - i * 13, 10))
    right(num(l.quantity), cols.qtyRight, y, 10)
    text(l.unit, cols.unit, y, 10)
    right(kr(l.unit_price), cols.priceRight, y, 10)
    right(kr(Math.round(l.quantity * l.unit_price * 100) / 100), cols.amount, y, 10)
    y -= descLines.length * 13 + 8
  }
  page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.5, color: gray })

  // Totaler
  ensure(80)
  y -= 16
  const totals: [string, string, boolean][] = [['Subtotal ekskl. moms', kr(doc.subtotal), false]]
  if (s.vat_registered) totals.push(['Moms 25 %', kr(doc.vat), false])
  totals.push([doc.type === 'kreditnota' ? 'Krediteret i alt DKK' : 'I alt DKK', kr(doc.total), true])
  totals.forEach(([k, v, b], i) => {
    right(k, W - M - 110, y - i * 16, b ? 11 : 10, b ? bold : font, b ? ink : gray)
    right(v, W - M, y - i * 16, b ? 11 : 10, b ? bold : font)
  })
  y -= totals.length * 16 + 24

  // Betaling
  if (doc.type === 'faktura') {
    ensure(90)
    text('Betaling', M, y, 11, bold)
    y -= 16
    const pay: string[] = []
    if (s.mobilepay_number) pay.push(`MobilePay: ${s.mobilepay_number} – skriv "Faktura ${doc.number}" i beskeden`)
    if (s.bank_reg && s.bank_account) pay.push(`Bankoverførsel: Reg.nr. ${s.bank_reg}, kontonr. ${s.bank_account} – angiv fakturanr. ${doc.number}`)
    pay.push(`Beløbet ${kr(doc.total)} betales senest ${dateDa(doc.due_date)}.`)
    pay.forEach((p) => {
      wrap(p, W - 2 * M, 10).forEach((l) => {
        text(l, M, y, 10)
        y -= 13
      })
    })
    y -= 10
  }
  if (doc.type === 'tilbud') {
    ensure(40)
    wrap(`Tilbuddet er gældende til og med ${dateDa(doc.valid_until)}. Acceptér online via linket i mailen.`, W - 2 * M, 10).forEach((l) => {
      text(l, M, y, 10, font, gray)
      y -= 13
    })
    y -= 10
  }
  if (doc.note) {
    ensure(40)
    wrap(doc.note, W - 2 * M, 10).forEach((l) => {
      ensure(14)
      text(l, M, y, 10, font, gray)
      y -= 13
    })
  }
  if (s.doc_footer) {
    ensure(30)
    y -= 8
    wrap(s.doc_footer, W - 2 * M, 9).forEach((l) => {
      text(l, M, y, 9, font, gray)
      y -= 12
    })
  }
  if (!s.vat_registered) text('Ikke momsregistreret', M, 50, 8, font, gray)
  footer()
  return await pdf.save()
}

const toBase64 = (bytes: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// ---------------- Mail ----------------

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#0b0b12;color:#fff;border-radius:12px 12px 0 0;padding:20px 24px;font-weight:900;letter-spacing:2px">DJ <span style="color:#e040fb">LINDSTRØM</span></div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
    ${body}
  </div>
</div></body></html>`
}
const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#e040fb;color:#000;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">${esc(label)}</a></p>`

async function send(to: string, subject: string, html: string, replyTo?: string, attachment?: { filename: string; content: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, reply_to: replyTo, attachments: attachment ? [attachment] : undefined }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}

function paymentHtml(doc: Doc, s: Settings) {
  const rows: string[] = []
  if (s.mobilepay_number)
    rows.push(`<b>MobilePay:</b> ${esc(s.mobilepay_number)} – skriv <b>Faktura ${doc.number}</b> i beskeden`)
  if (s.bank_reg && s.bank_account)
    rows.push(`<b>Bankoverførsel:</b> Reg.nr. ${esc(s.bank_reg)}, kontonr. ${esc(s.bank_account)} – angiv fakturanr. ${doc.number}`)
  return rows.length ? `<p style="background:#f6f0fa;border-radius:10px;padding:12px 14px;line-height:1.6">${rows.join('<br>')}</p>` : ''
}

async function isAdmin(req: Request) {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data } = await db.auth.getUser(jwt)
  const email = data.user?.email?.toLowerCase()
  if (!email) return false
  const { data: a } = await db.from('admins').select('email').ilike('email', email).maybeSingle()
  return !!a
}

async function handleSend(id: string) {
  const { doc, lines, s, related } = await loadDoc(id)
  if (!doc || doc.status === 'kladde') return new Response('Dokumentet er ikke udstedt', { status: 400 })

  const title = TITLES[doc.type]
  const url = `${SITE_URL}#/dok/${doc.public_token}`
  const pdf = toBase64(await makePdf(doc, lines, s, related))
  const first = String(doc.customer_name).split(' ')[0]

  let subject = ''
  let body = ''
  if (doc.type === 'tilbud') {
    subject = `Tilbud nr. ${doc.number} fra DJ Lindstrøm`
    body = `<p>Hej ${esc(first)}</p>
      <p>Tak for din forespørgsel. Her er mit tilbud på <b>${kr(doc.total)}</b> inkl. moms – du finder det også som PDF i mailen.</p>
      ${button(url, 'Se og acceptér tilbud')}
      <p style="color:#666;font-size:14px">Tilbuddet gælder til og med ${dateDa(doc.valid_until)}. Når du accepterer, er datoen booket.</p>
      <p>Mvh<br>Viktor · DJ Lindstrøm</p>`
  } else if (doc.type === 'faktura') {
    subject = `Faktura nr. ${doc.number} fra ${s.company_name}`
    body = `<p>Hej ${esc(first)}</p>
      <p>Hermed faktura nr. ${doc.number} på <b>${kr(doc.total)}</b> inkl. moms med betaling senest <b>${dateDa(doc.due_date)}</b>.</p>
      ${paymentHtml(doc, s)}
      ${button(url, 'Se faktura')}
      <p>Mvh<br>Viktor · DJ Lindstrøm</p>`
  } else {
    subject = `Kreditnota nr. ${doc.number} fra ${s.company_name}`
    body = `<p>Hej ${esc(first)}</p>
      <p>Hermed kreditnota nr. ${doc.number}${related ? ` vedrørende faktura nr. ${related}` : ''} på <b>${kr(doc.total)}</b> inkl. moms.</p>
      ${button(url, 'Se kreditnota')}
      <p>Mvh<br>Viktor · DJ Lindstrøm</p>`
  }

  await send(doc.customer_email, subject, layout(`${title} nr. ${doc.number}`, body), ADMIN_EMAIL, {
    filename: `${title}-${doc.number}.pdf`,
    content: pdf,
  })
  return new Response('OK')
}

async function handleReminder(id: string) {
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data: claimed } = await db
    .from('docs')
    .select('id, reminder_count, last_reminder_at')
    .eq('id', id)
    .eq('type', 'faktura')
    .eq('status', 'sendt')
    .lt('due_date', today)
    .lt('reminder_count', 3)
    .maybeSingle()
  if (!claimed || (claimed.last_reminder_at && claimed.last_reminder_at > weekAgo)) return new Response('Intet at sende')

  // Markér atomisk (samme rykkertal) så dobbeltkald ikke sender to rykkere
  const { data: upd } = await db
    .from('docs')
    .update({ reminder_count: claimed.reminder_count + 1, last_reminder_at: new Date().toISOString() })
    .eq('id', id)
    .eq('reminder_count', claimed.reminder_count)
    .select('id')
    .maybeSingle()
  if (!upd) return new Response('Intet at sende')

  const { doc, lines, s, related } = await loadDoc(id)
  if (!doc) return new Response('Intet at sende')
  const first = String(doc.customer_name).split(' ')[0]
  const url = `${SITE_URL}#/dok/${doc.public_token}`
  const body = `<p>Hej ${esc(first)}</p>
    <p>Jeg kan ikke se, at faktura nr. ${doc.number} på <b>${kr(doc.total)}</b> med forfald ${dateDa(doc.due_date)} er betalt endnu. Det er sikkert bare glippet – vil du se på det, når du får tid?</p>
    ${paymentHtml(doc, s)}
    ${button(url, 'Se faktura')}
    <p style="color:#666;font-size:14px">Har du allerede betalt, så se bort fra denne mail – og tak!</p>
    <p>Mvh<br>Viktor · DJ Lindstrøm</p>`
  try {
    await send(doc.customer_email, `Påmindelse: Faktura nr. ${doc.number}`, layout('Venlig påmindelse', body), ADMIN_EMAIL, {
      filename: `Faktura-${doc.number}.pdf`,
      content: toBase64(await makePdf(doc, lines, s, related)),
    })
  } catch (e) {
    await db.from('docs').update({ reminder_count: claimed.reminder_count, last_reminder_at: claimed.last_reminder_at }).eq('id', id)
    throw e
  }
  return new Response('OK')
}

async function handleAccepted(id: string) {
  const { data: doc } = await db
    .from('docs')
    .select('*')
    .eq('id', id)
    .eq('status', 'accepteret')
    .gte('accepted_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .maybeSingle()
  if (!doc) return new Response('Intet at sende')
  const body = `<p><b>${esc(doc.customer_name)}</b>${doc.customer_company ? ` (${esc(doc.customer_company)})` : ''} har accepteret tilbud nr. ${doc.number} på <b>${kr(doc.total)}</b>.</p>
    <p>Bookingen er sat til <b>Bekræftet</b>, og kunden har fået mail med link til musikønsker.</p>
    ${button(SITE_URL + '#/admin', 'Åbn admin')}`
  await send(ADMIN_EMAIL, `Tilbud nr. ${doc.number} accepteret – ${doc.customer_name}`, layout('Tilbud accepteret 🎉', body), doc.customer_email)
  return new Response('OK')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  const cors = { 'Access-Control-Allow-Origin': '*' }
  try {
    if (!resendKey()) return new Response('RESEND_API_KEY mangler', { status: 500, headers: cors })
    const { doc_id, kind } = await req.json().catch(() => ({}))
    if (typeof doc_id !== 'string') return new Response('Mangler doc_id', { status: 400, headers: cors })

    let res: Response
    if (kind === 'send') {
      if (!(await isAdmin(req))) return new Response('Ingen adgang', { status: 403, headers: cors })
      res = await handleSend(doc_id)
    } else if (kind === 'reminder') res = await handleReminder(doc_id)
    else if (kind === 'accepted') res = await handleAccepted(doc_id)
    else return new Response('Ukendt kind', { status: 400, headers: cors })
    return new Response(await res.text(), { status: res.status, headers: cors })
  } catch (e) {
    console.error(String(e))
    return new Response(`Fejl: ${e}`, { status: 502, headers: cors })
  }
})
