// BotCraft App shell

const App = () => {
  const [signedIn, setSignedIn] = React.useState(false);
  const [page, setPage] = React.useState('dashboard');
  const [collapsed, setCollapsed] = React.useState(false);
  const [lang, setLang] = React.useState(localStorage.getItem('bc-lang') || 'EN');
  const [openVideo, setOpenVideo] = React.useState(null);
  const [openAvatar, setOpenAvatar] = React.useState(null);
  const [newAvatar, setNewAvatar] = React.useState(false);
  const [empty, setEmpty] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  const t = window.STRINGS[lang];

  React.useEffect(() => {
    document.documentElement.dir = lang === 'HE' ? 'rtl' : 'ltr';
    localStorage.setItem('bc-lang', lang);
  }, [lang]);

  React.useEffect(() => { setOpenAvatar(null); }, [page]);

  const toggleLang = () => setLang(l => l === 'EN' ? 'HE' : 'EN');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const titles = {
    dashboard: t.nav.dashboard,
    avatars: openAvatar ? openAvatar.name : t.nav.avatars,
    videos: t.nav.videos,
    trends: t.nav.trends, analytics: t.nav.analytics, learnings: t.nav.learnings, settings: t.nav.settings,
  };

  if (!signedIn) {
    return <LoginScreen t={t} lang={lang} onLang={toggleLang} onSignIn={() => setSignedIn(true)}/>;
  }

  return <div style={{display:'flex', minHeight:'100vh', background:'var(--bg)'}}>
    <Sidebar
      active={page} onNav={setPage} lang={lang} t={t}
      collapsed={collapsed} onToggle={() => setCollapsed(c => !c)}
      onLang={toggleLang}
    />
    <main style={{flex:1, minWidth:0, position:'relative'}}>
      <Topbar
        title={titles[page]} t={t}
        notifCount={window.MOCK.notifications}
        onCreate={() => setNewAvatar(true)}
      />
      {page === 'dashboard' && (empty
        ? <EmptyDashboard lang={lang} onCreate={()=>{ setEmpty(false); setNewAvatar(true); }}/>
        : <Dashboard t={t} onOpenVideo={setOpenVideo}/>)}
      {page === 'avatars' && !openAvatar && <AvatarsPage t={t} onNew={()=>setNewAvatar(true)} onOpen={setOpenAvatar}/>}
      {page === 'avatars' && openAvatar && <AvatarDetail a={openAvatar} lang={lang} onClose={()=>setOpenAvatar(null)}/>}
      {page === 'videos' && (empty
        ? <EmptyVideos lang={lang} onCreate={()=>{ setEmpty(false); showToast(lang==='HE'?'🎬 הפקה החלה':'🎬 Production started'); }}/>
        : <VideosPage onOpenVideo={setOpenVideo}/>)}
      {page === 'trends' && <TrendsPage t={t} lang={lang}/>}
      {page === 'analytics' && <PlaceholderPage title="Cross-avatar analytics" blurb="Compare reach, engagement, and the best-performing posts across every persona you run."/>}
      {page === 'learnings' && <LearningsPage t={t} lang={lang}/>}
      {page === 'settings' && <SettingsPage t={t} lang={lang}/>}
    </main>
    {openVideo && <VideoModal v={openVideo} onClose={() => setOpenVideo(null)}/>}
    {newAvatar && <NewAvatar lang={lang} onClose={()=>setNewAvatar(false)} onCreate={()=>{ setNewAvatar(false); showToast(lang==='HE' ? '🚀 האווטר נוצר! בודק את האווטרים' : '🚀 Avatar created — check the Avatars page'); }}/>}
    {toast && <div style={{
      position:'fixed', top:20, right:20, zIndex:80,
      padding:'12px 16px', background:'var(--surface)', border:'1px solid var(--primary-glow)',
      borderRadius:12, boxShadow:'var(--shadow-glow)',
      fontFamily:'var(--font-body)', fontSize:13, color:'var(--text)',
      animation:'bcSlide 200ms cubic-bezier(0.22,1,0.36,1)'
    }}>{toast}</div>}
  </div>;
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
