// BotCraft UI primitives
// All components use the design tokens from colors_and_type.css

const Icon = ({ name, size = 16, stroke = 1.5, color }) => {
  const paths = {
    dashboard: <g><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></g>,
    avatars: <g><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></g>,
    videos: <g><rect x="2" y="6" width="20" height="12" rx="2"/><path d="m10 9 5 3-5 3z" fill="currentColor"/></g>,
    trends: <g><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></g>,
    analytics: <g><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-5"/></g>,
    learnings: <g><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 2.5 2.5 0 0 1-1.32-4.24 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 2.96-3.08A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2a2.5 2.5 0 0 0-2.5 2.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 2.5 2.5 0 0 0 1.32-4.24 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-2.96-3.08A2.5 2.5 0 0 0 14.5 2Z"/></g>,
    settings: <g><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></g>,
    search: <g><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></g>,
    bell: <g><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></g>,
    plus: <g><path d="M5 12h14"/><path d="M12 5v14"/></g>,
    sparkles: <g><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></g>,
    chevronLeft: <polyline points="15 18 9 12 15 6"/>,
    chevronRight: <polyline points="9 18 15 12 9 6"/>,
    play: <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>,
    close: <g><path d="M18 6 6 18"/><path d="m6 6 12 12"/></g>,
    check: <polyline points="20 6 9 17 4 12"/>,
    download: <g><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></g>,
    menu: <g><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></g>,
    globe: <g><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></g>,
    youtube: <g><path d="M22.5 6.5a2.8 2.8 0 0 0-2-2C18.7 4 12 4 12 4s-6.7 0-8.5.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 5.5 2.8 2.8 0 0 0 2 2C5.3 20 12 20 12 20s6.7 0 8.5-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-5.5z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor"/></g>,
    instagram: <g><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.4a4 4 0 1 1-7.9 1.2A4 4 0 0 1 16 11.4z"/><line x1="17.5" y1="6.5" x2="17.5" y2="6.5"/></g>,
    tiktok: <g><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></g>,
  };
  const p = paths[name];
  if (!p) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>{p}</svg>;
};

const Button = ({ variant = 'primary', children, icon, onClick, style, ...rest }) => {
  const base = {
    fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
    borderRadius: 10, padding: '9px 16px', border: '1px solid transparent',
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
    transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)', whiteSpace: 'nowrap',
  };
  const variants = {
    primary: { background: 'var(--brand-gradient)', color: '#fff', boxShadow: '0 6px 20px rgba(124,58,237,0.35)' },
    secondary: { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border)' },
    ghost: { background: 'transparent', color: 'var(--text-muted)' },
    danger: { background: 'var(--danger-bg)', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' },
    icon: { background: 'var(--surface-2)', color: 'var(--text-muted)', borderColor: 'var(--border)', padding: 9, borderRadius: 10 },
  };
  return <button onClick={onClick} style={{...base, ...variants[variant], ...style}} {...rest}>
    {icon && <Icon name={icon} size={14} stroke={2.2}/>}
    {children}
  </button>;
};

const Badge = ({ tone = 'neutral', children, pulse, style }) => {
  const tones = {
    success:  { bg: 'var(--success-bg)', color: 'var(--success)', border: 'rgba(16,185,129,0.25)' },
    warning:  { bg: 'var(--warning-bg)', color: 'var(--warning)', border: 'rgba(245,158,11,0.25)' },
    danger:   { bg: 'var(--danger-bg)',  color: 'var(--danger)',  border: 'rgba(239,68,68,0.25)' },
    info:     { bg: 'rgba(6,182,212,0.12)', color: 'var(--accent)', border: 'rgba(6,182,212,0.25)' },
    neutral:  { bg: 'var(--surface-2)', color: 'var(--text-muted)', border: 'var(--border)' },
    ai:       { bg: 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(6,182,212,0.18))', color: 'var(--primary-glow)', border: 'rgba(167,139,250,0.4)' },
  };
  const t = tones[tone];
  return <span style={{
    display:'inline-flex', alignItems:'center', gap:6, padding:'4px 9px',
    borderRadius:999, fontSize:11.5, fontWeight:500,
    background:t.bg, color:t.color, border:`1px solid ${t.border}`,
    animation: pulse ? 'bcPulse 1.6s ease-in-out infinite' : 'none',
    ...style
  }}>
    <span style={{width:5,height:5,borderRadius:99,background:'currentColor'}}/>
    {children}
  </span>;
};

