import { useEffect, useState } from 'react'
import { addTemplateVersion } from '../templatesApi.js'

export default function TemplateVersionDialog({ template, onClose, onSaved }) {
  const [file, setFile] = useState(null)
  const [changeNote, setChangeNote] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (event) => {
    event.preventDefault()
    if (!file) {
      setError('Выберите файл презентации PPTX')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const updated = await addTemplateVersion(template, { file, changeNote: changeNote.trim() })
      onSaved(updated)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card fade-in" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="subtitle">Новая версия шаблона</h2>
        <p className="muted small">Новая версия станет текущей. Предыдущие версии сохранятся, и к ним можно вернуться.</p>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span className="label">Файл шаблона</span>
            <input
              className="input"
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <label className="field">
            <span className="label">Что изменилось</span>
            <input
              className="input"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              maxLength={300}
              placeholder="Например, обновлён логотип и цвета"
            />
          </label>

          {error && <p className="alert alert-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Загружаем…' : 'Загрузить версию'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
