import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { auth, db, ensureAnonAuth } from '../firebase'
import {
  doc, onSnapshot, setDoc, serverTimestamp, updateDoc, getDoc, collection
} from 'firebase/firestore'
import QuestionCard from '../components/QuestionCard'
import WinnerCelebration from '../components/WinnerCelebration'

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
  const [showEndCelebration, setShowEndCelebration] = useState(false)
  const [showPauseCelebration, setShowPauseCelebration] = useState(false)
  const [playerCount, setPlayerCount] = useState(0) // 👈 inscritos
  const questionStartMs = useRef(null)
  const nav = useNavigate()

  // 1) Asegurar auth anónimo y crear (si no existe) mi doc de jugador
  useEffect(() => {
    (async () => {
      try{
        const u = await ensureAnonAuth()
        const name = qparams.get('name') || 'Jugador'
        const meRef = doc(db,'rooms',roomId,'players', u.uid)
        const exists = await getDoc(meRef)
        if(!exists.exists()){
          await setDoc(meRef, { name, score:0, joinedAt: serverTimestamp(), answers: {} })
        }
      } catch(err){ console.error(err) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // 2) Suscripción al documento de la sala
  useEffect(() => {
    const roomRef = doc(db,'rooms',roomId)
    const unsub = onSnapshot(roomRef, s => {
      const r = { id:s.id, ...s.data() }
      setRoom(r)

      if(r.state === 'question' && r.questionStart?.toMillis){
        questionStartMs.current = r.questionStart.toMillis()
        setSelected(null)
        setLock(false)
      }

      // 🎉 mostrar celebración al finalizar (para todos)
      if(r.state === 'ended' && r.winner){
        setShowEndCelebration(true)
        const t = setTimeout(() => setShowEndCelebration(false), 4500)
        return () => clearTimeout(t)
      }
    })
    return () => unsub()
  }, [roomId])

  // 3) Suscripción al conteo de jugadores (inscritos)
  useEffect(() => {
    const playersRef = collection(db,'rooms',roomId,'players')
    const unsub = onSnapshot(playersRef, snap => setPlayerCount(snap.size))
    return () => unsub()
  }, [roomId])

  // 4) Celebración de "Líder momentáneo" cuando el host pausa
  useEffect(() => {
    if (room?.state === 'question' && room?.paused && room?.leader) {
      setShowPauseCelebration(true)
      const t = setTimeout(() => setShowPauseCelebration(false), 1800)
      return () => clearTimeout(t)
    }
  }, [room?.paused, room?.leader?.id, room?.state])

  async function sendAnswer(index){
    if(lock || !room || room.state !== 'question' || room.paused) return
    const qIdx = room.currentQuestionIndex
    if(qIdx == null || qIdx < 0) return
    const nowMs = Date.now()
    const start = questionStartMs.current || nowMs

    // Descontar pausas del tiempo tomado
    const pausedSoFar = (room.pausedAccumMs || 0) +
      (room.paused && room.pauseStart?.toMillis ? (Date.now() - room.pauseStart.toMillis()) : 0)
    const timeTakenMs = Math.max(0, (nowMs - start) - pausedSoFar)

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
      {/* 🎉 Celebración de fin para todos los jugadores */}
      {showEndCelebration && room.winner && (
        <WinnerCelebration name={room.winner.name} subtitle="¡Ganó la partida!" />
      )}

      {/* 🎊 Lider momentáneo cuando el host pausa */}
      {showPauseCelebration && room?.leader && (
        <WinnerCelebration name={room.leader.name} subtitle="Líder momentáneo" durationMs={1600} />
      )}

      <div className="card">
        <div className="row" style={{justifyContent:'space-between'}}>
          <h1>Sala {room.code || room.id}</h1>
          <span className="badge">
            {room.state === 'question'
              ? (room.paused ? 'Pausado' : `${remaining ?? q?.timeLimitSec ?? 0}s`)
              : room.state}
          </span>
        </div>

        {room.state === 'lobby' && (
          <>
            <p className="small">Esperando a que el anfitrión inicie…</p>
            <p className="small">Inscritos: <strong>{playerCount}</strong></p>
          </>
        )}

        {room.state === 'question' && room.paused && (
          <p className="small">El juego está pausado.</p>
        )}

        {room.state === 'ended' && room.winner && (
          <p className="small" style={{marginTop:8}}>
            Ganador: <strong>{room.winner.name}</strong> ({room.winner.score || 0} pts)
          </p>
        )}
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
