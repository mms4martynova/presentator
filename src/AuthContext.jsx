import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return
        if (session) {
          setUser({ id: session.user.id, name: session.user.user_metadata?.name || session.user.email })
        }
      })
      .catch(() => {})
      .finally(() => mounted && setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser({ id: session.user.id, name: session.user.user_metadata?.name || session.user.email })
      } else {
        setUser(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
