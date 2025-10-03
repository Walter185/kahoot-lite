// src/pages/Player.jsx
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

function cdClass(remaining, total){
  if (remaining == null || total == null) return 'badge'
  const r = Number(remaining)
  if (r <= 3) return 'badge cd cd-red cd-blink'
  const pct = r / total
  if (pct <= 0.25) return 'badge cd cd-red cd-pulse'
  if (pct <= 0.5)  return 'badge cd cd-yellow cd-pulse'
  return 'badge cd cd-green'
}

export default function Player(){
  const { roomId } = useParams()
  const qparams = useQuery()
  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [playerCount, setPlayerCount] = useState(0)
  const [selected, setSelected] = useState(null)
  const [lock, setLock] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [showEndCelebration, setShowEndCelebration] = useState(false)
  const [showPauseCelebration, setShowPauseCelebration] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const questionStartMs = useRef(null)
  const nav = useNavigate()

  // Auth anónimo + crear doc si no existe
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
  }, [roomId])

  // Sala (estado general)
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

      if(r.state === 'ended' && r.winner){
        setShowEndCelebration(true)
        const t = setTimeout(() => setShowEndCelebration(false), 4500)
        return () => clearTimeout(t)
      }
    })
    return () => unsub()
  }, [roomId])

  // Ranking en vivo
  useEffect(() => {
    const qPlayers = query(collection(db,'rooms',roomId,'players'), orderBy('score','desc'))
    const unsub = onSnapshot(qPlayers, snap => {
      const arr = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      setPlayers(arr)
      setPlayerCount(snap.size)
    })
    return () => unsub()
  }, [roomId])

  // Celebración al pausar
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

  // Cuenta regresiva
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

  const topPlayer = players[0]
  const visibleLeader = room?.leader || (room?.paused ? (topPlayer && { name: topPlayer.name, score: topPlayer.score }) : null)
  const badgeCls = room?.state === 'question'
    ? (room.paused ? 'badge' : cdClass(remaining, totalTime))
    : 'badge'

  const correctList = (() => {
    if (!room || room.state !== 'reveal') return []
    const idx = room.currentQuestionIndex ?? -1
    if (idx < 0) return []
    const qCorrectIndex = room.quiz?.questions?.[idx]?.correctIndex
    return players.filter(p => {
      const a = p.answers?.[idx]
      if (!a) return false
      if (typeof a.correct === 'boolean') return a.correct
      return typeof qCorrectIndex === 'number' && a.index === qCorrectIndex
    }).map(p => ({ id: p.id, name: p.name || 'Jugador' }))
  })()

  return (
    <div className="player-wrap">
      <style>{`
        .player-wrap{
          position:fixed; inset:0;
          display:flex; flex-direction:column;
          background:#0b1220; color:#e5e7eb;
          overflow-y:auto;
          padding:8px;
        }
        .player-header{
          display:flex; align-items:center; justify-content:space-between;
          padding:6px 4px 10px;
        }
        .player-title{
          margin:0; font-size:1.2rem; font-weight:800; line-height:1;
        }
        .info-btn{
          width:28px; height:28px; display:grid; place-items:center;
          border-radius:8px; border:1px solid rgba(255,255,255,.12);
          background:rgba(255,255,255,.06); color:#e5e7eb;
          cursor:pointer; font-size:.85rem;
        }
        .card{ background:rgba(255,255,255,.06); border-radius:12px; padding:10px; margin-bottom:10px; }
        .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .leaderboard{ width:100%; border-collapse:collapse; }
        .leaderboard th, .leaderboard td{ padding:4px 8px; border-bottom:1px solid rgba(255,255,255,.1); text-align:left; }
      `}</style>

      {/* Header fijo Pelle + Info */}
      <header className="player-header">
        <h1 className="player-title">Pelle</h1>
        <button className="info-btn" onClick={()=>setShowInfo(true)}>ℹ️</button>
      </header>

      {/* 🎉 Fin */}
      {showEndCelebration && room.winner && (
        <WinnerCelebration name={room.winner.name} subtitle="¡Ganó la partida!" />
      )}

      {/* 🎊 Pausa */}
      {showPauseCelebration && room?.leader && (
        <WinnerCelebration name={room.leader.name} subtitle="Líder momentáneo" durationMs={1600} />
      )}

      {/* 🏅 Líder en pausa */}
      {room.state === 'question' && room.paused && visibleLeader && (
        <div className="card" style={{textAlign:'center'}}>
          <div className="cele-emoji" style={{fontSize:'1.6rem'}}>🎉</div>
          <div style={{fontWeight:800, fontSize:'1.25rem'}}>{visibleLeader.name}</div>
          <div className="small">Líder momentáneo {typeof visibleLeader.score === 'number' ? `• ${visibleLeader.score} pts` : ''}</div>
        </div>
      )}

      {/* 🎯 Lista de aciertos */}
      {room.state === 'reveal' && (
        <div className="card" style={{textAlign:'center'}}>
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
          <h2>Sala {room.code || room.id}</h2>
          <div className="row" style={{gap:8, alignItems:'center'}}>
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
            <p className="small">Esperando al anfitrión…</p>
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

      {/* Ranking */}
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

      <CreditsModal open={showInfo} onClose={()=>setShowInfo(false)} />
    </div>
  )
}
