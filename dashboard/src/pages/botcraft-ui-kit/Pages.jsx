// Trends, Learnings, Settings, and empty states

// =================== TRENDS ===================
const TRENDS_DATA = [
  { id:'t1', title:'AI agents replace junior devs', source:'twitter', heat:94, growth:'+412%', volume:'2.1M', niche:'tech', color:'#7C3AED', spark:[10,18,28,42,58,76,88,94] },
  { id:'t2', title:'5-minute morning workouts', source:'tiktok', heat:88, growth:'+186%', volume:'890K', niche:'fitness', color:'#EF4444', spark:[24,30,38,52,64,72,82,88] },
  { id:'t3', title:'The pizza monologue', source:'youtube', heat:82, growth:'+340%', volume:'1.4M', niche:'humor', color:'#F59E0B', spark:[8,12,22,38,55,68,78,82] },
  { id:'t4', title:'Cold plunge benefits debunked', source:'reddit', heat:79, growth:'+92%', volume:'420K', niche:'wellness', color:'#06B6D4', spark:[40,42,48,55,60,68,74,79] },
  { id:'t5', title:'Why Rust ate the backend', source:'youtube', heat:74, growth:'+58%', volume:'620K', niche:'tech', color:'#A78BFA', spark:[44,48,52,58,62,66,70,74] },
  { id:'t6', title:'Box breathing in 60 seconds', source:'tiktok', heat:71, growth:'+124%', volume:'310K', niche:'wellness', color:'#10B981', spark:[28,34,42,50,56,62,68,71] },
];
const SOURCES = [
  { id:'all', label:'All sources', icon:null },
  { id:'youtube', label:'YouTube', icon:'youtube', color:'#EF4444' },
  { id:'tiktok', label:'TikTok', icon:'tiktok', color:'#67E8F9' },
  { id:'twitter', label:'X/Twitter', icon:'globe', color:'#A78BFA' },
  { id:'reddit', label:'Reddit', icon:'globe', color:'#F59E0B' },
];

