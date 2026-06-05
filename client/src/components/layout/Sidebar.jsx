import { Film, Search, PenLine, ImageIcon, Settings } from 'lucide-react'

const NAV_ITEMS = [
  {
    id: 'video-creator',
    label: 'Video Creator',
    icon: Film,
    available: true,
  },
  {
    id: 'video-research',
    label: 'Video Research',
    icon: Search,
    available: false,
  },
  {
    id: 'script-writer',
    label: 'Script Writer',
    icon: PenLine,
    available: false,
  },
  {
    id: 'title-thumbnail',
    label: 'Title & Thumbnail',
    icon: ImageIcon,
    available: false,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    available: true,
  },
]

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="w-60 bg-[#141414] border-r border-white/[0.06] flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <span className="text-lg font-semibold tracking-tight text-white">
          Vorta
        </span>
        <p className="text-xs text-white/30 mt-0.5">Content Platform</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon, available }) => {
          const isActive = activePage === id
          const isComingSoon = !available && id !== 'settings'

          return (
            <button
              key={id}
              onClick={() => available && onNavigate(id)}
              disabled={!available}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left
                ${isActive
                  ? 'bg-white/10 text-white font-medium'
                  : available
                    ? 'text-white/50 hover:text-white/80 hover:bg-white/[0.05] cursor-pointer'
                    : 'text-white/25 cursor-default'
                }
              `}
            >
              <Icon size={16} strokeWidth={1.8} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {isComingSoon && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30 font-medium tracking-wide uppercase">
                  Soon
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/[0.06]">
        <p className="text-[11px] text-white/20">Phase 5 — Full Pipeline</p>
      </div>
    </aside>
  )
}
