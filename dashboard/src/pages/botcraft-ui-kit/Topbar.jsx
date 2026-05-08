// Topbar

const Topbar = ({ title, t, notifCount, onCreate }) => (
  <header style={{
    height: 64, padding: '0 32px', display:'flex', alignItems:'center', gap:16,
    background: 'rgba(10,10,15,0.7)', backdropFilter: 'blur(20px)',
    borderBottom: '1px solid var(--border)', position:'sticky', top:0, zIndex:20,
  }}>
    <h1 style={{margin:0, fontFamily:'var(--font-display)', fontSize:22, fontWeight:700, letterSpacing:'-0.02em'}}>{title}</h1>
    <div style={{flex:1}}/>
    <div style={{
      display:'flex', alignItems:'center', gap:8, background:'var(--surface-2)',
      border:'1px solid var(--border)', borderRadius:10, padding:'0 12px', height:38, width: 320
    }}>
      <Icon name="search" size={14} color="var(--text-dim)"/>
      <input placeholder={t.search} style={{
        flex:1, background:'none', border:'none', outline:'none',
        color:'var(--text)', fontFamily:'var(--font-body)', fontSize:13
      }}/>
      <kbd style={{
        fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-dim)',
        border:'1px solid var(--border)', borderRadius:4, padding:'1px 5px'
      }}>⌘K</kbd>
    </div>
    <button style={{
      position:'relative', background:'var(--surface-2)', border:'1px solid var(--border)',
      borderRadius:10, width:38, height:38, cursor:'pointer', color:'var(--text-muted)',
      display:'flex', alignItems:'center', justifyContent:'center'
    }}>
      <Icon name="bell" size={16}/>
      {notifCount > 0 && <span style={{
        position:'absolute', top:6, right:6, minWidth:14, height:14, borderRadius:99,
        background:'var(--brand-gradient)', fontSize:9, fontWeight:600, color:'#fff',
        display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px'
      }}>{notifCount}</span>}
    </button>
    <Button variant="primary" icon="plus" onClick={onCreate}>{t.quickCreate}</Button>
  </header>
);

window.Topbar = Topbar;
