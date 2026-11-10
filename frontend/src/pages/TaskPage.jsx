import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, downloadResult } from '../api.js'
import RebuildDialog from '../components/RebuildDialog.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDate, isActiveStatus, SLIDE_TYPE_LABELS } from '../labels.js'

export default function TaskPage() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const [task, setTask] = useState(null)
  const [error, setError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [rebuilding, setRebuilding] = useState(false)

  const load = useCallback(() => {
    api
      .getTask(taskId)
      .then((data) => {
        setTask(data)
        setError('')
      })
      .catch((err) => setError(err.message))
  }, [taskId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!task || !isActiveStatus(task.status)) return undefined
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [task, load])

  const openRebuild = () => {
    setRebuilding(true)
  }

  const download = async (format) => {
    setDownloadError('')
    try {
      if (format === 'pptx') {
        await downloadResult(task.id, task._pptx_key, task.title)
      }
    } catch (err) {
      setDownloadError(err.message)
    }
  }

  if (error && !task) {
    return (
      <section className="page">
        <p className="alert alert-error">{error}</p>
        <Link to="/tasks">Вернуться к истории</Link>
      </section>
    )
  }
  if (!task) return <p className="muted">Загружаем презентацию…</p>

  return (
    <section className="page">
      <header className="page-header">
        <Link to="/tasks" className="muted small">← История</Link>
        <div className="page-title-row">
          <h1 className="title">{task.title}</h1>
          <StatusBadge status={task.status} />
        </div>
        <p className="muted small">Создано {formatDate(task.created_at)}</p>
      </header>

      <div className="card stack">
        {isActiveStatus(task.status) && (
          <div>
            <div className="progress" aria-label="Прогресс генерации">
              <div className="progress-bar" style={{ width: `${task.progress}%` }} />
            </div>
            <p className="muted small">Готово на {task.progress}%. Страница обновится сама.</p>
          </div>
        )}
        {task.status === 'failed' && <p className="alert alert-error">{task.error}</p>}

        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!task.has_pptx}
            onClick={() => download('pptx')}
          >
            Скачать PPTX
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={isActiveStatus(task.status)}
            onClick={openRebuild}
          >
            Собрать заново с изменениями
          </button>
        </div>
        {downloadError && <p className="alert alert-error">{downloadError}</p>}
      </div>

      {task.outline && (
        <section className="outline">
          <h2 className="subtitle">Структура слайдов</h2>
          <ol className="outline-list">
            {task.outline.map((slide, index) => (
              <li key={index} className="card outline-item fade-in">
                <div className="outline-head">
                  <span className="outline-number">{index + 1}</span>
                  <strong>{slide.title}</strong>
                  <span className="tag">{SLIDE_TYPE_LABELS[slide.type] ?? slide.type}</span>
                </div>
                {slide.reasoning && <p className="muted small">{slide.reasoning}</p>}
                {slide.bullets && slide.bullets.length > 0 && (
                  <ul className="outline-bullets">
                    {slide.bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                )}
                {slide.table && (
                  <div className="outline-table-wrap">
                    <table className="outline-table">
                      <thead>
                        <tr>{slide.table.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {slide.table.rows.map((row, i) => (
                          <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {slide.chart && (
                  <p className="muted small">
                    Диаграмма: {slide.chart.kind || 'авто'}, {slide.chart.categories.length} категорий, {slide.chart.series.length} ряд(ов)
                  </p>
                )}
                {slide.comparison && (
                  <div className="outline-comparison">
                    <div>
                      <strong>{slide.comparison.left_title}</strong>
                      <ul>{slide.comparison.left_items.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                    <div>
                      <strong>{slide.comparison.right_title}</strong>
                      <ul>{slide.comparison.right_items.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {rebuilding && (
        <RebuildDialog
          task={task}
          onClose={() => setRebuilding(false)}
          onRebuilt={(rebuilt) => navigate(`/tasks/${rebuilt.id}`)}
        />
      )}
    </section>
  )
}
