import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { auth, db, ensureAnonAuth } from '../firebase'
import {
  doc, onSnapshot, setDoc, serverTimestamp, updateDoc, getDoc,
  collection, query, orderBy
} from 'firebase/firestore'
import QuestionCard from '../components/QuestionCard'
import WinnerCelebration from '../components/WinnerCelebration'
import CreditsModal from '../components/CreditsModal'

function useQuery(){
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

/** Clases para el badge del countdown según segundos restantes */
function cdClass(remaining, total){
  if (remaining == null || total == null) return 'badge'
  const r = Number(remaining)
  if (r <= 3) return 'badge cd cd-red cd-blink'        // < 3s: rojo intermitente
  const pct = r / total
  if (pct <= 0.25) return 'badge cd cd-red cd-pulse'    // 25%: rojo con pulso
  if (pct <= 0.5)  return 'badge cd cd-yellow cd-pulse' // 50%: amarillo con pulso
  return 'badge cd cd-green'                            // resto: verde
}

export default function Player(){
  const { roomId } = useParams()
  const qparams = useQuery()
  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])        // ranking en vivo
  const [playerCount, setPlayerCount] = useState(0) // inscritos
  const [selected, setSelected] = useState(null)
  const [lock, setLock] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [showEndCelebration, setShowEndCelebration] = useState(false)
  const [showPauseCelebration, setShowPauseCelebration] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const questionStartMs = useRef(null)
  const nav = useNavigate()

  // 1) Auth anónimo + crear mi doc si no existe
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

  // 2) Sala (estado general)
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

      // 🎉 Fin del juego: cartel para todos
      if(r.state === 'ended' && r.winner){
        setShowEndCelebration(true)
        const t = setTimeout(() => setShowEndCelebration(false), 4500)
        return () => clearTimeout(t)
      }
    })
    return () => unsub()
  }, [roomId])

  // 3) Ranking en vivo (y contador de inscritos)
  useEffect(() => {
    const qPlayers = query(collection(db,'rooms',roomId,'players'), orderBy('score','desc'))
    const unsub = onSnapshot(qPlayers, snap => {
      const arr = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      setPlayers(arr)
      setPlayerCount(snap.size)
    })
    return () => unsub()
  }, [roomId])

  // 4) Celebración corta al pausar
  useEffect(() => {
    if (room?.state === 'question' && room?.paused && room?.leader) {
      setShowPauseCelebration(true)
      const t = setTimeout(() => setShowPauseCelebration(false), 1600)
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
  const totalTime = q?.timeLimitSec ?? null
  const totalQ = room?.quiz?.questions?.length ?? 0
  const questionNumber = (room?.currentQuestionIndex ?? -1) + 1

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

  // Top 1 como fallback si por alguna razón no viniera "leader" en la pausa
  const topPlayer = players[0]
  const visibleLeader = room?.leader || (room?.paused ? (topPlayer && { name: topPlayer.name, score: topPlayer.score }) : null)

  // Clases dinámicas del badge (si está pausado, se ve neutro)
  const badgeCls = room?.state === 'question'
    ? (room.paused ? 'badge' : cdClass(remaining, totalTime))
    : 'badge'

  // 🎯 Lista de quienes acertaron la ronda actual (durante REVEAL)
  const correctList = (() => {
    if (!room || room.state !== 'reveal') return []
    const idx = room.currentQuestionIndex ?? -1
    if (idx < 0) return []
    const qCorrectIndex = room.quiz?.questions?.[idx]?.correctIndex
    return players.filter(p => {
      const a = p.answers?.[idx]
      if (!a) return false
      if (typeof a.correct === 'boolean') return a.correct
      // fallback si aún no se marcó .correct: comparar índice
      return typeof qCorrectIndex === 'number' && a.index === qCorrectIndex
    }).map(p => ({ id: p.id, name: p.name || 'Jugador' }))
  })()

  return (
    <div className="grid">
      {/* 🎉 Celebración de fin para todos los jugadores */}
      {showEndCelebration && room.winner && (
        <WinnerCelebration name={room.winner.name} subtitle="¡Ganó la partida!" />
      )}

      {/* 🎊 Mini celebración al pausar */}
      {showPauseCelebration && room?.leader && (
        <WinnerCelebration name={room.leader.name} subtitle="Líder momentáneo" durationMs={1600} />
      )}

      {/* 🏅 Cartel persistente de líder mientras está PAUSADO */}
      {room.state === 'question' && room.paused && visibleLeader && (
        <div className="card" style={{position:'sticky', top:8, zIndex:10, textAlign:'center'}}>
          <div className="cele-emoji" style={{fontSize:'1.6rem'}}>🎉</div>
          <div style={{fontWeight:800, fontSize:'1.25rem'}}>{visibleLeader.name}</div>
          <div className="small">Líder momentáneo {typeof visibleLeader.score === 'number' ? `• ${visibleLeader.score} pts` : ''}</div>
        </div>
      )}

      {/* 🎯 Lista de aciertos de la ronda (durante REVEAL) */}
      {room.state === 'reveal' && (
        <div className="card" style={{position:'sticky', top:8, zIndex:10, textAlign:'center'}}>
          <div className="cele-emoji" style={{fontSize:'1.6rem'}}>🎯</div>
          <div style={{fontWeight:800, fontSize:'1.15rem', marginBottom:6}}>
            {correctList.length ? '¡Acertaron!' : 'Nadie acertó esta 😅'}
          </div>
          {!!correctList.length && (
            <div className="row" style={{justifyContent:'center'}}>
              {correctList.map(p => (
                <span key={p.id} className="badge">{p.name}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
          <h1>Sala {room.code || room.id}</h1>
          <div className="row" style={{gap:8, alignItems:'center'}}>
            {/* Botón Info: solo cuando NO está en pregunta */}
            {room?.state !== 'question' && (
              <button className="btn small secondary" onClick={()=>setShowInfo(true)}>ℹ️ Info</button>
            )}
            {/* Progreso Pregunta X/Total */}
            {room.state !== 'lobby' && totalQ > 0 && questionNumber > 0 && (
              <span className="small" style={{opacity:0.8}}>
                Pregunta <strong>{questionNumber}/{totalQ}</strong>
              </span>
            )}
            <span className={badgeCls}>
              {room.state === 'question'
                ? (room.paused ? 'Pausado' : `${remaining ?? totalTime ?? 0}s`)
                : room.state}
            </span>
          </div>
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

      {/* 🏆 Ranking en vivo para todos los participantes */}
      <div className="card">
        <h2>Tabla de posiciones</h2>
        <table className="leaderboard">
          <thead><tr><th>Jugador</th><th>Puntos</th></tr></thead>
          <tbody>
            {[...players].map(p => (
              <tr key={p.id}>
                <td>{p.name || 'Jugador'}</td>
                <td>{p.score || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de créditos */}
      <CreditsModal open={showInfo} onClose={()=>setShowInfo(false)} />
    </div>
  )
}
