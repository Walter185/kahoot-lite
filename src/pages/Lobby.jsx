// src/pages/Lobby.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ensureAnonAuth } from '../firebase'
import RouletteWheel from '../components/RouletteWheel'
import WinnerCelebration from '../components/WinnerCelebration'
import CreditsModal from '../components/CreditsModal'

export default function Lobby(){
  const [showInfo, setShowInfo] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState('Geografía')
  const [showCelebration, setShowCelebration] = useState(false)
  const [wheelSize, setWheelSize] = useState(260)
  const headerRef = useRef(null)
  const nav = useNavigate()

  useEffect(() => { ensureAnonAuth() }, [])

  const materias = useMemo(() => ([
    'Geografía','Historia','Matemática','Lengua','Inglés','Biología','Física','Química'
  ]), [])

  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth
      const vh = window.visualViewport?.height || window.innerHeight
      const headerH = headerRef.current?.getBoundingClientRect().height ?? 48
      const GUTTER = 8
      const availH = Math.max(160, vh - headerH - GUTTER*2)
      const availW = Math.max(160, vw - GUTTER*2)
      const base = Math.min(availH, availW)
      const SCALE = 0.9
      const s = Math.floor(base * SCALE)
      setWheelSize(s)
    }
    calc()
    window.addEventListener('resize', calc)
    window.addEventListener('orientationchange', calc)
    window.visualViewport?.addEventListener('resize', calc)
    return () => {
      window.removeEventListener('resize', calc)
      window.removeEventListener('orientationchange', calc)
      window.visualViewport?.removeEventListener('resize', calc)
    }
  }, [])

  return (
    <div className="lobby-wrap">
      <style>{`
        .lobby-wrap{
          position: fixed; inset: 0;
          display: flex; flex-direction: column;
          background: #0b1220; color: #e5e7eb;
          overflow: hidden;
          -webkit-overflow-scrolling: auto;
        }
        .lw-header{
          display:flex; align-items:center; justify-content:space-between;
          padding: 8px 10px;
        }
        .lw-title{ margin:0; font-size:1.22rem; line-height:1; font-weight:800; letter-spacing:.2px; }
        .info-btn{
          width:28px; height:28px; display:grid; place-items:center;
          border-radius:8px; border:1px solid rgba(255,255,255,.12);
          background:rgba(255,255,255,.06); color:#e5e7eb; cursor:pointer; font-size:.9rem;
        }
        .lw-main{
          flex:1; min-height:0; padding: 0 8px 8px;
          display:grid; align-items: start; justify-items: center;
        }
        .roulette-wrap{
          width: 100%; height: 100%;
          display:grid; align-items:start; justify-items:center;
          padding:0; background:transparent; border:0; box-shadow:none;
        }
        .roulette-wrap.card{ padding:0!important; border:0!important; background:transparent!important; box-shadow:none!important; }
        .rw-wrap > .btn{ display:none!important; }
        .rw-wrap > .small{ display:none!important; }

        /* ⬆️ Elevar celebración de materia ganadora SOLO en Lobby */
        .lobby-wrap .cele-overlay{
          align-items: flex-start;                    /* sube el overlay */
          padding-top: clamp(10vh, 12vh, 15vh);         /* margen superior responsivo */
        }
      `}</style>

      <header className="lw-header" ref={headerRef}>
        <h1 className="lw-title">Pelle 2°4</h1>
        <button className="info-btn" aria-label="Información" onClick={()=>setShowInfo(true)}>ℹ️</button>
      </header>

      <main className="lw-main">
        <div className="roulette-wrap">
          <RouletteWheel
            subjects={materias}
            fixedResult="Geografía"
            compact
            size={wheelSize}
            onFinish={(materia) => {
              setSelectedSubject(materia)
              setShowCelebration(true)
            }}
          />
        </div>
      </main>

      <CreditsModal open={showInfo} onClose={()=>setShowInfo(false)} />

      {showCelebration && (
        <WinnerCelebration
          name={(selectedSubject || 'Geografía').toUpperCase()}
          subtitle="¡Materia ganadora!"
          durationMs={2200}
          onClose={() => {
            setShowCelebration(false)
            nav(`/create?subject=${encodeURIComponent(selectedSubject || 'Geografía')}`)
          }}
        />
      )}
    </div>
  )
}
