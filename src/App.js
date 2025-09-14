import { Routes, Route, Link } from 'react-router-dom'
import Lobby from './pages/Lobby'
import Host from './pages/Host'
import Player from './pages/Player'

export default function App(){
  return (
    <div className="container">
      <header className="row" style={{justifyContent:'space-between', marginBottom:18}}>
        <Link to="/" style={{fontWeight:800, letterSpacing:.5}}>Geografía</Link>
        <div className="small">Pelle 2°4ta TM</div>
      </header>
      <Routes>
        <Route path="/" element={<Lobby/>} />
        <Route path="/host/:roomId" element={<Host/>} />
        <Route path="/play/:roomId" element={<Player/>} />
      </Routes>
    </div>
  )
}
