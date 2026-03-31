import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect, Fragment } from 'react'
import UploadPage from './pages/UploadPage'
import EditorPage from './pages/EditorPage'
import OptimizePage from './pages/OptimizePage'
import ResultsPage from './pages/ResultsPage'

const steps = [
  { path: '/upload',   label: 'Upload' },
  { path: '/editor',   label: 'Editor' },
  { path: '/optimize', label: 'Optimierung' },
  { path: '/results',  label: 'Ergebnisse' },
]

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6l3 3 5-5" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4.1 4.1l1.4 1.4M14.5 14.5l1.4 1.4M4.1 15.9l1.4-1.4M14.5 5.5l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 10.5A7.5 7.5 0 1 1 9.5 2.5a5.5 5.5 0 0 0 8 8z" />
    </svg>
  )
}

function StepNav() {
  const location = useLocation()
  const currentIdx = steps.findIndex(s =>
    location.pathname === s.path || location.pathname.startsWith(s.path + '/')
  )

  return (
    <nav className="flex items-center" aria-label="Fortschritt">
      {steps.map((step, i) => {
        const done   = i < currentIdx
        const active = i === currentIdx
        return (
          <Fragment key={step.path}>
            {i > 0 && (
              <div
                className={`h-px w-5 transition-colors duration-300 ${done ? 'bg-accent' : 'bg-border'}`}
              />
            )}
            <NavLink to={step.path} className="outline-none">
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-200
                  ${active ? 'bg-accent/10' : 'hover:bg-elevated'}`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-200
                    ${active
                      ? 'bg-accent text-surface shadow-glow scale-110'
                      : done
                      ? 'bg-accent/20 text-accent'
                      : 'border border-border text-t3'}`}
                >
                  {done ? <CheckIcon /> : i + 1}
                </div>
                <span
                  className={`text-xs font-medium hidden md:block transition-colors duration-200
                    ${active ? 'text-accent' : done ? 'text-t2' : 'text-t3'}`}
                >
                  {step.label}
                </span>
              </div>
            </NavLink>
          </Fragment>
        )
      })}
    </nav>
  )
}

function NavBar({ dark, toggleDark }: { dark: boolean; toggleDark: () => void }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/80 backdrop-blur-xl transition-colors duration-250">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">

        <NavLink to="/" className="flex items-center gap-2 group flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
            <span className="font-display font-bold text-xs text-surface">KW</span>
          </div>
          <span className="font-display font-semibold text-t1 text-sm group-hover:text-accent transition-colors duration-150 hidden sm:block">
            Kurswahl
          </span>
          <span className="text-[10px] font-mono text-t3 bg-elevated border border-border px-1.5 py-0.5 rounded-md hidden sm:block">
            v{__APP_VERSION__}
          </span>
        </NavLink>

        <StepNav />

        <button
          onClick={toggleDark}
          className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-t2
            hover:text-accent hover:border-accent/40 transition-all duration-200 flex-shrink-0"
          aria-label="Erscheinungsbild wechseln"
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  )
}

export default function App() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('kw-theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('kw-theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <BrowserRouter>
      <NavBar dark={dark} toggleDark={() => setDark(d => !d)} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/"         element={<Navigate to="/upload" replace />} />
          <Route path="/upload"   element={<UploadPage />} />
          <Route path="/editor"   element={<EditorPage />} />
          <Route path="/optimize" element={<OptimizePage />} />
          <Route path="/results"  element={<ResultsPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
