import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) setError('Forkert e-mail eller adgangskode')
    setBusy(false)
  }

  return (
    <form onSubmit={login} className="card mx-auto mt-10 grid max-w-sm gap-3">
      <h1 className="text-xl font-black">Admin login</h1>
      <label className="field">
        <span>E-mail</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      </label>
      <label className="field">
        <span>Adgangskode</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn mt-2" disabled={busy}>
        {busy ? 'Logger ind …' : 'Log ind'}
      </button>
    </form>
  )
}
