// Login screen

const LoginScreen = ({ t, lang, onLang, onSignIn }) => (
  <div style={{
    minHeight:'100vh', background:'var(--bg)', display:'grid',
    gridTemplateColumns:'1fr 1fr', position:'relative', overflow:'hidden'
  }}>
    {/* Left: blob side */}
    <div style={{position:'relative', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', padding:48}}>
      <div style={{
        position:'absolute', width:520, height:520, borderRadius:'50%',
        background:'radial-gradient(circle at 40% 40%, #7C3AED 0%, transparent 70%)',
        filter:'blur(60px)', top:'-10%', left:'-15%', animation:'bcDrift 14s ease-in-out infinite'
      }}/>
      <div style={{
        position:'absolute', width:480, height:480, borderRadius:'50%',
        background:'radial-gradient(circle at 60% 60%, #06B6D4 0%, transparent 70%)',
        filter:'blur(60px)', bottom:'-10%', right:'-10%', animation:'bcDrift 16s ease-in-out infinite reverse'
      }}/>
      <div style={{position:'relative', zIndex:2, textAlign: lang==='HE'?'right':'left', maxWidth:420}}>
        <img src="../../assets/logo-real-square.png" width="96" height="96" style={{borderRadius:18, boxShadow:'0 12px 40px rgba(124,58,237,0.4)'}}/>
        <h1 style={{
          fontFamily:'var(--font-display)', fontSize:54, fontWeight:700,
          letterSpacing:'-0.025em', lineHeight:1.05, margin:'24px 0 16px'
        }}>
          <span style={{background:'var(--brand-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>BotCraft</span>
        </h1>
        <p style={{fontSize:18, color:'var(--text-muted)', lineHeight:1.5, margin:0}}>{t.loginSub}</p>
      </div>
    </div>

    {/* Right: form side */}
    <div style={{display:'flex', alignItems:'center', justifyContent:'center', padding:48, position:'relative'}}>
      <button onClick={onLang} style={{
        position:'absolute', top:24, [lang==='HE'?'left':'right']:24,
        background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:99,
        padding:'4px 5px', display:'flex', alignItems:'center', cursor:'pointer',
        fontFamily:'var(--font-mono)', fontSize:11, fontWeight:600,
      }}>
        <span style={{padding:'4px 10px', borderRadius:99, background: lang==='EN' ? 'var(--brand-gradient)':'transparent', color: lang==='EN'?'#fff':'var(--text-muted)'}}>EN</span>
        <span style={{padding:'4px 10px', borderRadius:99, background: lang==='HE' ? 'var(--brand-gradient)':'transparent', color: lang==='HE'?'#fff':'var(--text-muted)'}}>HE</span>
      </button>

      <div style={{width:'100%', maxWidth:380}}>
        <h2 style={{fontFamily:'var(--font-display)', fontSize:32, fontWeight:700, letterSpacing:'-0.02em', margin:'0 0 8px'}}>{t.loginTitle}</h2>
        <p style={{color:'var(--text-muted)', margin:'0 0 32px', fontSize:14}}>Sign in to continue to your studio.</p>

        <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <label style={{display:'flex', flexDirection:'column', gap:6}}>
            <span className="t-label">{t.email}</span>
            <input defaultValue="creator@botcraft.ai" style={{
              background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10,
              padding:'10px 12px', color:'var(--text)', fontFamily:'var(--font-body)', fontSize:14, outline:'none'
            }}/>
          </label>
          <label style={{display:'flex', flexDirection:'column', gap:6}}>
            <span className="t-label">{t.password}</span>
            <input type="password" defaultValue="••••••••••" style={{
              background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10,
              padding:'10px 12px', color:'var(--text)', fontFamily:'var(--font-body)', fontSize:14, outline:'none'
            }}/>
          </label>

          <Button variant="primary" onClick={onSignIn} style={{justifyContent:'center', padding:'12px 16px', marginTop:8}}>{t.signIn}</Button>

          <div style={{display:'flex', alignItems:'center', gap:12, color:'var(--text-dim)', fontSize:11, margin:'8px 0'}}>
            <div style={{flex:1, height:1, background:'var(--border)'}}/>
            <span style={{textTransform:'uppercase', letterSpacing:'0.08em'}}>{t.orContinue}</span>
            <div style={{flex:1, height:1, background:'var(--border)'}}/>
          </div>

          <Button variant="secondary" style={{justifyContent:'center', padding:'10px 16px'}}>
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C40.8 35.7 44 30.3 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
            {t.google}
          </Button>
        </div>
      </div>
    </div>
  </div>
);

window.LoginScreen = LoginScreen;
