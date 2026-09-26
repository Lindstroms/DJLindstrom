import { supabase } from './supabase'

export type PublicReview = { id: string; rating: number; text: string | null; display_name: string; event_label: string | null }
export type PublicReviews = { count: number; average: number | null; reviews: PublicReview[] }

export type ReviewForm = {
  first_name: string
  event_type: string | null
  event_date: string
  review: { rating: number; text: string | null; display_name: string; consent_publish: boolean } | null
}

export type AdminReview = PublicReview & {
  booking_id: string | null
  consent_publish: boolean
  approved: boolean
  created_at: string
  bookings: { customer_name: string } | null
}

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data
}

export async function getPublicReviews(): Promise<PublicReviews> {
  if (!supabase) return { count: 0, average: null, reviews: [] }
  return check(await supabase.rpc('get_public_reviews')) as PublicReviews
}

export async function getReviewForm(token: string): Promise<ReviewForm> {
  return check(await supabase!.rpc('get_review_form', { p_token: token })) as ReviewForm
}

export async function submitReview(token: string, rating: number, text: string, displayName: string, consent: boolean) {
  check(
    await supabase!.rpc('submit_review', {
      p_token: token,
      p_rating: rating,
      p_text: text,
      p_display_name: displayName,
      p_consent: consent,
    }),
  )
}
