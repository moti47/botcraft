// Dashboard page

const Dashboard = ({ t, onOpenVideo }) => {
  const { kpis, videos, schedule, insights, perfBars } = window.MOCK;
  const maxBar = Math.max(...perfBars.map(b => b.value));

  return <div style={{padding:'28px 32px', display:'flex', flexDirection:'column', gap:24, position:'relative'}}>
    {/* Ambient blobs */}
    <div style={{position:'fixed', width:380, height:380, borderRadius:'50%', background:'#7C3AED', filter:'blur(120px)', opacity:0.18, top:60, right:'30%', pointerEvents:'none', zIndex:0}}/>
    <div style={{position:'fixed', width:340, height:340, borderRadius:'50%', background:'#06B6D4', filter:'blur(120px)', opacity:0.14, bottom:0, right:0, pointerEvents:'none', zIndex:0}}/>

    {/* KPIs */}
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, position:'relative', zIndex:1}}>
      {kpis.map((k,i) => <StatTile key={i} {...k}/>)}
    </div>

    {/* Recent videos + insights side by side */}
    <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, position:'relative', zIndex:1}}>
      <Card style={{padding:0, overflow:'hidden'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)'}}>
          <h3 style={{margin:0, fontFamily:'var(--font-display)', fontSize:18, fontWeight:600}}>{t.recentVideos}</h3>
          <button style={{background:'none', border:'none', color:'var(--primary-glow)', fontFamily:'var(--font-body)', fontSize:12, fontWeight:500, cursor:'pointer'}}>{t.viewAll} →</button>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, padding:18}}>
          {videos.slice(0,6).map(v => (
            <div key={v.id} onClick={() => onOpenVideo(v)} style={{cursor:'pointer'}}>
              <div style={{
                width:'100%', aspectRatio:'16/10', borderRadius:10, background:v.thumb,
                position:'relative', overflow:'hidden', marginBottom:8
              }}>
                <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,transparent 50%, rgba(0,0,0,0.6))'}}/>
                <div style={{position:'absolute',top:8,left:8}}>
                  <Badge tone={v.status==='posted'?'success':v.status==='rendering'?'warning':v.status==='failed'?'danger':v.status==='ready'?'info':'neutral'} pulse={v.status==='rendering'}>{v.status}</Badge>
                </div>
                <div style={{position:'absolute',bottom:8,right:8,fontFamily:'var(--font-mono)',fontSize:11,color:'#fff',fontWeight:500}}>{v.views !== '—' ? `${v.views} views` : ''}</div>
              </div>
              <div style={{fontSize:13, fontWeight:500, color:'var(--text)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{v.title}</div>
              <div style={{fontSize:11, color:'var(--text-dim)', display:'flex', alignItems:'center', gap:6}}>
                <span>{v.avatar}</span><span>·</span><span>{v.created}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:14}}>
          <Icon name="sparkles" size={18} color="#A78BFA"/>
          <h3 style={{margin:0, fontFamily:'var(--font-display)', fontSize:16, fontWeight:600}}>{t.insights}</h3>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          {insights.map((ins, i) => (
            <div key={i} style={{padding:'12px 14px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10}}>
              <div style={{fontSize:13, lineHeight:1.45, color:'var(--text)', marginBottom:8}}>{ins.text}</div>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)'}}>{ins.confidence}% confidence</span>
                <div style={{flex:1, height:3, background:'var(--surface-3)', borderRadius:99, margin:'0 8px', overflow:'hidden'}}>
                  <div style={{width:`${ins.confidence}%`, height:'100%', background:'var(--brand-gradient)'}}/>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>

    {/* Schedule + perf */}
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, position:'relative', zIndex:1}}>
      <Card>
        <h3 style={{margin:'0 0 16px', fontFamily:'var(--font-display)', fontSize:16, fontWeight:600}}>{t.todaySchedule}</h3>
        <div style={{display:'flex', flexDirection:'column'}}>
          {schedule.map((s, i) => (
            <div key={i} style={{display:'flex', alignItems:'center', gap:14, padding:'10px 0', borderBottom:i<schedule.length-1?'1px solid var(--border)':'none'}}>
              <div style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-muted)', width:48}}>{s.time}</div>
              <div style={{
                width:8, height:8, borderRadius:99,
                background: s.kind==='post' ? '#A78BFA' : '#67E8F9',
                boxShadow: `0 0 8px ${s.kind==='post' ? 'rgba(167,139,250,0.6)' : 'rgba(103,232,249,0.6)'}`
              }}/>
              <div style={{flex:1, fontSize:13}}>
                <div style={{color:'var(--text)', fontWeight:500}}>{s.avatar}</div>
                <div style={{color:'var(--text-dim)', fontSize:11}}>{s.type} · {s.platform}</div>
              </div>
              <Badge tone="neutral">{s.kind}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 style={{margin:'0 0 16px', fontFamily:'var(--font-display)', fontSize:16, fontWeight:600}}>{t.avatarPerf}</h3>
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          {perfBars.map((b, i) => (
            <div key={i}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:5}}>
                <span style={{fontSize:13, color:'var(--text)'}}>{b.name}</span>
                <span style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-muted)'}}>{b.value}K</span>
              </div>
              <div style={{height:8, background:'var(--surface-2)', borderRadius:99, overflow:'hidden'}}>
                <div style={{
                  width:`${(b.value/maxBar)*100}%`, height:'100%',
                  background:'var(--brand-gradient)',
                  boxShadow:'0 0 12px rgba(124,58,237,0.4)'
                }}/>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </div>;
};

window.Dashboard = Dashboard;
