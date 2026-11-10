import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, signUp } from '../api.js'
import { useAuth } from '../AuthContext.jsx'

export default function LoginPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password)
      } else {
        if (!name.trim()) {
          setError('Введите имя')
          setLoading(false)
          return
        }
        await signUp(email.trim(), password, name.trim())
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card fade-in" onSubmit={submit}>
        <h1 className="title">Презентатор</h1>
        <p className="muted">
          {mode === 'login' ? 'Войдите, чтобы создавать презентации.' : 'Создайте аккаунт для начала работы.'}
        </p>

        {mode === 'register' && (
          <label className="field">
            <span className="label">Имя</span>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              autoFocus
            />
          </label>
        )}

        <label className="field">
          <span className="label">Электронная почта</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus={mode === 'login'}
            required
          />
        </label>

        <label className="field">
          <span className="label">Пароль</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </label>

        {error && <p className="alert alert-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={loading || !email.trim() || !password}>
          {loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError('')
          }}
        >
          {mode === 'login' ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
        </button>
      </form>
    </div>
  )
}
