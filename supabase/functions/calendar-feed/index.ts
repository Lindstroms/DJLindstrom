// iCalendar-feed med Viktors bekræftede jobs – til abonnement på iPhone.
// Beskyttet af det hemmelige token i settings.calendar_token (?token=...).
// Deployes med verify_jwt = false, da kalender-apps ikke kan sende login-headers.
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c)

// RFC 5545: linjer over 75 oktetter foldes
function fold(line: string) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
    }
    cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

const pad = (n: number) => String(n).padStart(2, '0')

// Lokal (dansk) tid som "floating" dato-tid + TZID
function stamp(date: string, time: string, addHours = 0) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + Math.round(addHours * 60)))
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Copenhagen',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? ''

  const { data: settings } = await db.from('settings').select('calendar_token').single()
  if (!settings || token.length < 32 || token !== settings.calendar_token) {
    return new Response('Ugyldigt link', { status: 403 })
  }

  // Bekræftede og afholdte jobs fra de sidste 90 dage og frem
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const { data: bookings, error } = await db
    .from('bookings')
    .select('*, event_types(name), event_themes(name), booking_packages(sound_packages(name))')
    .in('status', ['bekraeftet', 'afholdt'])
    .gte('event_date', since)
    .order('event_date')
  if (error) return new Response(error.message, { status: 500 })

  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'

  const events = (bookings ?? []).flatMap((b) => {
    const type = b.event_types?.name ?? 'Event'
    const theme = b.event_themes?.name
    const packages = (b.booking_packages ?? [])
      .map((p: { sound_packages: { name: string } | null }) => p.sound_packages?.name)
      .filter(Boolean)
      .join(', ')
    const description = [
      `Kunde: ${b.customer_name}${b.company ? ` (${b.company})` : ''}`,
      `Tlf: ${b.phone}`,
      `E-mail: ${b.email}`,
      `Timer: ${Number(b.hours).toLocaleString('da-DK')}`,
      b.guest_count != null ? `Gæster: ${b.guest_count}` : '',
      packages ? `Lyd & lys: ${packages}` : '',
      b.quoted_price != null ? `Pris: ${Number(b.quoted_price).toLocaleString('da-DK')} kr.` : '',
      b.message ? `Kundens besked: ${b.message}` : '',
      b.internal_notes ? `Noter: ${b.internal_notes}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    return [
      'BEGIN:VEVENT',
      `UID:${b.id}@djlindstrom`,
      `DTSTAMP:${now}`,
      `LAST-MODIFIED:${new Date(b.updated_at).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;TZID=Europe/Copenhagen:${stamp(b.event_date, b.start_time)}`,
      `DTEND;TZID=Europe/Copenhagen:${stamp(b.event_date, b.start_time, Number(b.hours))}`,
      `SUMMARY:${esc(`🎧 ${type}${theme ? ` – ${theme}` : ''} · ${b.customer_name}`)}`,
      `LOCATION:${esc(b.venue_address)}`,
      `DESCRIPTION:${esc(description)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:DJ-job i morgen',
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    ]
  })

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DJ Lindstrom//Booking//DA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:DJ Lindstrom – jobs',
    'X-WR-TIMEZONE:Europe/Copenhagen',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
    ...VTIMEZONE,
    ...events,
    'END:VCALENDAR',
  ]
    .map(fold)
    .join('\r\n')

  return new Response(ics + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="dj-lindstrom.ics"',
      'Cache-Control': 'no-store',
    },
  })
})
