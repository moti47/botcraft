// Sidebar component

const Sidebar = ({ active, onNav, lang, t, collapsed, onToggle, onLang }) => {
  const items = [
    { id: 'dashboard', icon: 'dashboard' },
    { id: 'avatars', icon: 'avatars' },
    { id: 'videos', icon: 'videos' },
    { id: 'trends', icon: 'trends' },
    { id: 'analytics', icon: 'analytics' },
    { id: 'learnings', icon: 'learnings' },
    { id: 'settings', icon: 'settings' },
  ];

  return <aside style={{
    width: collapsed ? 64 : 240,
    flexShrink: 0,
    background: 'var(--surface)',
    borderInlineEnd: '1px solid var(--border)',
    height: '100vh', display: 'flex', flexDirection: 'column',
    transition: 'width 200ms cubic-bezier(0.22,1,0.36,1)',
    position: 'sticky', top: 0,
  }}>
    <div style={{padding:'18px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)', height:64, boxSizing:'border-box'}}>
      <img src="../../assets/logo-real-square.png" width="32" height="32" style={{flexShrink:0}}/>
      {!collapsed && <div style={{fontFamily:'var(--font-display)', fontWeight:700, fontSize:18, letterSpacing:'-0.02em'}}>BotCraft</div>}
      <button onClick={onToggle} style={{
        marginInlineStart:'auto', background:'transparent', border:'none', color:'var(--text-dim)',
        cursor:'pointer', padding:4, borderRadius:6
      }}>
        <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16}/>
      </button>
    </div>

    <nav style={{flex:1, padding:'12px 8px', display:'flex', flexDirection:'column', gap:2}}>
      {items.map(it => {
        const isActive = active === it.id;
        return <button key={it.id} onClick={() => onNav(it.id)} style={{
          display:'flex', alignItems:'center', gap:12, padding: collapsed ? '10px' : '10px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: isActive ? 'var(--brand-gradient)' : 'transparent',
          color: isActive ? '#fff' : 'var(--text-muted)',
          border: 'none', borderRadius: 10, cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 500,
          boxShadow: isActive ? '0 4px 16px rgba(124,58,237,0.35)' : 'none',
          transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)',
        }}
          onMouseEnter={(e)=>{ if(!isActive) e.currentTarget.style.background='var(--surface-2)'; e.currentTarget.style.color='var(--text)'; }}
          onMouseLeave={(e)=>{ if(!isActive) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--text-muted)'; } }}
        >
          <Icon name={it.icon} size={18} stroke={1.6}/>
          {!collapsed && <span>{t.nav[it.id]}</span>}
        </button>;
      })}
    </nav>

    <div style={{padding:12, borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:10}}>
      {!collapsed && <button onClick={onLang} style={{
        background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:99,
        padding:'4px 5px', display:'flex', alignItems:'center', cursor:'pointer',
        fontFamily:'var(--font-mono)', fontSize:11, fontWeight:600, color:'var(--text-muted)',
        alignSelf:'flex-start'
      }}>
        <span style={{padding:'4px 10px', borderRadius:99, background: lang==='EN' ? 'var(--brand-gradient)':'transparent', color: lang==='EN'?'#fff':'var(--text-muted)'}}>EN</span>
        <span style={{padding:'4px 10px', borderRadius:99, background: lang==='HE' ? 'var(--brand-gradient)':'transparent', color: lang==='HE'?'#fff':'var(--text-muted)'}}>HE</span>
      </button>}
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <div style={{width:32, height:32, borderRadius:10, background:'linear-gradient(135deg,#A78BFA,#67E8F9)', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)',
          fontWeight:700, color:'#0A0A0F', fontSize:13}}>YO</div>
        {!collapsed && <div style={{minWidth:0, flex:1}}>
          <div style={{fontSize:13, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>You</div>
          <div style={{fontSize:11, color:'var(--text-dim)'}}>Pro plan</div>
        </div>}
      </div>
    </div>
  </aside>;
};

window.Sidebar = Sidebar;
