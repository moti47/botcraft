// New Avatar — full multi-section form with AI auto-fill, live preview, RTL-aware

const NewAvatar = ({ lang, onClose, onCreate }) => {
  const isHE = lang === 'HE';
  const [section, setSection] = React.useState('basic');
  const [autoFill, setAutoFill] = React.useState(true);
  const [submitted, setSubmitted] = React.useState(false);

  const [form, setForm] = React.useState({
    name: '', niche: 'tech', langSel: 'EN', description: '',
    traits: ['energetic','geeky'], tone: 'friendly-expert', audience: '', backstory: '',
    style: 'cinematic', gender: 'neutral', age: 32, hair: '', outfit: '', setting: '',
    voice: 'Atlas · warm baritone', speed: 1.0, emotion: 'neutral',
    primary: '#7C3AED', secondary: '#06B6D4', accent: '#A78BFA', bg: '#0A0A0F', text: '#F8FAFC',
    titleFont: 'Space Grotesk', bodyFont: 'Inter',
    pace: 65, music: 'electronic', screenTime: 35,
    visualTypes: ['avatar_animation','screen_recording','kinetic_typography'],
  });
  const set = (k,v) => setForm(f => ({...f, [k]: v}));

  const STR = {
    EN: {
      title: 'New avatar', subtitle: 'Spin up a persona — empty fields get filled by AI.',
      sections: { basic: 'Basics', persona: 'Persona', visuals: 'Visuals', voice: 'Voice', brand: 'Brand identity' },
      name: 'Name', niche: 'Niche', language: 'Language', description: 'Description',
      traits: 'Personality traits', tone: 'Tone of voice', audience: 'Target audience', backstory: 'Background story',
      style: 'Style preset', gender: 'Gender presentation', age: 'Age',
      hair: 'Hair', outfit: 'Outfit', setting: 'Setting',
      voiceLib: 'Voice library', speed: 'Speed', emotion: 'Emotion', recommend: 'AI recommend',
      colors: 'Color palette', primary: 'Primary', secondary: 'Secondary', accent: 'Accent', bg: 'Background', text: 'Text',
      typography: 'Typography', titleFont: 'Title font', bodyFont: 'Body font',
      pace: 'Editing pace', music: 'Music genre', screenTime: 'Avatar screen-time', visualTypes: 'Preferred visual types',
      autoFill: 'Generate AI fill-ins for empty fields', cancel: 'Cancel', create: 'Create avatar',
      preview: 'Live preview', aiSuggest: '✨ AI suggest from persona',
      slow: 'slow', fast: 'fast', placeholder: 'Leave blank to let AI decide',
    },
    HE: {
      title: 'אווטר חדש', subtitle: 'בנה דמות — שדות ריקים יושלמו על ידי בינה מלאכותית.',
      sections: { basic: 'בסיס', persona: 'דמות', visuals: 'ויזואל', voice: 'קול', brand: 'זהות מותגית' },
      name: 'שם', niche: 'נישה', language: 'שפה', description: 'תיאור',
      traits: 'תכונות אופי', tone: 'טון דיבור', audience: 'קהל יעד', backstory: 'רקע',
      style: 'סגנון', gender: 'מגדר', age: 'גיל',
      hair: 'שיער', outfit: 'לבוש', setting: 'רקע צילום',
      voiceLib: 'ספריית קולות', speed: 'מהירות', emotion: 'רגש', recommend: 'המלצת AI',
      colors: 'פלטת צבעים', primary: 'ראשי', secondary: 'משני', accent: 'הדגשה', bg: 'רקע', text: 'טקסט',
      typography: 'טיפוגרפיה', titleFont: 'פונט כותרות', bodyFont: 'פונט גוף',
      pace: 'קצב עריכה', music: 'סגנון מוזיקה', screenTime: 'נוכחות אווטר', visualTypes: 'סוגי ויזואל מועדפים',
      autoFill: 'מילוי אוטומטי של שדות ריקים', cancel: 'ביטול', create: 'צור אווטר',
      preview: 'תצוגה חיה', aiSuggest: '✨ הצעת AI לפי הדמות',
      slow: 'איטי', fast: 'מהיר', placeholder: 'השאר ריק והבינה תחליט',
    },
  }[lang];

  const sections = ['basic','persona','visuals','voice','brand'];
  const niches = ['tech','gaming','fitness','comedy','lifestyle','news','cooking','finance','education','beauty'];
  const allTraits = ['energetic','calm','geeky','sarcastic','warm','authoritative','friendly','mysterious','playful','professional'];
  const styles = ['realistic','anime','3d-render','cinematic','cartoon','illustrated'];
  const allVT = ['avatar_animation','screen_recording','stock_video','kinetic_typography','lottie_animation','ai_generated_clip','code_visualization','whiteboard','2d_character'];
  const voices = [
    { name: 'Atlas', tags: 'warm · baritone · EN' },
    { name: 'Nova', tags: 'crisp · alto · EN' },
    { name: 'Sage', tags: 'calm · mezzo · EN/HE' },
    { name: 'Quark', tags: 'energetic · tenor · EN' },
  ];

  // simple field with AI badge if it was AI-filled (after submit + empty)
  const Field = ({ label, children, aiFilled }) => (
    <label style={{display:'flex', flexDirection:'column', gap:6}}>
      <span style={{display:'flex', alignItems:'center', gap:8}}>
        <span className="t-label">{label}</span>
        {aiFilled && <AIBadge/>}
      </span>
      {children}
    </label>
  );

  const inputStyle = {
    background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10,
    padding:'10px 12px', color:'var(--text)', fontFamily:'var(--font-body)', fontSize:13.5,
    outline:'none', width:'100%', boxSizing:'border-box',
    textAlign: isHE ? 'right' : 'left',
  };

  const aiFor = (key) => submitted && autoFill && (form[key] === '' || (Array.isArray(form[key]) && form[key].length === 0));

  return <div style={{
    position:'fixed', inset:0, background:'rgba(10,10,15,0.78)', backdropFilter:'blur(12px)',
    zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:20
  }} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{
      width:'min(1180px, 100%)', maxHeight:'92vh', overflow:'hidden',
      background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20,
      boxShadow:'var(--shadow-xl)', display:'grid', gridTemplateColumns:'220px 1fr 360px',
      direction: isHE ? 'rtl' : 'ltr',
    }}>
      {/* Section nav */}
      <div style={{borderInlineEnd:'1px solid var(--border)', padding:'24px 16px', background:'var(--surface)'}}>
        <h2 style={{margin:'0 0 4px', fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, letterSpacing:'-0.02em'}}>{STR.title}</h2>
        <p style={{margin:'0 0 18px', fontSize:11.5, color:'var(--text-dim)', lineHeight:1.5}}>{STR.subtitle}</p>
        <nav style={{display:'flex', flexDirection:'column', gap:2}}>
          {sections.map((s, i) => {
            const active = section === s;
            return <button key={s} onClick={() => setSection(s)} style={{
              display:'flex', alignItems:'center', gap:10, padding:'9px 11px',
              background: active ? 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(6,182,212,0.18))' : 'transparent',
              border: `1px solid ${active ? 'rgba(167,139,250,0.4)' : 'transparent'}`,
              borderRadius:9, cursor:'pointer', textAlign: isHE?'right':'left',
              color: active ? 'var(--text)' : 'var(--text-muted)',
              fontFamily:'var(--font-body)', fontSize:13, fontWeight:500,
            }}>
              <span style={{
                width:22, height:22, borderRadius:6, flexShrink:0,
                background: active ? 'var(--brand-gradient)' : 'var(--surface-2)',
                color: active ? '#fff' : 'var(--text-dim)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'var(--font-mono)', fontSize:11, fontWeight:600,
              }}>{i+1}</span>
              {STR.sections[s]}
            </button>;
          })}
        </nav>
      </div>

      {/* Form body */}
      <div style={{padding:'24px 28px', overflow:'auto', maxHeight:'92vh'}}>
        {section === 'basic' && <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <h3 style={{margin:0, fontFamily:'var(--font-display)', fontSize:18, fontWeight:600}}>{STR.sections.basic}</h3>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <Field label={STR.name} aiFilled={aiFor('name')}>
              <input style={inputStyle} value={form.name} onChange={e=>set('name',e.target.value)} placeholder={isHE ? 'למשל: טכנו טום' : 'e.g. Tech Tom'}/>
            </Field>
            <Field label={STR.language}>
              <select style={inputStyle} value={form.langSel} onChange={e=>set('langSel',e.target.value)}>
                <option value="EN">English</option>
                <option value="HE">עברית</option>
                <option value="ES">Español</option>
              </select>
            </Field>
          </div>
          <Field label={STR.niche}>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {niches.map(n => (
                <button key={n} onClick={()=>set('niche',n)} style={{
                  padding:'6px 12px', borderRadius:99, fontSize:12, cursor:'pointer',
                  background: form.niche===n ? 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))' : 'var(--surface-2)',
                  border:`1px solid ${form.niche===n ? 'var(--primary-glow)' : 'var(--border)'}`,
                  color: form.niche===n ? 'var(--text)' : 'var(--text-muted)',
                  fontFamily:'var(--font-body)',
                }}>{n}</button>
              ))}
            </div>
          </Field>
          <Field label={STR.description} aiFilled={aiFor('description')}>
            <textarea style={{...inputStyle, minHeight:80, resize:'vertical'}} value={form.description} onChange={e=>set('description',e.target.value)} placeholder={STR.placeholder}/>
          </Field>
        </div>}

        {section === 'persona' && <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <h3 style={{margin:0, fontFamily:'var(--font-display)', fontSize:18, fontWeight:600}}>{STR.sections.persona}</h3>
          <Field label={STR.traits}>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {allTraits.map(t => {
                const sel = form.traits.includes(t);
                return <button key={t} onClick={()=>set('traits', sel ? form.traits.filter(x=>x!==t) : [...form.traits,t])} style={{
                  padding:'6px 12px', borderRadius:99, fontSize:12, cursor:'pointer',
                  background: sel ? 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))' : 'var(--surface-2)',
                  border:`1px solid ${sel ? 'var(--primary-glow)' : 'var(--border)'}`,
                  color: sel ? 'var(--text)' : 'var(--text-muted)',
                }}>{t}</button>;
              })}
            </div>
          </Field>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <Field label={STR.tone}>
              <select style={inputStyle} value={form.tone} onChange={e=>set('tone',e.target.value)}>
                <option>friendly-expert</option><option>casual</option><option>formal</option><option>comedic</option><option>inspirational</option>
              </select>
            </Field>
          </div>
          <Field label={STR.audience} aiFilled={aiFor('audience')}>
            <textarea style={{...inputStyle, minHeight:60, resize:'vertical'}} value={form.audience} onChange={e=>set('audience',e.target.value)} placeholder={STR.placeholder}/>
          </Field>
          <Field label={STR.backstory} aiFilled={aiFor('backstory')}>
            <textarea style={{...inputStyle, minHeight:80, resize:'vertical'}} value={form.backstory} onChange={e=>set('backstory',e.target.value)} placeholder={STR.placeholder}/>
          </Field>
        </div>}

        {section === 'visuals' && <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <h3 style={{margin:0, fontFamily:'var(--font-display)', fontSize:18, fontWeight:600}}>{STR.sections.visuals}</h3>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <Field label={STR.style}>
              <select style={inputStyle} value={form.style} onChange={e=>set('style',e.target.value)}>{styles.map(s => <option key={s}>{s}</option>)}</select>
            </Field>
            <Field label={STR.gender}>
              <div style={{display:'flex', gap:6}}>
                {['M','F','Neutral'].map(g => (
                  <button key={g} onClick={()=>set('gender',g.toLowerCase())} style={{
                    flex:1, padding:'9px 10px', borderRadius:8, cursor:'pointer', fontSize:12.5,
                    background: form.gender===g.toLowerCase() ? 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))' : 'var(--surface-2)',
                    border:`1px solid ${form.gender===g.toLowerCase() ? 'var(--primary-glow)' : 'var(--border)'}`,
                    color: form.gender===g.toLowerCase() ? 'var(--text)' : 'var(--text-muted)',
                  }}>{g}</button>
                ))}
              </div>
            </Field>
          </div>
          <Field label={`${STR.age}: ${form.age}`}>
            <input type="range" min={18} max={70} value={form.age} onChange={e=>set('age',+e.target.value)} style={{width:'100%', accentColor:'#7C3AED'}}/>
          </Field>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14}}>
            <Field label={STR.hair} aiFilled={aiFor('hair')}><input style={inputStyle} value={form.hair} onChange={e=>set('hair',e.target.value)} placeholder={STR.placeholder}/></Field>
            <Field label={STR.outfit} aiFilled={aiFor('outfit')}><input style={inputStyle} value={form.outfit} onChange={e=>set('outfit',e.target.value)} placeholder={STR.placeholder}/></Field>
            <Field label={STR.setting} aiFilled={aiFor('setting')}><input style={inputStyle} value={form.setting} onChange={e=>set('setting',e.target.value)} placeholder={STR.placeholder}/></Field>
          </div>
          <Button variant="secondary" icon="sparkles" style={{alignSelf:'flex-start'}}>{isHE ? 'הפק 3 תצוגות' : 'Generate 3 previews'}</Button>
        </div>}

        {section === 'voice' && <div style={{display:'flex', flexDirection:'column', gap:14}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <h3 style={{margin:0, fontFamily:'var(--font-display)', fontSize:18, fontWeight:600}}>{STR.sections.voice}</h3>
            <Button variant="secondary" icon="sparkles">{STR.recommend}</Button>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {voices.map(v => {
              const sel = form.voice.startsWith(v.name);
              return <div key={v.name} onClick={()=>set('voice', `${v.name} · ${v.tags.split('·')[0].trim()}`)} style={{
                display:'flex', alignItems:'center', gap:14, padding:'12px 14px',
                background: sel ? 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(6,182,212,0.12))' : 'var(--surface-2)',
                border:`1px solid ${sel ? 'var(--primary-glow)' : 'var(--border)'}`,
                borderRadius:10, cursor:'pointer'
              }}>
                <button style={{
                  width:32, height:32, borderRadius:99, border:'none', cursor:'pointer',
                  background: sel ? 'var(--brand-gradient)' : 'var(--surface-3)',
                  display:'flex', alignItems:'center', justifyContent:'center'
                }}>
                  <Icon name="play" size={12} color={sel ? '#fff' : 'var(--text-muted)'}/>
                </button>
                <div style={{flex:1}}>
                  <div style={{fontWeight:500, fontSize:14}}>{v.name}</div>
                  <div style={{fontSize:11, color:'var(--text-dim)', fontFamily:'var(--font-mono)'}}>{v.tags}</div>
                </div>
                {sel && <Badge tone="ai">selected</Badge>}
              </div>;
            })}
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:6}}>
            <Field label={`${STR.speed}: ${form.speed.toFixed(2)}×`}>
              <input type="range" min={0.7} max={1.5} step={0.05} value={form.speed} onChange={e=>set('speed',+e.target.value)} style={{width:'100%', accentColor:'#7C3AED'}}/>
            </Field>
            <Field label={STR.emotion}>
              <select style={inputStyle} value={form.emotion} onChange={e=>set('emotion',e.target.value)}>
                <option>neutral</option><option>excited</option><option>calm</option><option>serious</option><option>playful</option>
              </select>
            </Field>
          </div>
        </div>}

        {section === 'brand' && <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <h3 style={{margin:0, fontFamily:'var(--font-display)', fontSize:18, fontWeight:600}}>{STR.sections.brand}</h3>
            <Button variant="secondary" icon="sparkles">{STR.aiSuggest}</Button>
          </div>

          <div>
            <span className="t-label" style={{display:'block', marginBottom:8}}>{STR.colors}</span>
            <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10}}>
              {[
                { k:'primary', l: STR.primary }, { k:'secondary', l: STR.secondary },
                { k:'accent', l: STR.accent }, { k:'bg', l: STR.bg }, { k:'text', l: STR.text }
              ].map(c => (
                <label key={c.k} style={{display:'flex', flexDirection:'column', gap:6, alignItems:'center'}}>
                  <input type="color" value={form[c.k]} onChange={e=>set(c.k, e.target.value)} style={{
                    width:'100%', height:48, border:'1px solid var(--border)', borderRadius:10,
                    background:'var(--surface-2)', cursor:'pointer'
                  }}/>
                  <span style={{fontSize:11, color:'var(--text-muted)'}}>{c.l}</span>
                  <span style={{fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--text-dim)'}}>{form[c.k]}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <Field label={STR.titleFont}>
              <select style={inputStyle} value={form.titleFont} onChange={e=>set('titleFont',e.target.value)}>
                <option>Space Grotesk</option><option>Inter</option><option>Playfair Display</option><option>Bebas Neue</option>
              </select>
            </Field>
            <Field label={STR.bodyFont}>
              <select style={inputStyle} value={form.bodyFont} onChange={e=>set('bodyFont',e.target.value)}>
                <option>Inter</option><option>IBM Plex Sans</option><option>Source Sans Pro</option>
              </select>
            </Field>
          </div>

          <Field label={`${STR.pace}: ${form.pace}/100`}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <span style={{fontSize:11, color:'var(--text-dim)', minWidth:30}}>{STR.slow}</span>
              <input type="range" min={0} max={100} value={form.pace} onChange={e=>set('pace',+e.target.value)} style={{flex:1, accentColor:'#7C3AED'}}/>
              <span style={{fontSize:11, color:'var(--text-dim)', minWidth:30}}>{STR.fast}</span>
            </div>
          </Field>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <Field label={STR.music}>
              <select style={inputStyle} value={form.music} onChange={e=>set('music',e.target.value)}>
                {['lofi','ambient','upbeat','cinematic','electronic','hip-hop','none'].map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label={`${STR.screenTime}: ${form.screenTime}%`}>
              <input type="range" min={0} max={100} value={form.screenTime} onChange={e=>set('screenTime',+e.target.value)} style={{width:'100%', accentColor:'#7C3AED'}}/>
            </Field>
          </div>

          <Field label={STR.visualTypes}>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {allVT.map(v => {
                const sel = form.visualTypes.includes(v);
                return <button key={v} onClick={()=>set('visualTypes', sel ? form.visualTypes.filter(x=>x!==v) : [...form.visualTypes,v])} style={{
                  padding:'6px 11px', borderRadius:99, fontSize:11.5, cursor:'pointer',
                  background: sel ? 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))' : 'var(--surface-2)',
                  border:`1px solid ${sel ? 'var(--primary-glow)' : 'var(--border)'}`,
                  color: sel ? 'var(--text)' : 'var(--text-muted)',
                  fontFamily:'var(--font-mono)',
                }}>{v}</button>;
              })}
            </div>
          </Field>
        </div>}
      </div>

      {/* Live preview */}
      <div style={{borderInlineStart:'1px solid var(--border)', padding:'24px 22px', background:'var(--surface)', overflow:'auto'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
          <span className="t-label">{STR.preview}</span>
          <button onClick={onClose} style={{background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, width:28, height:28, cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <Icon name="close" size={14}/>
          </button>
        </div>
        {/* Phone frame preview */}
        <div style={{
          width:220, height:400, margin:'0 auto', borderRadius:28,
          background: form.bg, border:'8px solid #1C1C26', boxShadow:'0 24px 60px rgba(0,0,0,0.6)',
          padding:14, position:'relative', overflow:'hidden', color: form.text, fontFamily: form.bodyFont
        }}>
          <div style={{position:'absolute', top:-2, left:'50%', transform:'translateX(-50%)', width:60, height:14, background:'#1C1C26', borderRadius:'0 0 12px 12px'}}/>
          <div style={{
            width:'100%', aspectRatio:'9/12', borderRadius:14, marginTop:14,
            background:`linear-gradient(135deg, ${form.primary}, ${form.secondary})`,
            position:'relative', overflow:'hidden',
            display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:12
          }}>
            <div style={{position:'absolute', top:8, left:8, padding:'3px 7px', background:'rgba(0,0,0,0.4)', borderRadius:6, fontSize:9, fontFamily:'var(--font-mono)', color:'#fff'}}>0:24</div>
            <div style={{
              fontFamily: form.titleFont, fontWeight:700, fontSize:18, letterSpacing:'-0.02em', color:'#fff',
              textShadow:'0 2px 8px rgba(0,0,0,0.4)'
            }}>{form.name || (isHE ? 'שם האווטר' : 'Avatar name')}</div>
            <div style={{fontSize:10, color:'rgba(255,255,255,0.85)', marginTop:2}}>{form.niche} · {form.tone}</div>
          </div>
          <div style={{display:'flex', gap:6, marginTop:10}}>
            {form.visualTypes.slice(0,3).map(v => (
              <div key={v} style={{flex:1, height:4, borderRadius:99, background: form.accent, opacity:0.7}}/>
            ))}
          </div>
          <div style={{marginTop:8, fontSize:10, color: form.text, opacity:0.7, fontFamily: form.bodyFont}}>
            ♪ {form.music} · {form.pace > 50 ? (isHE?'קצב מהיר':'fast cuts') : (isHE?'קצב איטי':'slow cuts')}
          </div>
        </div>

        {/* AI fill toggle + actions */}
        <div style={{marginTop:24, padding:'12px 14px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10}}>
          <label style={{display:'flex', alignItems:'center', gap:10, cursor:'pointer'}}>
            <div onClick={()=>setAutoFill(a=>!a)} style={{
              width:34, height:20, borderRadius:99, position:'relative', flexShrink:0,
              background: autoFill ? 'var(--brand-gradient)' : 'var(--surface-3)',
              border:`1px solid ${autoFill?'transparent':'var(--border)'}`, cursor:'pointer',
              transition:'all 200ms'
            }}>
              <div style={{
                position:'absolute', top:1, [autoFill ? (isHE?'right':'left') : (isHE?'left':'right')]: autoFill ? 15 : 1,
                width:14, height:14, borderRadius:99, background:'#fff'
              }}/>
            </div>
            <span style={{fontSize:12, color:'var(--text)', display:'flex', alignItems:'center', gap:6}}>
              <Icon name="sparkles" size={12} color="#A78BFA"/>{STR.autoFill}
            </span>
          </label>
        </div>

        <div style={{display:'flex', gap:8, marginTop:16}}>
          <Button variant="ghost" onClick={onClose} style={{flex:1, justifyContent:'center'}}>{STR.cancel}</Button>
          <Button variant="primary" onClick={()=>{ setSubmitted(true); setTimeout(onCreate, 600); }} style={{flex:2, justifyContent:'center'}}>{STR.create}</Button>
        </div>
      </div>
    </div>
  </div>;
};

window.NewAvatar = NewAvatar;
