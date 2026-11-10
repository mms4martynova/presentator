import { Link, useParams } from 'react-router-dom'
import { getThemes } from '../lib/pptxBuilder.js'

const THEME_INFO = {
  default: { desc: 'Синие акценты, светлый фон — универсальный выбор', swatch: ['#2563EB', '#F8FAFC', '#0F172A'] },
  corporate: { desc: 'Глубокий синий, строгий деловой стиль', swatch: ['#1E3A5F', '#F1F5F9', '#0F172A'] },
  dark: { desc: 'Тёмный фон, яркие акценты — для конференций', swatch: ['#3B82F6', '#1E293B', '#0F172A'] },
  warm: { desc: 'Янтарные тона, уютная атмосфера', swatch: ['#B45309', '#FEF3C7', '#1C1917'] },
  forest: { desc: 'Зелёные акценты, экологичная тема', swatch: ['#15803D', '#ECFDF5', '#052E16'] },
}

export default function TemplatePage() {
  const { templateId } = useParams()
  const themes = getThemes()
  const theme = themes.find((t) => t.key === templateId)
  const info = THEME_INFO[templateId] || { desc: '', swatch: [] }

  if (!theme) {
    return (
      <section className="page">
        <p className="alert alert-error">Тема не найдена</p>
        <Link to="/templates">Ко всем темам</Link>
      </section>
    )
  }

  return (
    <section className="page">
      <header className="page-header">
        <Link to="/templates" className="muted small">← Оформление</Link>
        <h1 className="title">{theme.name}</h1>
        <p className="muted">{info.desc}</p>
      </header>

      <div className="card stack">
        <h2 className="subtitle">Палитра</h2>
        <div className="theme-swatch-large">
          {info.swatch.map((color, i) => (
            <div key={i} className="theme-color-card">
              <div className="theme-color-block" style={{ background: `#${color}` }} />
              <span className="mono">#{color}</span>
            </div>
          ))}
        </div>

        <div className="theme-preview">
          <h3 className="subtitle">Образец слайда</h3>
          <div className="preview-slide" style={{ background: `#${info.swatch[1]}` }}>
            <div className="preview-title" style={{ color: `#${info.swatch[2]}` }}>Заголовок слайда</div>
            <div className="preview-bar" style={{ background: `#${info.swatch[0]}` }} />
            <ul className="preview-bullets" style={{ color: `#${info.swatch[2]}` }}>
              <li>Первый пункт</li>
              <li>Второй пункт</li>
              <li>Третий пункт</li>
            </ul>
          </div>
        </div>

        <div className="form-actions">
          <Link className="btn btn-primary" to="/">Создать с этой темой</Link>
        </div>
      </div>
    </section>
  )
}
