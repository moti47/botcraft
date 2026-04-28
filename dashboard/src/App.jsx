import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { Overview } from './pages/Overview'
import { Avatars } from './pages/Avatars'
import { Videos } from './pages/Videos'
import { Analytics } from './pages/Analytics'
import { Notifications } from './pages/Notifications'
import { Settings } from './pages/Settings'
import { AvatarDetail } from './pages/AvatarDetail'
import { useStore } from './store/useStore'
import { useNotificationsSSE } from './hooks/useApi'
import { ProduceVideoModal } from './components/modals/ProduceVideoModal'
import { NewAvatarPanel } from './components/modals/NewAvatarPanel'
import { EditDnaPanel } from './components/modals/EditDnaPanel'
import { VideoDetailModal } from './components/modals/VideoDetailModal'

function SSEBridge() {
  useNotificationsSSE()
  return null
}

export default function App() {
  const activePage = useStore((s) => s.activePage)

  const Page =
    activePage === 'avatars' ? Avatars
    : activePage === 'avatar-detail' ? AvatarDetail
    : activePage === 'videos' ? Videos
    : activePage === 'analytics' ? Analytics
    : activePage === 'notifications' ? Notifications
    : activePage === 'settings' ? Settings
    : Overview

  return (
    <div className="min-h-screen bg-background">
      <SSEBridge />
      <Sidebar />
      <div className="md:ml-[240px] pb-16 md:pb-0">
        <TopBar />
        <main className="p-4 md:p-8">
          <Page />
        </main>
      </div>
      <ProduceVideoModal />
      <NewAvatarPanel />
      <EditDnaPanel />
      <VideoDetailModal />
    </div>
  )
}
