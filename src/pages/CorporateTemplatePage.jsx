import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import TemplateFormDialog from '../components/TemplateFormDialog.jsx'
import TemplateVersionDialog from '../components/TemplateVersionDialog.jsx'
import { useAuth } from '../AuthContext.jsx'
import { formatDate } from '../labels.js'
import { deleteTemplate, downloadTemplateFile, getTemplate, setCurrentVersion } from '../templatesApi.js'

export default function CorporateTemplatePage() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [template, setTemplate] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    getTemplate(templateId)
      .then((data) => {
        setTemplate(data)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [templateId])

  useEffect(() => {
    load()
  }, [load])

  if (error && !template) {
    return (
      <section className="page">
        <p className="alert alert-error">{error}</p>
        <Link to="/corporate-templates">Ко всем шаблонам</Link>
      </section>
    )
  }
  if (!template) return <p className="muted">Загружаем шаблон…</p>

  const isOwner = template.created_by === user?.id
  const { current } = template
  const colors = current?.theme?.colors

  const remove = async () => {
    setDeleting(true)
    try {
      await deleteTemplate(template)
      navigate('/corporate-templates')
    } catch (err) {
      setActionError(err.message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const rollback = async (version) => {
    setActionError('')
    try {
      setTemplate(await setCurrentVersion(template.id, version.version_number))
    } catch (err) {
      setActionError(err.message)
    }
  }

  const download = async (version) => {
    setActionError('')
    try {
      await downloadTemplateFile(version, template.name)
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <Link to="/corporate-templates" className="muted small">← Корпоративные шаблоны</Link>
        <div className="page-title-row">
          <h1 className="title">{template.name}</h1>
          {isOwner && (
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
              Изменить данные
            </button>
          )}
        </div>
        {template.description && <p className="muted">{template.description}</p>}
      </header>

      <div className="card stack">
        <dl className="meta-grid">
          <div>
            <dt>Бренд</dt>
            <dd>{template.brand || 'Не указан'}</dd>
          </div>
          <div>
            <dt>Текущая версия</dt>
            <dd>{current ? `Версия ${current.version_number}` : 'Нет'}</dd>
          </div>
          <div>
            <dt>Обновлён</dt>
            <dd>{formatDate(template.updated_at)}</dd>
          </div>
          <div>
            <dt>Автор</dt>
            <dd>{template.author_name || 'Не указан'}</dd>
          </div>
        </dl>

        {colors && (
          <div>
            <h2 className="subtitle">Палитра</h2>
            <div className="theme-swatch-large">
              {Object.entries(colors).map(([role, color]) => (
                <div key={role} className="theme-color-card">
                  <div className="theme-color-block" style={{ background: `#${color}` }} />
                  <span className="mono">#{color}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {current?.theme?.layoutNames?.length > 0 && (
          <div>
            <h2 className="subtitle">Макеты слайдов</h2>
            <div className="list-item-meta">
              {current.theme.layoutNames.map((name) => (
                <span key={name} className="tag">{name}</span>
              ))}
            </div>
          </div>
        )}

        {isOwner && (
          <div className="form-actions">
            {confirmDelete ? (
              <>
                <span className="muted small">Удалить шаблон и все его версии?</span>
                <button type="button" className="btn btn-danger" disabled={deleting} onClick={remove}>
                  {deleting ? 'Удаляем…' : 'Удалить'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                  Отмена
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-primary" onClick={() => setUploading(true)}>
                  Загрузить новую версию
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                  Удалить шаблон
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <section className="outline">
        <h2 className="subtitle">История версий</h2>
        {actionError && <p className="alert alert-error">{actionError}</p>}
        <ul className="list">
          {template.versions.map((version) => {
            const isCurrent = version.version_number === template.current_version
            return (
              <li key={version.id} className="card list-item">
                <div className="list-item-main">
                  <div className="list-item-meta">
                    <strong className="list-title">Версия {version.version_number}</strong>
                    {isCurrent && <span className="tag tag-success">Текущая</span>}
                  </div>
                  <span className="muted small">
                    {formatDate(version.created_at)}
                    {version.author_name ? ` · ${version.author_name}` : ''}
                  </span>
                  {version.change_note && <span className="muted small">{version.change_note}</span>}
                </div>
                <div className="actions">
                  <button type="button" className="btn btn-ghost" onClick={() => download(version)}>
                    Скачать
                  </button>
                  {isOwner && !isCurrent && (
                    <button type="button" className="btn btn-secondary" onClick={() => rollback(version)}>
                      Сделать текущей
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {editing && (
        <TemplateFormDialog
          template={template}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setTemplate(updated)
            setEditing(false)
          }}
        />
      )}

      {uploading && (
        <TemplateVersionDialog
          template={template}
          onClose={() => setUploading(false)}
          onSaved={(updated) => {
            setTemplate(updated)
            setUploading(false)
          }}
        />
      )}
    </section>
  )
}
