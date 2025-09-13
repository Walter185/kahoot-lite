import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, ensureAnonAuth, now } from '../firebase'
import {
  doc, setDoc, getDoc, runTransaction, collection
} from 'firebase/firestore'

const sampleQuiz = {
  title: 'Modelo agroexportador (AR, 1870–1930)',
  questions: [
    {
      text: '¿En qué período histórico se consolidó el modelo agroexportador?',
      options: ['1870-1930','1810-1850','1940-1970','1820-1910'],
      correctIndex: 0, timeLimitSec: 20
    },
    {
      text: '¿Qué producto se convirtió en el principal de exportación de Argentina?',
      options: ['Oro','Carne y cereales','Vino','Azúcar'],
      correctIndex: 1, timeLimitSec: 20
    },
    {
      text: '¿Qué país fue el principal inversor extranjero en Argentina durante este modelo?',
      options: ['Francia','Alemania','Estados Unidos','Gran Bretaña'],
      correctIndex: 3, timeLimitSec: 20
    },
    {
      text: '¿Qué región argentina fue la más favorecida?',
      options: ['Noroeste','Noreste','Pampa Húmeda','La Patagonia'],
      correctIndex: 2, timeLimitSec: 15
    },
    {
      text: '¿Qué acontecimiento internacional puso en crisis el modelo agroexportador?',
      options: ['La Segunda Guerra Mundial','La crisis de 1930','La Primera Guerra Mundial','La Revolución Industrial'],
      correctIndex: 1, timeLimitSec: 20
    },
    {
      text: '¿Qué grupo social concentraba la tierra y el poder político en Argentina?',
      options: ['Oligarquía terrateniente','Clase obrera','Campesinos indígenas','Inmigrantes y trabajadores urbanos'],
      correctIndex: 0, timeLimitSec: 20
    },
    {
      text: '¿Cuál de las siguientes fue una consecuencia problemática del modelo agroexportador argentino entre 1870 y 1930?',
      options: [
        'Aumento generalizado del acceso a la propiedad rural para inmigrantes',
        'Igual distribución de la riqueza y del poder político',
        'Diversificación industrial en todo el país',
        'Concentración de la tierra y desplazamiento de pequeños productores'
      ],
      correctIndex: 3, timeLimitSec: 25
    }
  ]
}

// Código de 6 dígitos numérico
function code6(){ return Math.floor(100000 + Math.random()*900000).toString() }

export default function Lobby(){
  const [roomCode, setRoomCode] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const nav = useNavigate()

  useEffect(() => { ensureAnonAuth() }, [])

  const cleanName = (name || '').replace(/\s+/g, ' ').trim()
  const isNameValid = cleanName.length >= 2
  const isJoinEnabled = roomCode && isNameValid

  // Crear sala con transacción: reserva code -> roomId y crea room
  async function createRoom(){
    setCreating(true)
    try{
      const u = await ensureAnonAuth()

      const { roomId } = await runTransaction(db, async (tx) => {
        // genera code y chequea alias
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

        // crea room con ID auto
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
          code: codeTry,       // ← guardamos el code dentro de la sala
          quiz: sampleQuiz
        })

        // reserva alias (no se puede sobrescribir por reglas)
        tx.set(aliasRef, {
          roomId: roomIdAuto,
          hostId: u.uid,
          createdAt: now(),
          active: true
        })

        return { roomId: roomIdAuto, code: codeTry }
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

  // Unirse: requiere nombre válido y resuelve code → roomId
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
      // Fallback opcional: intentar rooms/{roomCode} si aún usás el esquema viejo
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
    // (Opcional: comprobar que la sala exista)
    const roomRef = doc(db, 'rooms', roomId)
    const roomSnap = await getDoc(roomRef)
    if(!roomSnap.exists()){
      alert('La sala ya no está disponible.')
      return
    }
    nav(`/play/${roomId}?name=${encodeURIComponent(trimmed.slice(0, 20))}`)
  }

  const shareUrl = roomCode ? `${window.location.origin}/play/${roomCode}` : ''

  return (
    <div className="grid">
      <div className="card">
        <h1>Crear sala</h1>
        <p className="small">Se genera una sala con el cuestionario “{sampleQuiz.title}”.</p>
        <button className="btn" onClick={createRoom} disabled={creating}>
          {creating ? 'Creando...' : 'Crear y ser anfitrión'}
        </button>
      </div>

      <div className="card">
        <h1>Unirse a una sala</h1>
        <div className="grid two">
          <div>
            <label className="small">Código de sala</label>
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
            <label className="small">Tu nombre (obligatorio)</label>
            <input
              className="input"
              placeholder="Nombre visible"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={20}
              required
            />
            {!isNameValid && name.length > 0 && (
              <div className="small" style={{color:'#fca5a5', marginTop:6}}>
                Mínimo 2 caracteres.
              </div>
            )}
          </div>
        </div>
        <div className="row" style={{marginTop:12}}>
          <button className="btn secondary" onClick={joinRoom} disabled={!isJoinEnabled}>
            Unirme
          </button>
          {roomCode && <span className="small">Link directo: <code>{shareUrl}</code></span>}
        </div>
      </div>
    </div>
  )
}
