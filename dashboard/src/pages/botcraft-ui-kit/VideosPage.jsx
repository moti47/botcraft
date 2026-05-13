// Videos page + Video modal

const VideosPage = ({ onOpenVideo }) => {
  const { videos } = window.MOCK;
  const [filter, setFilter] = React.useState('all');
  const filtered = filter==='all' ? videos : videos.filter(v => v.status === filter);

  return <div style={{padding:'28px 32px', position:'relative'}}>
    <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap'}}>
      <div style={{display:'flex', gap:4, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:3}}>
        {['all','queued','rendering','ready','posted','failed'].map(f => (
          <button key={f} onClick={()=>setFilter(f)} style={{
            padding:'6px 12px', border:'none', borderRadius:7, cursor:'pointer',
            background: filter===f ? 'var(--surface-3)' : 'transparent',
            color: filter===f ? 'var(--text)' : 'var(--text-muted)',
            fontFamily:'var(--font-body)', fontSize:12, fontWeight:500, textTransform:'capitalize'
          }}>{f}</button>
        ))}
      </div>
      <div style={{flex:1}}/>
      <Button variant="primary" icon="plus">Produce new</Button>
    </div>

    <Card style={{padding:0, overflow:'hidden'}}>
      <div style={{
        display:'grid', gridTemplateColumns:'80px 1fr 140px 120px 220px 100px 80px 60px',
        gap:12, padding:'12px 18px', borderBottom:'1px solid var(--border)',
        fontSize:10.5, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:500
      }}>
        <div></div><div>Topic</div><div>Avatar</div><div>Status</div><div>Pipeline</div><div>Platforms</div><div style={{textAlign:'right'}}>Views</div><div></div>
      </div>
      {filtered.map(v => (
        <div key={v.id} onClick={()=>onOpenVideo(v)} style={{
          display:'grid', gridTemplateColumns:'80px 1fr 140px 120px 220px 100px 80px 60px',
          gap:12, padding:'12px 18px', borderBottom:'1px solid var(--border)',
          alignItems:'center', cursor:'pointer', transition:'background 200ms'
        }}
          onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}
        >
          <div style={{width:64, aspectRatio:'16/10', borderRadius:6, background:v.thumb}}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:13, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{v.title}</div>
            <div style={{fontSize:11, color:'var(--text-dim)'}}>{v.created}</div>
          </div>
          <div style={{fontSize:13, color:'var(--text-muted)'}}>{v.avatar}</div>
          <Badge tone={v.status==='posted'?'success':v.status==='rendering'?'warning':v.status==='failed'?'danger':v.status==='ready'?'info':'neutral'} pulse={v.status==='rendering'}>{v.status}</Badge>
          <PipelineProgress step={v.step}/>
          <div style={{display:'flex', gap:6}}>{v.platforms.map(p => <PlatformGlyph key={p} p={p} size={14}/>)}</div>
          <div style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text)', textAlign:'right'}}>{v.views}</div>
          <Icon name="chevronRight" size={14} color="var(--text-dim)"/>
        </div>
      ))}
    </Card>
  </div>;
};

