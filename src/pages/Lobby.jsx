import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db, ensureAnonAuth, now } from '../firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'

const sampleQuiz = {
  title: 'Modelo agroexportador (AR, 1870–1930)',
  questions: [
    {
      text: '¿En qué período histórico se consolidó el modelo agroexportador?',
      options: ['1810-1850','1870-1930','1940-1970','1820-1910'],
      correctIndex: 1,
      timeLimitSec: 20
    },
    {
      text: '¿Qué producto se convirtió en el principal de exportación de Argentina?',
      options: ['Oro','Carne y cereales','Vino','Azúcar'],
      correctIndex: 1,
      timeLimitSec: 20
    },
    {
      text: '¿Qué país fue el principal inversor extranjero en Argentina durante este modelo?',
      options: ['Francia','Gran Bretaña','Estados Unidos','Alemania'],
      correctIndex: 1,
      timeLimitSec: 20
    },
    {
      text: '¿Qué región argentina fue la más favorecida?',
      options: ['Noroeste','Noreste','Pampa Húmeda','La Patagonia'],
      correctIndex: 2,
      timeLimitSec: 15
    },
    {
      text: '¿Qué acontecimiento internacional puso en crisis el modelo agroexportador?',
      options: ['La Segunda Guerra Mundial','La crisis de 1930','La Primera Guerra Mundial','La Revolución Industrial'],
      correctIndex: 1,
      timeLimitSec: 20
    },
    {
      text: '¿Qué grupo social concentraba la tierra y el poder político en Argentina?',
      options: ['Clase obrera','Oligarquía terrateniente','Campesinos indígenas','Inmigrantes y trabajadores urbanos'],
      correctIndex: 1,
      timeLimitSec: 20
    },
    {
      text: '¿Cuál de las siguientes fue una consecuencia problemática del modelo agroexportador argentino entre 1870 y 1930?',
      options: [
        'Aumento generalizado del acceso a la propiedad rural para inmigrantes',
        'Igual distribución de la riqueza y del poder político',
        'Diversificación industrial en todo el país',
        'Concentración de la tierra y desplazamiento de pequeños productores'
      ],
      correctIndex: 3,
      timeLimitSec: 25
    }
  ]
}

function code6(){ return Math.random().toString().slice(2,8) }

export default function Lobby(){
  const [roomCode, setRoomCode] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const nav = useNavigate()

  useEffect(() => { ensureAnonAuth() }, [])

  // src/pages/Lobby.js
  async function createRoom(){
    setCreating(true)
    try{
      // 🔐 Asegura usuario anónimo antes de escribir
      const u = await ensureAnonAuth()

      const id = code6()
      const ref = doc(db, 'rooms', id)
      await setDoc(ref, {
        hostId: u.uid,
        createdAt: now(),
        state: 'lobby',
        currentQuestionIndex: -1,
        questionStart: null,
        quiz: sampleQuiz
      })
      nav(`/host/${id}`)
    } finally {
      setCreating(false)
    }
  }

  async function joinRoom(){
    if(!roomCode) return
    const ref = doc(db, 'rooms', roomCode)
    const snap = await getDoc(ref)
    if(!snap.exists()){
      alert('Sala no encontrada')
      return
    }
    nav(`/play/${roomCode}?name=${encodeURIComponent(name || 'Jugador')}`)
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
            <input className="input" placeholder="p. ej. 123456" value={roomCode} onChange={e => setRoomCode(e.target.value.trim())} />
          </div>
          <div>
            <label className="small">Tu nombre</label>
            <input className="input" placeholder="Nombre visible" value={name} onChange={e => setName(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{marginTop:12}}>
          <button className="btn secondary" onClick={joinRoom}>Unirme</button>
          {roomCode && <span className="small">Link directo: <code>{shareUrl}</code></span>}
        </div>
      </div>
    </div>
  )
}
