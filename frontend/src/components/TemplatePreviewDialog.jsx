import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function TemplatePreviewDialog({ templateId, version, onClose }) {
  const [pdfUrl, setPdfUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let url = null
    let cancelled = false
    api
      .getTemplateVersionPreview(templateId, version.id)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setPdfUrl(url)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [templateId, version.id])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide card fade-in" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="page-title-row">
          <h2 className="subtitle">Версия {version.version}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
        {error && <p className="alert alert-error">{error}</p>}
        {!error && !pdfUrl && <p className="muted">Готовим предпросмотр…</p>}
        {pdfUrl && <iframe className="preview-frame" src={pdfUrl} title="Предпросмотр шаблона" />}
      </div>
    </div>
  )
}
