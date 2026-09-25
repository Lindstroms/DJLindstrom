import type { Booking, Catalog } from './types'

const types = [
  ['t1', '18 års fødselsdag', '🎉', 'Fest med fuld dansegulv', 3, 8],
  ['t2', 'Rund fødselsdag', '🎂', '30, 40, 50, 60 år …', 3, 8],
  ['t3', 'Bryllup', '💍', 'Fra første dans til sidste sang', 4, 10],
  ['t4', 'Reception', '🥂', 'Stemningsmusik i baggrunden', 1, 4],
  ['t5', 'Firmaevent', '🏢', 'Julefrokost, sommerfest m.m.', 2, 8],
  ['t6', 'Club', '🪩', 'Club-aften med tema', 2, 6],
] as const

export const demoCatalog: Catalog = {
  eventTypes: types.map(([id, name, icon, description, min_hours, max_hours], i) => ({
    id, name, icon, description, min_hours, max_hours, sort_order: i, active: true,
  })),
  themes: ["90'er", 'House / Techno', 'Latin', 'Hip hop / R&B'].map((name, i) => ({
    id: 'th' + i, event_type_id: 't6', name, sort_order: i, active: true,
  })),
  packages: [
    ['p1', 'Lille lydanlæg', 'Op til ca. 50 gæster'],
    ['p2', 'Stort lydanlæg', 'Op til ca. 200 gæster, inkl. subwoofer'],
    ['p3', 'Lys', 'Partylys og effekter'],
    ['p4', 'Røgmaskine', 'Til de rigtige lyseffekter'],
    ['p5', 'Trådløs mikrofon', 'Til taler og annonceringer'],
  ].map(([id, name, description], i) => ({ id, name, description, sort_order: i, active: true })),
  blockedDates: [],
  showPrices: false,
}

export const demoBookings: Booking[] = [
  {
    id: 'b1',
    status: 'ny',
    event_type_id: 't3',
    event_theme_id: null,
    event_date: '2026-11-14',
    start_time: '20:00',
    hours: 5,
    venue_address: 'Festsalen, Hovedgaden 1, 8000 Aarhus C',
    guest_count: 90,
    customer_name: 'Anna Hansen',
    company: null,
    email: 'anna@example.dk',
    phone: '12345678',
    message: 'Første dans: Ed Sheeran – Perfect',
    internal_notes: null,
    quoted_price: null,
    created_at: '2026-09-20T10:00:00Z',
    event_types: { name: 'Bryllup', icon: '💍' },
    event_themes: null,
    booking_packages: [{ sound_packages: { name: 'Stort lydanlæg' } }, { sound_packages: { name: 'Lys' } }],
  },
]
