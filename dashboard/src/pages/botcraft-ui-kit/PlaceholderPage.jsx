// Generic placeholder for pages not fully built out
const PlaceholderPage = ({ title, blurb }) => (
  <div style={{padding:'28px 32px', position:'relative'}}>
    <div style={{position:'fixed', width:340, height:340, borderRadius:'50%', background:'#7C3AED', filter:'blur(120px)', opacity:0.14, top:80, right:'25%', pointerEvents:'none', zIndex:0}}/>
    <div style={{
      maxWidth:560, margin:'80px auto 0', textAlign:'center', position:'relative', zIndex:1,
      padding:'48px 32px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20
    }}>
      <div style={{
        width:64, height:64, margin:'0 auto 18px', borderRadius:18,
        background:'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(6,182,212,0.18))',
        border:'1px solid rgba(167,139,250,0.4)',
        display:'flex', alignItems:'center', justifyContent:'center'
      }}>
        <Icon name="sparkles" size={28} color="#A78BFA"/>
      </div>
      <h2 style={{margin:'0 0 10px', fontFamily:'var(--font-display)', fontSize:26, fontWeight:700, letterSpacing:'-0.02em'}}>{title}</h2>
      <p style={{margin:'0 0 20px', color:'var(--text-muted)', fontSize:14, lineHeight:1.6}}>{blurb}</p>
      <Button variant="primary" icon="plus">Get started</Button>
    </div>
  </div>
);
window.PlaceholderPage = PlaceholderPage;
