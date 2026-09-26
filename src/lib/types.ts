export type EventType = {
  id: string
  name: string
  description: string | null
  icon: string | null
  min_hours: number
  max_hours: number
  sort_order: number
  active: boolean
  price?: number | null
}

export type EventTheme = {
  id: string
  event_type_id: string
  name: string
  sort_order: number
  active: boolean
}

export type SoundPackage = {
  id: string
  name: string
  description: string | null
  sort_order: number
  active: boolean
  price?: number | null
}

export type BookingStatus = 'ny' | 'tilbud_sendt' | 'bekraeftet' | 'afholdt' | 'afvist' | 'annulleret'

export const STATUS_LABELS: Record<BookingStatus, string> = {
  ny: 'Ny forespørgsel',
  tilbud_sendt: 'Tilbud sendt',
  bekraeftet: 'Bekræftet',
  afholdt: 'Afholdt',
  afvist: 'Afvist',
  annulleret: 'Annulleret',
}

export type BookingRequest = {
  event_type_id: string
  event_theme_id: string | null
  event_date: string // yyyy-MM-dd
  start_time: string // HH:mm
  hours: number
  venue_address: string
  guest_count: number | null
  customer_name: string
  company: string | null
  email: string
  phone: string
  message: string | null
  package_ids: string[]
}

export type Booking = Omit<BookingRequest, 'package_ids'> & {
  id: string
  status: BookingStatus
  internal_notes: string | null
  quoted_price: number | null
  created_at: string
  event_types: { name: string; icon: string | null } | null
  event_themes: { name: string } | null
  booking_packages: { sound_packages: { name: string } | null }[]
  wishlist_token: string
  music_genres: string[]
  music_energy: number | null
  music_notes: string | null
  song_wishes: import('./music').Wish[]
}

export type Catalog = {
  eventTypes: EventType[]
  themes: EventTheme[]
  packages: SoundPackage[]
  blockedDates: string[]
  showPrices: boolean
}
