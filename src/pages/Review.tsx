import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Stars from '../components/Stars'
import { getReviewForm, submitReview, type ReviewForm } from '../lib/reviews'

const LABELS = ['', 'Ikke godt', 'Okay', 'Godt', 'Rigtig godt', 'Fantastisk!']

export default function Review() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const [form, setForm] = useState<ReviewForm | null>(null)
  const [error, setError] = useState('')
  const [rating, setRating] = useState(() => Math.min(5, Math.max(0, Number(params.get('stars')) || 0)))
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(true)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getReviewForm(token)
      .then((f) => {
        setForm(f)
        if (f.review) {
          setRating((r) => r || f.review!.rating)
          setText(f.review.text ?? '')
          setName(f.review.display_name)
          setConsent(f.review.consent_publish)
        } else {
          setName(`${f.first_name}${f.event_type ? `, ${f.event_type.toLowerCase()}` : ''}`)
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [token])

  const send = async () => {
    setSending(true)
    setError('')
    try {
      await submitReview(token, rating, text, name, consent)
      setDone(true)
      window.scrollTo(0, 0)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  if (!form)
    return error ? (
      <div className="card text-center">
        <p className="text-4xl">🎧</p>
        <p className="mt-3 font-semibold">{error}</p>
      </div>
    ) : (
      <p className="text-zinc-400">Indlæser …</p>
    )

  if (done)
    return (
      <div className="card mt-6 text-center">
        <p className="text-5xl">💜</p>
        <h1 className="mt-4 font-display text-2xl font-black">Tusind tak, {form.first_name}!</h1>
        <p className="mt-3 text-zinc-300">Din anmeldelse er modtaget. Det betyder virkelig meget.</p>
        <Link to="/" className="btn-ghost mt-8 inline-block">
          Til forsiden
        </Link>
      </div>
    )

  return (
    <div className="grid grid-cols-1 gap-5">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Anmeldelse</p>
        <h1 className="mt-2 font-display text-2xl font-black sm:text-3xl">Hvordan var festen, {form.first_name}?</h1>
        {form.review && <p className="mt-2 text-sm text-zinc-400">Du har allerede anmeldt – du kan rette din anmeldelse her.</p>}
      </header>

      <section className="card grid gap-5">
        <div className="text-center">
          <Stars value={rating} onChange={setRating} size="text-5xl" />
          <p className="mt-2 h-6 font-semibold text-accent">{LABELS[rating]}</p>
        </div>

        <label className="field">
          <span>Fortæl lidt om oplevelsen</span>
          <textarea
            rows={5}
            maxLength={1500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hvordan var stemningen, musikken og samarbejdet?"
          />
        </label>

        <label className="field">
          <span>Navn der vises ved anmeldelsen</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="fx Anna & Jonas, bryllup" />
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-accent)]"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span className="text-zinc-300">DJ Lindstrom må gerne vise min anmeldelse på hjemmesiden.</span>
        </label>

        {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}

        <button className="btn" disabled={!rating || !name.trim() || sending} onClick={send}>
          {sending ? 'Sender …' : form.review ? 'Opdater anmeldelse' : 'Send anmeldelse'}
        </button>
      </section>
    </div>
  )
}
