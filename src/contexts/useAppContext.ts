import { useContext } from 'react'
import { AppContext, type AppState } from './appContextValue'

export function useAppContext(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}