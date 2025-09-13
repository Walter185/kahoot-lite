export default function QuestionCard({ q, selected, onSelect, disabled=false, reveal=false }){
  if(!q) return null
  return (
    <div className="card">
      <div className="row" style={{justifyContent:'space-between'}}>
        <h2 style={{maxWidth:'80%'}}>{q.text}</h2>
        <div className="badge">{q.timeLimitSec}s</div>
      </div>

      <div className="grid two">
        {q.options.map((opt, i) => {
          let cls = "option"
          if(reveal){
            cls += i === q.correctIndex ? " correct" : (selected===i ? " wrong" : "")
          } else if(selected===i){
            cls += " selected"
          }
          return (
            <div key={i} className={cls} onClick={() => !disabled && onSelect(i)}>
              {opt}
            </div>
          )
        })}
      </div>
    </div>
  )
}
