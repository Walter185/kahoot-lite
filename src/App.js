import { Routes, Route, Link } from 'react-router-dom'
import Lobby from './pages/Lobby'
import Host from './pages/Host'
import Player from './pages/Player'
import CreateRoom from './pages/CreateRoom'

export default function App(){
  return (
    <div className="container">
      {/* Header antiguo removido para dar lugar a headers locales mobile-first */}
      <Routes>
        <Route path="/" element={<Lobby/>} />
        <Route path="/create" element={<CreateRoom/>} />
        <Route path="/host/:roomId" element={<Host/>} />
        <Route path="/play/:roomId" element={<Player/>} />
      </Routes>
    </div>
  )
}
