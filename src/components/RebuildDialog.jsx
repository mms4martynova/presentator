import { useEffect, useState } from 'react'
import { api } from '../api.js'
import ThemePicker from './ThemePicker.jsx'

export default function RebuildDialog({ task, onClose, onRebuilt }) {
  const [title, setTitle] = useState(task.title)
  const [theme, setTheme] = useState({
    templateId: task.request.template_id ?? 'default',
    templateVersionId: task.request.template_version_id ?? null,
  })
  const [slidesCount, setSlidesCount] = useState(task.request.slides_count ?? 8)
  const [wantPdf, setWantPdf] = useState(task.want_pdf ?? false)
  const [orderedSlides, setOrderedSlides] = useState(() => task.outline || [])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const moveSlide = (index, direction) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= orderedSlides.length) return
    setOrderedSlides((current) => {
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(nextIndex, 0, moved)
      return next
    })
  }

  const submit = async (event) => {
    event.preventDefault()
    const changes = {}
    if (title.trim() !== task.title) changes.title = title.trim()
    if (
      theme.templateId !== (task.request.template_id ?? 'default')
      || theme.templateVersionId !== (task.request.template_version_id ?? null)
    ) {
      changes.template_id = theme.templateId
      changes.template_version_id = theme.templateVersionId
    }
    if (Number(slidesCount) !== task.request.slides_count) changes.slides_count = Number(slidesCount)
    if (wantPdf !== (task.want_pdf ?? false)) changes.want_pdf = wantPdf
    const currentOrder = (task.outline || []).map((slide) => slide.title)
    const nextOrder = orderedSlides.map((slide) => slide.title)
    if (JSON.stringify(nextOrder) !== JSON.stringify(currentOrder)) changes.slide_order = nextOrder
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

          <div className="field">
            <span className="label">Оформление</span>
            <ThemePicker value={theme} onChange={setTheme} />
          </div>

          {orderedSlides.length > 0 && (
            <div className="field">
              <span className="label">Порядок слайдов</span>
              <p className="hint">Переместите слайды кнопками вверх и вниз, затем соберите новую версию.</p>
              <ol className="rebuild-slide-list">
                {orderedSlides.map((slide, index) => (
                  <li key={`${slide.title}-${index}`} className="rebuild-slide-item">
                    <span className="rebuild-slide-index">{index + 1}</span>
                    <span className="rebuild-slide-title">{slide.title}</span>
                    <span className="rebuild-slide-actions">
                      <button type="button" className="btn btn-ghost btn-icon" onClick={() => moveSlide(index, -1)} disabled={index === 0} aria-label="Переместить вверх">↑</button>
                      <button type="button" className="btn btn-ghost btn-icon" onClick={() => moveSlide(index, 1)} disabled={index === orderedSlides.length - 1} aria-label="Переместить вниз">↓</button>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

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

          <label className="check">
            <input type="checkbox" checked={wantPdf} onChange={(e) => setWantPdf(e.target.checked)} />
            <span>Также создать PDF-версию</span>
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
