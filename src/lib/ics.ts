import type { Booking } from './types'

const pad = (n: number) => String(n).padStart(2, '0')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c)

function localStamp(date: string, time: string, addHours = 0) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const dt = new Date(y, m - 1, d, hh, mm + Math.round(addHours * 60))
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
}

export function bookingToIcs(b: Booking): string {
  const title = `DJ: ${b.event_types?.name ?? 'Event'}${b.event_themes ? ` (${b.event_themes.name})` : ''} – ${b.customer_name}`
  const packages = b.booking_packages.map((p) => p.sound_packages?.name).filter(Boolean).join(', ')
  const description = [
    `Kunde: ${b.customer_name}${b.company ? ` (${b.company})` : ''}`,
    `Tlf: ${b.phone}`,
    `E-mail: ${b.email}`,
    `Timer: ${b.hours}`,
    b.guest_count != null ? `Gæster: ${b.guest_count}` : '',
    packages ? `Lyd & lys: ${packages}` : '',
    b.message ? `Besked: ${b.message}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DJ Lindstrom//Booking//DA',
    'BEGIN:VEVENT',
    `UID:${b.id}@djlindstrom`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Copenhagen:${localStamp(b.event_date, b.start_time)}`,
    `DTEND;TZID=Europe/Copenhagen:${localStamp(b.event_date, b.start_time, Number(b.hours))}`,
    `SUMMARY:${esc(title)}`,
    `LOCATION:${esc(b.venue_address)}`,
    `DESCRIPTION:${esc(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadIcs(b: Booking) {
  const blob = new Blob([bookingToIcs(b)], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `dj-${b.event_date}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
