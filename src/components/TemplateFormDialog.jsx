import { useEffect, useState } from 'react'
import { createTemplate, updateTemplateInfo } from '../templatesApi.js'

export default function TemplateFormDialog({ template, onClose, onSaved }) {
  const [name, setName] = useState(template?.name ?? '')
  const [brand, setBrand] = useState(template?.brand ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (event) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('Укажите название шаблона')
      return
    }
    if (!template && !file) {
      setError('Выберите файл презентации PPTX')
      return
    }
    const fields = { name: name.trim(), brand: brand.trim(), description: description.trim() }
    setSubmitting(true)
    setError('')
    try {
      const saved = template
        ? await updateTemplateInfo(template.id, fields)
        : await createTemplate({ ...fields, file })
      onSaved(saved)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card fade-in" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="subtitle">{template ? 'Данные шаблона' : 'Новый корпоративный шаблон'}</h2>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span className="label">Название</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </label>

          <label className="field">
            <span className="label">Бренд</span>
            <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={120} placeholder="Например, название компании" />
          </label>

          <label className="field">
            <span className="label">Описание</span>
            <textarea
              className="input textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
            />
          </label>

          {!template && (
            <label className="field">
              <span className="label">Файл шаблона</span>
              <input
                className="input"
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className="hint">Презентация PowerPoint (.pptx) до 50 МБ. Цвета, шрифты, фон и отступы берутся из её оформления.</span>
            </label>
          )}

          {error && <p className="alert alert-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
