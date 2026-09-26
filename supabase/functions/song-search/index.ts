// Sangsøgning til musikønsker: iTunes Search API (dansk katalog), med Deezer som reserve.
// Begge er gratis og kræver ingen nøgle. Offentlig (verify_jwt = false) – returnerer kun søgeresultater.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

type Song = {
  title: string
  artist: string
  artwork_url: string | null
  preview_url: string | null
  external_url: string | null
}

async function itunes(q: string): Promise<Song[]> {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term: q, entity: 'song', country: 'DK', limit: '15' })}`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`iTunes ${res.status}`)
  const data = await res.json()
  return (data.results ?? []).map((r: Record<string, string>) => ({
    title: r.trackName,
    artist: r.artistName,
    artwork_url: r.artworkUrl100?.replace('100x100bb', '200x200bb') ?? null,
    preview_url: r.previewUrl ?? null,
    external_url: r.trackViewUrl ?? null,
  }))
}

async function deezer(q: string): Promise<Song[]> {
  const res = await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q, limit: '15' })}`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Deezer ${res.status}`)
  const data = await res.json()
  return (data.data ?? []).map((r: { title: string; artist: { name: string }; album: { cover_medium: string }; preview: string; link: string }) => ({
    title: r.title,
    artist: r.artist?.name ?? '',
    artwork_url: r.album?.cover_medium ?? null,
    preview_url: r.preview || null,
    external_url: r.link ?? null,
  }))
}

// Fjern dubletter (samme titel + kunstner)
function dedupe(songs: Song[]) {
  const seen = new Set<string>()
  return songs.filter((s) => {
    const k = `${s.title}|${s.artist}`.toLowerCase()
    if (!s.title || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100)
  if (q.length < 2) return Response.json([], { headers: CORS })

  let songs: Song[] = []
  try {
    songs = await itunes(q)
  } catch (e) {
    console.warn(String(e))
  }
  if (songs.length === 0) {
    try {
      songs = await deezer(q)
    } catch (e) {
      console.warn(String(e))
      return Response.json({ error: 'Søgningen er utilgængelig lige nu' }, { status: 502, headers: CORS })
    }
  }

  return Response.json(dedupe(songs).slice(0, 12), {
    headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' },
  })
})
