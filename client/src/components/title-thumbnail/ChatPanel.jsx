import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, MessageCircle, RotateCcw, Image, Type, AlertCircle } from 'lucide-react'

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function ChatPanel({ briefId, mode, onTitleUpdate, onImageUpdate, onOverlayUpdate, onRestore }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [versions, setVersions] = useState([])
  const scrollRef = useRef(null)

  const modeTypes = mode === 'title' ? ['title'] : ['image', 'overlay']

  useEffect(() => {
    if (!briefId) return
    fetch(`/api/title-thumbnail/versions/${briefId}`)
      .then(r => r.json())
      .then(data => {
        const allVersions = data.versions || []
        setVersions(allVersions.filter(v => modeTypes.includes(v.type)))
        const restored = allVersions
          .filter(v => v.instruction && modeTypes.includes(v.type))
          .flatMap(v => {
            const msgs = [{ role: 'user', content: v.instruction, time: v.createdAt, versionId: v.versionId }]
            const reply = v.data?.assistantReply || v.data?.clarifyingQuestion
            if (reply) msgs.push({ role: 'assistant', content: reply, time: v.createdAt, type: v.type, ambiguous: v.data?.ambiguous })
            return msgs
          })
        setMessages(restored)
      })
      .catch(() => {})
  }, [briefId])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  async function handleSend() {
    if (!input.trim() || sending || !briefId) return
    const msg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg, time: new Date().toISOString() }])
    setMessages(prev => [...prev, { role: 'pending', content: '', time: null }])
    setSending(true)

    try {
      const endpoint = mode === 'title'
        ? '/api/title-thumbnail/chat/title'
        : '/api/title-thumbnail/chat/thumbnail'

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefId, message: msg }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Chat request failed')

      setMessages(prev => {
        const filtered = prev.filter(m => m.role !== 'pending')
        const reply = data.assistantReply || data.clarifyingQuestion || 'Done.'
        const intentLabel = data.intent ? ` [${data.intent}]` : ''
        return [...filtered, {
          role: 'assistant',
          content: reply + intentLabel,
          time: new Date().toISOString(),
          type: data.intent || 'title',
          ambiguous: data.intent === 'ambiguous',
        }]
      })

      if (mode === 'title' && data.titles && onTitleUpdate) {
        onTitleUpdate(data.titles)
      } else if (data.intent === 'edit_image' && data.imagePath && onImageUpdate) {
        onImageUpdate(data.imagePath, data.prompt)
      } else if (data.intent === 'edit_overlay' && data.overlayState && onOverlayUpdate) {
        onOverlayUpdate(data.overlayState, data.finalImagePath)
      } else if (data.intent === 'restore' && onRestore) {
        onRestore({
          overlayState: data.overlayState,
          finalImagePath: data.finalImagePath,
          baseImages: data.baseImages,
          titleCandidates: data.titleCandidates,
        })
      }

      fetch(`/api/title-thumbnail/versions/${briefId}`)
        .then(r => r.json())
        .then(d => setVersions(d.versions || []))
        .catch(() => {})
    } catch (err) {
      setMessages(prev => {
        const filtered = prev.filter(m => m.role !== 'pending')
        return [...filtered, { role: 'error', content: err.message, time: new Date().toISOString() }]
      })
    } finally {
      setSending(false)
    }
  }

  async function handleRestore(versionId) {
    if (!briefId || sending) return
    setSending(true)
    try {
      const resp = await fetch(`/api/title-thumbnail/restore/${briefId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Restore failed')

      setMessages(prev => [...prev, {
        role: 'system',
        content: `Restored to version from ${formatTime(versions.find(v => v.versionId === versionId)?.createdAt)}`,
        time: new Date().toISOString(),
      }])

      if (onRestore) onRestore(data.currentState)

      fetch(`/api/title-thumbnail/versions/${briefId}`)
        .then(r => r.json())
        .then(d => setVersions(d.versions || []))
        .catch(() => {})
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: err.message, time: new Date().toISOString() }])
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const typeIcon = { image: Image, overlay: Type, title: MessageCircle }

  return (
    <div className="vorta-chat-panel flex flex-col rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', height: '100%' }}>
      {/* Header */}
      <div className="vorta-chat-header shrink-0 px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <MessageCircle size={12} className="text-purple-400" />
        <span className="text-[11px] font-medium text-white/60">
          {mode === 'title' ? 'Title Chat' : 'Thumbnail Chat'}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="vorta-chat-messages flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 120, maxHeight: 280 }}>
        {messages.length === 0 && (
          <p className="text-[10px] text-white/20 text-center py-4">
            {mode === 'title'
              ? 'Ask to revise titles — e.g. "make them shorter" or "try more shock framing"'
              : 'Describe changes — e.g. "make the background darker" or "use a serif font"'}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`vorta-chat-msg flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'pending' ? (
              <div className="vorta-chat-bubble px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ background: 'rgba(139,92,246,0.08)' }}>
                <Loader2 size={10} className="animate-spin text-purple-400" />
                <span className="text-[10px] text-purple-300/50">Thinking...</span>
              </div>
            ) : m.role === 'error' ? (
              <div className="vorta-chat-bubble px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <AlertCircle size={10} className="text-red-400" />
                <span className="text-[10px] text-red-300">{m.content}</span>
              </div>
            ) : m.role === 'system' ? (
              <div className="vorta-chat-system w-full text-center">
                <span className="text-[9px] text-white/20 px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <RotateCcw size={8} className="inline mr-1 -mt-0.5" />{m.content}
                </span>
              </div>
            ) : (
              <div
                className="vorta-chat-bubble px-3 py-1.5 rounded-lg max-w-[85%]"
                style={{
                  background: m.role === 'user' ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${m.role === 'user' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <p className="text-[11px] leading-relaxed" style={{ color: m.role === 'user' ? '#c4b5fd' : 'rgba(255,255,255,0.6)' }}>
                  {m.content}
                </p>
                {m.time && <span className="text-[8px] text-white/15 mt-0.5 block">{formatTime(m.time)}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Version history strip */}
      {versions.length > 0 && (
        <div className="vorta-version-strip shrink-0 px-3 py-1.5 flex items-center gap-1 overflow-x-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <span className="text-[8px] text-white/20 shrink-0 mr-1">History:</span>
          {versions.map((v, i) => {
            const isCurrent = i === versions.length - 1
            const Icon = typeIcon[v.type] || MessageCircle
            return (
              <button
                key={v.versionId}
                onClick={() => !isCurrent && handleRestore(v.versionId)}
                disabled={isCurrent || sending}
                className="vorta-version-chip shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] transition-all"
                title={`${v.type}: ${v.instruction || 'initial'} (${formatTime(v.createdAt)})`}
                style={{
                  background: isCurrent ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isCurrent ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  color: isCurrent ? '#c4b5fd' : 'rgba(255,255,255,0.25)',
                  cursor: isCurrent ? 'default' : 'pointer',
                }}
              >
                <Icon size={7} />
                <span>v{i + 1}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Input */}
      <div className="vorta-chat-input shrink-0 px-3 py-2 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          className="vorta-input flex-1 text-[11px]"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'title' ? 'Revise titles...' : 'Edit thumbnail...'}
          disabled={sending}
          style={{ padding: '6px 10px' }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="vorta-btn shrink-0 p-1.5 rounded-md transition-all"
          style={{
            background: input.trim() && !sending ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)',
            color: input.trim() && !sending ? '#c4b5fd' : 'rgba(255,255,255,0.2)',
          }}
        >
          {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </button>
      </div>
    </div>
  )
}