const TrendsPage = ({ t, lang }) => {
  const isHE = lang === 'HE';
  const [src, setSrc] = React.useState('all');
  const [niche, setNiche] = React.useState('all');
  const list = TRENDS_DATA.filter(x => (src==='all'||x.source===src) && (niche==='all'||x.niche===niche));
  const STR = isHE ? {
    h:'מגמות חיות', sub:'מה בוער עכשיו ברשת — בחר מגמה והאווטר ינסח ממנה גרסה משלך',
    src:'מקור', niche:'נישה', heat:'חום', growth:'צמיחה 24 שעות', volume:'נפח', use:'הקצה לאווטר',
    distHead:'התפלגות לפי נישה', volHead:'נפח לפי שעה (24 שעות)',
  } : {
    h:'Live trends', sub:'What\'s heating up — pick a trend and an avatar will draft a take in your brand',
    src:'Source', niche:'Niche', heat:'Heat', growth:'24h growth', volume:'Volume', use:'Assign to avatar',
    distHead:'Distribution by niche', volHead:'Volume by hour (24h)',
  };

  // Niche pie wedges
  const nicheStats = ['tech','fitness','humor','wellness'].map(n => ({
    n, c: TRENDS_DATA.filter(x=>x.niche===n).length,
    color: { tech:'#7C3AED', fitness:'#EF4444', humor:'#F59E0B', wellness:'#06B6D4' }[n]
  }));
  const total = nicheStats.reduce((a,b)=>a+b.c,0);
  let cumul = 0;
  const wedges = nicheStats.map(s => {
    const start = cumul/total;
    cumul += s.c;
    const end = cumul/total;
    return { ...s, start, end };
  });

  // Volume sample (24 hours)
  const hours = Array.from({length:24},(_,i) => 30 + Math.round(40*Math.sin(i/3.8)) + (i>16?20:0) + (i===19?35:0));

  return <div style={{padding:'28px 32px', position:'relative'}}>
    <div style={{position:'fixed', width:380, height:380, borderRadius:'50%', background:'#F59E0B', filter:'blur(120px)', opacity:0.12, top:60, [isHE?'left':'right']:'25%', pointerEvents:'none', zIndex:0}}/>

    <div style={{position:'relative', zIndex:1, marginBottom:22}}>
      <h1 style={{margin:0, fontFamily:'var(--font-display)', fontSize:30, fontWeight:700, letterSpacing:'-0.02em'}}>
        <span style={{background:'var(--brand-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>{STR.h}</span>
      </h1>
      <p style={{margin:'6px 0 0', color:'var(--text-muted)', fontSize:14}}>{STR.sub}</p>
    </div>

    {/* Filters */}
    <div style={{display:'flex', gap:10, marginBottom:18, flexWrap:'wrap', position:'relative', zIndex:1}}>
      <div style={{display:'flex', gap:4, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:3}}>
        {SOURCES.map(s => (
          <button key={s.id} onClick={()=>setSrc(s.id)} style={{
            padding:'6px 12px', border:'none', borderRadius:7, cursor:'pointer',
            background: src===s.id ? 'var(--surface-3)' : 'transparent',
            color: src===s.id ? 'var(--text)' : 'var(--text-muted)',
            fontFamily:'var(--font-body)', fontSize:12, fontWeight:500,
            display:'flex', alignItems:'center', gap:6
          }}>{s.icon && <Icon name={s.icon} size={12} color={src===s.id?s.color:undefined}/>}{s.label}</button>
        ))}
      </div>
      <div style={{display:'flex', gap:4, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:3}}>
        {['all','tech','fitness','humor','wellness'].map(n => (
          <button key={n} onClick={()=>setNiche(n)} style={{
            padding:'6px 12px', border:'none', borderRadius:7, cursor:'pointer',
            background: niche===n ? 'var(--surface-3)' : 'transparent',
            color: niche===n ? 'var(--text)' : 'var(--text-muted)',
            fontFamily:'var(--font-body)', fontSize:12, fontWeight:500, textTransform:'capitalize'
          }}>{n}</button>
        ))}
      </div>
    </div>

    {/* Charts row */}
    <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:16, marginBottom:18, position:'relative', zIndex:1}}>
      <Card>
        <h3 style={{margin:'0 0 14px', fontFamily:'var(--font-display)', fontSize:15, fontWeight:600}}>{STR.distHead}</h3>
        <div style={{display:'flex', alignItems:'center', gap:18}}>
          <svg width={120} height={120} viewBox="0 0 42 42">
            <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="var(--surface-2)" strokeWidth="6"/>
            {wedges.map((w,i) => {
              const dash = (w.end - w.start) * 100;
              const offset = -w.start * 100 + 25;
              return <circle key={i} cx="21" cy="21" r="15.9" fill="transparent" stroke={w.color} strokeWidth="6"
                strokeDasharray={`${dash} ${100-dash}`} strokeDashoffset={offset} transform="rotate(-90 21 21)"/>;
            })}
            <text x="21" y="20" textAnchor="middle" fontSize="6" fill="var(--text)" fontWeight="600" fontFamily="var(--font-mono)">{total}</text>
            <text x="21" y="26" textAnchor="middle" fontSize="3" fill="var(--text-dim)" fontFamily="var(--font-body)">trends</text>
          </svg>
          <div style={{flex:1, display:'flex', flexDirection:'column', gap:6}}>
            {nicheStats.map(s => (
              <div key={s.n} style={{display:'flex', alignItems:'center', gap:8, fontSize:12.5}}>
                <span style={{width:8, height:8, borderRadius:2, background:s.color}}/>
                <span style={{flex:1, color:'var(--text-muted)', textTransform:'capitalize'}}>{s.n}</span>
                <span style={{fontFamily:'var(--font-mono)', color:'var(--text)'}}>{s.c}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <h3 style={{margin:'0 0 14px', fontFamily:'var(--font-display)', fontSize:15, fontWeight:600}}>{STR.volHead}</h3>
        <svg width="100%" height="120" viewBox="0 0 480 120" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trendVol" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.4"/>
              <stop offset="100%" stopColor="#7C3AED" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* Area fill */}
          <path d={`M0,120 ${hours.map((v,i)=>`L${(i/23)*480},${120 - v}`).join(' ')} L480,120 Z`} fill="url(#trendVol)"/>
          {/* Line */}
          <path d={hours.map((v,i)=>`${i?'L':'M'}${(i/23)*480},${120 - v}`).join(' ')} fill="none" stroke="#A78BFA" strokeWidth="2"/>
          {/* Peak marker */}
          {(() => {
            const max = Math.max(...hours);
            const idx = hours.indexOf(max);
            const cx = (idx/23)*480;
            const cy = 120 - max;
            return <g>
              <circle cx={cx} cy={cy} r="5" fill="#7C3AED" stroke="#A78BFA" strokeWidth="2"/>
              <text x={cx} y={cy-10} textAnchor="middle" fontSize="10" fill="var(--text)" fontFamily="var(--font-mono)">peak {idx}:00</text>
            </g>;
          })()}
        </svg>
        <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--text-dim)'}}>
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </Card>
    </div>

    {/* Trend cards */}
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:14, position:'relative', zIndex:1}}>
      {list.map(tr => (
        <Card key={tr.id} style={{padding:0, overflow:'hidden', position:'relative'}}>
          <div style={{height:6, background:`linear-gradient(90deg, ${tr.color}, ${tr.color}55)`}}/>
          <div style={{padding:'16px 18px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:10}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                  <Icon name={tr.source==='twitter'||tr.source==='reddit'?'globe':tr.source} size={12} color={tr.color}/>
                  <span style={{fontSize:10.5, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em'}}>{tr.source} · {tr.niche}</span>
                </div>
                <div style={{fontSize:15, fontWeight:600, color:'var(--text)', lineHeight:1.3}}>{tr.title}</div>
              </div>
              <div style={{textAlign:isHE?'left':'right', flexShrink:0}}>
                <div style={{fontFamily:'var(--font-mono)', fontSize:24, fontWeight:600, color:tr.color, lineHeight:1}}>{tr.heat}</div>
                <div style={{fontSize:10, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2}}>{STR.heat}</div>
              </div>
            </div>
            <Sparkline data={tr.spark} width={280} height={28}/>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)'}}>
              <div>
                <div style={{fontSize:10.5, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'0.06em'}}>{STR.growth}</div>
                <div style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--success)', marginTop:2}}>{tr.growth} · {tr.volume}</div>
              </div>
              <Button variant="primary" icon="sparkles">{STR.use}</Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </div>;
};

// =================== LEARNINGS ===================
const LearningsPage = ({ t, lang }) => {
  const isHE = lang === 'HE';
  const STR = isHE ? {
    h:'הבינה שלך לומדת מ-247 סרטונים',
    sub:'תבניות שזיהינו השבוע — צפה ואשר/דחה כל תובנה כדי ללמד את המערכת',
    bestHours:'השעות הטובות ביותר לפרסום', hookPerf:'ביצועי הוקים', visualMix:'חלוקת ויזואל', hashtag:'אשכולות האשטגים',
    confidence:'ביטחון', samples:'מ-מדגם', accept:'אשר', reject:'דחה',
    summary:'סיכום השבוע', videosAnalyzed:'סרטונים נותחו', patterns:'תבניות זוהו', applied:'תובנות שוטפות'
  } : {
    h:'Your AI is learning from 247 videos',
    sub:'Patterns it found this week — accept or reject each one to keep training it',
    bestHours:'Best hours to post', hookPerf:'Hook performance', visualMix:'Visual mix that wins', hashtag:'Hashtag clusters',
    confidence:'confidence', samples:'samples', accept:'Accept', reject:'Reject',
    summary:'This week\'s summary', videosAnalyzed:'videos analyzed', patterns:'patterns found', applied:'insights applied'
  };

  // Heatmap data — 7 days × 24 hours
  const heatmap = Array.from({length:7}, (d) => Array.from({length:24}, (h) => {
    const peak = (h===19||h===12) ? 0.9 : (h===9||h===21)?0.7 : (h<6||h>22)?0.05 : 0.3;
    return Math.min(1, peak + (Math.sin((d+1)*(h+1))*0.15 + Math.cos(d*h)*0.1));
  }));
  const days = isHE ? ['א','ב','ג','ד','ה','ו','ש'] : ['M','T','W','T','F','S','S'];

  // Hook types
  const hooks = [
    { name: isHE?'שאלה':'Question', perf: 92, count: 78 },
    { name: isHE?'הצהרה נועזת':'Bold claim', perf: 78, count: 64 },
    { name: isHE?'סיפור אישי':'Personal story', perf: 71, count: 42 },
    { name: isHE?'סטטיסטיקה':'Stat shock', perf: 64, count: 38 },
    { name: isHE?'הומור':'Joke', perf: 56, count: 25 },
  ];

  // Visual radial
  const visuals = [
    { name:'screen_recording', val:34, color:'#7C3AED' },
    { name:'avatar_animation', val:26, color:'#06B6D4' },
    { name:'kinetic_typography', val:22, color:'#A78BFA' },
    { name:'stock_video', val:12, color:'#10B981' },
    { name:'2d_character', val:6, color:'#F59E0B' },
  ];

  // Hashtag bubbles
  const hashtags = [
    { tag:'#AItools', size:42, perf:94 }, { tag:'#DevTools', size:34, perf:82 }, { tag:'#shorts', size:48, perf:71 },
    { tag:'#fyp', size:46, perf:68 }, { tag:'#wellness', size:30, perf:78 }, { tag:'#fitness', size:32, perf:84 },
    { tag:'#tech', size:38, perf:88 }, { tag:'#humor', size:28, perf:62 }, { tag:'#productivity', size:32, perf:74 },
    { tag:'#machinelearning', size:24, perf:80 },
  ];

  // Recommendations
  const recs = [
    { icon:'sparkles', text: isHE?'פרסם בשעה 19:00 בימי שני, רביעי וחמישי — פי 2.3 ביצועים':'Post at 7 PM on Mon/Wed/Thu — 2.3× the views', conf:91 },
    { icon:'sparkles', text: isHE?'התחל סרטונים בשאלה — שיעור צפייה גבוה ב-34%':'Open videos with a question — +34% retention', conf:87 },
    { icon:'sparkles', text: isHE?'הימנע מתאורה כתומה — מקטין CTR ב-22% ב-TikTok':'Avoid orange-tinted thumbnails — TikTok CTR drops 22%', conf:79 },
    { icon:'sparkles', text: isHE?'שמור על משך 28-32 שניות — תחום הזהב לרילס':'Keep videos 28–32s — sweet spot for Reels', conf:73 },
  ];

  return <div style={{padding:'28px 32px', position:'relative'}}>
    <div style={{position:'fixed', width:380, height:380, borderRadius:'50%', background:'#06B6D4', filter:'blur(120px)', opacity:0.12, top:60, [isHE?'right':'left']:'30%', pointerEvents:'none', zIndex:0}}/>

    {/* Header */}
    <div style={{position:'relative', zIndex:1, marginBottom:22}}>
      <h1 style={{margin:0, fontFamily:'var(--font-display)', fontSize:30, fontWeight:700, letterSpacing:'-0.02em', maxWidth:760, lineHeight:1.15}}>
        <span style={{background:'var(--brand-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>{STR.h}</span>
      </h1>
      <p style={{margin:'8px 0 0', color:'var(--text-muted)', fontSize:14, maxWidth:640}}>{STR.sub}</p>
    </div>

    {/* Summary tiles */}
    <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:18, position:'relative', zIndex:1}}>
      <Card><div className="t-label">{STR.videosAnalyzed}</div><div style={{fontFamily:'var(--font-mono)', fontSize:32, fontWeight:600, marginTop:6, background:'var(--brand-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>247</div></Card>
      <Card><div className="t-label">{STR.patterns}</div><div style={{fontFamily:'var(--font-mono)', fontSize:32, fontWeight:600, marginTop:6}}>18</div></Card>
      <Card><div className="t-label">{STR.applied}</div><div style={{fontFamily:'var(--font-mono)', fontSize:32, fontWeight:600, marginTop:6, color:'var(--success)'}}>12</div></Card>
    </div>

    {/* Charts grid */}
    <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:14, marginBottom:14, position:'relative', zIndex:1}}>
      {/* Heatmap */}
      <Card>
        <h3 style={{margin:'0 0 14px', fontFamily:'var(--font-display)', fontSize:15, fontWeight:600}}>{STR.bestHours}</h3>
        <div style={{display:'grid', gridTemplateColumns:'24px repeat(24,1fr)', gap:2, fontFamily:'var(--font-mono)', fontSize:9}}>
          <div></div>
          {Array.from({length:24}).map((_,h) => (
            <div key={h} style={{textAlign:'center', color:'var(--text-dim)', fontSize: h%3===0?9:0}}>{h%3===0?h:''}</div>
          ))}
          {heatmap.map((row, di) => <React.Fragment key={di}>
            <div style={{color:'var(--text-dim)', display:'flex', alignItems:'center', justifyContent:'center'}}>{days[di]}</div>
            {row.map((v, hi) => (
              <div key={hi} style={{
                aspectRatio:'1', borderRadius:3,
                background: v>0.7 ? `rgba(124,58,237,${v})` : v>0.4 ? `rgba(167,139,250,${v*0.8})` : `rgba(167,139,250,${v*0.3})`,
                boxShadow: v>0.85 ? '0 0 6px rgba(124,58,237,0.6)' : 'none'
              }} title={`${v.toFixed(2)}`}/>
            ))}
          </React.Fragment>)}
        </div>
        <div style={{display:'flex', alignItems:'center', gap:8, marginTop:14, fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--text-dim)'}}>
          <span>low</span>
          <div style={{flex:1, height:6, background:'linear-gradient(90deg, rgba(167,139,250,0.1), rgba(167,139,250,0.5), rgba(124,58,237,1))', borderRadius:99}}/>
          <span>high</span>
        </div>
      </Card>

      {/* Hook performance */}
      <Card>
        <h3 style={{margin:'0 0 14px', fontFamily:'var(--font-display)', fontSize:15, fontWeight:600}}>{STR.hookPerf}</h3>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {hooks.map((h,i) => (
            <div key={i}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12.5}}>
                <span>{h.name}</span>
                <span style={{fontFamily:'var(--font-mono)', color:'var(--text-muted)'}}>{h.perf}% · n={h.count}</span>
              </div>
              <div style={{height:8, background:'var(--surface-2)', borderRadius:99, overflow:'hidden'}}>
                <div style={{
                  width:`${h.perf}%`, height:'100%',
                  background: i===0?'var(--brand-gradient)':'#A78BFA88',
                  boxShadow: i===0?'0 0 12px rgba(124,58,237,0.5)':'none'
                }}/>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>

    {/* Second row */}
    <div style={{display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:14, marginBottom:18, position:'relative', zIndex:1}}>
      {/* Visual mix donut */}
      <Card>
        <h3 style={{margin:'0 0 14px', fontFamily:'var(--font-display)', fontSize:15, fontWeight:600}}>{STR.visualMix}</h3>
        <div style={{display:'flex', alignItems:'center', gap:14}}>
          <svg width={120} height={120} viewBox="0 0 42 42">
            <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="var(--surface-2)" strokeWidth="5"/>
            {(() => { let cumul=0; return visuals.map((v,i) => {
              const dash = v.val;
              const offset = -cumul + 25;
              cumul += dash;
              return <circle key={i} cx="21" cy="21" r="15.9" fill="transparent" stroke={v.color} strokeWidth="5"
                strokeDasharray={`${dash} ${100-dash}`} strokeDashoffset={offset} transform="rotate(-90 21 21)"/>;
            }); })()}
          </svg>
          <div style={{flex:1, display:'flex', flexDirection:'column', gap:6}}>
            {visuals.map(v => (
              <div key={v.name} style={{display:'flex', alignItems:'center', gap:8, fontSize:11.5}}>
                <span style={{width:8, height:8, borderRadius:2, background:v.color, flexShrink:0}}/>
                <span style={{flex:1, color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:11, overflow:'hidden', textOverflow:'ellipsis'}}>{v.name}</span>
                <span style={{fontFamily:'var(--font-mono)', color:'var(--text)', fontSize:11}}>{v.val}%</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Hashtag bubbles */}
      <Card>
        <h3 style={{margin:'0 0 14px', fontFamily:'var(--font-display)', fontSize:15, fontWeight:600}}>{STR.hashtag}</h3>
        <div style={{display:'flex', flexWrap:'wrap', gap:6, alignItems:'center'}}>
          {hashtags.map(h => (
            <span key={h.tag} style={{
              padding: `${4 + h.size/16}px ${8 + h.size/8}px`,
              fontSize: 11 + h.size/10,
              background: `linear-gradient(135deg, rgba(124,58,237,${h.perf/200}), rgba(6,182,212,${h.perf/200}))`,
              border: `1px solid rgba(167,139,250,${h.perf/180})`,
              borderRadius: 99,
              color: h.perf>80?'var(--text)':'var(--text-muted)',
              fontFamily:'var(--font-mono)', fontWeight:500,
            }}>{h.tag} <span style={{fontSize:'0.8em', color:'var(--text-dim)'}}>{h.perf}</span></span>
          ))}
        </div>
      </Card>
    </div>

    {/* Recommendations */}
    <h3 style={{margin:'0 0 12px', fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, position:'relative', zIndex:1}}>
      {isHE ? 'תובנות לאישור' : 'Insights to approve'}
    </h3>
    <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, position:'relative', zIndex:1}}>
      {recs.map((r,i) => (
        <Card key={i}>
          <div style={{display:'flex', alignItems:'flex-start', gap:12}}>
            <div style={{
              width:36, height:36, borderRadius:10,
              background:'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))',
              border:'1px solid rgba(167,139,250,0.4)',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
            }}>
              <Icon name={r.icon} size={16} color="#A78BFA"/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13.5, lineHeight:1.5, color:'var(--text)', marginBottom:10}}>{r.text}</div>
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:12}}>
                <div style={{flex:1, height:4, background:'var(--surface-3)', borderRadius:99, overflow:'hidden'}}>
                  <div style={{width:`${r.conf}%`, height:'100%', background:'var(--brand-gradient)'}}/>
                </div>
                <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-muted)'}}>{r.conf}% {STR.confidence}</span>
              </div>
              <div style={{display:'flex', gap:6}}>
                <Button variant="primary" icon="check">{STR.accept}</Button>
                <Button variant="ghost">{STR.reject}</Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </div>;
};

// =================== SETTINGS ===================
const SettingsPage = ({ t, lang }) => {
  const isHE = lang === 'HE';
  const [section, setSection] = React.useState('integrations');
  const [keys, setKeys] = React.useState({
    openai: { val: 'sk-prod-•••••••••••••••••aB42', status:'connected', usage: 68 },
    elevenlabs: { val: '••••••••••••••3kL', status:'connected', usage: 42 },
    runway: { val: '', status:'missing', usage: 0 },
    pika: { val: 'pk-•••••••••••••8Q1', status:'expired', usage: 0 },
  });
  const [n8n, setN8n] = React.useState({
    url: 'https://n8n.botcraft.io/webhook/avatar-pipeline',
    secret: '••••••••••••••3kL', timeout: 30, retries: 3, lastPing:'2 min ago'
  });
  const [storage, setStorage] = React.useState({ used: 184, total: 500 });

  const STR = isHE ? {
    h:'הגדרות', sub:'חיבורים, מפתחות, תזמורת — הכול במקום אחד',
    sections:{ integrations:'חיבורי AI', n8n:'n8n', storage:'אחסון', notifs:'התראות', team:'צוות', billing:'חיוב' },
    apiKeys:'מפתחות API', usage:'שימוש החודש', test:'בדוק חיבור', save:'שמור', regen:'רענן',
    n8nHead:'אינטגרציית n8n', webhook:'כתובת Webhook', secret:'מפתח סודי', timeout:'Timeout (שניות)', retries:'נסיונות חוזרים',
    testConn:'בדוק חיבור', lastPing:'פינג אחרון', healthy:'בריא', warning:'שים לב', failing:'כשל',
    notifsHead:'התראות', email:'אימייל', push:'דפדפן', slack:'Slack',
    storageHead:'אחסון', renderQuota:'מכסת רנדור החודש',
    teamHead:'חברי צוות', invite:'הזמן',
    billingHead:'מסלול ושימוש', proPlan:'מסלול Pro', pricePer:'$49 / חודש',
    connected:'מחובר', missing:'לא מוגדר', expired:'פג תוקף',
  } : {
    h:'Settings', sub:'Connections, keys, orchestration — all in one place',
    sections:{ integrations:'AI integrations', n8n:'n8n', storage:'Storage', notifs:'Notifications', team:'Team', billing:'Billing' },
    apiKeys:'API keys', usage:'Usage this month', test:'Test connection', save:'Save', regen:'Regenerate',
    n8nHead:'n8n integration', webhook:'Webhook URL', secret:'Webhook secret', timeout:'Timeout (s)', retries:'Retries',
    testConn:'Test webhook', lastPing:'Last ping', healthy:'Healthy', warning:'Warning', failing:'Failing',
    notifsHead:'Notifications', email:'Email', push:'Browser push', slack:'Slack',
    storageHead:'Storage', renderQuota:'Render quota this month',
    teamHead:'Team members', invite:'Invite',
    billingHead:'Plan & usage', proPlan:'Pro plan', pricePer:'$49 / month',
    connected:'Connected', missing:'Not set', expired:'Expired',
  };

  const inputStyle = {
    background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10,
    padding:'9px 12px', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:13,
    outline:'none', width:'100%', boxSizing:'border-box', textAlign: isHE?'right':'left',
  };

  const sections = ['integrations','n8n','storage','notifs','team','billing'];
  const sectionIcons = { integrations:'sparkles', n8n:'settings', storage:'download', notifs:'bell', team:'avatars', billing:'analytics' };

  // ================ Integrations panel ================
  const integrations = [
    { id:'openai', name:'OpenAI', desc:'GPT-4o for scripting', color:'#10B981', limit:'$50' },
    { id:'elevenlabs', name:'ElevenLabs', desc:'Text-to-speech voices', color:'#A78BFA', limit:'500K chars' },
    { id:'runway', name:'Runway ML', desc:'Video generation Gen-3', color:'#06B6D4', limit:'2K credits' },
    { id:'pika', name:'Pika Labs', desc:'Short-form video AI', color:'#F59E0B', limit:'1K credits' },
  ];

  const renderIntegrations = () => (
    <div style={{display:'flex', flexDirection:'column', gap:14}}>
      <h2 style={{margin:0, fontFamily:'var(--font-display)', fontSize:20, fontWeight:600}}>{STR.apiKeys}</h2>
      {integrations.map(i => {
        const k = keys[i.id];
        const tone = k.status==='connected'?'success':k.status==='expired'?'danger':'warning';
        const label = k.status==='connected'?STR.connected:k.status==='expired'?STR.expired:STR.missing;
        return <Card key={i.id} style={{padding:0, overflow:'hidden'}}>
          <div style={{height:3, background:`linear-gradient(90deg, ${i.color}, ${i.color}55)`}}/>
          <div style={{padding:'18px 20px', display:'grid', gridTemplateColumns:'auto 1fr auto', gap:18, alignItems:'center'}}>
            <div style={{
              width:42, height:42, borderRadius:10,
              background:`${i.color}22`, border:`1px solid ${i.color}55`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'var(--font-display)', fontWeight:700, fontSize:18, color:i.color
            }}>{i.name[0]}</div>
            <div>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <span style={{fontFamily:'var(--font-display)', fontSize:16, fontWeight:600}}>{i.name}</span>
                <Badge tone={tone}>{label}</Badge>
              </div>
              <div style={{fontSize:12, color:'var(--text-muted)', marginTop:3}}>{i.desc}</div>
            </div>
            <div style={{textAlign:isHE?'left':'right'}}>
              <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-dim)'}}>{STR.usage}</div>
              <div style={{fontFamily:'var(--font-mono)', fontSize:14, fontWeight:600, color:'var(--text)', marginTop:2}}>{k.usage}% / {i.limit}</div>
            </div>
          </div>
          <div style={{padding:'0 20px 18px', display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, alignItems:'center'}}>
            <input type="password" placeholder={k.status==='missing' ? `${i.name} API key…` : ''} value={k.val} onChange={e=>setKeys(k => ({...k, [i.id]: {...k[i.id], val:e.target.value}}))} style={inputStyle}/>
            <Button variant="secondary">{STR.test}</Button>
            <Button variant="ghost" icon="sparkles">{STR.regen}</Button>
          </div>
          {/* Usage bar */}
          {k.status==='connected' && <div style={{padding:'0 20px 18px'}}>
            <div style={{height:5, background:'var(--surface-2)', borderRadius:99, overflow:'hidden'}}>
              <div style={{width:`${k.usage}%`, height:'100%', background:k.usage>80?'var(--warning)':i.color, boxShadow:`0 0 8px ${i.color}55`}}/>
            </div>
          </div>}
        </Card>;
      })}
    </div>
  );

  // ================ n8n panel ================
  const renderN8n = () => (
    <div style={{display:'flex', flexDirection:'column', gap:18}}>
      <h2 style={{margin:0, fontFamily:'var(--font-display)', fontSize:20, fontWeight:600}}>{STR.n8nHead}</h2>

      {/* Status banner */}
      <div style={{
        padding:'14px 18px', borderRadius:12,
        background:'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,182,212,0.10))',
        border:'1px solid rgba(16,185,129,0.35)',
        display:'flex', alignItems:'center', gap:14
      }}>
        <span style={{
          width:10, height:10, borderRadius:99, background:'var(--success)',
          boxShadow:'0 0 10px rgba(16,185,129,0.7)', animation:'bcPulse 1.6s ease-in-out infinite'
        }}/>
        <div style={{flex:1}}>
          <div style={{fontWeight:500, fontSize:14}}>{STR.healthy}</div>
          <div style={{fontSize:12, color:'var(--text-muted)', marginTop:2}}>{STR.lastPing}: {n8n.lastPing} · 247ms</div>
        </div>
        <Button variant="secondary">{STR.testConn}</Button>
      </div>

      <Card>
        <div style={{display:'grid', gridTemplateColumns:'1fr', gap:14}}>
          <label style={{display:'flex', flexDirection:'column', gap:6}}>
            <span className="t-label">{STR.webhook}</span>
            <input style={inputStyle} value={n8n.url} onChange={e=>setN8n({...n8n, url:e.target.value})}/>
          </label>
          <label style={{display:'flex', flexDirection:'column', gap:6}}>
            <span className="t-label">{STR.secret}</span>
            <input type="password" style={inputStyle} value={n8n.secret} onChange={e=>setN8n({...n8n, secret:e.target.value})}/>
          </label>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <label style={{display:'flex', flexDirection:'column', gap:6}}>
              <span className="t-label">{STR.timeout}</span>
              <input type="number" style={inputStyle} value={n8n.timeout} onChange={e=>setN8n({...n8n, timeout:+e.target.value})}/>
            </label>
            <label style={{display:'flex', flexDirection:'column', gap:6}}>
              <span className="t-label">{STR.retries}</span>
              <input type="number" style={inputStyle} value={n8n.retries} onChange={e=>setN8n({...n8n, retries:+e.target.value})}/>
            </label>
          </div>
        </div>
      </Card>

      {/* Pipeline diagram */}
      <Card>
        <h3 style={{margin:'0 0 14px', fontFamily:'var(--font-display)', fontSize:14, fontWeight:600}}>{isHE?'תזרים פעיל':'Active pipeline'}</h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8, alignItems:'center'}}>
          {[
            { name:isHE?'טריגר':'Trigger', sub:'webhook', color:'#7C3AED' },
            { name:isHE?'תסריט':'Script', sub:'GPT-4o', color:'#06B6D4' },
            { name:isHE?'TTS':'TTS', sub:'ElevenLabs', color:'#A78BFA' },
            { name:isHE?'וידאו':'Video', sub:'Runway', color:'#10B981' },
            { name:isHE?'פרסום':'Publish', sub:'YT/TT/IG', color:'#F59E0B' },
          ].map((node, i) => (
            <div key={i} style={{
              padding:'10px 8px', textAlign:'center',
              background:`${node.color}15`, border:`1px solid ${node.color}55`, borderRadius:10
            }}>
              <div style={{fontSize:12, fontWeight:600, color:node.color}}>{node.name}</div>
              <div style={{fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text-dim)', marginTop:3}}>{node.sub}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );

  // ================ Storage panel ================
  const renderStorage = () => (
    <div style={{display:'flex', flexDirection:'column', gap:18}}>
      <h2 style={{margin:0, fontFamily:'var(--font-display)', fontSize:20, fontWeight:600}}>{STR.storageHead}</h2>
      <Card>
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
          <span style={{fontSize:14, fontWeight:500}}>{storage.used} GB / {storage.total} GB</span>
          <span style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--text-muted)'}}>{Math.round(storage.used/storage.total*100)}%</span>
        </div>
        <div style={{height:12, background:'var(--surface-2)', borderRadius:99, overflow:'hidden'}}>
          <div style={{width:`${storage.used/storage.total*100}%`, height:'100%', background:'var(--brand-gradient)', boxShadow:'0 0 14px rgba(124,58,237,0.5)'}}/>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginTop:18}}>
          {[
            { name:isHE?'סרטונים':'Videos', size:122, color:'#7C3AED' },
            { name:isHE?'אודיו':'Audio', size:32, color:'#06B6D4' },
            { name:isHE?'מודלים':'Models', size:18, color:'#A78BFA' },
            { name:isHE?'אחר':'Other', size:12, color:'#10B981' },
          ].map((c,i) => (
            <div key={i}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:4}}>
                <span style={{width:8, height:8, borderRadius:2, background:c.color}}/>
                <span style={{fontSize:12, color:'var(--text-muted)'}}>{c.name}</span>
              </div>
              <div style={{fontFamily:'var(--font-mono)', fontSize:18, fontWeight:600}}>{c.size} GB</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 style={{margin:'0 0 14px', fontFamily:'var(--font-display)', fontSize:14, fontWeight:600}}>{STR.renderQuota}</h3>
        <div style={{display:'flex', alignItems:'flex-end', gap:14, marginBottom:8}}>
          <div style={{fontFamily:'var(--font-mono)', fontSize:36, fontWeight:600, background:'var(--brand-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>147</div>
          <div style={{fontFamily:'var(--font-mono)', fontSize:18, color:'var(--text-muted)', marginBottom:4}}>/ 500 min</div>
        </div>
        <div style={{height:8, background:'var(--surface-2)', borderRadius:99, overflow:'hidden'}}>
          <div style={{width:'29.4%', height:'100%', background:'var(--brand-gradient)'}}/>
        </div>
      </Card>
    </div>
  );

  // ================ Notifs ================
  const renderNotifs = () => {
    const items = [
      { ch: STR.email, sub: 'you@email.com', on:true },
      { ch: STR.push, sub: 'browser.botcraft.io', on:true },
      { ch: STR.slack, sub: '#avatar-alerts', on:false },
    ];
    const events = [
      { e:isHE?'סרטון פורסם':'Video posted', tone:'success' },
      { e:isHE?'רנדור נכשל':'Render failed', tone:'danger' },
      { e:isHE?'אישור AI חכם':'Smart insight ready', tone:'ai' },
      { e:isHE?'מגמה חדשה בנישה שלך':'New trend in your niche', tone:'warning' },
    ];
    return <div style={{display:'flex', flexDirection:'column', gap:18}}>
      <h2 style={{margin:0, fontFamily:'var(--font-display)', fontSize:20, fontWeight:600}}>{STR.notifsHead}</h2>
      <Card>
        {items.map((it,i) => (
          <div key={i} style={{
            display:'flex', alignItems:'center', gap:14, padding:'12px 0',
            borderBottom: i<items.length-1?'1px solid var(--border)':'none'
          }}>
            <div style={{flex:1}}>
              <div style={{fontWeight:500, fontSize:14}}>{it.ch}</div>
              <div style={{fontSize:12, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginTop:2}}>{it.sub}</div>
            </div>
            <div style={{
              width:38, height:22, borderRadius:99, position:'relative', cursor:'pointer',
              background: it.on ? 'var(--brand-gradient)' : 'var(--surface-3)'
            }}>
              <div style={{position:'absolute', top:2, [it.on?(isHE?'left':'right'):(isHE?'right':'left')]:2, width:16, height:16, borderRadius:99, background:'#fff', transition:'all 200ms'}}/>
            </div>
          </div>
        ))}
      </Card>
      <Card>
        <h3 style={{margin:'0 0 12px', fontFamily:'var(--font-display)', fontSize:14, fontWeight:600}}>{isHE?'אירועים':'Events'}</h3>
        <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
          {events.map((e,i) => <Badge key={i} tone={e.tone}>{e.e}</Badge>)}
        </div>
      </Card>
    </div>;
  };

  // ================ Team ================
  const renderTeam = () => {
    const members = [
      { name:'Yael Cohen', email:'yael@you.io', role:'Owner', initial:'Y', grad:'linear-gradient(135deg,#7C3AED,#06B6D4)' },
      { name:'David Marom', email:'david@you.io', role:'Editor', initial:'D', grad:'linear-gradient(135deg,#06B6D4,#10B981)' },
      { name:'Tamar Levi', email:'tamar@you.io', role:'Viewer', initial:'T', grad:'linear-gradient(135deg,#F59E0B,#EF4444)' },
    ];
    return <div style={{display:'flex', flexDirection:'column', gap:14}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <h2 style={{margin:0, fontFamily:'var(--font-display)', fontSize:20, fontWeight:600}}>{STR.teamHead}</h2>
        <Button variant="primary" icon="plus">{STR.invite}</Button>
      </div>
      <Card style={{padding:0, overflow:'hidden'}}>
        {members.map((m,i) => (
          <div key={i} style={{
            display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:14, alignItems:'center',
            padding:'14px 18px', borderBottom: i<members.length-1?'1px solid var(--border)':'none'
          }}>
            <Avatar a={m} size={38}/>
            <div>
              <div style={{fontWeight:500, fontSize:14}}>{m.name}</div>
              <div style={{fontSize:12, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginTop:2}}>{m.email}</div>
            </div>
            <Badge tone={m.role==='Owner'?'ai':m.role==='Editor'?'info':'neutral'}>{m.role}</Badge>
            <Button variant="ghost">···</Button>
          </div>
        ))}
      </Card>
    </div>;
  };

  // ================ Billing ================
  const renderBilling = () => (
    <div style={{display:'flex', flexDirection:'column', gap:14}}>
      <h2 style={{margin:0, fontFamily:'var(--font-display)', fontSize:20, fontWeight:600}}>{STR.billingHead}</h2>
      <Card style={{padding:0, overflow:'hidden', background:'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(6,182,212,0.10))', border:'1px solid rgba(167,139,250,0.4)'}}>
        <div style={{padding:'24px 26px', display:'flex', alignItems:'center', gap:18}}>
          <div style={{
            width:56, height:56, borderRadius:14, background:'var(--brand-gradient)',
            display:'flex', alignItems:'center', justifyContent:'center'
          }}>
            <Icon name="sparkles" size={26} color="#fff"/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontFamily:'var(--font-display)', fontSize:22, fontWeight:700}}>{STR.proPlan}</div>
            <div style={{fontFamily:'var(--font-mono)', fontSize:14, color:'var(--text-muted)', marginTop:2}}>{STR.pricePer} · {isHE?'מתחדש 12 ביוני':'Renews Jun 12'}</div>
          </div>
          <Button variant="secondary">{isHE?'נהל מסלול':'Manage plan'}</Button>
        </div>
      </Card>
      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12}}>
        <Card><div className="t-label">{isHE?'סרטונים':'Videos'}</div><div style={{fontFamily:'var(--font-mono)', fontSize:24, fontWeight:600, marginTop:6}}>147 / 500</div></Card>
        <Card><div className="t-label">{isHE?'אווטרים':'Avatars'}</div><div style={{fontFamily:'var(--font-mono)', fontSize:24, fontWeight:600, marginTop:6}}>12 / ∞</div></Card>
        <Card><div className="t-label">{isHE?'אחסון':'Storage'}</div><div style={{fontFamily:'var(--font-mono)', fontSize:24, fontWeight:600, marginTop:6}}>184 / 500 GB</div></Card>
      </div>
    </div>
  );

  const content = {
    integrations: renderIntegrations(), n8n: renderN8n(), storage: renderStorage(),
    notifs: renderNotifs(), team: renderTeam(), billing: renderBilling()
  }[section];

  return <div style={{padding:'28px 32px', position:'relative'}}>
    <div style={{position:'fixed', width:340, height:340, borderRadius:'50%', background:'#7C3AED', filter:'blur(120px)', opacity:0.12, top:80, [isHE?'left':'right']:'30%', pointerEvents:'none', zIndex:0}}/>

    <div style={{position:'relative', zIndex:1, marginBottom:22}}>
      <h1 style={{margin:0, fontFamily:'var(--font-display)', fontSize:30, fontWeight:700, letterSpacing:'-0.02em'}}>{STR.h}</h1>
      <p style={{margin:'6px 0 0', color:'var(--text-muted)', fontSize:14}}>{STR.sub}</p>
    </div>

    <div style={{display:'grid', gridTemplateColumns:'220px 1fr', gap:24, position:'relative', zIndex:1}}>
      {/* Section nav */}
      <nav style={{display:'flex', flexDirection:'column', gap:4, position:'sticky', top:80, alignSelf:'start'}}>
        {sections.map(s => (
          <button key={s} onClick={()=>setSection(s)} style={{
            display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
            background: section===s ? 'var(--surface)' : 'transparent',
            border: `1px solid ${section===s ? 'var(--primary-glow)' : 'transparent'}`,
            borderRadius:10, cursor:'pointer', color: section===s ? 'var(--text)' : 'var(--text-muted)',
            fontFamily:'var(--font-body)', fontSize:13, fontWeight: section===s ? 600 : 500,
            textAlign: isHE?'right':'left', boxShadow: section===s ? 'var(--shadow-glow)':'none',
            transition:'all 200ms cubic-bezier(0.22,1,0.36,1)'
          }}>
            <Icon name={sectionIcons[s]} size={14} color={section===s?'#A78BFA':undefined}/>
            <span>{STR.sections[s]}</span>
          </button>
        ))}
      </nav>

      <div>{content}</div>
    </div>
  </div>;
};

// =================== EMPTY STATES ===================
const EmptyDashboard = ({ lang, onCreate }) => {
  const isHE = lang === 'HE';
  return <div style={{padding:'40px 32px', position:'relative', minHeight:'calc(100vh - 64px)'}}>
    <div style={{position:'fixed', width:480, height:480, borderRadius:'50%', background:'#7C3AED', filter:'blur(140px)', opacity:0.18, top:40, [isHE?'left':'right']:'25%', pointerEvents:'none', zIndex:0, animation:'bcDrift 8s ease-in-out infinite'}}/>
    <div style={{position:'fixed', width:380, height:380, borderRadius:'50%', background:'#06B6D4', filter:'blur(120px)', opacity:0.14, bottom:20, [isHE?'right':'left']:0, pointerEvents:'none', zIndex:0, animation:'bcDrift 10s ease-in-out infinite reverse'}}/>

    <div style={{maxWidth:680, margin:'40px auto 0', textAlign:'center', position:'relative', zIndex:1}}>
      {/* Hero illustration — orbiting avatars */}
      <div style={{width:200, height:200, margin:'0 auto 28px', position:'relative'}}>
        <div style={{
          position:'absolute', inset:0, border:'1px dashed rgba(167,139,250,0.3)', borderRadius:'50%',
          animation:'spin 20s linear infinite'
        }}/>
        <div style={{
          position:'absolute', inset:24, border:'1px dashed rgba(167,139,250,0.2)', borderRadius:'50%',
          animation:'spin 30s linear infinite reverse'
        }}/>
        <div style={{
          position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
          width:84, height:84, borderRadius:24, background:'var(--brand-gradient)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 0 40px rgba(124,58,237,0.5)'
        }}>
          <Icon name="sparkles" size={42} color="#fff"/>
        </div>
        {/* Orbiting dots */}
        {[0,72,144,216,288].map((deg,i) => (
          <div key={i} style={{
            position:'absolute', top:'50%', left:'50%',
            width:0, height:0, transform:`translate(-50%,-50%) rotate(${deg}deg) translateX(100px)`,
          }}>
            <div style={{
              width:16, height:16, borderRadius:6,
              background: ['linear-gradient(135deg,#7C3AED,#06B6D4)','linear-gradient(135deg,#06B6D4,#10B981)','linear-gradient(135deg,#F59E0B,#EF4444)','linear-gradient(135deg,#EF4444,#7C3AED)','linear-gradient(135deg,#06B6D4,#A78BFA)'][i],
              boxShadow:'0 0 14px rgba(167,139,250,0.4)',
              transform:`rotate(${-deg}deg)`
            }}/>
          </div>
        ))}
      </div>

      <h1 style={{margin:'0 0 14px', fontFamily:'var(--font-display)', fontSize:36, fontWeight:700, letterSpacing:'-0.025em', lineHeight:1.1}}>
        {isHE ? <>בוא נבנה את <span style={{background:'var(--brand-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>האווטר הראשון שלך</span></>
              : <>Let's craft your <span style={{background:'var(--brand-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>first AI persona</span></>}
      </h1>
      <p style={{margin:'0 0 28px', color:'var(--text-muted)', fontSize:15, lineHeight:1.6, maxWidth:520, marginInline:'auto'}}>
        {isHE ? 'תבחר נישה, קול, וסגנון — והאולפן שלנו מתחיל לייצר וידאו אוטומטית. תוך שעתיים יש לך את הסרטון הראשון.'
              : 'Pick a niche, voice, and style — the studio drafts, renders, and posts on a schedule. First video lands in under two hours.'}
      </p>
      <div style={{display:'flex', justifyContent:'center', gap:10, marginBottom:36}}>
        <Button variant="primary" icon="plus" onClick={onCreate}>{isHE?'יצירת אווטר':'Create avatar'}</Button>
        <Button variant="secondary" icon="play">{isHE?'צפה בדמו 90שנ':'Watch 90s demo'}</Button>
      </div>

      {/* Three-step strip */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, textAlign:isHE?'right':'left'}}>
        {[
          { n:'01', t:isHE?'הגדר אווטר':'Define avatar', d:isHE?'נישה, קול, ויזואל, קהל':'Niche, voice, look, audience' },
          { n:'02', t:isHE?'חבר פלטפורמות':'Connect platforms', d:isHE?'YouTube, TikTok, Instagram':'YouTube, TikTok, Instagram' },
          { n:'03', t:isHE?'שב והסתכל':'Sit back', d:isHE?'הסטודיו מפרסם בלוז שלך':'Studio drafts and posts on your schedule' },
        ].map((s,i) => (
          <Card key={i}>
            <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-dim)', marginBottom:8}}>{s.n}</div>
            <div style={{fontFamily:'var(--font-display)', fontSize:15, fontWeight:600, marginBottom:6}}>{s.t}</div>
            <div style={{fontSize:12.5, color:'var(--text-muted)', lineHeight:1.5}}>{s.d}</div>
          </Card>
        ))}
      </div>
    </div>
  </div>;
};

const EmptyVideos = ({ lang, onCreate }) => {
  const isHE = lang === 'HE';
  return <div style={{padding:'28px 32px', position:'relative'}}>
    <div style={{position:'fixed', width:340, height:340, borderRadius:'50%', background:'#06B6D4', filter:'blur(120px)', opacity:0.12, top:80, [isHE?'left':'right']:'30%', pointerEvents:'none', zIndex:0, animation:'bcDrift 12s ease-in-out infinite'}}/>

    <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:20}}>
      <Button variant="primary" icon="plus" onClick={onCreate}>{isHE?'הפק חדש':'Produce new'}</Button>
    </div>

    <Card style={{padding:0, overflow:'hidden', position:'relative', zIndex:1}}>
      {/* Mock-row skeleton at top */}
      <div style={{padding:'40px 32px 8px', textAlign:'center'}}>
        <div style={{
          width:64, height:64, margin:'0 auto 16px', borderRadius:18,
          background:'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(6,182,212,0.18))',
          border:'1px solid rgba(167,139,250,0.4)',
          display:'flex', alignItems:'center', justifyContent:'center'
        }}>
          <Icon name="videos" size={28} color="#A78BFA"/>
        </div>
        <h2 style={{margin:'0 0 8px', fontFamily:'var(--font-display)', fontSize:22, fontWeight:600}}>
          {isHE?'אין סרטונים עדיין':'No videos yet'}
        </h2>
        <p style={{margin:'0 0 20px', color:'var(--text-muted)', fontSize:14, lineHeight:1.6, maxWidth:440, marginInline:'auto'}}>
          {isHE ? 'הפק את הסרטון הראשון, או הקצה מגמה לאחד האווטרים שלך והאולפן ינסח גרסה'
                : 'Produce one manually, or pick a live trend and assign it to an avatar — the studio takes it from there.'}
        </p>
        <div style={{display:'flex', justifyContent:'center', gap:10}}>
          <Button variant="primary" icon="sparkles" onClick={onCreate}>{isHE?'הפק סרטון':'Produce video'}</Button>
          <Button variant="secondary" icon="trends">{isHE?'עיין במגמות':'Browse trends'}</Button>
        </div>
      </div>

      {/* Skeleton rows */}
      <div style={{padding:'28px 18px 18px', display:'flex', flexDirection:'column', gap:8, opacity:0.4, pointerEvents:'none'}}>
        {[1,2,3].map(i => (
          <div key={i} style={{
            display:'grid', gridTemplateColumns:'80px 1fr 100px 100px 80px',
            gap:12, alignItems:'center', padding:'10px 12px', borderRadius:10, background:'var(--surface-2)'
          }}>
            <div style={{aspectRatio:'16/10', borderRadius:6, background:'linear-gradient(90deg, var(--surface-3), var(--surface-2), var(--surface-3))', backgroundSize:'200% 100%', animation:'bcShimmer 2s ease-in-out infinite'}}/>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              <div style={{height:12, width:`${60+i*8}%`, background:'var(--surface-3)', borderRadius:4}}/>
              <div style={{height:9, width:'30%', background:'var(--surface-3)', borderRadius:4, opacity:0.6}}/>
            </div>
            <div style={{height:10, width:'70%', background:'var(--surface-3)', borderRadius:4}}/>
            <div style={{height:18, width:'70%', background:'var(--surface-3)', borderRadius:99}}/>
            <div style={{height:8, width:'90%', background:'var(--surface-3)', borderRadius:4}}/>
          </div>
        ))}
      </div>
    </Card>
  </div>;
};

Object.assign(window, { TrendsPage, LearningsPage, SettingsPage, EmptyDashboard, EmptyVideos });
