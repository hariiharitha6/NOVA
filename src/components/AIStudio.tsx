import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useShellStore } from '../store/useShellStore'
import { resizeWindow } from '../hooks/useElectronBridge'

// Studio window dimensions
const STUDIO_WIN_W = 1080
const STUDIO_WIN_H = 720

// Spring physics
const S_SPRING = { type: 'spring', stiffness: 380, damping: 28 }
const S_SOFT   = { type: 'spring', stiffness: 220, damping: 24 }

// ─── Module Definitions ───────────────────────────────────────────────────────
export interface StudioModule {
  id: string
  name: string
  icon: string
  badge?: string
}

const MODULES: StudioModule[] = [
  { id: 'terminal',     name: 'AI Terminal',     icon: '⚡', badge: 'v2.4' },
  { id: 'conversation', name: 'Conversation',    icon: '💬', badge: 'Live' },
  { id: 'files',        name: 'Generated Files', icon: '📄', badge: '+4' },
  { id: 'research',     name: 'Research',        icon: '🔍', badge: '12 Src' },
  { id: 'tasks',        name: 'Tasks',           icon: '🎯', badge: '3 Active' },
  { id: 'timeline',     name: 'Timeline',        icon: '⏳', badge: '8 Rev' },
  { id: 'artifacts',    name: 'Artifacts',       icon: '💎', badge: '2 Docs' },
  { id: 'memory',       name: 'Memory',          icon: '🧠', badge: '1.2k Vectors' },
  { id: 'logs',         name: 'Logs',            icon: '📡', badge: '140 t/s' },
]

