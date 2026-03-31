import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import EditorPage from './pages/EditorPage'
import OptimizePage from './pages/OptimizePage'
import ResultsPage from './pages/ResultsPage'

const steps = [
  { path: '/upload', label: '1. Upload' },
  { path: '/editor', label: '2. Editor' },
  { path: '/optimize', label: '3. Optimierung' },
  { path: '/results', label: '4. Ergebnisse' },
]

function NavBar() {
  return (
    <nav className="bg-blue-700 text-white px-6 py-3 flex gap-6 items-center">
      <span className="font-bold text-lg mr-4">Kurswahl</span>
      {steps.map(s => (
        <NavLink
          key={s.path}
          to={s.path}
          className={({ isActive }) =>
            `text-sm ${isActive ? 'text-white font-semibold underline' : 'text-blue-200 hover:text-white'}`
          }
        >
          {s.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <main className="max-w-6xl mx-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/optimize" element={<OptimizePage />} />
            <Route path="/results" element={<ResultsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
