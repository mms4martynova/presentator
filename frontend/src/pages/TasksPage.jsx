import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDate, isActiveStatus } from '../labels.js'

export default function TasksPage() {
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState('')

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

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="title">История презентаций</h1>
        <p className="muted">Последние 50 генераций. Активные задачи обновляются автоматически.</p>
      </header>

      {error && <p className="alert alert-error">{error}</p>}
      {tasks === null && !error && <p className="muted">Загружаем историю…</p>}

      {tasks?.length === 0 && (
        <div className="card empty">
          <p>Пока нет ни одной презентации.</p>
          <Link className="btn btn-primary" to="/">Создать первую</Link>
        </div>
      )}

      {tasks?.length > 0 && (
        <ul className="list">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link to={`/tasks/${task.id}`} className="card list-item">
                <div>
                  <strong className="list-title">{task.title}</strong>
                  <span className="muted small">{formatDate(task.created_at)}</span>
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