// ─── 1. AI TERMINAL MODULE ───────────────────────────────────────────────────
function TerminalModule() {
  const [inputCmd, setInputCmd] = useState('')
  const [lines, setLines] = useState<Array<{ id: number; text: string; type: 'cmd' | 'output' | 'ai' }>>([
    { id: 1, text: 'AI OS Kernel v4.2.0 [x86_64-win32-release]', type: 'output' },
    { id: 2, text: 'Connected to local runtime daemon at 127.0.0.1:9090', type: 'output' },
    { id: 3, text: 'ai-os-tool run-agent --target="optimize-neural-cache"', type: 'cmd' },
    { id: 4, text: '✔ Agent initialized in 42ms. Allocating 4GB memory buffer.', type: 'ai' },
    { id: 5, text: '✔ Optimized 12 kernel vectors. Cache hit ratio elevated to 98.4%.', type: 'output' },
  ])
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleRun = () => {
    if (!inputCmd.trim()) return
    const newCmd = inputCmd.trim()
    setLines(prev => [
      ...prev,
      { id: Date.now(), text: `$ ${newCmd}`, type: 'cmd' },
      { id: Date.now() + 1, text: `[AI Execution Daemon] Executing directive: "${newCmd}"`, type: 'ai' },
      { id: Date.now() + 2, text: `Done in 12ms. Exit code: 0`, type: 'output' }
    ])
    setInputCmd('')
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [lines])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {/* Status Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#8F97A2' }}>
          <span style={{ animation: 'pulse 1.5s infinite' }}>●</span>
          <span>Interactive Neural Shell</span>
        </div>
        <div style={{ fontSize: 10, color: '#7C838D', fontFamily: 'monospace' }}>
          PID: 14890 | RAM: 142MB | TTY: /dev/pts/1
        </div>
      </div>

      {/* Terminal Output */}
      <div ref={scrollRef} style={{ flex: 1, background: 'rgba(5, 7, 18, 0.85)', borderRadius: 12, border: '1px solid rgba(56,189,248,0.2)', padding: 14, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {lines.map(l => (
          <div key={l.id} style={{ color: l.type === 'cmd' ? '#8F97A2' : l.type === 'ai' ? '#EDE5D2' : '#9BA3AC', lineHeight: 1.5 }}>
            {l.text}
          </div>
        ))}
      </div>

      {/* Terminal Prompt Input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(15,23,42,0.8)', padding: '6px 12px', borderRadius: 12, border: '1px solid rgba(56,189,248,0.3)' }}>
        <span style={{ color: '#8F97A2', fontWeight: 'bold' }}>❯</span>
        <input
          value={inputCmd}
          onChange={e => setInputCmd(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRun()}
          placeholder="Type an AI engineering command..."
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: 12, fontFamily: '"JetBrains Mono", monospace' }}
        />
        <button onClick={handleRun} style={{ background: '#0284c7', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
          Run
        </button>
      </div>
    </div>
  )
}

// ─── 2. CONVERSATION MODULE ──────────────────────────────────────────────────
function ConversationModule() {
  const [messages, setMessages] = useState([
    { id: 1, sender: 'user', text: 'Refactor the data pipeline to handle 10k event streams per second.' },
    { id: 2, sender: 'agent', thought: 'Analyzing current throughput bottlenecks. Recommending zero-copy ring buffer with Lock-Free Concurrent Queue.', text: 'I have updated the pipeline architecture. Here is the layout:' },
  ])
  const [msgInput, setMsgInput] = useState('')

  const handleSend = () => {
    if (!msgInput.trim()) return
    const text = msgInput.trim()
    setMessages(prev => [
      ...prev,
      { id: Date.now(), sender: 'user', text },
      { id: Date.now() + 1, sender: 'agent', thought: 'Synthesizing response for requested directive...', text: `Executed directive: "${text}". Updated internal cache and emitted signal event.` }
    ])
    setMsgInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 6 }}>
        {messages.map(m => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: m.sender === 'user' ? '#E1D6BE' : '#8F97A2' }}>
              {m.sender === 'user' ? 'ENGINEER' : 'AI ORCHESTRATOR'}
            </span>
            {m.thought && (
              <div style={{ fontSize: 11, fontStyle: 'italic', background: 'rgba(233,224,207,0.10)', color: '#EDE5D2', padding: '6px 10px', borderRadius: 8, borderLeft: '2px solid #E1D6BE', maxWidth: '85%' }}>
                💭 {m.thought}
              </div>
            )}
            <div style={{ background: m.sender === 'user' ? 'rgba(139,92,246,0.2)' : 'rgba(30,41,59,0.7)', border: `1px solid ${m.sender === 'user' ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`, color: '#e2e8f0', padding: '10px 14px', borderRadius: 12, fontSize: 12, maxWidth: '85%', lineHeight: 1.5 }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, background: 'rgba(15,23,42,0.8)', padding: '8px 12px', borderRadius: 14, border: '1px solid rgba(139,92,246,0.3)' }}>
        <input
          value={msgInput}
          onChange={e => setMsgInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Direct the AI agent..."
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: 12 }}
        />
        <button onClick={handleSend} style={{ background: 'linear-gradient(135deg, #B92D32, #B92D32)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
          Send
        </button>
      </div>
    </div>
  )
}

// ─── 3. GENERATED FILES MODULE ───────────────────────────────────────────────
function FilesModule() {
  const [selectedFile, setSelectedFile] = useState('pipeline.ts')

  const files = [
    { name: 'pipeline.ts', status: 'modified', diff: '+ 14 lines' },
    { name: 'neural_cache.rs', status: 'added', diff: '+ 180 lines' },
    { name: 'config.json', status: 'clean', diff: '0 changes' },
  ]

  const codeSnippets: Record<string, string> = {
    'pipeline.ts': `// AI OS Data Pipeline Module
export class NeuralPipeline {
  private queue: LockFreeQueue<TelemetryEvent>;

  constructor(size: number = 10000) {
    this.queue = new LockFreeQueue(size);
  }

+ public async processStream(stream: EventStream): Promise<void> {
+   await this.queue.enqueueBatch(stream.readAvailable());
+   this.emit('batch_processed');
+ }
}`,
    'neural_cache.rs': `// High-speed Rust Memory Cache
pub struct NeuralCache {
    store: Arc<RwLock<HashMap<String, Vec<u8>>>>,
}

impl NeuralCache {
    pub fn new() -> Self {
        Self { store: Arc::new(RwLock::new(HashMap::new())) }
    }
}`,
    'config.json': `{
  "target_fps": 120,
  "glass_blur_px": 40,
  "max_neural_threads": 8
}`
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, height: '100%' }}>
      {/* File Tree List */}
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#7C838D', letterSpacing: '0.1em', marginBottom: 4 }}>PROJECT FILES</div>
        {files.map(f => (
          <button
            key={f.name}
            onClick={() => setSelectedFile(f.name)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: selectedFile === f.name ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: selectedFile === f.name ? '#EDE5D2' : '#9BA3AC',
              fontSize: 12, textAlign: 'left',
            }}
          >
            <span>📄 {f.name}</span>
            <span style={{ fontSize: 9, color: f.status === 'modified' ? '#f59e0b' : f.status === 'added' ? '#10b981' : '#7C838D' }}>{f.diff}</span>
          </button>
        ))}
      </div>

      {/* Code / Diff Viewer */}
      <div style={{ background: 'rgba(5,7,18,0.9)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', padding: 14, fontFamily: 'monospace', fontSize: 11, overflowY: 'auto', whiteSpace: 'pre-wrap', color: '#e2e8f0', lineHeight: 1.6 }}>
        {codeSnippets[selectedFile]}
      </div>
    </div>
  )
}

