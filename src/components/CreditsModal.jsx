export default function CreditsModal({ open, onClose }) {
  if (!open) return null;
  const handleOverlayClick = () => onClose?.();
  const stop = (e) => e.stopPropagation();

  const supportsDvh = typeof window !== 'undefined' && CSS?.supports?.('height','100dvh');
  const vhUnit = supportsDvh ? '100dvh' : '100svh';

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        overflow: 'auto',
        background: 'rgba(0,0,0,.35)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        zIndex: 9999,
        pointerEvents: 'auto',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(12px, env(safe-area-inset-left))',
        paddingRight: 'max(12px, env(safe-area-inset-right))',
        height: vhUnit,
      }}
    >
      <div
        className="card"
        onClick={stop}
        style={{
          width: 'min(560px, calc(100vw - 24px))',
          maxHeight: `calc(${vhUnit} - 24px)`,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          borderRadius: 16,
          padding: 16,
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          /* ⬇️ súbelo un poco (entre 6vh y 12vh según pantalla) */
          transform: 'translateY(clamp(-12vh, -8vh, -6vh))',
        }}
      >
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
        >
          <h2 style={{ margin: 0 }}>Información</h2>
          <button
            className="btn small secondary"
            onClick={onClose}
            style={{ width: 'auto', minHeight: 32, padding: '6px 12px' }}
          >
            Cerrar
          </button>
        </div>

        <div className="small" style={{ lineHeight: 1.5 }}>
          <strong>Integrantes del grupo:</strong><br />
          Nicolas Liendo<br />
          Juan Segundo Saborido<br />
          Lucia Inchausti<br />
          Lucia Toscano<br />
          Raffaella Massara<br />
          Lucero Barrio Nuevo<br />
          Nino Turri<br />
          Lautaro Dias Bazan
          <br /><br />
          <strong>Profesora:</strong> Jimena Gatica<br />
        </div>
      </div>
    </div>
  );
}