const VideoModal = ({ v, onClose }) => {
  const [tab, setTab] = React.useState('overview');
  if (!v) return null;
  return <div style={{
    position:'fixed', inset:0, background:'rgba(10,10,15,0.78)',
    backdropFilter:'blur(12px)', zIndex:60,
    display:'flex', alignItems:'center', justifyContent:'center', padding:24
  }} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{
      width:'min(960px,100%)', maxHeight:'90vh', overflow:'auto',
      background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20,
      boxShadow:'var(--shadow-xl)'
    }}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border)'}}>
        <div>
          <h2 style={{margin:0, fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, letterSpacing:'-0.02em'}}>{v.title}</h2>
          <div style={{fontSize:12, color:'var(--text-dim)', marginTop:4}}>{v.avatar} · {v.created}</div>
        </div>
        <button onClick={onClose} style={{background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, width:34, height:34, cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <Icon name="close" size={16}/>
        </button>
      </div>

      <div style={{padding:20}}>
        <div style={{
          width:'100%', aspectRatio:'16/9', borderRadius:14, background:v.thumb,
          position:'relative', overflow:'hidden', marginBottom:16
        }}>
          <div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 50% 50%, transparent, rgba(0,0,0,0.4))'}}/>
          <button style={{
            position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            width:64, height:64, borderRadius:99,
            background:'rgba(255,255,255,0.95)', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center'
          }}>
            <Icon name="play" size={26} color="#0A0A0F"/>
          </button>
        </div>

        <div style={{display:'flex', gap:4, borderBottom:'1px solid var(--border)', marginBottom:18}}>
          {['overview','script','insights','publish'].map(tb => (
            <button key={tb} onClick={()=>setTab(tb)} style={{
              padding:'10px 14px', border:'none', cursor:'pointer',
              background:'transparent', borderBottom:`2px solid ${tab===tb ? 'var(--primary-glow)' : 'transparent'}`,
              color: tab===tb ? 'var(--text)' : 'var(--text-muted)',
              fontFamily:'var(--font-body)', fontSize:13, fontWeight:500, textTransform:'capitalize',
              marginBottom:-1
            }}>{tb === 'insights' ? 'AI insights' : tb}</button>
          ))}
        </div>

        {tab==='overview' && <div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16}}>
            <div style={{background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:14}}>
              <div className="t-label">Status</div>
              <div style={{marginTop:8}}><Badge tone={v.status==='posted'?'success':'info'}>{v.status}</Badge></div>
            </div>
            <div style={{background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:14}}>
              <div className="t-label">Views</div>
              <div style={{fontFamily:'var(--font-mono)', fontSize:22, fontWeight:600, marginTop:6}}>{v.views}</div>
            </div>
            <div style={{background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:14}}>
              <div className="t-label">Predicted</div>
              <div style={{fontFamily:'var(--font-mono)', fontSize:22, fontWeight:600, marginTop:6, background:'var(--brand-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>78/100</div>
            </div>
          </div>
          <div className="t-label" style={{marginBottom:10}}>Pipeline</div>
          <div style={{padding:'14px 16px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10}}>
            <PipelineProgress step={v.step}/>
          </div>
        </div>}

        {tab==='script' && <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {[
            { beat: 'Hook · 0:00', visual: 'screen_recording', text: 'Your GPU bill jumped 4× last month. Here\'s why nobody told you.' },
            { beat: 'Setup · 0:08', visual: 'avatar_animation', text: 'Three weeks ago, training prices on H100s broke a record nobody is talking about.' },
            { beat: 'Payoff · 0:24', visual: 'kinetic_typography', text: 'And the wild part — there\'s a fix sitting in PyTorch 2.5 that almost no team has switched on.' },
          ].map((b, i) => (
            <div key={i} style={{padding:14, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10}}>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                <span className="t-label">{b.beat}</span>
                <Badge tone="ai">{b.visual}</Badge>
              </div>
              <div style={{fontSize:13, lineHeight:1.5, color:'var(--text)'}}>{b.text}</div>
            </div>
          ))}
        </div>}

        {tab==='insights' && <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
          {[
            { q: 'Why this hook?', a: 'Question hooks have +34% retention on TechTom\'s previous posts.' },
            { q: 'Why these visuals?', a: 'Screen recording opens get 2.1× more YouTube CTR for tech niche.' },
            { q: 'Why this music?', a: 'Subtle electronic matches TechTom\'s brand pace (medium-fast).' },
            { q: 'Predicted score', a: '78/100 — top 22% of similar shorts in the last 30 days.' },
          ].map((c, i) => (
            <div key={i} style={{padding:14, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <Icon name="sparkles" size={14} color="#A78BFA"/>
                <span style={{fontSize:12.5, fontWeight:600, color:'var(--primary-glow)'}}>{c.q}</span>
              </div>
              <div style={{fontSize:13, lineHeight:1.45, color:'var(--text)'}}>{c.a}</div>
            </div>
          ))}
        </div>}

        {tab==='publish' && <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div>
            <div className="t-label" style={{marginBottom:6}}>Caption <AIBadge/></div>
            <textarea defaultValue="Your GPU bill went up 4× last month — here's the one PyTorch flag that fixes it. #AI #ML #DevTools" style={{
              width:'100%', minHeight:80, background:'var(--surface-2)', border:'1px solid var(--border)',
              borderRadius:10, padding:12, color:'var(--text)', fontFamily:'var(--font-body)', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box'
            }}/>
          </div>
          <div style={{display:'flex', gap:8}}>
            <Button variant="secondary" icon="youtube">YouTube</Button>
            <Button variant="secondary" icon="tiktok">TikTok</Button>
            <Button variant="secondary" icon="instagram">Instagram</Button>
          </div>
          <div style={{display:'flex', gap:8, marginTop:8}}>
            <Button variant="primary">Publish now</Button>
            <Button variant="secondary">Schedule</Button>
            <Button variant="ghost">Save draft</Button>
            <div style={{flex:1}}/>
            <Button variant="icon" icon="download"></Button>
          </div>
        </div>}
      </div>
    </div>
  </div>;
};

window.VideosPage = VideosPage;
window.VideoModal = VideoModal;
