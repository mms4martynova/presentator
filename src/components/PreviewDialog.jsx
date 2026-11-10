import { useEffect, useState } from 'react'

export default function PreviewDialog({ title, loadBlob, onClose }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let blobUrl = null
    let cancelled = false
    loadBlob()
      .then((blob) => {
        if (cancelled) return
        blobUrl = URL.createObjectURL(blob)
        setUrl(blobUrl)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [loadBlob])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide card fade-in" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="page-title-row">
          <h2 className="subtitle">{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
        {error && <p className="alert alert-error">{error}</p>}
        {!error && !url && <p className="muted">Готовим предпросмотр…</p>}
        {url && <iframe className="preview-frame" src={url} title={title} />}
      </div>
    </div>
  )
}
