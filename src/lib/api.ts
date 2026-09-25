import { supabase } from './supabase'
import type { Booking, BookingRequest, BookingStatus, Catalog } from './types'
import { demoCatalog, demoBookings } from './demo'

function fail(message: string): never {
  throw new Error(message)
}

export async function fetchCatalog(): Promise<Catalog> {
  if (!supabase) return demoCatalog

  const [types, themes, packages, blocked, settings, prices] = await Promise.all([
    supabase
      .from('event_types')
      .select('id, name, description, icon, min_hours, max_hours, sort_order, active')
      .eq('active', true)
      .order('sort_order'),
    supabase.from('event_themes').select('*').eq('active', true).order('sort_order'),
    supabase
      .from('sound_packages')
      .select('id, name, description, sort_order, active')
      .eq('active', true)
      .order('sort_order'),
    supabase.from('blocked_dates').select('date'),
    supabase.from('settings').select('show_prices').maybeSingle(),
    supabase.rpc('public_prices'),
  ])

  const error = types.error ?? themes.error ?? packages.error ?? blocked.error ?? settings.error
  if (error) fail('Kunne ikke hente data: ' + error.message)

  const priceMap = new Map<string, number | null>(
    (prices.data ?? []).map((p: { id: string; price: number | null }) => [p.id, p.price]),
  )

  return {
    eventTypes: (types.data ?? []).map((t) => ({ ...t, price: priceMap.get(t.id) ?? null })),
    themes: themes.data ?? [],
    packages: (packages.data ?? []).map((p) => ({ ...p, price: priceMap.get(p.id) ?? null })),
    blockedDates: (blocked.data ?? []).map((b) => b.date as string),
    showPrices: settings.data?.show_prices ?? false,
  }
}

export async function submitBookingRequest(req: BookingRequest): Promise<void> {
  if (!supabase) {
    await new Promise((r) => setTimeout(r, 600))
    return
  }
  const { error } = await supabase.rpc('submit_booking_request', { payload: req })
  if (error) fail(error.message)
}

// ---------- Admin ----------

export async function fetchBookings(): Promise<Booking[]> {
  if (!supabase) return demoBookings
  const { data, error } = await supabase
    .from('bookings')
    .select('*, event_types(name, icon), event_themes(name), booking_packages(sound_packages(name))')
    .order('event_date', { ascending: true })
  if (error) fail(error.message)
  return data as Booking[]
}

export async function updateBooking(
  id: string,
  patch: Partial<Pick<Booking, 'status' | 'internal_notes' | 'quoted_price'>> & { status?: BookingStatus },
): Promise<void> {
  if (!supabase) {
    const b = demoBookings.find((x) => x.id === id)
    if (b) Object.assign(b, patch)
    return
  }
  const { error } = await supabase.from('bookings').update(patch).eq('id', id)
  if (error) fail(error.message)
}
