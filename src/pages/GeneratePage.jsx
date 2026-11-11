import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import ThemePicker from '../components/ThemePicker.jsx'
import { analyzeRequest, recommend, VIZ_LABELS } from '../lib/advisor.js'
import { splitText } from '../lib/content.js'

const FAST_MODE_MAX_SLIDES = 5
const INITIAL_FORM = {
  title: '',
  text: '',
  slidesCount: 8,
  language: 'ru',
  audience: '',
  tone: '',
  theme: { templateId: 'default', templateVersionId: null },
  wantPdf: false,
  fastMode: false,
  slidesJson: '',
}

function parseSlides(raw) {
  if (!raw.trim()) return { slides: null }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return { error: 'Структурированные данные должны быть списком слайдов в формате JSON' }
    }
    return { slides: parsed }
  } catch {
    return { error: 'Структурированные данные должны быть корректным JSON' }
  }
}

function previewOutline(form) {
  const { slides } = parseSlides(form.slidesJson)
  if (slides) return slides
  if (form.text.trim()) {
    const max = form.fastMode ? FAST_MODE_MAX_SLIDES : 40
    const remaining = Math.max(Number(form.slidesCount) - 0, 1)
    return splitText(form.text.trim(), Math.min(remaining, max))
  }
  return []
}

export default function GeneratePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((current) => ({ ...current, [field]: value }))
  }

  const maxSlides = form.fastMode ? FAST_MODE_MAX_SLIDES : 40

  const advisorPreview = useMemo(() => {
    const outline = previewOutline(form)
    if (outline.length === 0) return null
    const ctx = analyzeRequest({
      title: form.title,
      text: form.text,
      slides: outline,
      slides_count: Number(form.slidesCount),
      audience: form.audience,
      tone: form.tone,
    })
    const recommendations = outline.map((slide) => {
      const rec = recommend(slide, ctx)
      return { title: slide.title, ...rec }
    })
    const counts = {}
    let totalConf = 0
    for (const rec of recommendations) {
      counts[rec.visualization] = (counts[rec.visualization] || 0) + 1
      totalConf += rec.confidence
    }
    const distribution = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([viz, count]) => ({ viz, label: VIZ_LABELS[viz] || viz, count }))
    return {
      distribution,
      recommendations,
      avgConfidence: Math.round((totalConf / recommendations.length) * 100) / 100,
      totalSlides: recommendations.length,
    }
  }, [form.text, form.slidesJson, form.slidesCount, form.fastMode, form.audience, form.tone])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const { slides, error: slidesError } = parseSlides(form.slidesJson)
    if (slidesError) {
      setError(slidesError)
      return
    }
    if (!form.text.trim() && !slides) {
      setError('Опишите содержание презентации или добавьте структурированные данные')
      return
    }
    setSubmitting(true)
    try {
      const task = await api.createTask({
        title: form.title.trim(),
        text: form.text.trim() || null,
        slides,
        slides_count: Number(form.slidesCount),
        language: form.language,
        audience: form.audience.trim() || null,
        tone: form.tone.trim() || null,
        template_id: form.theme.templateId,
        template_version_id: form.theme.templateVersionId,
        want_pdf: form.wantPdf,
        mode: 'sync',
      })
      navigate(`/tasks/${task.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="title">Новая презентация</h1>
        <p className="muted">Опишите содержание, и Презентатор соберёт слайды в выбранном оформлении.</p>
      </header>

      <form className="card form fade-in" onSubmit={submit}>
        <label className="field">
          <span className="label">Название презентации</span>
          <input className="input" value={form.title} onChange={update('title')} maxLength={200} required />
        </label>

        <label className="field">
          <span className="label">Описание или структура содержания</span>
          <textarea
            className="input textarea"
            rows={8}
            value={form.text}
            onChange={update('text')}
            placeholder={'Каждый блок с новой строки. Заголовок слайда можно начать с #.\n\n# Итоги квартала\n- Выручка выросла на 12%\n- Открыто два новых офиса'}
          />
        </label>

        <div className="grid-2">
          <label className="field">
            <span className="label">Количество слайдов</span>
            <input
              className="input"
              type="number"
              min={1}
              max={maxSlides}
              value={form.slidesCount}
              onChange={update('slidesCount')}
            />
            {form.fastMode && <span className="hint">В быстром режиме не больше {FAST_MODE_MAX_SLIDES} слайдов</span>}
          </label>
          <label className="field">
            <span className="label">Язык</span>
            <select className="input" value={form.language} onChange={update('language')}>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Аудитория</span>
            <input className="input" value={form.audience} onChange={update('audience')} placeholder="Например, совет директоров" />
          </label>
          <label className="field">
            <span className="label">Тон изложения</span>
            <input className="input" value={form.tone} onChange={update('tone')} placeholder="Например, деловой и краткий" />
          </label>
        </div>

        <div className="field">
          <span className="label">Оформление</span>
          <ThemePicker value={form.theme} onChange={(theme) => setForm((cur) => ({ ...cur, theme }))} />
        </div>

        <div className="checks">
          <label className="check">
            <input type="checkbox" checked={form.wantPdf} onChange={update('wantPdf')} />
            <span>Также создать PDF-версию для скачивания</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.fastMode} onChange={update('fastMode')} />
            <span>Быстрый режим: результат сразу (до {FAST_MODE_MAX_SLIDES} слайдов)</span>
          </label>
        </div>

        <details className="details">
          <summary>Структурированные данные (для опытных пользователей)</summary>
          <label className="field">
            <span className="hint">
              Список слайдов в формате JSON, например: [{'{'}"title": "Продажи", "chart": {'{'}"categories": ["2023", "2024"], "series": [{'{'}"name": "Выручка", "values": [10, 12]{'}'}]{'}'}{'}'}]
            </span>
            <textarea
              className="input textarea mono"
              rows={6}
              value={form.slidesJson}
              onChange={update('slidesJson')}
            />
          </label>
        </details>

        {advisorPreview && (
          <div className="advisor-panel fade-in">
            <div className="advisor-header">
              <h3 className="subtitle">Рекомендации визуализации</h3>
              <span className="advisor-confidence">
                Уверенность: {Math.round(advisorPreview.avgConfidence * 100)}%
              </span>
            </div>
            <div className="advisor-distribution">
              {advisorPreview.distribution.map((d) => (
                <span key={d.viz} className="advisor-chip">
                  <span className="advisor-chip-count">{d.count}</span>
                  {d.label}
                </span>
              ))}
            </div>
            <ul className="advisor-list">
              {advisorPreview.recommendations.map((rec, i) => (
                <li key={i} className="advisor-item">
                  <span className="advisor-item-num">{i + 1}</span>
                  <div className="advisor-item-body">
                    <span className="advisor-item-title">{rec.title || `Слайд ${i + 1}`}</span>
                    <span className="advisor-item-viz">{VIZ_LABELS[rec.visualization] || rec.visualization}</span>
                  </div>
                  <span className="advisor-item-conf" title={rec.reasoning}>
                    {Math.round(rec.confidence * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="alert alert-error">{error}</p>}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting || !form.title.trim()}>
            {submitting ? 'Создаём презентацию…' : 'Создать презентацию'}
          </button>
        </div>
      </form>
    </section>
  )
}
