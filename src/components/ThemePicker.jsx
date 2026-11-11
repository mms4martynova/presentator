import { useEffect, useState } from 'react'
import { getThemes } from '../lib/pptxBuilder.js'
import { listTemplates } from '../templatesApi.js'

const BUILT_IN_THEMES = getThemes()

export default function ThemePicker({ value, onChange }) {
  const [templates, setTemplates] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listTemplates()
      .then((data) => {
        if (cancelled) return
        setTemplates(data.filter((template) => template.current))
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <div className="palette-grid">
        {BUILT_IN_THEMES.map((theme) => {
          const active = value.templateVersionId === null && value.templateId === theme.key
          return (
            <button
              type="button"
              key={theme.key}
              className={`palette-card ${active ? 'palette-card-active' : ''}`}
              onClick={() => onChange({ templateId: theme.key, templateVersionId: null })}
            >
              <div className="palette-swatches">
                {theme.swatch.map((color, i) => (
                  <span key={i} className="palette-dot" style={{ background: `#${color}` }} />
                ))}
              </div>
              <span className="palette-name">{theme.name}</span>
              <span className="palette-desc">{theme.desc}</span>
            </button>
          )
        })}
        {templates.map((template) => {
          const { current } = template
          const { colors } = current.theme
          const active = value.templateVersionId === current.id
          return (
            <button
              type="button"
              key={template.id}
              className={`palette-card ${active ? 'palette-card-active' : ''}`}
              onClick={() => onChange({ templateId: null, templateVersionId: current.id })}
            >
              <div className="palette-swatches">
                {[colors.primary, colors.light, colors.dark].map((color, i) => (
                  <span key={i} className="palette-dot" style={{ background: `#${color}` }} />
                ))}
              </div>
              <span className="palette-name">{template.name}</span>
              <span className="palette-desc">
                {template.brand ? `${template.brand} · ` : ''}версия {current.version_number}
              </span>
            </button>
          )
        })}
      </div>
      {error && <p className="alert alert-error">{error}</p>}
    </>
  )
}
