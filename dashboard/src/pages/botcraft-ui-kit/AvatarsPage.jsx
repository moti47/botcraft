// Avatars page

const AvatarsPage = ({ t, onNew, onOpen }) => {
  const { avatars } = window.MOCK;
  const [filter, setFilter] = React.useState('all');

  return <div style={{padding:'28px 32px', position:'relative'}}>
    <div style={{position:'fixed', width:340, height:340, borderRadius:'50%', background:'#06B6D4', filter:'blur(120px)', opacity:0.12, top:80, right:'25%', pointerEvents:'none', zIndex:0}}/>

    <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:24, position:'relative', zIndex:1}}>
      <div style={{display:'flex', gap:6, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:3}}>
        {['all','active','paused'].map(f => (
          <button key={f} onClick={()=>setFilter(f)} style={{
            padding:'6px 12px', border:'none', borderRadius:7, cursor:'pointer',
            background: filter===f ? 'var(--surface-3)' : 'transparent',
            color: filter===f ? 'var(--text)' : 'var(--text-muted)',
            fontFamily:'var(--font-body)', fontSize:12, fontWeight:500, textTransform:'capitalize'
          }}>{f}</button>
        ))}
      </div>
      <div style={{flex:1}}/>
      <Button variant="secondary" icon="search">Filter</Button>
      <Button variant="primary" icon="plus" onClick={onNew}>{t.newAvatar}</Button>
    </div>

    <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, position:'relative', zIndex:1}}>
      {/* New avatar card */}
      <Card onClick={onNew} style={{
        background:'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(6,182,212,0.12))',
        border:'1px dashed rgba(167,139,250,0.4)',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        minHeight:280, gap:12, cursor:'pointer'
      }}>
        <div style={{
          width:56, height:56, borderRadius:14, background:'var(--brand-gradient)',
          display:'flex', alignItems:'center', justifyContent:'center'
        }}>
          <Icon name="plus" size={24} color="#fff" stroke={2}/>
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, marginBottom:4}}>New avatar</div>
          <div style={{fontSize:12, color:'var(--text-muted)', maxWidth:200}}>Spin up a persona — AI fills empty fields automatically.</div>
        </div>
      </Card>

      {avatars.filter(a => filter==='all' || a.status===filter).map(a => (
        <Card key={a.id} onClick={()=>onOpen(a)} style={{padding:0, overflow:'hidden'}}>
          <div style={{padding:18, display:'flex', alignItems:'center', gap:14}}>
            <Avatar a={a} size={56}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <div style={{fontFamily:'var(--font-display)', fontSize:17, fontWeight:600}}>{a.name}</div>
                <span style={{
                  width:8, height:8, borderRadius:99,
                  background: a.status==='active' ? 'var(--success)' : 'var(--text-dim)',
                  boxShadow: a.status==='active' ? '0 0 8px rgba(16,185,129,0.6)' : 'none'
                }}/>
              </div>
              <div style={{display:'flex', gap:6, marginTop:4}}>
                <Badge tone="neutral">{a.niche}</Badge>
                <Badge tone="neutral">{a.lang}</Badge>
              </div>
            </div>
          </div>
          <div style={{padding:'14px 18px', borderTop:'1px solid var(--border)', background:'var(--surface-2)', display:'flex', justifyContent:'space-between'}}>
            <div>
              <div style={{fontFamily:'var(--font-mono)', fontSize:18, fontWeight:600, color:'var(--text)'}}>{a.videos}</div>
              <div style={{fontSize:10.5, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em'}}>videos</div>
            </div>
            <div>
              <div style={{fontFamily:'var(--font-mono)', fontSize:18, fontWeight:600, color:'var(--text)'}}>{a.views}</div>
              <div style={{fontSize:10.5, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em'}}>views</div>
            </div>
            <div>
              <div style={{fontFamily:'var(--font-mono)', fontSize:18, fontWeight:600, color:'var(--success)'}}>{a.growth}</div>
              <div style={{fontSize:10.5, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em'}}>growth</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </div>;
};

window.AvatarsPage = AvatarsPage;
