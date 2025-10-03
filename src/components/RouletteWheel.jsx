import { useMemo, useRef, useState } from "react";
import "./RouletteWheel.css";

/**
 * Ruleta de materias
 * - subjects: string[]
 * - fixedResult: string | null (si existe, siempre cae ahí)
 * - onFinish: (materia) => void
 * - size: number (px)
 * - compact: boolean (si true, NO reserva altura extra para puntero/nota)
 */
export default function RouletteWheel({
  subjects = ["Geografía", "Historia", "Matemática", "Lengua", "Inglés", "Biología"],
  fixedResult = "Geografía",
  onFinish = () => {},
  size = 300,
  compact = false,
}) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const wheelRef = useRef(null);

  const data = useMemo(() => {
    const unique = subjects.length ? subjects : ["Geografía"];
    const n = unique.length;
    const slice = 360 / n;
    const colors = ["#ef4444","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899","#22c55e","#06b6d4","#f97316","#eab308"];

    const items = unique.map((label, i) => {
      const start = i * slice;
      const end = (i + 1) * slice;
      return { label, start, end, mid: start + slice / 2, fill: colors[i % colors.length] };
    });

    const targetIndex = Math.max(
      0,
      items.findIndex((s) => s.label.toLowerCase() === String(fixedResult || "").toLowerCase())
    );

    return { items, slice, targetIndex };
  }, [subjects, fixedResult]);

  const polar = (r, deg) => {
    const rad = (Math.PI / 180) * (deg - 90);
    return [r * Math.cos(rad), r * Math.sin(rad)];
  };
  const arcPath = (r, a0, a1) => {
    const [x0, y0] = polar(r, a0);
    const [x1, y1] = polar(r, a1);
    const largeArc = a1 - a0 <= 180 ? 0 : 1;
    return `M0,0 L${x0},${y0} A${r},${r} 0 ${largeArc} 1 ${x1},${y1} Z`;
  };

  const spin = () => {
    if (spinning) return;
    setSpinning(true);

    const turns = 6 + Math.floor(Math.random() * 3);
    const target = data.items[data.targetIndex];
    const jitter = (Math.random() - 0.5) * (data.slice * 0.6);
    const finalDeg = 360 * turns + (90 - target.mid + jitter);

    setRotation((prev) => prev + finalDeg);

    const DURATION_MS = 2600;
    window.setTimeout(() => {
      setSpinning(false);
      onFinish?.(target.label);
    }, DURATION_MS + 60);
  };

  const R = size / 2;

  return (
    <div
      className={`rw-wrap ${compact ? "rw-compact" : ""}`}
      style={{ width: size, height: size }}
    >
      {/* Puntero superpuesto sin reservar altura extra */}
      <div className="rw-pointer rw-overlay" title="Puntero" />

      <div
        className={`rw-wheel ${spinning ? "spinning" : ""}`}
        style={{ width: size, height: size, transform: `rotate(${rotation}deg)` }}
        ref={wheelRef}
        onClick={spin}
      >
        <svg viewBox={[-R, -R, size, size].join(" ")} width={size} height={size} style={{ display: "block" }}>
          {data.items.map((s, i) => (
            <path key={i} d={arcPath(R, s.start, s.end)} fill={s.fill} stroke="#222" strokeWidth="1" />
          ))}
          {data.items.map((s, i) => {
            const labelRadius = R * 0.62;
            const [tx, ty] = polar(labelRadius, s.mid);
            return (
              <g key={`t-${i}`} transform={`translate(${tx}, ${ty}) rotate(${s.mid})`}>
                <text
                  transform="rotate(90)"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontSize={Math.max(12, Math.min(16, R * 0.09))}
                  fill="#fff"
                  fontWeight={700}
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,.35)", strokeWidth: 2 }}
                >
                  {s.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Nota y botón internos ocultables desde fuera; no los renderizo en modo compact */}
      {!compact && (
        <>
          <button className="btn" onClick={spin} disabled={spinning} style={{ marginTop: 10 }}>
            {spinning ? "Girando..." : "Girar"}
          </button>
          <div className="small" style={{ marginTop: 6, opacity: 0.8 }}>
            {/* Mensaje opcional (lo ocultamos desde el padre) */}
          </div>
        </>
      )}
    </div>
  );
}
