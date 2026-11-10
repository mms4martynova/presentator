import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { getThemes } from '../lib/pptxBuilder.js'

const THEMES = getThemes()

export default function RebuildDialog({ task, onClose, onRebuilt }) {
  const [title, setTitle] = useState(task.title)
  const [templateId, setTemplateId] = useState(task.request.template_id ?? 'default')
  const [slidesCount, setSlidesCount] = useState(task.request.slides_count ?? 8)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (event) => {
    event.preventDefault()
    const changes = {}
    if (title.trim() !== task.title) changes.title = title.trim()
    if (String(templateId) !== String(task.request.template_id ?? 'default')) {
      changes.template_id = templateId
    }
    if (Number(slidesCount) !== task.request.slides_count) changes.slides_count = Number(slidesCount)
    if (Object.keys(changes).length === 0) {
      setError('Измените хотя бы один параметр')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const rebuilt = await api.rebuildTask(task.id, changes)
      onRebuilt(rebuilt)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card fade-in" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="subtitle">Собрать заново</h2>
        <p className="muted small">
          Если меняется только оформление или название, структура слайдов сохранится. Изменение числа слайдов
          перестроит содержание.
        </p>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span className="label">Название</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>
          <label className="field">
            <span className="label">Оформление</span>
            <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t.key} value={t.key}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Количество слайдов</span>
            <input
              className="input"
              type="number"
              min={1}
              max={40}
              value={slidesCount}
              onChange={(e) => setSlidesCount(e.target.value)}
            />
          </label>
          {error && <p className="alert alert-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Собираем…' : 'Собрать заново'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