const Card = ({ children, style, hover, onClick }) => {
  const [h, setH] = React.useState(false);
  const isHover = hover || h;
  return <div
    onClick={onClick}
    onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{
      background: 'var(--surface)',
      border: `1px solid ${isHover ? 'var(--primary-glow)' : 'var(--border)'}`,
      borderRadius: 14, padding: 18,
      boxShadow: isHover ? 'var(--shadow-glow)' : 'var(--inner-glow)',
      transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)',
      transform: isHover ? 'translateY(-2px)' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}>{children}</div>;
};

const Sparkline = ({ data, gradient, width = 100, height = 32 }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const range = Math.max(max - min, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  return <svg width={width} height={height} style={{overflow:'visible'}}>
    {gradient && <defs><linearGradient id="spg" x1="0" y1="0" x2={width} y2="0"><stop stopColor="#7C3AED"/><stop offset="1" stopColor="#06B6D4"/></linearGradient></defs>}
    <polyline points={pts} fill="none" stroke={gradient ? 'url(#spg)' : '#A78BFA'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
};

const StatTile = ({ label, value, delta, spark, gradient }) => (
  <Card>
    <div className="t-label" style={{position:'relative'}}>{label}</div>
    <div style={{
      fontFamily:'var(--font-mono)', fontSize:32, fontWeight:600, margin:'8px 0 4px',
      fontFeatureSettings:"'tnum' 1",
      ...(gradient ? { background:'var(--brand-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' } : { color:'var(--text)' })
    }}>{value}</div>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:8}}>
      <div style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--success)'}}>↑ {delta}</div>
      <Sparkline data={spark} gradient={gradient}/>
    </div>
  </Card>
);

const PipelineProgress = ({ step }) => {
  const labels = ['Script', 'Visuals', 'TTS', 'Edit', 'Ready'];
  return <div style={{display:'flex', alignItems:'center', gap:0, flex:1}}>
    {labels.map((l, i) => {
      const done = i < step - 1;
      const active = i === step - 1;
      return <React.Fragment key={l}>
        <div style={{
          width:18, height:18, borderRadius:99, flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontFamily:'var(--font-mono)', fontSize:10, fontWeight:600,
          background: done ? 'var(--brand-gradient)' : active ? 'rgba(124,58,237,0.18)' : 'var(--surface-2)',
          border: `1px solid ${done ? 'transparent' : active ? 'var(--primary-glow)' : 'var(--border)'}`,
          color: done ? '#fff' : active ? 'var(--primary-glow)' : 'var(--text-dim)',
          animation: active ? 'bcRing 1.4s ease-in-out infinite' : 'none',
        }}>{done ? '✓' : i + 1}</div>
        {i < labels.length - 1 && <div style={{
          flex:1, height:1, minWidth:14,
          background: done ? 'linear-gradient(90deg,#7C3AED,#06B6D4)' : 'var(--border)'
        }}/>}
      </React.Fragment>;
    })}
  </div>;
};

const AIBadge = () => (
  <span style={{
    display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px',
    background:'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(6,182,212,0.18))',
    border:'1px solid rgba(167,139,250,0.4)', borderRadius:99,
    color:'var(--primary-glow)', fontSize:10.5, fontWeight:500
  }}>✨ AI</span>
);

const Avatar = ({ a, size = 40 }) => (
  <div style={{
    width:size, height:size, borderRadius: size > 50 ? 14 : 10,
    background: a.grad, display:'flex', alignItems:'center', justifyContent:'center',
    color:'#fff', fontFamily:'var(--font-display)', fontWeight:700,
    fontSize: size * 0.42, flexShrink:0, position:'relative', overflow:'hidden'
  }}>
    {a.initial}
    <div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.25), transparent 60%)'}}/>
  </div>
);

const PlatformGlyph = ({ p, size = 14 }) => {
  const map = { yt: 'youtube', tt: 'tiktok', ig: 'instagram' };
  const colors = { yt:'#EF4444', tt:'#67E8F9', ig:'#A78BFA' };
  return <Icon name={map[p]} size={size} color={colors[p]}/>;
};

Object.assign(window, { Icon, Button, Badge, Card, Sparkline, StatTile, PipelineProgress, AIBadge, Avatar, PlatformGlyph });
