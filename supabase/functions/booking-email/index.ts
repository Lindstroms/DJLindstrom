// Sender kvittering til kunden og besked til Viktor, når der kommer en ny forespørgsel.
// Kaldes af en database-trigger på bookings (se migration 0003_booking_email.sql).
//
// Secrets (Supabase: Edge Functions -> Secrets):
//   RESEND_API_KEY  – påkrævet
//   EMAIL_FROM      – valgfri, standard "DJ Lindstrom <booking@fam-lindstrom.dk>"
//   ADMIN_EMAIL     – valgfri, standard "viktor@fam-lindstrom.dk"
import { createClient } from 'npm:@supabase/supabase-js@2'

const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'DJ Lindstrom <booking@fam-lindstrom.dk>'
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? 'viktor@fam-lindstrom.dk'
const ADMIN_URL = 'https://lindstroms.github.io/DJLindstrom/#/admin'

// Accepterer både RESEND_API_KEY og resend_api_key
const resendKey = () => Deno.env.get('RESEND_API_KEY') ?? Deno.env.get('resend_api_key')

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const dateDa = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Copenhagen',
  })

const hoursDa = (h: number) => `${Number(h).toLocaleString('da-DK')} timer`

type Row = [label: string, value: string | null | undefined]

function table(rows: Row[]) {
  return `<table cellpadding="6" style="border-collapse:collapse;font-size:15px">${rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="white-space:pre-line">${esc(v)}</td></tr>`,
    )
    .join('')}</table>`
}

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#0b0b12;color:#fff;border-radius:12px 12px 0 0;padding:20px 24px;font-weight:900;letter-spacing:2px">DJ <span style="color:#e040fb">LINDSTROM</span></div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
    ${body}
  </div>
</div></body></html>`
}

async function send(to: string, subject: string, html: string, replyTo?: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, reply_to: replyTo }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!resendKey()) {
    // Kun navne (ikke værdier) – hjælper med at finde stavefejl i secret-navnet
    const names = Object.keys(Deno.env.toObject()).filter((k) => !k.startsWith('SUPABASE_') && !k.startsWith('DENO_'))
    return new Response(`RESEND_API_KEY mangler. Fundne secrets: ${names.join(', ') || '(ingen)'}`, { status: 500 })
  }

  const { id } = await req.json().catch(() => ({}))
  if (typeof id !== 'string') return new Response('Mangler id', { status: 400 })

  // Markér som sendt atomisk: kun nye, ikke-notificerede forespørgsler fra de sidste 15 minutter.
  // Det gør funktionen sikker at kalde flere gange og ubrugelig til spam.
  const { data: b, error } = await db
    .from('bookings')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', id)
    .is('notified_at', null)
    .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .select('*, event_types(name), event_themes(name), booking_packages(sound_packages(name))')
    .maybeSingle()

  if (error) return new Response(error.message, { status: 500 })
  if (!b) return new Response('Intet at sende', { status: 200 })

  const event = [b.event_types?.name, b.event_themes?.name].filter(Boolean).join(' – ')
  const packages =
    (b.booking_packages ?? []).map((p: { sound_packages: { name: string } | null }) => p.sound_packages?.name).filter(Boolean).join(', ') ||
    'Ønsker rådgivning'
  const when = `${dateDa(b.event_date)} kl. ${String(b.start_time).slice(0, 5)}, ${hoursDa(b.hours)}`

  const details: Row[] = [
    ['Event', event],
    ['Tidspunkt', when],
    ['Adresse', b.venue_address],
    ['Gæster', b.guest_count != null ? String(b.guest_count) : null],
    ['Lyd & lys', packages],
    ['Besked', b.message],
  ]

  const customerHtml = layout(
    'Tak for din forespørgsel!',
    `<p>Hej ${esc(b.customer_name)}</p>
     <p>Tak for din forespørgsel – vi kontakter dig og sender et tilbud inden for 24 timer.</p>
     <p style="margin-top:20px;font-weight:600">Det har du sendt:</p>
     ${table(details)}
     <p style="margin-top:20px;color:#666;font-size:14px">Har du spørgsmål, så svar blot på denne mail.</p>
     <p>Mvh<br>DJ Lindstrom</p>`,
  )

  const adminHtml = layout(
    `Ny forespørgsel: ${event}`,
    `${table([
      ['Kunde', b.customer_name + (b.company ? ` (${b.company})` : '')],
      ['Telefon', b.phone],
      ['E-mail', b.email],
      ...details,
    ])}
     <p style="margin-top:24px"><a href="${ADMIN_URL}" style="background:#e040fb;color:#000;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Åbn i admin</a></p>
     <p style="color:#666;font-size:14px">Svar på denne mail for at skrive direkte til kunden.</p>`,
  )

  const results = await Promise.allSettled([
    send(b.email, 'Tak for din forespørgsel – DJ Lindstrom', customerHtml, ADMIN_EMAIL),
    send(ADMIN_EMAIL, `Ny forespørgsel: ${event} ${b.event_date}`, adminHtml, b.email),
  ])
  const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
  if (failed.length) {
    const msg = failed.map((f) => String(f.reason)).join('\n')
    console.error(msg)
    return new Response(`Fejl ved afsendelse:\n${msg}`, { status: 502 })
  }
  return new Response('OK', { status: 200 })
})
