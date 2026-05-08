// Avatar Detail — full multi-tab view for a specific persona
// Tabs: Profile, Brand, Voice, Platforms, Schedule, Content, Analytics

const AVATAR_DEEP = {
  a1: {
    description: 'A geeky-but-friendly tech explainer who unpacks shipping infra and AI tooling for engineers who actually build.',
    audience: 'Senior engineers, tech leads, builders aged 25–40 who follow Hacker News',
    tone: 'friendly-expert', traits: ['energetic','geeky','curious','authoritative'],
    backstory: 'Ex-staff engineer at a YC unicorn. Quit to teach. Now ships a video a day.',
    style: 'cinematic', age: 32, gender: 'M', hair: 'short brown, undercut', outfit: 'black tee, charcoal blazer', setting: 'studio with neon strip',
    voice: 'Atlas', voiceTags: 'warm · baritone · EN', speed: 1.05, emotion: 'excited',
    primary: '#7C3AED', secondary: '#06B6D4', accent: '#A78BFA', bg: '#0A0A0F', text: '#F8FAFC',
    titleFont: 'Space Grotesk', bodyFont: 'Inter',
    pace: 72, music: 'electronic', screenTime: 38, visualTypes: ['screen_recording','kinetic_typography','code_visualization'],
    platforms: { yt: { handle: '@techtom', conn: true, posts: 31 }, tt: { handle: '@techtom.eth', conn: true, posts: 28 }, ig: { handle: '', conn: false, posts: 0 } },
    schedule: [
      { day: 'Mon', slots: ['09:00','19:00'] }, { day: 'Tue', slots: ['12:30'] }, { day: 'Wed', slots: ['09:00','19:00'] },
      { day: 'Thu', slots: ['12:30'] }, { day: 'Fri', slots: ['09:00'] }, { day: 'Sat', slots: [] }, { day: 'Sun', slots: ['19:00'] },
    ],
  },
  a3: {
    description: 'הומורן עוקצני בעברית — בדיחות יומיומיות על טכנולוגיה, חיים, ומה שביניהם.',
    audience: 'גילאי 18–35 דוברי עברית שאוהבים סטנדאפ קצר',
    tone: 'comedic', traits: ['sarcastic','playful','warm'],
    backstory: 'דמות בדיונית בהשראת קומיקאי תל-אביבי. מספר את כל מה שאחרים פוחדים לומר.',
    style: 'cartoon', age: 29, gender: 'M', hair: 'curly black, messy', outfit: 'graphic tee, denim jacket', setting: 'urban rooftop',
    voice: 'Quark', voiceTags: 'energetic · tenor · HE', speed: 1.15, emotion: 'playful',
    primary: '#F59E0B', secondary: '#EF4444', accent: '#FCD34D', bg: '#0A0A0F', text: '#F8FAFC',
    titleFont: 'Space Grotesk', bodyFont: 'Inter',
    pace: 88, music: 'hip-hop', screenTime: 65, visualTypes: ['avatar_animation','kinetic_typography','2d_character'],
    platforms: { yt: { handle: '', conn: false, posts: 0 }, tt: { handle: '@comedycarl.he', conn: true, posts: 18 }, ig: { handle: '@comedy.carl', conn: true, posts: 12 } },
    schedule: [
      { day: 'Mon', slots: [] }, { day: 'Tue', slots: ['21:30'] }, { day: 'Wed', slots: ['21:30'] },
      { day: 'Thu', slots: ['21:30'] }, { day: 'Fri', slots: ['18:00'] }, { day: 'Sat', slots: [] }, { day: 'Sun', slots: ['21:30'] },
    ],
  },
};
// Default fallback for any avatar not deeply specified
const defaultDeep = {
  description: 'Auto-generated persona description.', audience: 'General creators 18–34', tone: 'friendly-expert',
  traits: ['warm','energetic'], backstory: 'A creator the AI is still learning about.',
  style: 'cinematic', age: 28, gender: 'F', hair: 'shoulder-length, soft waves', outfit: 'minimal, monochrome', setting: 'softly lit studio',
  voice: 'Nova', voiceTags: 'crisp · alto · EN', speed: 1.0, emotion: 'neutral',
  primary: '#06B6D4', secondary: '#10B981', accent: '#67E8F9', bg: '#0A0A0F', text: '#F8FAFC',
  titleFont: 'Space Grotesk', bodyFont: 'Inter',
  pace: 55, music: 'lofi', screenTime: 50, visualTypes: ['avatar_animation','stock_video'],
  platforms: { yt: { handle: '', conn: false, posts: 0 }, tt: { handle: '', conn: false, posts: 0 }, ig: { handle: '', conn: false, posts: 0 } },
  schedule: [{day:'Mon',slots:['09:00']},{day:'Tue',slots:[]},{day:'Wed',slots:['09:00']},{day:'Thu',slots:[]},{day:'Fri',slots:['09:00']},{day:'Sat',slots:[]},{day:'Sun',slots:[]}],
};

