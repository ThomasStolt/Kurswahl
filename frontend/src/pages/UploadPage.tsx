import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { UploadResult } from '../types'

export default function UploadPage() {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const handleFile = useCallback(async (file: File) => {
    if (loading) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Bitte eine CSV-Datei hochladen.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.uploadCsv(file)
      setResult(res)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => navigate('/editor'), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [navigate, loading])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div className="max-w-lg mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">CSV hochladen</h1>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragging(false)
          }
        }}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-16 cursor-pointer transition-colors
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 bg-white'}`}
      >
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) handleFile(file)
          }}
        />
        {loading ? (
          <p className="text-blue-600 font-medium">Wird verarbeitet…</p>
        ) : (
          <>
            <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600">CSV-Datei hier ablegen oder klicken</p>
          </>
        )}
      </label>

      {result && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="font-medium text-green-800">
            ✓ {result.total} Schüler geladen — {result.valid_count} gültig, {result.invalid_count} mit Fehlern
          </p>
          <p className="text-sm text-green-600 mt-1">Weiterleitung zum Editor…</p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}
    </div>
  )
}
