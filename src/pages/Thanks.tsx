import { Link } from 'react-router-dom'

export default function Thanks() {
  return (
    <div className="card mt-10 text-center">
      <div className="text-5xl">🎧</div>
      <h1 className="mt-4 text-2xl font-black">Tak for din forespørgsel!</h1>
      <p className="mt-3 text-zinc-300">Vi kontakter dig og sender et tilbud inden for 24 timer.</p>
      <Link to="/" className="btn-ghost mt-8 inline-block">
        Send en ny forespørgsel
      </Link>
    </div>
  )
}