// ─── 4. RESEARCH MODULE ──────────────────────────────────────────────────────
function ResearchModule() {
  const sources = [
    { title: 'Lock-Free Queues in High Frequency Trading Systems', domain: 'arxiv.org', relevance: '99%' },
    { title: 'Electron Windows Transparency & GPU Acceleration Guide', domain: 'electronjs.org', relevance: '96%' },
    { title: 'Framer Motion Spring Dynamics and Layout Morphing', domain: 'framer.com', relevance: '92%' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '12px 16px', background: 'rgba(139,92,246,0.1)', borderRadius: 12, border: '1px solid rgba(139,92,246,0.25)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#E1D6BE', marginBottom: 4 }}>SYNTHESIS RESULT</div>
        <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>
          High-performance Electron transparent overlays require disabling DWM frame margins and enabling hardware acceleration with custom native window bounds calculations.
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: '#7C838D', letterSpacing: '0.1em' }}>CITATIONS & SOURCES</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sources.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(15,23,42,0.6)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>{s.title}</div>
              <div style={{ fontSize: 10, color: '#7C838D' }}>{s.domain}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: 6 }}>
              {s.relevance}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 5. TASKS MODULE ─────────────────────────────────────────────────────────
function TasksModule() {
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Initialize Electron transparency window', done: true },
    { id: 2, text: 'Detect taskbar height and screen bounds', done: true },
    { id: 3, text: 'Build AI Capsule Framer Motion spring morphing', done: true },
    { id: 4, text: 'Implement Voice-First Audio WebSocket protocol', done: true },
    { id: 5, text: 'Construct AI Engineering Studio Multi-Panel System', done: false },
  ])

  const toggleTask = (id: number) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  const completed = tasks.filter(t => t.done).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Progress header */}
      <div style={{ padding: 12, background: 'rgba(15,23,42,0.6)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1', marginBottom: 6 }}>
          <span>Agent Execution Pipeline</span>
          <span style={{ color: '#E1D6BE', fontWeight: 'bold' }}>{Math.round((completed / tasks.length) * 100)}%</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(completed / tasks.length) * 100}%`, background: 'linear-gradient(90deg, #B92D32, #E1D6BE)', transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Task List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {tasks.map(t => (
          <div
            key={t.id}
            onClick={() => toggleTask(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'rgba(15,23,42,0.4)', borderRadius: 10,
              border: `1px solid ${t.done ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
              cursor: 'pointer',
            }}
          >
            <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${t.done ? '#10b981' : '#7C838D'}`, background: t.done ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white' }}>
              {t.done ? '✓' : ''}
            </div>
            <span style={{ fontSize: 12, color: t.done ? '#9BA3AC' : '#e2e8f0', textDecoration: t.done ? 'line-through' : 'none' }}>
              {t.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 6. TIMELINE MODULE ──────────────────────────────────────────────────────
function TimelineModule() {
  const checkpoints = [
    { time: '05:00 AM', label: 'Initial Project Scaffolding', hash: 'c1a90f' },
    { time: '05:12 AM', label: 'Electron Transparent Capsule Window', hash: 'f820b1' },
    { time: '05:25 AM', label: 'Voice-First Audio Visualizer', hash: 'd401e2' },
    { time: '05:32 AM', label: 'AI Engineering Studio Multi-Panel', hash: 'HEAD' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', paddingRight: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#7C838D', letterSpacing: '0.1em' }}>REVISION HISTORY & TIME SCRUBBER</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 15, top: 10, bottom: 10, width: 2, background: 'rgba(139,92,246,0.3)' }} />
        {checkpoints.map((cp, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: cp.hash === 'HEAD' ? '#E1D6BE' : '#2E333A', border: '2px solid #14171C', boxShadow: cp.hash === 'HEAD' ? '0 0 10px #E1D6BE' : 'none' }} />
            <div style={{ flex: 1, padding: '10px 14px', background: 'rgba(15,23,42,0.6)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{cp.label}</div>
                <div style={{ fontSize: 10, color: '#7C838D' }}>{cp.time}</div>
              </div>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: cp.hash === 'HEAD' ? '#8F97A2' : '#7C838D', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}>
                {cp.hash}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 7. ARTIFACTS MODULE ─────────────────────────────────────────────────────
function ArtifactsModule() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: 14, background: 'rgba(15,23,42,0.6)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8F97A2', marginBottom: 8 }}>ARCHITECTURE SPECIFICATION ARTIFACT</div>
        <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
          ### System Topography
          - **Floating Capsule**: Translucent frameless window anchoring at taskbar.
          - **Neural Daemon**: Asynchronous event router with WebSockets.
          - **Studio Grid**: Resizable, dockable layout engine built with Framer Motion.
        </div>
      </div>

      <div style={{ padding: 14, background: 'rgba(15,23,42,0.6)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#E1D6BE', marginBottom: 8 }}>FLOW DIAGRAM ARTIFACT</div>
        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, border: '1px dashed rgba(167,139,250,0.3)', borderRadius: 8 }}>
          <div style={{ padding: '6px 12px', background: 'rgba(233,224,207,0.22)', color: '#EDE5D2', borderRadius: 6, fontSize: 11 }}>Capsule</div>
          <span style={{ color: '#7C838D' }}>➔</span>
          <div style={{ padding: '6px 12px', background: 'rgba(56,189,248,0.2)', color: '#7dd3fc', borderRadius: 6, fontSize: 11 }}>Spring Morph</div>
          <span style={{ color: '#7C838D' }}>➔</span>
          <div style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', borderRadius: 6, fontSize: 11 }}>AI Studio</div>
        </div>
      </div>
    </div>
  )
}

// ─── 8. MEMORY MODULE ────────────────────────────────────────────────────────
function MemoryModule() {
  const memoryItems = [
    { key: 'user_preference_theme', val: 'Dark Futuristic Glassmorphism' },
    { key: 'electron_transparency_mode', val: 'win32 pop-up-menu window level' },
    { key: 'neural_context_token_limit', val: '128,000 tokens' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#7C838D', letterSpacing: '0.1em' }}>PERSISTENT MEMORY & VECTOR EMBEDDINGS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {memoryItems.map((m, i) => (
          <div key={i} style={{ padding: '10px 14px', background: 'rgba(15,23,42,0.6)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: '#E1D6BE', fontFamily: 'monospace', marginBottom: 2 }}>{m.key}</div>
            <div style={{ fontSize: 12, color: '#e2e8f0' }}>{m.val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 9. LOGS MODULE ──────────────────────────────────────────────────────────
function LogsModule() {
  const logs = [
    '[05:00:12] [INFO] Main process initialized transparent BrowserWindow',
    '[05:00:13] [IPC] Received display-metrics-changed event',
    '[05:00:14] [WEBSOCKET] Connected to ws://localhost:8000/ws/voice',
    '[05:00:15] [RENDERER] Framer Motion spring physics initialized @ 120 FPS',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', background: 'rgba(5,7,18,0.9)', padding: 12, borderRadius: 12, fontFamily: 'monospace', fontSize: 11, overflowY: 'auto' }}>
      {logs.map((l, i) => (
        <div key={i} style={{ color: '#9BA3AC', lineHeight: 1.5 }}>
          {l}
        </div>
      ))}
    </div>
  )
}

// ─── MAIN AI STUDIO COMPONENT ────────────────────────────────────────────────
export function AIStudio() {
  const { setStudioOpen, activeStudioTab, setActiveStudioTab, dockedPanels, toggleDockPanel } = useShellStore()

  // Set window size when mounting
  useEffect(() => {
    resizeWindow(STUDIO_WIN_W, STUDIO_WIN_H)
  }, [])

  const renderModuleContent = (id: string) => {
    switch (id) {
      case 'terminal':     return <TerminalModule />
      case 'conversation': return <ConversationModule />
      case 'files':        return <FilesModule />
      case 'research':     return <ResearchModule />
      case 'tasks':        return <TasksModule />
      case 'timeline':     return <TimelineModule />
      case 'artifacts':    return <ArtifactsModule />
      case 'memory':       return <MemoryModule />
      case 'logs':         return <LogsModule />
      default:             return <TerminalModule />
    }
  }

  const activeModule = MODULES.find(m => m.id === activeStudioTab) || MODULES[0]

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0, borderRadius: 9999 }}
      animate={{ scale: 1, opacity: 1, borderRadius: 24 }}
      exit={{ scale: 0.85, opacity: 0, borderRadius: 9999 }}
      transition={S_SPRING as any}
      style={{
        width: '100%',
        height: '100%',
        background: 'rgba(7, 8, 22, 0.94)',
        backdropFilter: 'blur(40px) saturate(190%)',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        boxShadow: '0 30px 90px rgba(0,0,0,0.85), 0 0 50px rgba(99,102,241,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ── HEADER & WORKSPACE BAR ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'linear-gradient(135deg, #B92D32, #E1D6BE)', boxShadow: '0 0 10px #B92D32' }} />
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: '#f1f5f9', textTransform: 'uppercase' }}>
            AI Engineering Studio
          </span>
          <span style={{ fontSize: 10, color: '#7C838D', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            v3.8 Multi-Thread Runtime
          </span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setStudioOpen(false)}
            style={{
              width: 26, height: 26, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,0.06)', color: '#9BA3AC',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, transition: 'background 0.2s',
            }}
            title="Collapse Back to Capsule"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── MODULE SELECTOR / DOCK TABS ───────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 16px',
          background: 'rgba(15,23,42,0.4)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          overflowX: 'auto',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        {MODULES.map(mod => {
          const isActive = activeStudioTab === mod.id
          const isDocked = dockedPanels.includes(mod.id)
          return (
            <motion.button
              key={mod.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveStudioTab(mod.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: isActive ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.03)',
                borderWidth: 1, borderStyle: 'solid',
                borderColor: isActive ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)',
                color: isActive ? '#EDE5D2' : '#9BA3AC',
                fontSize: 11, fontWeight: isActive ? 700 : 500,
                whiteSpace: 'nowrap',
                transition: 'all 0.18s ease',
              }}
            >
              <span>{mod.icon}</span>
              <span>{mod.name}</span>
              {mod.badge && (
                <span style={{ fontSize: 9, background: isActive ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4, color: isActive ? '#f1f5f9' : '#7C838D' }}>
                  {mod.badge}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* ── MAIN STUDIO WORKSPACE LAYOUT (PRIMARY & DOCKED SIDE PANELS) ───── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, padding: 16, overflow: 'hidden' }}>

        {/* Primary View */}
        <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', padding: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
              <span>{activeModule.icon}</span>
              <span>{activeModule.name}</span>
            </div>
            <button
              onClick={() => toggleDockPanel(activeModule.id)}
              style={{ fontSize: 10, color: '#E1D6BE', background: 'rgba(233,224,207,0.10)', border: '1px solid rgba(233,224,207,0.22)', padding: '3px 8px', borderRadius: 6, cursor: 'pointer' }}
            >
              {dockedPanels.includes(activeModule.id) ? 'Undock Side View' : 'Dock to Side'}
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {renderModuleContent(activeStudioTab)}
          </div>
        </div>

        {/* Docked Secondary View */}
        <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', padding: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7C838D', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>
            DOCKED MODULE (CONVERSATION & STREAM)
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ConversationModule />
          </div>
        </div>

      </div>
    </motion.div>
  )
}
