import { supabase } from './supabase'
import type { BookingStatus } from './types'
import type { DocStatus, DocType } from './finance'

export type ProgramItem = { time?: string; label: string; note?: string }

export type EventPlan = {
  contact_name?: string
  contact_phone?: string
  setup_from?: string
  location?: 'inde' | 'ude' | 'begge'
  power?: 'ja' | 'nej' | 'ved_ikke'
  access?: string
  notes?: string
  program?: ProgramItem[]
}

export type PortalDoc = {
  type: DocType
  number: number
  status: DocStatus
  total: number
  issue_date: string
  due_date: string | null
  valid_until: string | null
  token: string
}

export type Portal = {
  status: BookingStatus
  first_name: string
  customer_name: string
  company: string | null
  event_type: string | null
  event_icon: string | null
  event_theme: string | null
  event_date: string
  start_time: string
  hours: number
  venue_address: string
  guest_count: number | null
  packages: string[]
  plan: EventPlan
  plan_updated_at: string | null
  plan_editable: boolean
  docs: PortalDoc[]
  music: { wishes: number; genres: number } | null
  live_token: string | null
  review: { done: boolean } | null
  contact: { email: string; phone: string }
}

export const LOCATION_LABEL = { inde: 'Indendørs', ude: 'Udendørs', begge: 'Både inde og ude' } as const
export const POWER_LABEL = { ja: 'Ja', nej: 'Nej', ved_ikke: 'Ved ikke' } as const

// Typiske punkter i et program – kunden trykker for at tilføje
export const PROGRAM_SUGGESTIONS = [
  'Gæsterne ankommer',
  'Velkomstdrink',
  'Middag',
  'Taler',
  'Første dans',
  'Kage / dessert',
  'Dansegulvet åbner',
  'Underholdning / indslag',
  'Natmad',
  'Sidste sang',
]

export const portalUrl = (token: string) => `${location.origin}${location.pathname}#/booking/${token}`

export async function getPortal(token: string): Promise<Portal> {
  const { data, error } = await supabase!.rpc('get_customer_portal', { p_token: token })
  if (error) throw new Error(error.message)
  return data as Portal
}

export async function saveEventPlan(token: string, plan: EventPlan): Promise<string> {
  const { data, error } = await supabase!.rpc('save_event_plan', { p_token: token, p_plan: plan })
  if (error) throw new Error(error.message)
  return data as string
}

export const planIsEmpty = (p: EventPlan | null | undefined) => !p || Object.keys(p).filter((k) => k !== 'program' || p.program?.length).length === 0
