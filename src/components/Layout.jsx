import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOut } from '../api.js'
import { useAuth } from '../AuthContext.jsx'

const NAV_ITEMS = [
  { to: '/', label: 'Новая презентация', end: true },
  { to: '/tasks', label: 'История' },
  { to: '/templates', label: 'Оформление' },
  { to: '/corporate-templates', label: 'Корпоративные шаблоны' },
]

export default function Layout() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const logout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="container header-inner">
          <span className="brand">Презентатор</span>
          <nav className="nav">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="user-area">
            <span className="muted small">{user?.name}</span>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="container main">
        <Outlet />
      </main>
    </div>
  )
}