const AvatarDetail = ({ a, lang, onClose }) => {
  const isHE = lang === 'HE';
  const deep = AVATAR_DEEP[a.id] || defaultDeep;
  const [tab, setTab] = React.useState('profile');
  const [persona, setPersona] = React.useState(deep);
  const set = (k,v) => setPersona(p => ({...p, [k]: v}));

  const STR = {
    EN: {
      back: '← Back to avatars', edit: 'Edit', pause: 'Pause', resume: 'Resume', moreActions: 'More',
      tabs: { profile:'Profile', brand:'Brand', voice:'Voice', platforms:'Platforms', schedule:'Schedule', content:'Content', analytics:'Analytics' },
      videos:'Videos', views:'Total views', growth:'30d growth', avg:'Avg engagement',
      description:'Description', audience:'Target audience', tone:'Tone', traits:'Traits', backstory:'Backstory',
      appearance:'Appearance', style:'Style', age:'Age', gender:'Gender', hair:'Hair', outfit:'Outfit', setting:'Setting',
      colorPalette:'Color palette', typography:'Typography', titleFont:'Title font', bodyFont:'Body font',
      pace:'Editing pace', music:'Music genre', screenTime:'Avatar screen-time', visualTypes:'Visual types',
      brandPreview:'Brand in action', primary:'Primary', secondary:'Secondary', accent:'Accent', bg:'Background', text:'Text',
      voiceLib:'Voice library', currentVoice:'Current voice', speed:'Speed', emotion:'Emotion', preview:'Preview',
      aiRecommends:'AI recommends', whyMatch:'Why this matches',
      connect:'Connect', connected:'Connected', disconnect:'Disconnect', autoPublish:'Auto-publish',
      slot:'+ Add slot', empty:'No posts',
      recent:'Recent content', filter:'All',
      perfBy:'Performance by platform', topVideos:'Top videos', insights:'AI insights',
      slow:'slow', fast:'fast',
    },
    HE: {
      back: '→ חזרה לאווטרים', edit: 'עריכה', pause: 'השהיה', resume: 'הפעלה', moreActions: 'עוד',
      tabs: { profile:'פרופיל', brand:'מותג', voice:'קול', platforms:'פלטפורמות', schedule:'תזמון', content:'תוכן', analytics:'ניתוחים' },
      videos:'סרטונים', views:'סך צפיות', growth:'צמיחה 30 יום', avg:'מעורבות ממוצעת',
      description:'תיאור', audience:'קהל יעד', tone:'טון', traits:'תכונות', backstory:'רקע',
      appearance:'מראה', style:'סגנון', age:'גיל', gender:'מגדר', hair:'שיער', outfit:'לבוש', setting:'רקע צילום',
      colorPalette:'פלטת צבעים', typography:'טיפוגרפיה', titleFont:'פונט כותרות', bodyFont:'פונט גוף',
      pace:'קצב עריכה', music:'מוזיקה', screenTime:'נוכחות אווטר', visualTypes:'סוגי ויזואל',
      brandPreview:'המותג בפעולה', primary:'ראשי', secondary:'משני', accent:'הדגשה', bg:'רקע', text:'טקסט',
      voiceLib:'ספריית קולות', currentVoice:'קול נוכחי', speed:'מהירות', emotion:'רגש', preview:'השמע',
      aiRecommends:'המלצת AI', whyMatch:'למה זה מתאים',
      connect:'חבר', connected:'מחובר', disconnect:'נתק', autoPublish:'פרסום אוטומטי',
      slot:'+ הוסף סלוט', empty:'אין פוסטים',
      recent:'תוכן אחרון', filter:'הכול',
      perfBy:'ביצועים לפי פלטפורמה', topVideos:'סרטונים מובילים', insights:'תובנות AI',
      slow:'איטי', fast:'מהיר',
    }
  }[lang];

  const tabs = ['profile','brand','voice','platforms','schedule','content','analytics'];

  const inputStyle = {
    background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10,
    padding:'9px 12px', color:'var(--text)', fontFamily:'var(--font-body)', fontSize:13.5,
    outline:'none', width:'100%', boxSizing:'border-box',
    textAlign: isHE ? 'right' : 'left',
  };

  const Field = ({ label, children, full }) => (
    <label style={{display:'flex', flexDirection:'column', gap:6, gridColumn: full?'1 / -1':'auto'}}>
      <span className="t-label">{label}</span>
      {children}
    </label>
  );

  // ==== Tab content ====

  const ProfileTab = () => (
    <div style={{display:'flex', flexDirection:'column', gap:18}}>
      <div className="t-h3">{STR.tabs.profile}</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Field label={STR.description} full>
          <textarea style={{...inputStyle, minHeight:70, resize:'vertical'}} value={persona.description} onChange={e=>set('description',e.target.value)}/>
        </Field>
        <Field label={STR.audience}>
          <textarea style={{...inputStyle, minHeight:60, resize:'vertical'}} value={persona.audience} onChange={e=>set('audience',e.target.value)}/>
        </Field>
        <Field label={STR.tone}>
          <select style={inputStyle} value={persona.tone} onChange={e=>set('tone',e.target.value)}>
            <option>friendly-expert</option><option>casual</option><option>formal</option><option>comedic</option><option>inspirational</option>
          </select>
        </Field>
        <Field label={STR.traits} full>
          <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
            {['energetic','calm','geeky','sarcastic','warm','authoritative','friendly','curious','playful','professional'].map(tr => {
              const sel = persona.traits.includes(tr);
              return <button key={tr} onClick={()=>set('traits', sel ? persona.traits.filter(x=>x!==tr) : [...persona.traits,tr])} style={{
                padding:'5px 11px', borderRadius:99, fontSize:12, cursor:'pointer',
                background: sel ? 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))' : 'var(--surface-2)',
                border:`1px solid ${sel ? 'var(--primary-glow)' : 'var(--border)'}`,
                color: sel ? 'var(--text)' : 'var(--text-muted)', fontFamily:'var(--font-body)',
              }}>{tr}</button>;
            })}
          </div>
        </Field>
        <Field label={STR.backstory} full>
          <textarea style={{...inputStyle, minHeight:70, resize:'vertical'}} value={persona.backstory} onChange={e=>set('backstory',e.target.value)}/>
        </Field>
      </div>

      <div className="t-h3" style={{fontSize:16, marginTop:8}}>{STR.appearance}</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14}}>
        <Field label={STR.style}>
          <select style={inputStyle} value={persona.style} onChange={e=>set('style',e.target.value)}>
            <option>cinematic</option><option>realistic</option><option>cartoon</option><option>anime</option><option>3d-render</option><option>illustrated</option>
          </select>
        </Field>
        <Field label={STR.gender}>
          <select style={inputStyle} value={persona.gender} onChange={e=>set('gender',e.target.value)}>
            <option>M</option><option>F</option><option>Neutral</option>
          </select>
        </Field>
        <Field label={`${STR.age}: ${persona.age}`}>
          <input type="range" min={18} max={70} value={persona.age} onChange={e=>set('age',+e.target.value)} style={{width:'100%', accentColor:'#7C3AED'}}/>
        </Field>
        <Field label={STR.hair}><input style={inputStyle} value={persona.hair} onChange={e=>set('hair',e.target.value)}/></Field>
        <Field label={STR.outfit}><input style={inputStyle} value={persona.outfit} onChange={e=>set('outfit',e.target.value)}/></Field>
        <Field label={STR.setting}><input style={inputStyle} value={persona.setting} onChange={e=>set('setting',e.target.value)}/></Field>
      </div>
    </div>
  );

  const BrandPreview = () => (
    <div style={{
      background: persona.bg, border:'1px solid var(--border)', borderRadius:14,
      padding:'24px 22px', position:'relative', overflow:'hidden', minHeight:280
    }}>
      <div style={{position:'absolute', width:240, height:240, borderRadius:'50%',
        background: persona.primary, filter:'blur(80px)', opacity:0.35, top:-60, left:-40, pointerEvents:'none'}}/>
      <div style={{position:'absolute', width:200, height:200, borderRadius:'50%',
        background: persona.secondary, filter:'blur(80px)', opacity:0.3, bottom:-50, right:-30, pointerEvents:'none'}}/>
      <div style={{position:'relative'}}>
        <span style={{
          fontFamily: persona.bodyFont, fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase',
          color: persona.accent, fontWeight:600
        }}>Episode 142</span>
        <h2 style={{
          fontFamily: persona.titleFont, fontWeight:700, fontSize:36, letterSpacing:'-0.02em',
          margin:'10px 0 6px', color: persona.text, lineHeight:1.1, maxWidth:420
        }}>
          <span style={{background:`linear-gradient(135deg, ${persona.primary}, ${persona.secondary})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>
            {a.name === 'TechTom' ? 'GPUs broke the internet' : a.name === 'Comedy Carl' ? 'הקטע של הפיצה' : 'Today\'s drop'}
          </span>
        </h2>
        <p style={{fontFamily: persona.bodyFont, color: persona.text, opacity:0.7, fontSize:14, lineHeight:1.5, margin:'0 0 18px', maxWidth:440}}>
          {a.name === 'TechTom' ? 'Three weeks ago training prices broke a record. The fix is sitting in PyTorch 2.5.' :
           a.name === 'Comedy Carl' ? 'אתה יודע מה הכי מעצבן בפיצה? שאף פעם לא יודעים אם להשאיר משהו לבוקר.' :
           'A small daily story, told well.'}
        </p>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <button style={{
            padding:'9px 16px', borderRadius:10, border:'none', cursor:'pointer',
            background: `linear-gradient(135deg, ${persona.primary}, ${persona.secondary})`,
            color:'#fff', fontFamily: persona.bodyFont, fontWeight:600, fontSize:13
          }}>Watch now</button>
          <button style={{
            padding:'9px 14px', borderRadius:10, cursor:'pointer',
            background:'transparent', color: persona.text,
            border: `1px solid ${persona.accent}`, fontFamily: persona.bodyFont, fontWeight:500, fontSize:13
          }}>Subscribe</button>
        </div>
      </div>
    </div>
  );

  const BrandTab = () => (
    <div style={{display:'flex', flexDirection:'column', gap:20}}>
      <div className="t-h3">{STR.tabs.brand}</div>
      <BrandPreview/>

      <div className="t-h3" style={{fontSize:16}}>{STR.colorPalette}</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10}}>
        {[
          { k:'primary', l: STR.primary }, { k:'secondary', l: STR.secondary },
          { k:'accent', l: STR.accent }, { k:'bg', l: STR.bg }, { k:'text', l: STR.text }
        ].map(c => (
          <label key={c.k} style={{display:'flex', flexDirection:'column', gap:6}}>
            <input type="color" value={persona[c.k]} onChange={e=>set(c.k, e.target.value)} style={{
              width:'100%', height:54, border:'1px solid var(--border)', borderRadius:10,
              background:'var(--surface-2)', cursor:'pointer', padding:0
            }}/>
            <span style={{fontSize:11, color:'var(--text-muted)'}}>{c.l}</span>
            <span style={{fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--text-dim)'}}>{persona[c.k]}</span>
          </label>
        ))}
      </div>

      <div className="t-h3" style={{fontSize:16}}>{STR.typography}</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Field label={STR.titleFont}>
          <select style={inputStyle} value={persona.titleFont} onChange={e=>set('titleFont',e.target.value)}>
            <option>Space Grotesk</option><option>Inter</option><option>Playfair Display</option><option>Bebas Neue</option><option>JetBrains Mono</option>
          </select>
        </Field>
        <Field label={STR.bodyFont}>
          <select style={inputStyle} value={persona.bodyFont} onChange={e=>set('bodyFont',e.target.value)}>
            <option>Inter</option><option>IBM Plex Sans</option><option>Source Sans Pro</option>
          </select>
        </Field>
      </div>

      <div className="t-h3" style={{fontSize:16}}>Editorial</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Field label={`${STR.pace}: ${persona.pace}/100`}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <span style={{fontSize:11, color:'var(--text-dim)', minWidth:30}}>{STR.slow}</span>
            <input type="range" min={0} max={100} value={persona.pace} onChange={e=>set('pace',+e.target.value)} style={{flex:1, accentColor:'#7C3AED'}}/>
            <span style={{fontSize:11, color:'var(--text-dim)', minWidth:30}}>{STR.fast}</span>
          </div>
        </Field>
        <Field label={STR.music}>
          <select style={inputStyle} value={persona.music} onChange={e=>set('music',e.target.value)}>
            {['lofi','ambient','upbeat','cinematic','electronic','hip-hop','none'].map(m => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label={`${STR.screenTime}: ${persona.screenTime}%`} full>
          <input type="range" min={0} max={100} value={persona.screenTime} onChange={e=>set('screenTime',+e.target.value)} style={{width:'100%', accentColor:'#7C3AED'}}/>
        </Field>
      </div>
      <Field label={STR.visualTypes} full>
        <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
          {['avatar_animation','screen_recording','stock_video','kinetic_typography','lottie_animation','ai_generated_clip','code_visualization','whiteboard','2d_character'].map(v => {
            const sel = persona.visualTypes.includes(v);
            return <button key={v} onClick={()=>set('visualTypes', sel ? persona.visualTypes.filter(x=>x!==v) : [...persona.visualTypes,v])} style={{
              padding:'5px 11px', borderRadius:99, fontSize:11.5, cursor:'pointer',
              background: sel ? 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))' : 'var(--surface-2)',
              border:`1px solid ${sel ? 'var(--primary-glow)' : 'var(--border)'}`,
              color: sel ? 'var(--text)' : 'var(--text-muted)', fontFamily:'var(--font-mono)',
            }}>{v}</button>;
          })}
        </div>
      </Field>
    </div>
  );

  const VoiceTab = () => {
    const voices = [
      { name: 'Atlas', tags: 'warm · baritone · EN', match: 92 },
      { name: 'Nova', tags: 'crisp · alto · EN', match: 64 },
      { name: 'Sage', tags: 'calm · mezzo · EN/HE', match: 71 },
      { name: 'Quark', tags: 'energetic · tenor · EN/HE', match: 86 },
      { name: 'Luma', tags: 'soft · soprano · EN', match: 48 },
    ];
    const recommended = voices.reduce((a,b) => b.match > a.match ? b : a);

    return <div style={{display:'flex', flexDirection:'column', gap:18}}>
      <div className="t-h3">{STR.tabs.voice}</div>

      {/* AI recommendation panel */}
      <div style={{
        padding:'18px 20px', borderRadius:14,
        background:'linear-gradient(135deg, rgba(124,58,237,0.14), rgba(6,182,212,0.14))',
        border:'1px solid rgba(167,139,250,0.4)', position:'relative', overflow:'hidden'
      }}>
        <div style={{position:'absolute', width:160, height:160, borderRadius:'50%', background:'#7C3AED', filter:'blur(80px)', opacity:0.25, top:-40, right:-40}}/>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10, position:'relative'}}>
          <Icon name="sparkles" size={16} color="#A78BFA"/>
          <span style={{fontSize:12, fontWeight:600, color:'var(--primary-glow)', letterSpacing:'0.04em', textTransform:'uppercase'}}>{STR.aiRecommends}</span>
          <Badge tone="ai" style={{marginInlineStart:'auto'}}>{recommended.match}% match</Badge>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:14, position:'relative'}}>
          <button style={{
            width:42, height:42, borderRadius:99, border:'none', cursor:'pointer',
            background:'var(--brand-gradient)', display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 8px 22px rgba(124,58,237,0.4)'
          }}><Icon name="play" size={14} color="#fff"/></button>
          <div>
            <div style={{fontFamily:'var(--font-display)', fontSize:20, fontWeight:700, letterSpacing:'-0.02em'}}>{recommended.name}</div>
            <div style={{fontSize:12, color:'var(--text-muted)', fontFamily:'var(--font-mono)'}}>{recommended.tags}</div>
          </div>
          <div style={{flex:1}}/>
          <Button variant="primary" onClick={()=>set('voice', recommended.name)}>{isHE ? 'בחר' : 'Use this voice'}</Button>
        </div>
        <div style={{position:'relative', display:'flex', flexDirection:'column', gap:6}}>
          <span style={{fontSize:11, fontWeight:600, color:'var(--text-muted)', letterSpacing:'0.04em', textTransform:'uppercase'}}>{STR.whyMatch}</span>
          {[
            isHE ? `התאמה לטון "${persona.tone}" — תכונה מובילה: ${persona.traits[0]}` : `Matches your "${persona.tone}" tone with the trait "${persona.traits[0]}"`,
            isHE ? `קצב מהירות ${persona.speed.toFixed(2)}× מתאים לעריכה ${persona.pace>50?'מהירה':'איטית'}` : `Speed ${persona.speed.toFixed(2)}× suits your ${persona.pace>50?'fast-cut':'slow-cut'} editing pace`,
            isHE ? `מבוסס על 24K צפיות מסרטונים דומים` : 'Based on 24K views from similar avatars in your niche',
          ].map((reason, i) => (
            <div key={i} style={{display:'flex', alignItems:'flex-start', gap:8, fontSize:13, color:'var(--text)', lineHeight:1.45}}>
              <span style={{color:'var(--primary-glow)', flexShrink:0, marginTop:2}}>✦</span>
              {reason}
            </div>
          ))}
        </div>
      </div>

      <div className="t-h3" style={{fontSize:15}}>{STR.voiceLib}</div>
      <div style={{display:'flex', flexDirection:'column', gap:8}}>
        {voices.map(v => {
          const sel = persona.voice === v.name;
          return <div key={v.name} onClick={()=>set('voice', v.name)} style={{
            display:'flex', alignItems:'center', gap:14, padding:'12px 14px',
            background: sel ? 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(6,182,212,0.12))' : 'var(--surface-2)',
            border:`1px solid ${sel ? 'var(--primary-glow)' : 'var(--border)'}`,
            borderRadius:10, cursor:'pointer'
          }}>
            <button style={{
              width:34, height:34, borderRadius:99, border:'none', cursor:'pointer',
              background: sel ? 'var(--brand-gradient)' : 'var(--surface-3)',
              display:'flex', alignItems:'center', justifyContent:'center'
            }}><Icon name="play" size={12} color={sel ? '#fff' : 'var(--text-muted)'}/></button>
            <div style={{flex:1}}>
              <div style={{fontWeight:500, fontSize:14}}>{v.name}</div>
              <div style={{fontSize:11, color:'var(--text-dim)', fontFamily:'var(--font-mono)'}}>{v.tags}</div>
            </div>
            {/* Match meter */}
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{width:80, height:4, background:'var(--surface-3)', borderRadius:99, overflow:'hidden'}}>
                <div style={{width:`${v.match}%`, height:'100%', background: v.match>80?'var(--brand-gradient)' : v.match>60?'#A78BFA':'var(--text-dim)'}}/>
              </div>
              <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)', minWidth:32, textAlign:'end'}}>{v.match}%</span>
            </div>
            {sel && <Badge tone="ai">selected</Badge>}
          </div>;
        })}
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:6}}>
        <Field label={`${STR.speed}: ${persona.speed.toFixed(2)}×`}>
          <input type="range" min={0.7} max={1.5} step={0.05} value={persona.speed} onChange={e=>set('speed',+e.target.value)} style={{width:'100%', accentColor:'#7C3AED'}}/>
        </Field>
        <Field label={STR.emotion}>
          <select style={inputStyle} value={persona.emotion} onChange={e=>set('emotion',e.target.value)}>
            <option>neutral</option><option>excited</option><option>calm</option><option>serious</option><option>playful</option>
          </select>
        </Field>
      </div>
    </div>;
  };

  const PlatformsTab = () => {
    const plats = [
      { id:'yt', name:'YouTube', glyph:'youtube', color:'#EF4444', followers:'24.1K' },
      { id:'tt', name:'TikTok', glyph:'tiktok', color:'#67E8F9', followers:'48.6K' },
      { id:'ig', name:'Instagram', glyph:'instagram', color:'#A78BFA', followers:'12.3K' },
    ];
    return <div style={{display:'flex', flexDirection:'column', gap:14}}>
      <div className="t-h3">{STR.tabs.platforms}</div>
      {plats.map(p => {
        const data = persona.platforms[p.id];
        return <div key={p.id} style={{
          display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:18, alignItems:'center',
          padding:'16px 18px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14
        }}>
          <div style={{
            width:42, height:42, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center',
            background: data.conn ? `${p.color}22` : 'var(--surface-2)', border:`1px solid ${data.conn ? p.color+'55' : 'var(--border)'}`
          }}>
            <Icon name={p.glyph} size={22} color={data.conn ? p.color : 'var(--text-dim)'}/>
          </div>
          <div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <span style={{fontFamily:'var(--font-display)', fontSize:16, fontWeight:600}}>{p.name}</span>
              {data.conn ? <Badge tone="success">{STR.connected}</Badge> : <Badge tone="neutral">offline</Badge>}
            </div>
            <div style={{fontSize:12, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginTop:3}}>
              {data.handle || '— not connected —'}
            </div>
          </div>
          {data.conn && <div style={{textAlign:isHE?'left':'right'}}>
            <div style={{fontFamily:'var(--font-mono)', fontSize:18, fontWeight:600}}>{data.posts}</div>
            <div style={{fontSize:10.5, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em'}}>{STR.tabs.content.toLowerCase()}</div>
          </div>}
          <Button variant={data.conn ? 'secondary' : 'primary'}>
            {data.conn ? STR.disconnect : STR.connect}
          </Button>
        </div>;
      })}

      <div style={{
        marginTop:8, padding:'14px 18px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14,
        display:'flex', alignItems:'center', justifyContent:'space-between'
      }}>
        <div>
          <div style={{fontWeight:500, fontSize:14}}>{STR.autoPublish}</div>
          <div style={{fontSize:12, color:'var(--text-muted)', marginTop:2}}>
            {isHE ? 'סרטונים שעוברים בדיקת איכות יפורסמו אוטומטית' : 'Videos that pass the quality check post automatically'}
          </div>
        </div>
        <div style={{
          width:38, height:22, borderRadius:99, position:'relative',
          background:'var(--brand-gradient)', cursor:'pointer'
        }}>
          <div style={{position:'absolute', top:2, [isHE?'left':'right']:2, width:16, height:16, borderRadius:99, background:'#fff'}}/>
        </div>
      </div>
    </div>;
  };

  const ScheduleTab = () => (
    <div style={{display:'flex', flexDirection:'column', gap:18}}>
      <div className="t-h3">{STR.tabs.schedule}</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8}}>
        {persona.schedule.map((d,i) => (
          <div key={i} style={{
            background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12,
            padding:'12px 10px', minHeight:160, display:'flex', flexDirection:'column', gap:8
          }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <span style={{fontFamily:'var(--font-display)', fontSize:13, fontWeight:600}}>{d.day}</span>
              <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-dim)'}}>{d.slots.length}</span>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:6, flex:1}}>
              {d.slots.map((s,si) => (
                <div key={si} style={{
                  padding:'6px 8px', background:'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(6,182,212,0.18))',
                  border:'1px solid rgba(167,139,250,0.4)', borderRadius:8,
                  fontFamily:'var(--font-mono)', fontSize:11, fontWeight:500, color:'var(--primary-glow)',
                  textAlign:'center'
                }}>{s}</div>
              ))}
              {d.slots.length === 0 && <div style={{fontSize:10.5, color:'var(--text-dim)', textAlign:'center', marginTop:'auto', marginBottom:'auto'}}>{STR.empty}</div>}
            </div>
            <button style={{
              padding:'5px 8px', background:'transparent', border:'1px dashed var(--border)', borderRadius:7,
              color:'var(--text-muted)', fontSize:10.5, cursor:'pointer'
            }}>{STR.slot}</button>
          </div>
        ))}
      </div>

      {/* Heatmap-ish best-times suggestion */}
      <div style={{
        padding:'16px 18px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14
      }}>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
          <Icon name="sparkles" size={14} color="#A78BFA"/>
          <span style={{fontSize:12, fontWeight:600, color:'var(--primary-glow)', letterSpacing:'0.04em', textTransform:'uppercase'}}>{STR.aiRecommends}</span>
        </div>
        <div style={{fontSize:13, lineHeight:1.5}}>
          {isHE
            ? `${a.name} מקבל פי 2.3 צפיות בפרסום ב-19:00 בימי שני, רביעי וחמישי. הוסף סלוטים?`
            : `${a.name} gets 2.3× the views when posting at 7 PM on Mondays, Wednesdays, and Thursdays. Add slots?`}
        </div>
        <div style={{display:'flex', gap:8, marginTop:10}}>
          <Button variant="primary">{isHE ? 'החל את ההמלצה' : 'Apply suggestion'}</Button>
          <Button variant="ghost">{isHE ? 'דחה' : 'Dismiss'}</Button>
        </div>
      </div>
    </div>
  );

  const ContentTab = () => {
    const all = window.MOCK.videos.filter(v => v.avatar === a.name);
    const list = all.length ? all : window.MOCK.videos.slice(0,4); // fall back
    return <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div className="t-h3">{STR.recent}</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14}}>
        {list.map(v => (
          <div key={v.id} style={{cursor:'pointer'}}>
            <div style={{
              width:'100%', aspectRatio:'16/10', borderRadius:10, background:v.thumb,
              position:'relative', overflow:'hidden', marginBottom:8
            }}>
              <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,transparent 50%, rgba(0,0,0,0.6))'}}/>
              <div style={{position:'absolute',top:8, [isHE?'right':'left']:8}}>
                <Badge tone={v.status==='posted'?'success':v.status==='rendering'?'warning':v.status==='failed'?'danger':v.status==='ready'?'info':'neutral'} pulse={v.status==='rendering'}>{v.status}</Badge>
              </div>
              <div style={{position:'absolute',bottom:8, [isHE?'left':'right']:8,fontFamily:'var(--font-mono)',fontSize:11,color:'#fff',fontWeight:500}}>{v.views !== '—' ? `${v.views} views` : ''}</div>
            </div>
            <div style={{fontSize:13, fontWeight:500, color:'var(--text)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{v.title}</div>
            <div style={{fontSize:11, color:'var(--text-dim)'}}>{v.created}</div>
          </div>
        ))}
      </div>
    </div>;
  };

  const AnalyticsTab = () => {
    const platBars = [
      { name:'YouTube', value: 248, color:'#EF4444' },
      { name:'TikTok', value: 392, color:'#67E8F9' },
      { name:'Instagram', value: 87, color:'#A78BFA' },
    ];
    const max = Math.max(...platBars.map(p=>p.value));
    return <div style={{display:'flex', flexDirection:'column', gap:18}}>
      <div className="t-h3">{STR.tabs.analytics}</div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14}}>
        <StatTile label={STR.videos} value={String(a.videos)} delta="+3" spark={[20,22,25,28,30,31,33,a.videos]}/>
        <StatTile label={STR.views} value={a.views} delta={a.growth} spark={[160,180,200,215,220,235,242,248]} gradient/>
        <StatTile label={STR.growth} value={a.growth} delta="vs last 30d" spark={[5,8,10,12,14,16,17,18]}/>
        <StatTile label={STR.avg} value="6.4%" delta="+0.8%" spark={[4,5,5,5.5,6,6.2,6.3,6.4]}/>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Card>
          <h3 style={{margin:'0 0 14px', fontFamily:'var(--font-display)', fontSize:15, fontWeight:600}}>{STR.perfBy}</h3>
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {platBars.map((p,i) => (
              <div key={i}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:5}}>
                  <span style={{fontSize:13}}>{p.name}</span>
                  <span style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text-muted)'}}>{p.value}K</span>
                </div>
                <div style={{height:8, background:'var(--surface-2)', borderRadius:99, overflow:'hidden'}}>
                  <div style={{width:`${(p.value/max)*100}%`, height:'100%', background:p.color, boxShadow:`0 0 12px ${p.color}55`}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:14}}>
            <Icon name="sparkles" size={16} color="#A78BFA"/>
            <h3 style={{margin:0, fontFamily:'var(--font-display)', fontSize:15, fontWeight:600}}>{STR.insights}</h3>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {[
              { t: isHE ? `${a.name} ב-19:00 - פי 2.3 צפיות` : `${a.name} at 7 PM gets 2.3× views`, c: 87 },
              { t: isHE ? 'הוקים בצורת שאלה - +34% רטנשן' : 'Question-form hooks: +34% retention', c: 92 },
              { t: isHE ? `סגנון ${persona.style} עובד הכי טוב בנישה שלך` : `${persona.style} style outperforms others in your niche`, c: 71 },
            ].map((ins, i) => (
              <div key={i} style={{padding:'10px 12px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10}}>
                <div style={{fontSize:13, lineHeight:1.45, color:'var(--text)', marginBottom:6}}>{ins.t}</div>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div style={{flex:1, height:3, background:'var(--surface-3)', borderRadius:99, overflow:'hidden'}}>
                    <div style={{width:`${ins.c}%`, height:'100%', background:'var(--brand-gradient)'}}/>
                  </div>
                  <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)'}}>{ins.c}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>;
  };

  const tabContent = {
    profile: <ProfileTab/>, brand: <BrandTab/>, voice: <VoiceTab/>,
    platforms: <PlatformsTab/>, schedule: <ScheduleTab/>, content: <ContentTab/>, analytics: <AnalyticsTab/>,
  }[tab];

  return <div style={{padding:'20px 32px 40px', position:'relative'}}>
    {/* Ambient blob keyed off persona color */}
    <div style={{position:'fixed', width:380, height:380, borderRadius:'50%', background:persona.primary, filter:'blur(120px)', opacity:0.18, top:60, [isHE?'left':'right']:'30%', pointerEvents:'none', zIndex:0}}/>
    <div style={{position:'fixed', width:340, height:340, borderRadius:'50%', background:persona.secondary, filter:'blur(120px)', opacity:0.14, bottom:0, [isHE?'right':'left']:0, pointerEvents:'none', zIndex:0}}/>

    {/* Back link */}
    <button onClick={onClose} style={{
      background:'transparent', border:'none', color:'var(--text-muted)', cursor:'pointer',
      fontFamily:'var(--font-body)', fontSize:13, padding:'4px 0', marginBottom:16, position:'relative', zIndex:1
    }}>{STR.back}</button>

    {/* Header card */}
    <Card style={{
      padding:0, overflow:'hidden', marginBottom:20, position:'relative', zIndex:1,
      background:`linear-gradient(135deg, ${persona.primary}1A, ${persona.secondary}14)`
    }}>
      <div style={{padding:'24px 28px', display:'flex', alignItems:'center', gap:20, position:'relative', overflow:'hidden'}}>
        <div style={{position:'absolute', width:200, height:200, borderRadius:'50%', background:persona.primary, filter:'blur(60px)', opacity:0.35, top:-50, [isHE?'right':'left']:-50}}/>
        <Avatar a={a} size={88}/>
        <div style={{flex:1, position:'relative'}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <h1 style={{margin:0, fontFamily:'var(--font-display)', fontSize:32, fontWeight:700, letterSpacing:'-0.02em'}}>{a.name}</h1>
            <span style={{
              width:10, height:10, borderRadius:99,
              background: a.status==='active' ? 'var(--success)' : 'var(--text-dim)',
              boxShadow: a.status==='active' ? '0 0 10px rgba(16,185,129,0.6)' : 'none'
            }}/>
          </div>
          <div style={{display:'flex', gap:6, marginTop:8}}>
            <Badge tone="neutral">{a.niche}</Badge>
            <Badge tone="neutral">{a.lang}</Badge>
            <Badge tone="ai">{persona.tone}</Badge>
          </div>
        </div>
        <div style={{display:'flex', gap:8, position:'relative'}}>
          <Button variant="secondary">{a.status==='active' ? STR.pause : STR.resume}</Button>
          <Button variant="primary" icon="plus">New video</Button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex', borderTop:'1px solid var(--border)', overflowX:'auto'}}>
        {tabs.map(tb => (
          <button key={tb} onClick={()=>setTab(tb)} style={{
            padding:'14px 18px', border:'none', background:'transparent', cursor:'pointer',
            color: tab===tb ? 'var(--text)' : 'var(--text-muted)',
            fontFamily:'var(--font-body)', fontSize:13.5, fontWeight: tab===tb ? 600 : 500,
            borderBottom:`2px solid ${tab===tb ? 'var(--primary-glow)' : 'transparent'}`, marginBottom:-1,
            whiteSpace:'nowrap'
          }}>{STR.tabs[tb]}</button>
        ))}
      </div>
    </Card>

    {/* Tab body */}
    <div style={{position:'relative', zIndex:1}}>{tabContent}</div>
  </div>;
};

window.AvatarDetail = AvatarDetail;
