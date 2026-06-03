import { useState } from 'react'
import Sidebar from './components/layout/Sidebar'
import VideoCreator from './pages/VideoCreator'
import VideoResearch from './pages/VideoResearch'
import ScriptWriter from './pages/ScriptWriter'
import TitleThumbnail from './pages/TitleThumbnail'
import Settings from './pages/Settings'

const PAGES = {
  'video-creator': VideoCreator,
  'video-research': VideoResearch,
  'script-writer': ScriptWriter,
  'title-thumbnail': TitleThumbnail,
  'settings': Settings,
}

export default function App() {
  const [activePage, setActivePage] = useState('video-creator')
  const PageComponent = PAGES[activePage]

  return (
    <div className="flex h-screen bg-[#0f0f0f] text-white overflow-hidden">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="flex-1 overflow-y-auto">
        <PageComponent />
      </main>
    </div>
  )
}
