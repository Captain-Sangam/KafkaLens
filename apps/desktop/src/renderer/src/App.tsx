import { useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useUIStore } from '@/stores/uiStore'
import { useClusterStore } from '@/stores/clusterStore'
import ClusterDashboard from '@/pages/ClusterDashboard'
import TopicList from '@/pages/TopicList'
import MessageBrowser from '@/pages/MessageBrowser'
import ConsumerGroups from '@/pages/ConsumerGroups'
import SchemaRegistry from '@/pages/SchemaRegistry'
import DLQDashboard from '@/pages/DLQDashboard'
import { BrokerConfig } from '@/pages/BrokerConfig'
import { Settings } from '@/pages/Settings'
import { NotificationToasts } from '@/components/common/NotificationToasts'

function App(): React.ReactElement {
  const currentPage = useUIStore((s) => s.currentPage)
  const loadClusters = useClusterStore((s) => s.loadClusters)

  useEffect(() => {
    loadClusters()
  }, [loadClusters])

  const pageMap: Record<string, React.ReactNode> = {
    dashboard: <ClusterDashboard />,
    topics: <TopicList />,
    messages: <MessageBrowser />,
    'consumer-groups': <ConsumerGroups />,
    'schema-registry': <SchemaRegistry />,
    dlq: <DLQDashboard />,
    brokers: <BrokerConfig />,
    settings: <Settings />
  }

  return (
    <AppLayout>
      {pageMap[currentPage] ?? <ClusterDashboard />}
      <NotificationToasts />
    </AppLayout>
  )
}

export default App
