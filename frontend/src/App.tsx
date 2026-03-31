import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import EditorPage from './pages/EditorPage'
import OptimizePage from './pages/OptimizePage'
import ResultsPage from './pages/ResultsPage'

function NavBar() {
  return (
    <nav className="bg-blue-700 text-white px-6 py-3 flex gap-6 items-center">
      <span className="font-bold text-lg">Kurswahl</span>
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
