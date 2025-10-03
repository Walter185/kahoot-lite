// src/pages/CreateRoom.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { db, ensureAnonAuth, now } from '../firebase'
import { doc, getDoc, runTransaction, collection } from 'firebase/firestore'
import CreditsModal from '../components/CreditsModal'

/* Quiz de Geografía (único por ahora) */
const sampleQuiz = {
  title: 'Modelo agroexportador (AR, 1870–1930)',
  questions: [
    { text: '¿En qué período histórico se consolidó el modelo agroexportador?', options: ['1870-1930','1810-1850','1940-1970','1820-1910'], correctIndex: 0, timeLimitSec: 20 },
    { text: '¿Qué producto se convirtió en el principal de exportación de Argentina?', options: ['Oro','Carne y cereales','Vino','Azúcar'], correctIndex: 1, timeLimitSec: 20 },
    { text: '¿Qué país fue el principal inversor extranjero en Argentina durante este modelo?', options: ['Francia','Alemania','Estados Unidos','Gran Bretaña'], correctIndex: 3, timeLimitSec: 20 },
    { text: '¿Qué región argentina fue la más favorecida?', options: ['Noroeste','Noreste','Pampa Húmeda','La Patagonia'], correctIndex: 2, timeLimitSec: 15 },
    { text: '¿Qué acontecimiento internacional puso en crisis el modelo agroexportador?', options: ['La Segunda Guerra Mundial','La crisis de 1930','La Primera Guerra Mundial','La Revolución Industrial'], correctIndex: 1, timeLimitSec: 20 },
    { text: '¿Qué grupo social concentraba la tierra y el poder político en Argentina?', options: ['Oligarquía terrateniente','Clase obrera','Campesinos indígenas','Inmigrantes y trabajadores urbanos'], correctIndex: 0, timeLimitSec: 20 },
    { text: '¿Cuál fue una consecuencia problemática del modelo (1870–1930)?', options: ['Acceso generalizado', 'Igual distribución', 'Diversificación nacional', 'Concentración y desplazamiento'], correctIndex: 3, timeLimitSec: 25 },
    { text: '¿Qué producto caracterizó la economía cubana?', options: ['Tabaco','Café','Azúcar','Salitre'], correctIndex: 2, timeLimitSec: 20 },
    { text: '¿Qué país se especializó en café?', options: ['Cuba','Brasil','Chile','Argentina'], correctIndex: 1, timeLimitSec: 20 },
    { text: '¿Consecuencia ambiental en Argentina?', options: ['Reforestación masiva','Sobreexplotación y deforestación','Reducción del monocultivo','Se detuvo la concentración'], correctIndex: 1, timeLimitSec: 20 }
  ]
}

const QUIZZES_BY_SUBJECT = { 'Geografía': sampleQuiz }
function code6(){ return Math.floor(100000 + Math.random()*900000).toString() }

