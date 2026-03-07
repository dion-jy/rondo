import { useState, useCallback } from 'react'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import Calendar from './components/Calendar'
import Jobs from './components/Jobs'
import Executions from './components/Executions'
import TokenEconomy from './components/TokenEconomy'
import { useWebSocket } from './hooks/useApi'

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleWsMessage = useCallback((data) => {
    if (data.type === 'jobs' || data.type === 'runs') {
      setRefreshKey(k => k + 1)
    }
  }, [])

  const { connected } = useWebSocket(handleWsMessage)

  const pages = {
    dashboard: <Dashboard key={refreshKey} />,
    calendar: <Calendar key={refreshKey} />,
    jobs: <Jobs key={refreshKey} />,
    executions: <Executions key={refreshKey} />,
    tokens: <TokenEconomy key={refreshKey} />,
  }

  return (
    <Layout activeTab={tab} onTabChange={setTab} connected={connected}>
      {pages[tab] || pages.dashboard}
    </Layout>
  )
}
