import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { auth, db, ensureAnonAuth, now } from '../firebase'
import {
  doc, onSnapshot, updateDoc, collection, query, orderBy,
  getDocs, writeBatch
} from 'firebase/firestore'
import QuestionCard from '../components/QuestionCard'
import WinnerCelebration from '../components/WinnerCelebration'

export default function Host() {
  const { roomId } = useParams()
  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [remaining, setRemaining] = useState(null)
  const [autoRevealedAtIndex, setAutoRevealedAtIndex] = useState(-1)
  const nav = useNavigate()

  // Asegura sesión anónima
  useEffect(() => { ensureAnonAuth() }, [])

  // Suscripciones a sala y jugadores
  useEffect(() => {
    const ref = doc(db, 'rooms', roomId)
    const unsubRoom = onSnapshot(ref, s => setRoom({ id: s.id, ...s.data() }))
    const unsubPlayers = onSnapshot(
      query(collection(db, 'rooms', roomId, 'players'), orderBy('joinedAt', 'asc')),
      snap => setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return () => { unsubRoom(); unsubPlayers() }
  }, [roomId])

  const meIsHost = room && auth.currentUser && room.hostId === auth.currentUser.uid
  const q = room?.quiz?.questions?.[room?.currentQuestionIndex ?? -1]
  const totalQ = room?.quiz?.questions?.length ?? 0

  async function startGame() {
    if (!meIsHost) return
    await updateDoc(doc(db, 'rooms', roomId), {
      state: 'question', currentQuestionIndex: 0, questionStart: now(),
      paused: false, pauseStart: null, pausedAccumMs: 0
    })
    setAutoRevealedAtIndex(-1)
  }

  async function reveal() {
    if (!meIsHost || !room) return
    const qIdx = room.currentQuestionIndex
    const qData = room.quiz.questions[qIdx]
    const batch = writeBatch(db)
    const snap = await getDocs(collection(db, 'rooms', roomId, 'players'))
    snap.forEach(docSnap => {
      const p = docSnap.data()
      const ans = p.answers?.[qIdx]
      if (ans && !ans.scored) {
        const limitMs = qData.timeLimitSec * 1000
        const timeMs = Math.max(0, Math.min(limitMs, ans.timeTakenMs || limitMs))
        const correct = ans.index === qData.correctIndex
        const base = correct ? Math.round(1000 * (1 - (timeMs / limitMs))) : 0
        const gained = Math.max(0, base)
        const newScore = (p.score || 0) + gained
        batch.update(docSnap.ref, {
          score: newScore,
          [`answers.${qIdx}.scored`]: true,
          [`answers.${qIdx}.correct`]: correct
        })
      }
    })
    await batch.commit()
    await updateDoc(doc(db, 'rooms', roomId), { state: 'reveal' })
  }

  async function nextQuestion() {
    if (!meIsHost || !room) return
    const next = room.currentQuestionIndex + 1
    if (next >= totalQ) {
      await updateDoc(doc(db, 'rooms', roomId), { state: 'ended' })
    } else {
      await updateDoc(doc(db, 'rooms', roomId), {
        state: 'question', currentQuestionIndex: next, questionStart: now(),
        paused: false, pauseStart: null, pausedAccumMs: 0
      })
      setAutoRevealedAtIndex(-1)
    }
  }

  // Pausar / Reanudar
  async function togglePause() {
    if (!meIsHost || !room || room.state !== 'question') return
    if (!room.paused) {
      // Entrar en pausa
      await updateDoc(doc(db, 'rooms', roomId), { paused: true, pauseStart: now() })
    } else {
      // Salir de pausa: sumamos al acumulado la diferencia (cliente)
      const pauseStartMs = room.pauseStart?.toMillis ? room.pauseStart.toMillis() : Date.now()
      const delta = Math.max(0, Date.now() - pauseStartMs)
      await updateDoc(doc(db, 'rooms', roomId), {
        paused: false, pauseStart: null, pausedAccumMs: (room.pausedAccumMs || 0) + delta
      })
    }
  }

  // ⏱️ Cuenta regresiva con soporte de pausa
  useEffect(() => {
    if (!meIsHost || !room || room.state !== 'question' || !q || !room.questionStart?.toMillis) {
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
      if (secs === 0 && autoRevealedAtIndex !== room.currentQuestionIndex) {
        setAutoRevealedAtIndex(room.currentQuestionIndex)
        reveal().catch(console.error)
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meIsHost, room?.state, room?.currentQuestionIndex, room?.questionStart?.seconds, room?.paused, room?.pauseStart?.seconds, room?.pausedAccumMs, q?.timeLimitSec])

  // Auto-next 3.5s después del reveal
  useEffect(() => {
    if (!meIsHost || !room || room.state !== 'reveal') return
    const t = setTimeout(() => { nextQuestion().catch(console.error) }, 3500)
    return () => clearTimeout(t)
  }, [meIsHost, room?.state]) // eslint-disable-line

  if (!room) return <div className="card">Cargando sala...</div>
  if (!meIsHost) return (
    <div className="card">
      <h2>No sos el anfitrión</h2>
      <p className="small">Ingresaste como <code>{auth.currentUser?.uid}</code>. Solo el anfitrión puede controlar la partida.</p>
    </div>
  )

  return (
    <div className="grid">
      {/* Celebración al finalizar o al pausar */}
      {(() => {
        const top = [...players].sort((a, b) => (b.score || 0) - (a.score || 0))[0]
        if (!top) return null
        if (room.state === 'ended') {
          return <WinnerCelebration name={top.name || 'Ganador/a'} subtitle="¡Ganó la partida!" durationMs={4000} />
        }
        if (room.state === 'question' && room.paused) {
          return <WinnerCelebration name={top.name || 'Líder'} subtitle="Líder momentáneo" durationMs={1800} />
        }
        return null
      })()}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Sala {room.code || room.id}</h1>
          <span className="badge">
            {room.state === 'question' && typeof remaining === 'number'
              ? (room.paused ? `Pausado` : `${remaining}s`)
              : room.state}
          </span>
        </div>
        <p className="small">Jugadores conectados: {players.length}</p>

        {room.state === 'lobby' && <button className="btn" onClick={startGame}>Iniciar</button>}

        {room.state === 'question' && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={reveal}>Revelar ahora</button>
            <button className="btn secondary" onClick={togglePause}>
              {room.paused ? 'REANUDAR' : 'PARAR JUEGO'}
            </button>
          </div>
        )}

        {room.state === 'reveal' && <button className="btn" onClick={nextQuestion}>Siguiente</button>}
        {room.state === 'ended' && <button className="btn secondary" onClick={() => nav('/')}>Volver al inicio</button>}
      </div>

      {(room.state === 'question' || room.state === 'reveal') && q && (
        <QuestionCard q={q} selected={null} onSelect={() => { }} disabled reveal={room.state === 'reveal'} countdownSec={remaining} />
      )}

      <div className="card">
        <h2>Tabla de posiciones</h2>
        <table className="leaderboard">
          <thead><tr><th>Jugador</th><th>Puntos</th></tr></thead>
          <tbody>
            {[...players].sort((a, b) => (b.score || 0) - (a.score || 0)).map(p => (
              <tr key={p.id}><td>{p.name || 'Jugador'}</td><td>{p.score || 0}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
