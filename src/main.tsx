import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import './index.css'
import Booking from './pages/Booking'
import Thanks from './pages/Thanks'
import Admin from './pages/admin/Admin'

// HashRouter, fordi GitHub Pages ikke kan omskrive URL'er til index.html
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <div className="mx-auto min-h-dvh max-w-2xl px-4 py-8">
        <nav className="mb-8 flex items-center justify-between">
          <Link to="/" className="text-lg font-black tracking-widest">
            DJ <span className="text-accent">LINDSTROM</span>
          </Link>
        </nav>
        <Routes>
          <Route path="/" element={<Booking />} />
          <Route path="/tak" element={<Thanks />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </div>
    </HashRouter>
  </StrictMode>,
)
