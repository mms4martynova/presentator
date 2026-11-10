import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDate, isActiveStatus, SLIDE_TYPE_LABELS } from '../labels.js'

const STATUS_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'completed', label: 'Готовые' },
  { value: 'processing', label: 'В работе' },
  { value: 'failed', label: 'С ошибками' },
]

export default function TasksPage() {
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    api
      .listTasks()
      .then((data) => {
        setTasks(data)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!tasks?.some((task) => isActiveStatus(task.status))) return undefined
    const timer = setInterval(load, 3000)
    return () => clearInterval(timer)
  }, [tasks, load])

  const filtered = useMemo(() => {
    if (!tasks) return null
    return tasks.filter((task) => {
      if (filter !== 'all' && task.status !== filter) return false
      if (search.trim() && !task.title.toLowerCase().includes(search.trim().toLowerCase())) return false
      return true
    })
  }, [tasks, filter, search])

  const slideCount = (task) => (task.outline ? task.outline.length : 0)

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="title">История презентаций</h1>
        <p className="muted">Последние 50 генераций. Активные задачи обновляются автоматически.</p>
      </header>

      {tasks?.length > 0 && (
        <div className="filter-bar">
          <input
            className="input filter-search"
            placeholder="Поиск по названию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="filter-tabs">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`filter-tab ${filter === f.value ? 'filter-tab-active' : ''}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="alert alert-error">{error}</p>}
      {tasks === null && !error && <p className="muted">Загружаем историю…</p>}

      {tasks?.length === 0 && (
        <div className="card empty">
          <p>Пока нет ни одной презентации.</p>
          <Link className="btn btn-primary" to="/">Создать первую</Link>
        </div>
      )}

      {filtered?.length === 0 && tasks?.length > 0 && (
        <p className="muted">Ничего не найдено. Попробуйте изменить поиск или фильтр.</p>
      )}

      {filtered?.length > 0 && (
        <ul className="list">
          {filtered.map((task) => (
            <li key={task.id}>
              <Link to={`/tasks/${task.id}`} className="card list-item">
                <div className="list-item-main">
                  <strong className="list-title">{task.title}</strong>
                  <div className="list-item-meta">
                    <span className="muted small">{formatDate(task.created_at)}</span>
                    {slideCount(task) > 0 && (
                      <span className="tag">{slideCount(task)} слайдов</span>
                    )}
                    {task.has_pdf && <span className="tag tag-success">PDF</span>}
                  </div>
                </div>
                <div className="list-meta">
                  {isActiveStatus(task.status) && (
                    <span className="progress-text">{task.progress}%</span>
                  )}
                  <StatusBadge status={task.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
