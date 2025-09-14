export default function CreditsModal({ open, onClose }){
  if(!open) return null

  // Cerrar al hacer click fuera de la tarjeta
  const handleOverlayClick = () => onClose?.();
  const stop = (e) => e.stopPropagation();

  return (
    <div
      className="cele-overlay"
      onClick={handleOverlayClick}
      style={{
        backdropFilter:'blur(2px)',
        // ⚠️ Esto asegura que el overlay reciba clicks aunque .cele-overlay tenga pointer-events:none en el CSS global
        pointerEvents:'auto',
        zIndex: 9999
      }}
    >
      <div className="card" style={{maxWidth:560}} onClick={stop}>
        <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
          <h2>Información</h2>
          <button className="btn small secondary" onClick={onClose}>Cerrar</button>
        </div>
        <div className="small" style={{lineHeight:1.5, marginTop:8}}>
          <strong>Integrantes del grupo:</strong><br/>
          Nicolas Liendo<br/>
          Juan Segundo Saborido<br/>
          Lucia Inchausti<br/>
          Lucia Toscano<br/>
          Raffaella Massara<br/>
          Lucero Barrio Nuevo<br/>
          Nino Turri<br/>
          Lautaro Dias Bazan
          <br/><br/>
          <strong>Profesora:</strong> Jimena Gatica<br/>
        </div>
      </div>
    </div>
  )
}
