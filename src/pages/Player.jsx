import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { auth, db, ensureAnonAuth } from '../firebase'
import {
  doc, onSnapshot, setDoc, serverTimestamp, updateDoc, getDoc
} from 'firebase/firestore'
import QuestionCard from '../components/QuestionCard'

function useQuery(){
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export default function Player(){
  const { roomId } = useParams()
  const qparams = useQuery()
  const [room, setRoom] = useState(null)
  const [selected, setSelected] = useState(null)
  const [lock, setLock] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const questionStartMs = useRef(null)
  const nav = useNavigate()

  useEffect(() => {
    ensureAnonAuth().then(initPlayer).catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function initPlayer(u){
    const name = qparams.get('name') || 'Jugador'
    const meRef = doc(db,'rooms',roomId,'players', u.uid)

    const exists = await getDoc(meRef)
    if(!exists.exists()){
      await setDoc(meRef, { name, score:0, joinedAt: serverTimestamp(), answers: {} })
    }

    const roomRef = doc(db,'rooms',roomId)
    const unsubRoom = onSnapshot(roomRef, s => {
      const r = { id:s.id, ...s.data() }
      setRoom(r)

      if(r.state === 'question' && r.questionStart?.toMillis){
        questionStartMs.current = r.questionStart.toMillis()
        setSelected(null)
        setLock(false)
      }

      if(r.state === 'ended'){
        alert('¡Partida terminada!')
        nav('/')
      }
    })
    return () => unsubRoom()
  }

  async function sendAnswer(index){
    if(lock || !room || room.state !== 'question' || room.paused) return
    const qIdx = room.currentQuestionIndex
    if(qIdx == null || qIdx < 0) return
    const nowMs = Date.now()
    const start = questionStartMs.current || nowMs

    // Descontar pausas del tiempo tomado
    const pausedSoFar = (room.pausedAccumMs || 0) +
      (room.paused && room.pauseStart?.toMillis ? (Date.now() - room.pauseStart.toMillis()) : 0)
    const effectiveNow = nowMs + pausedSoFar
    const timeTakenMs = Math.max(0, effectiveNow - start)

    setSelected(index)
    setLock(true)

    await updateDoc(doc(db,'rooms',roomId,'players', auth.currentUser.uid), {
      [`answers.${qIdx}`]: { index, timeTakenMs, at: serverTimestamp() }
    })
  }

  const q = room?.quiz?.questions?.[room?.currentQuestionIndex ?? -1]
  const reveal = room?.state === 'reveal'

  // ⏱️ Cuenta regresiva con soporte de pausa
  useEffect(() => {
    if (!room || room.state !== 'question' || !q || !room.questionStart?.toMillis) {
      setRemaining(null)
      return
    }
    const start = room.questionStart.toMillis()
    const baseDeadline = start + q.timeLimitSec * 1000

    const tick = () => {
      const pausedSoFar = (room.pausedAccumMs || 0) +
        (room.paused && room.pauseStart?.toMillis ? (Date.now() - room.pauseStart.toMillis()) : 0)
      const deadline = baseDeadline + pausedSoFar
      const secs = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(secs)
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [room?.state, room?.questionStart?.seconds, room?.paused, room?.pauseStart?.seconds, room?.pausedAccumMs, q?.timeLimitSec])

  if(!room) return <div className="card">Conectando...</div>

  return (
    <div className="grid">
      <div className="card">
        <div className="row" style={{justifyContent:'space-between'}}>
          <h1>Sala {room.id}</h1>
          <span className="badge">
            {room.state === 'question'
              ? (room.paused ? 'Pausado' : `${remaining ?? q?.timeLimitSec ?? 0}s`)
              : room.state}
          </span>
        </div>
        {room.state === 'lobby' && <p className="small">Esperando a que el anfitrión inicie…</p>}
        {room.state === 'question' && room.paused && <p className="small">El juego está pausado.</p>}
      </div>

      {(room.state === 'question' || room.state === 'reveal') && q && (
        <QuestionCard
          q={q}
          selected={selected}
          onSelect={sendAnswer}
          disabled={lock || reveal || room.paused}
          reveal={reveal}
          countdownSec={remaining}
        />
      )}
    </div>
  )
}
