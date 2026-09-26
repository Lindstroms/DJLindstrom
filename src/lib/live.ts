import { useEffect } from 'react'
import { supabase } from './supabase'
import type { Song } from './music'

export type LiveItem = {
  id: string
  title: string
  artist: string
  artwork_url: string | null
  guest_name?: string | null
  votes?: number
  voted?: boolean
}

export type LiveQueue = {
  open: boolean
  event_type: string | null
  queue: LiveItem[]
  played: LiveItem[]
}

export type LiveRequest = LiveItem & {
  booking_id: string
  preview_url: string | null
  votes: number
  status: 'queued' | 'played' | 'rejected'
  created_at: string
  updated_at: string
}

// Anonym, stabil id for denne browser – bruges til at undgå dobbeltstemmer
export function voterId() {
  const key = 'djl-voter'
  try {
    let id = localStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(key, id)
    }
    return id
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2, 12)
  }
}

export const liveUrl = (token: string) => `${location.origin}${location.pathname}#/live/${token}`

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data
}

export async function getLiveQueue(token: string): Promise<LiveQueue> {
  return check(await supabase!.rpc('get_live_queue', { p_token: token, p_voter: voterId() })) as LiveQueue
}

export async function requestSong(token: string, song: Song, guestName: string) {
  return check(
    await supabase!.rpc('request_live_song', { p_token: token, p_voter: voterId(), p_song: song, p_guest_name: guestName }),
  ) as 'added' | 'voted' | 'already' | 'blocked'
}

export async function voteSong(token: string, requestId: string) {
  return check(await supabase!.rpc('vote_live_song', { p_token: token, p_voter: voterId(), p_request_id: requestId })) as
    | 'voted'
    | 'already'
}

// Genindlæser med jævne mellemrum, og straks når fanen bliver synlig igen
export function usePolling(fn: () => void, ms: number, deps: unknown[] = []) {
  useEffect(() => {
    fn()
    const t = setInterval(() => document.visibilityState === 'visible' && fn(), ms)
    const onVis = () => document.visibilityState === 'visible' && fn()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
