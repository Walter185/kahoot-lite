import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db, ensureAnonAuth, now } from '../firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'

const sampleQuiz = {
  title: 'Demo',
  questions: [
    { text: '¿Capital de Uruguay?', options: ['Montevideo','Salto','Paysandú','Colonia'], correctIndex: 0, timeLimitSec: 20 },
    { text: '2 + 2 =', options: ['3','4','22','5'], correctIndex: 1, timeLimitSec: 10 },
    { text: '¿Color de la bandera de Argentina?', options: ['Rojo','Celeste y blanco','Verde','Negro'], correctIndex: 1, timeLimitSec: 15 },
  ]
}

function code6(){ return Math.random().toString().slice(2,8) }

export default function Lobby(){
  const [roomCode, setRoomCode] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const nav = useNavigate()

  useEffect(() => { ensureAnonAuth() }, [])

  async function createRoom(){
    setCreating(true)
    const u = auth.currentUser
    const id = code6()
    const ref = doc(db, 'rooms', id)
    await setDoc(ref, {
      hostId: u.uid,
      createdAt: now(),
      state: 'lobby',
      currentQuestionIndex: -1,
      questionStart: null,
      quiz: sampleQuiz,
    })
    setCreating(false)
    nav(`/host/${id}`)
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
        <p className="small">Se genera una sala con un quiz de ejemplo. Luego podés avanzar pregunta por pregunta.</p>
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
