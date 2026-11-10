import { Link } from 'react-router-dom'
import { getThemes } from '../lib/pptxBuilder.js'

const THEME_INFO = {
  default: { desc: 'Синие акценты, светлый фон — универсальный выбор', swatch: ['#2563EB', '#F8FAFC', '#0F172A'] },
  corporate: { desc: 'Глубокий синий, строгий деловой стиль', swatch: ['#1E3A5F', '#F1F5F9', '#0F172A'] },
  dark: { desc: 'Тёмный фон, яркие акценты — для конференций', swatch: ['#3B82F6', '#1E293B', '#0F172A'] },
  warm: { desc: 'Янтарные тона, уютная атмосфера', swatch: ['#B45309', '#FEF3C7', '#1C1917'] },
  forest: { desc: 'Зелёные акценты, экологичная тема', swatch: ['#15803D', '#ECFDF5', '#052E16'] },
}

export default function TemplatesPage() {
  const themes = getThemes()

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="title">Оформление презентаций</h1>
        <p className="muted">Выберите цветовую тему при создании презентации. Каждая тема задаёт цвета, фон и стиль слайдов.</p>
      </header>

      <ul className="theme-list">
        {themes.map((t) => {
          const info = THEME_INFO[t.key] || { desc: '', swatch: [] }
          return (
            <li key={t.key}>
              <Link to={`/templates/${t.key}`} className="card theme-card fade-in">
                <div className="theme-swatch">
                  {info.swatch.map((color, i) => (
                    <span key={i} className="theme-color" style={{ background: `#${color}` }} />
                  ))}
                </div>
                <div className="theme-info">
                  <strong className="list-title">{t.name}</strong>
                  <span className="muted small">{info.desc}</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
