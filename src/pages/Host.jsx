import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { auth, db, ensureAnonAuth, now } from '../firebase'
import { doc, onSnapshot, updateDoc, collection, query, orderBy, getDocs, writeBatch } from 'firebase/firestore'
import QuestionCard from '../components/QuestionCard'

export default function Host(){
  const { roomId } = useParams()
  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const nav = useNavigate()

  useEffect(() => { ensureAnonAuth() }, [])

  useEffect(() => {
    const ref = doc(db, 'rooms', roomId)
    const unsubRoom = onSnapshot(ref, s => setRoom({ id:s.id, ...s.data() }))
    const unsubPlayers = onSnapshot(query(collection(db,'rooms',roomId,'players'), orderBy('joinedAt','asc')),
      snap => setPlayers(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    )
    return () => { unsubRoom(); unsubPlayers() }
  }, [roomId])

  const meIsHost = room && auth.currentUser && room.hostId === auth.currentUser.uid
  const q = room?.quiz?.questions?.[room?.currentQuestionIndex ?? -1]
  const totalQ = room?.quiz?.questions?.length ?? 0

  async function startGame(){
    if(!meIsHost) return
    await updateDoc(doc(db,'rooms',roomId), { state:'question', currentQuestionIndex:0, questionStart: now() })
  }

  async function reveal(){
    if(!meIsHost) return
    const qIdx = room.currentQuestionIndex
    const qData = room.quiz.questions[qIdx]
    const batch = writeBatch(db)
    const snap = await getDocs(collection(db,'rooms',roomId,'players'))
    snap.forEach(docSnap => {
      const p = docSnap.data()
      const ans = p.answers?.[qIdx]
      if(ans && !ans.scored){
        const correct = ans.index === qData.correctIndex
        const timeMs = Math.max(0, Math.min((qData.timeLimitSec*1000), ans.timeTakenMs || qData.timeLimitSec*1000))
        const base = correct ? Math.round(1000 * (1 - (timeMs/(qData.timeLimitSec*1000)))) : 0
        const gained = Math.max(0, base)
        const newScore = (p.score || 0) + gained
        batch.update(docSnap.ref, { score:newScore, [`answers.${qIdx}.scored`]: true, [`answers.${qIdx}.correct`]: correct })
      }
    })
    await batch.commit()
    await updateDoc(doc(db,'rooms',roomId), { state:'reveal' })
  }

  async function nextQuestion(){
    if(!meIsHost) return
    const next = room.currentQuestionIndex + 1
    if(next >= totalQ){
      await updateDoc(doc(db,'rooms',roomId), { state:'ended' })
    } else {
      await updateDoc(doc(db,'rooms',roomId), { state:'question', currentQuestionIndex: next, questionStart: now() })
    }
  }

  if(!room) return <div className="card">Cargando sala...</div>
  if(!meIsHost) return <div className="card">
    <h2>No sos el anfitrión</h2>
    <p className="small">Ingresaste como <code>{auth.currentUser?.uid}</code>. Solo el anfitrión puede controlar la partida.</p>
  </div>

  return (
    <div className="grid">
      <div className="card">
        <div className="row" style={{justifyContent:'space-between'}}>
          <h1>Sala {room.id}</h1>
          <span className="badge">{room.state}</span>
        </div>
        <p className="small">Jugadores conectados: {players.length}</p>
        {room.state === 'lobby' && <button className="btn" onClick={startGame}>Iniciar</button>}
        {room.state === 'question' && <button className="btn" onClick={reveal}>Revelar respuesta</button>}
        {(room.state === 'reveal') && <button className="btn" onClick={nextQuestion}>Siguiente</button>}
        {(room.state === 'ended') && <button className="btn secondary" onClick={() => nav('/')}>Volver al inicio</button>}
      </div>

      {(room.state === 'question' || room.state === 'reveal') && q && (
        <QuestionCard q={q} selected={null} onSelect={()=>{}} disabled reveal={room.state==='reveal'} />
      )}

      <div className="card">
        <h2>Tabla de posiciones</h2>
        <table className="leaderboard">
          <thead><tr><th>Jugador</th><th>Puntos</th></tr></thead>
          <tbody>
            {[...players].sort((a,b)=>(b.score||0)-(a.score||0)).map(p => (
              <tr key={p.id}><td>{p.name||'Jugador'}</td><td>{p.score||0}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
