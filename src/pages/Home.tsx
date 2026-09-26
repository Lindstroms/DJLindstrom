import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchCatalog } from '../lib/api'
import type { Catalog } from '../lib/types'
import { content } from '../content'
import Booking from './Booking'

// Tilføjer .is-visible når elementer med .reveal ruller i syne
function useReveal(deps: unknown[]) {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal:not(.is-visible)')
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.12 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

function InstagramIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Equalizer({ bars = 40 }: { bars?: number }) {
  return (
    <div className="eq" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} style={{ animationDelay: `${-((i * 137) % 1000) / 1000}s`, animationDuration: `${0.8 + ((i * 53) % 70) / 100}s` }} />
      ))}
    </div>
  )
}

function Vinyl({ className = '' }: { className?: string }) {
  return (
    <div className={`vinyl ${className}`} aria-hidden="true">
      <div className="vinyl-label">
        <span className="font-display text-[0.6rem] tracking-[0.3em] text-black">LINDSTROM</span>
      </div>
    </div>
  )
}

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadError, setLoadError] = useState('')
  const [preselect, setPreselect] = useState<{ id: string; nonce: number }>()
  const bookRef = useRef<HTMLElement>(null)

  useEffect(() => {
    fetchCatalog().then(setCatalog).catch((e: Error) => setLoadError(e.message))
  }, [])
  useReveal([catalog])

  const scrollToBook = () => bookRef.current?.scrollIntoView({ behavior: 'smooth' })
  const pick = (id: string) => {
    setPreselect({ id, nonce: Date.now() })
    scrollToBook()
  }

  const names = catalog?.eventTypes.map((t) => t.name) ?? []

  return (
    <div className="overflow-x-clip">
      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0b0b12]/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="cursor-pointer font-display text-base font-black tracking-[0.2em] sm:text-lg"
          >
            DJ <span className="text-accent">LINDSTROM</span>
          </button>
          <div className="flex items-center gap-2">
            <a
              href={content.instagram.url}
              target="_blank"
              rel="noreferrer"
              className="grid size-10 place-items-center rounded-full text-zinc-300 transition hover:bg-white/5 hover:text-white"
              aria-label="Instagram"
            >
              <InstagramIcon />
            </a>
            <button className="btn btn-glow !px-5 !py-2 text-sm" onClick={scrollToBook}>
              Book nu
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate flex min-h-[88svh] items-center overflow-hidden">
        <img
          src={import.meta.env.BASE_URL + content.hero.image}
          alt=""
          fetchPriority="high"
          className="hero-bg absolute inset-0 -z-30 size-full object-cover object-[70%_center]"
        />
        {/* Mørk overgang så teksten kan læses */}
        <div className="absolute inset-0 -z-20 bg-gradient-to-r from-[#0b0b12] via-[#0b0b12]/75 to-[#0b0b12]/20" />
        <div className="absolute inset-0 -z-20 bg-gradient-to-t from-[#0b0b12] via-transparent to-[#0b0b12]/40" />
        <div className="blob blob-a" />

        <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-12">
          <p className="hero-in mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-accent">{content.hero.kicker}</p>
          <h1 className="hero-in font-display text-[clamp(2.8rem,11vw,7.5rem)] font-black leading-[0.9] tracking-tight [animation-delay:.1s]">
            DJ
            <br />
            <span className="text-gradient">LINDSTROM</span>
          </h1>
          <p className="hero-in mt-6 max-w-md text-lg text-zinc-300 [animation-delay:.2s] sm:text-xl">{content.hero.tagline}</p>
          <div className="hero-in mt-8 flex flex-wrap gap-3 [animation-delay:.3s]">
            <button className="btn btn-glow text-lg" onClick={scrollToBook}>
              Book DJ Lindstrom
            </button>
            <button className="btn-ghost text-lg" onClick={() => document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' })}>
              Se events
            </button>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 -z-10 h-24 opacity-60">
          <Equalizer />
        </div>
      </section>

      {/* Rullende bånd med event-typer */}
      {names.length > 0 && (
        <div className="marquee border-y border-white/5 bg-white/[0.02] py-4" aria-hidden="true">
          <div className="marquee-track font-display text-lg font-bold uppercase tracking-widest text-zinc-500">
            {[...names, ...names, ...names, ...names].map((n, i) => (
              <span key={i} className="flex items-center gap-8 pr-8">
                {n} <span className="text-accent">✦</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Om Viktor */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2 md:py-28">
        <div className="reveal relative mx-auto aspect-[3/4] w-full max-w-sm">
          <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-accent/40 via-fuchsia-900/20 to-indigo-600/30 blur-2xl" />
          <div className="relative size-full overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950">
            <img
              src={import.meta.env.BASE_URL + content.about.image}
              alt={content.about.imageAlt}
              loading="lazy"
              className="size-full object-cover"
            />
          </div>
          <Vinyl className="absolute -bottom-8 -right-6 size-28 sm:-right-10 sm:size-36" />
        </div>
        <div className="reveal">
          <h2 className="section-title">{content.about.title}</h2>
          {content.about.paragraphs.map((p) => (
            <p key={p} className="mt-4 text-lg leading-relaxed text-zinc-300">
              {p}
            </p>
          ))}
          <a
            href={content.instagram.url}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 font-semibold text-accent hover:underline"
          >
            <InstagramIcon /> Følg med på {content.instagram.handle}
          </a>
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-8 sm:grid-cols-3">
        {content.highlights.map((h, i) => (
          <div key={h.title} className="reveal card glow-card" style={{ transitionDelay: `${i * 80}ms` }}>
            <div className="text-3xl">{h.icon}</div>
            <h3 className="mt-3 font-display text-lg font-bold">{h.title}</h3>
            <p className="mt-1 text-zinc-400">{h.text}</p>
          </div>
        ))}
      </section>

      {/* Event-typer */}
      <section id="events" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <div className="reveal mb-10 text-center">
          <h2 className="section-title">Hvad skal fejres?</h2>
          <p className="mt-3 text-zinc-400">Vælg din type fest – så er du allerede i gang med bookingen.</p>
        </div>
        {loadError && <p className="text-center text-red-400">{loadError}</p>}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {catalog?.eventTypes.map((t, i) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className="reveal event-card group text-left"
              style={{ transitionDelay: `${(i % 3) * 80}ms` }}
            >
              <span className="text-4xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 sm:text-5xl">
                {t.icon}
              </span>
              <span className="mt-4 block font-display text-base font-bold sm:text-xl">{t.name}</span>
              {t.description && <span className="mt-1 block text-sm text-zinc-400">{t.description}</span>}
              {catalog.showPrices && t.price != null && (
                <span className="mt-2 block text-sm font-semibold text-accent">fra {Number(t.price).toLocaleString('da-DK')} kr.</span>
              )}
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent opacity-80 transition group-hover:gap-2 group-hover:opacity-100">
                Book <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Sådan foregår det */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="reveal section-title mb-10 text-center">Sådan foregår det</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {content.steps.map((s, i) => (
            <li key={s.title} className="reveal card relative overflow-hidden" style={{ transitionDelay: `${i * 80}ms` }}>
              <span className="absolute -right-2 -top-6 font-display text-8xl font-black text-white/[0.04]">{i + 1}</span>
              <span className="grid size-10 place-items-center rounded-full bg-accent font-display font-black text-black">{i + 1}</span>
              <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-1 text-zinc-400">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Galleri – vises først når der er billeder i content.ts */}
      {content.gallery.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="reveal section-title mb-8 text-center">Stemning fra tidligere fester</h2>
          <div className="columns-2 gap-3 md:columns-3">
            {content.gallery.map((g) => (
              <img
                key={g.src}
                src={import.meta.env.BASE_URL + g.src}
                alt={g.alt}
                loading="lazy"
                className="reveal mb-3 w-full rounded-2xl border border-white/10"
              />
            ))}
          </div>
        </section>
      )}

      {/* Booking */}
      <section id="book" ref={bookRef} className="relative scroll-mt-16 py-20">
        <div className="blob blob-c" />
        <div className="mx-auto max-w-2xl px-4">
          <div className="reveal mb-8 text-center">
            <h2 className="section-title">
              Book <span className="text-gradient">DJ Lindstrom</span>
            </h2>
            <p className="mt-3 text-zinc-400">Send en uforpligtende forespørgsel – du får et tilbud inden for 24 timer.</p>
          </div>
          {catalog ? <Booking catalog={catalog} preselect={preselect} /> : !loadError && <p className="text-center text-zinc-400">Indlæser …</p>}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="font-display font-black tracking-[0.2em]">
              DJ <span className="text-accent">LINDSTROM</span>
            </p>
            <p className="mt-1 text-sm text-zinc-500">© {new Date().getFullYear()} DJ Lindstrom</p>
          </div>
          <div className="flex flex-col items-center gap-2 text-sm sm:items-end">
            <a href={content.instagram.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-zinc-300 hover:text-white">
              <InstagramIcon className="size-4" /> {content.instagram.handle}
            </a>
            <a href={`mailto:${content.email}`} className="text-zinc-300 hover:text-white">
              {content.email}
            </a>
            <Link to="/admin" className="text-xs text-zinc-600 hover:text-zinc-400">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
