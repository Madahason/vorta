import { useState } from 'react'
import Sidebar from './components/layout/Sidebar'
import VideoCreator from './pages/VideoCreator'
import VideoResearch from './pages/VideoResearch'
import ScriptWriter from './pages/ScriptWriter'
import TitleThumbnail from './pages/TitleThumbnail'
import Settings from './pages/Settings'
import Projects from './pages/Projects'
import Onboarding from './components/Onboarding'

const LS_KEYS = {
  scenes:        'vorta_scenes',
  projectId:     'vorta_project_id',
  statuses:      'vorta_scene_statuses',
  metadata:      'vorta_script_metadata',
  motionComps:   'vorta_motion_components',
  clipMatches:   'vorta_clip_matches',
  selectedClips: 'vorta_selected_clips',
  sessionKey:    'vorta_session_key',
  direction:     'vorta_direction',
}

function restoreProject(key) {
  const snapshot = JSON.parse(localStorage.getItem(`vorta_project_data_${key}`) || 'null')
  if (!snapshot) return false
  try {
    if (snapshot.scenes)        localStorage.setItem(LS_KEYS.scenes,        JSON.stringify(snapshot.scenes))
    if (snapshot.sceneStatuses) localStorage.setItem(LS_KEYS.statuses,      JSON.stringify(snapshot.sceneStatuses))
    if (snapshot.selectedClips) localStorage.setItem(LS_KEYS.selectedClips, JSON.stringify(snapshot.selectedClips))
    if (snapshot.clipMatches)   localStorage.setItem(LS_KEYS.clipMatches,   JSON.stringify(snapshot.clipMatches))
    if (snapshot.projectId)     localStorage.setItem(LS_KEYS.projectId,     JSON.stringify(snapshot.projectId))
    if (snapshot.metadata)      localStorage.setItem(LS_KEYS.metadata,      JSON.stringify(snapshot.metadata))
    localStorage.setItem(LS_KEYS.sessionKey, JSON.stringify(key))
    // direction.json isn't part of the snapshot — it's always re-fetched fresh from the
    // server for the restored project's sessionKey. Clear any stale value from whatever
    // project was open before, so its treatment/audit can't leak into this one while the
    // fresh fetch is in flight (or if the restored project never had a direction at all).
    localStorage.removeItem(LS_KEYS.direction)
    return true
  } catch {
    return false
  }
}

function clearSession() {
  Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k))
}

export default function App() {
  const [activePage, setActivePage] = useState('video-creator')
  // Increment to force VideoCreator remount (on project open or new project)
  const [creatorKey, setCreatorKey] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('vorta_onboarded')
  )

  const handleOpenProject = (key) => {
    if (restoreProject(key)) {
      setCreatorKey(k => k + 1)
      setActivePage('video-creator')
    }
  }

  const handleNewProject = () => {
    clearSession()
    setCreatorKey(k => k + 1)
    setActivePage('video-creator')
  }

  const renderPage = () => {
    switch (activePage) {
      case 'projects':       return <Projects onOpen={handleOpenProject} onNew={handleNewProject} />
      case 'video-creator':  return <VideoCreator key={creatorKey} />
      case 'video-research': return <VideoResearch onNavigate={setActivePage} />
      case 'script-writer':  return <ScriptWriter onNavigate={setActivePage} />
      case 'title-thumbnail':return <TitleThumbnail onNavigate={setActivePage} />
      case 'settings':       return <Settings />
      default:               return <VideoCreator key={creatorKey} />
    }
  }

  return (
    <>
      <div className="flex h-screen bg-[#0f0f0f] text-white overflow-hidden">
        <Sidebar activePage={activePage} onNavigate={setActivePage} />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          {renderPage()}
        </main>
      </div>
      {showOnboarding && <Onboarding onDismiss={() => setShowOnboarding(false)} />}
    </>
  )
}