export default function CreateRoom(){
  const nav = useNavigate()
  const { search } = useLocation()
  const params = useMemo(() => new URLSearchParams(search), [search])
  const initialSubject = decodeURIComponent(params.get('subject') || 'Geografía')

  const [subject] = useState(initialSubject)
  const [roomCode, setRoomCode] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  useEffect(() => { ensureAnonAuth() }, [])

  const cleanName = (name || '').replace(/\s+/g, ' ').trim()
  const isNameValid = cleanName.length >= 2
  const isJoinEnabled = roomCode && isNameValid
  const shareUrl = roomCode ? `${window.location.origin}/play/${roomCode}` : ''

  async function createRoom(){
    setCreating(true)
    try{
      const u = await ensureAnonAuth()
      const materia = subject || 'Geografía'
      const quiz = QUIZZES_BY_SUBJECT[materia] || QUIZZES_BY_SUBJECT['Geografía']

      const { roomId } = await runTransaction(db, async (tx) => {
        let codeTry = code6()
        let aliasRef = doc(db, 'roomCodes', codeTry)
        let aliasSnap = await tx.get(aliasRef)
        let tries = 0
        while (aliasSnap.exists()) {
          if (++tries > 8) throw new Error('room_code_exhausted')
          codeTry = code6()
          aliasRef = doc(db, 'roomCodes', codeTry)
          aliasSnap = await tx.get(aliasRef)
        }

        const roomRef = doc(collection(db, 'rooms'))
        const roomIdAuto = roomRef.id

        tx.set(roomRef, {
          hostId: u.uid,
          createdAt: now(),
          state: 'lobby',
          currentQuestionIndex: -1,
          questionStart: null,
          paused: false,
          pauseStart: null,
          pausedAccumMs: 0,
          code: codeTry,
          subject: materia,
          quiz
        })
        tx.set(aliasRef, { roomId: roomIdAuto, hostId: u.uid, createdAt: now(), active: true })
        return { roomId: roomIdAuto }
      })

      nav(`/host/${roomId}`)
    } catch (e) {
      console.error(e)
      const msg = e.message === 'room_code_exhausted'
        ? 'No pudimos generar un código único. Probá otra vez.'
        : (e.code || e.message)
      alert(`No se pudo crear la sala: ${msg}`)
    } finally {
      setCreating(false)
    }
  }

  async function joinRoom(){
    const trimmed = cleanName
    if (trimmed.length < 2) {
      alert('Ingresá tu nombre (mínimo 2 caracteres).')
      return
    }
    if(!roomCode) return
    const aliasRef = doc(db, 'roomCodes', roomCode)
    const aliasSnap = await getDoc(aliasRef)
    if(!aliasSnap.exists()){
      const roomRefLegacy = doc(db, 'rooms', roomCode)
      const roomSnapLegacy = await getDoc(roomRefLegacy)
      if (!roomSnapLegacy.exists()) {
        alert('Código inválido o sala inexistente.')
        return
      }
      nav(`/play/${roomCode}?name=${encodeURIComponent(trimmed.slice(0, 20))}`)
      return
    }
    const { roomId } = aliasSnap.data()
    const roomRef = doc(db, 'rooms', roomId)
    const roomSnap = await getDoc(roomRef)
    if(!roomSnap.exists()){
      alert('La sala ya no está disponible.')
      return
    }
    nav(`/play/${roomId}?name=${encodeURIComponent(trimmed.slice(0, 20))}`)
  }

  return (
    <div className="cr-wrap">
      <style>{`
        html, body, #root { height: 100%; }
        body { margin: 0; overflow: hidden; }

        .cr-wrap{
          position: fixed; inset:0;        /* ocupa todo el viewport */
          display: flex; flex-direction: column;
          background:#0b1220; color:#e5e7eb;
          overflow: hidden;
        }

        .cr-header{
          padding: 8px 10px;
          display:flex; align-items:center; justify-content:space-between;
        }
        .cr-title{ margin:0; font-size:1.22rem; font-weight:800; line-height:1; letter-spacing:.2px; }
        .info-btn{
          width:28px; height:28px; display:grid; place-items:center;
          border-radius:8px; border:1px solid rgba(255,255,255,.12);
          background:rgba(255,255,255,.06); color:#e5e7eb; cursor:pointer;
          font-size:.9rem;
        }

        /* Main: tarjetas pegadas arriba, sin centrar vertical */
        .cr-main{
          flex:1; min-height:0;
          display:grid; grid-template-rows:auto auto;
          gap: 10px; padding: 8px 10px 10px;
          align-content: start;          /* 👈 clave: pega arriba */
          justify-items: center;
        }
        .card{
          width:100%; max-width:520px;
          background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.08);
          border-radius:16px; padding:10px 12px;
          box-shadow:0 6px 20px rgba(0,0,0,.25);
        }
        .row{ display:flex; gap:8px; align-items:center; }
        .grid.two{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        @media (max-width:480px){ .grid.two{ grid-template-columns:1fr; } }
        .input{
          width:100%; height:40px; border-radius:10px;
          border:1px solid rgba(255,255,255,.18);
          background:rgba(255,255,255,.08); color:#fff; padding:8px 10px;
        }
        .btn{
          background:#3b82f6; color:#fff; border:none;
          padding:10px 14px; border-radius:12px; font-weight:700; cursor:pointer;
          width:100%;
        }
        .btn.secondary{ background:rgba(255,255,255,.14); }
        .small{ font-size:.9rem; }
      `}</style>

      <header className="cr-header">
        <h1 className="cr-title">Pelle 2°4</h1>
        <button className="info-btn" aria-label="Info" onClick={()=>setShowInfo(true)}>ℹ️</button>
      </header>

      <main className="cr-main">
        <div className="card" style={{ textAlign:'center' }}>
          <h2 style={{marginBottom:4}}>Crear sala</h2>
          <div className="small" style={{opacity:.85, marginBottom:8}}>
            Materia: <strong>{subject || 'Geografía'}</strong>
          </div>
          <button className="btn" onClick={createRoom} disabled={creating}>
            {creating ? 'Creando...' : 'Crear y ser anfitrión'}
          </button>
        </div>

        <div className="card">
          <h2>Unirse</h2>
          <div className="grid two">
            <div>
              <label className="small">Código</label>
              <input
                className="input"
                placeholder="p. ej. 123456"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.trim())}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
              />
            </div>
            <div>
              <label className="small">Tu nombre</label>
              <input
                className="input"
                placeholder="Nombre visible"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={20}
                required
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
            <button className="btn secondary" onClick={joinRoom} disabled={!isJoinEnabled}>
              Unirme
            </button>
            {roomCode && (
              <span className="small" style={{ opacity: .85 }}>
                Link: <code>{shareUrl}</code>
              </span>
            )}
          </div>
        </div>
      </main>

      <CreditsModal open={showInfo} onClose={()=>setShowInfo(false)} />
    </div>
  )
}
