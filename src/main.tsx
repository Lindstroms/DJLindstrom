import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import './index.css'
import Home from './pages/Home'
import Thanks from './pages/Thanks'
import Admin from './pages/admin/Admin'
import MusicWishes from './pages/MusicWishes'
import LiveGuest from './pages/LiveGuest'
import Review from './pages/Review'
import LiveDj from './pages/admin/LiveDj'

// Enkel ramme til takkeside og admin
function Page({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 py-8">
      <nav className="mb-8 flex items-center justify-between">
        <Link to="/" className="font-display text-lg font-black tracking-[0.2em]">
          DJ <span className="text-accent">LINDSTRØM</span>
        </Link>
      </nav>
      {children}
    </div>
  )
}

// HashRouter, fordi GitHub Pages ikke kan omskrive URL'er til index.html
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tak" element={<Page><Thanks /></Page>} />
        <Route path="/admin" element={<Page><Admin /></Page>} />
        <Route path="/musik/:token" element={<Page><MusicWishes /></Page>} />
        <Route path="/live/:token" element={<Page><LiveGuest /></Page>} />
        <Route path="/anmeld/:token" element={<Page><Review /></Page>} />
        <Route path="/admin/live/:id" element={<Page><LiveDj /></Page>} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)
