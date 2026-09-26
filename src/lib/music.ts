import { supabase } from './supabase'

export const GENRES = [
  'Pop',
  'Danske hits',
  'Fællessang',
  '80’er',
  '90’er',
  '00’er',
  'House / Dance',
  'Hip hop / R&B',
  'Rock',
  'Latin',
  'Disco / Funk',
  'Techno',
] as const

export const ENERGY_LABELS = ['', 'Hyggelig baggrund', 'Afslappet', 'Blandet', 'Festlig', 'Fuld fart!']

export const MOMENTS = ['Indmarch', 'Første dans', 'Brudevals', 'Kagen', 'Sidste sang']

export type Song = {
  title: string
  artist: string
  artwork_url: string | null
  preview_url: string | null
  external_url: string | null
}

export type WishKind = 'must' | 'wish' | 'nope'

export type Wish = Song & { id: string; kind: WishKind; moment: string | null; created_at: string }

export const WISH_LABELS: Record<WishKind, string> = {
  must: 'Skal spilles',
  wish: 'Ønsker',
  nope: 'Må ikke spilles',
}

export type Wishlist = {
  editable: boolean
  event_type: string | null
  event_theme: string | null
  event_date: string
  start_time: string
  hours: number
  first_name: string
  genres: string[]
  energy: number | null
  notes: string | null
  wishes: Wish[]
}

const SEARCH_URL = 'https://vubxctebuwiftamiskxs.supabase.co/functions/v1/song-search'

export async function searchSongs(q: string, signal?: AbortSignal): Promise<Song[]> {
  const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(q)}`, { signal })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Søgningen fejlede')
  return data
}

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data
}

export async function getWishlist(token: string): Promise<Wishlist> {
  return check(await supabase!.rpc('get_wishlist', { p_token: token })) as Wishlist
}

export async function saveMusicPrefs(token: string, genres: string[], energy: number | null, notes: string) {
  check(await supabase!.rpc('save_music_prefs', { p_token: token, p_genres: genres, p_energy: energy, p_notes: notes }))
}

export async function addWish(token: string, song: Song, kind: WishKind, moment?: string) {
  check(await supabase!.rpc('add_song_wish', { p_token: token, p_wish: { ...song, kind, moment: moment ?? null } }))
}

export async function removeWish(token: string, id: string) {
  check(await supabase!.rpc('remove_song_wish', { p_token: token, p_id: id }))
}

export const spotifySearchUrl = (s: { title: string; artist: string }) =>
  `https://open.spotify.com/search/${encodeURIComponent(`${s.title} ${s.artist}`)}`
