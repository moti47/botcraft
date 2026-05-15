/**
 * sfx.js — programmatic sound effects via Web Audio API.
 *
 * No external audio files needed — every effect is synthesized on the fly
 * from oscillators and noise nodes. Costs zero bandwidth and zero quota.
 *
 * Usage:
 *   import { sfx } from './lib/sfx'
 *   sfx.whoosh()    // transition swoosh
 *   sfx.pop()       // caption word emphasis
 *   sfx.thump()     // hook impact / scene punch-in
 *   sfx.ding()      // success ping
 *
 * Volume is global and capped so SFX never overpower TTS.
 */

let ctx = null
let masterGain = null
let muted = false

function getCtx() {
  if (!ctx) {
    // Lazy-init on first call so we don't hit the autoplay policy block
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    masterGain = ctx.createGain()
    masterGain.gain.value = 0.25   // SFX bed sits well under TTS
    masterGain.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function noiseBuffer(seconds, duration) {
  const c = getCtx(); if (!c) return null
  const len = Math.floor(c.sampleRate * seconds)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    // Pink-ish noise: tapers in/out to avoid clicks
    const env = Math.sin((i / len) * Math.PI)
    data[i] = (Math.random() * 2 - 1) * env
  }
  return buf
}

export const sfx = {
  setMuted(v) { muted = !!v },
  isMuted() { return muted },

  /** Transition whoosh — filtered noise sweep, ~250ms. */
  whoosh() {
    if (muted) return
    const c = getCtx(); if (!c) return
    const t = c.currentTime
    const dur = 0.32
    const buf = noiseBuffer(dur)
    if (!buf) return
    const src = c.createBufferSource(); src.buffer = buf
    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.4
    filter.frequency.setValueAtTime(180, t)
    filter.frequency.exponentialRampToValueAtTime(3800, t + dur * 0.85)
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.7, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(filter); filter.connect(g); g.connect(masterGain)
    src.start(t); src.stop(t + dur + 0.02)
  },

  /** Caption pop — short percussive blip on word emphasis. */
  pop() {
    if (muted) return
    const c = getCtx(); if (!c) return
    const t = c.currentTime
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(820, t)
    o.frequency.exponentialRampToValueAtTime(180, t + 0.08)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    o.connect(g); g.connect(masterGain)
    o.start(t); o.stop(t + 0.12)
  },

  /** Hook thump — deep punch for scene punch-in / hook reveal. */
  thump() {
    if (muted) return
    const c = getCtx(); if (!c) return
    const t = c.currentTime
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(110, t)
    o.frequency.exponentialRampToValueAtTime(34, t + 0.22)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    o.connect(g); g.connect(masterGain)
    o.start(t); o.stop(t + 0.32)
    // Sprinkle a touch of noise for a "kick" texture
    const buf = noiseBuffer(0.15); if (!buf) return
    const src = c.createBufferSource(); src.buffer = buf
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400
    const ng = c.createGain()
    ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    src.connect(lp); lp.connect(ng); ng.connect(masterGain)
    src.start(t); src.stop(t + 0.16)
  },

  /** Success ding — bright bell tone for CTAs / completion. */
  ding() {
    if (muted) return
    const c = getCtx(); if (!c) return
    const t = c.currentTime
    ;[880, 1320].forEach((freq, i) => {
      const o = c.createOscillator()
      o.type = 'triangle'
      o.frequency.value = freq
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t + i * 0.04)
      g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.04 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.04 + 0.5)
      o.connect(g); g.connect(masterGain)
      o.start(t + i * 0.04); o.stop(t + i * 0.04 + 0.55)
    })
  },

  /** Soft hi-hat tick for word emphasis on quiet captions. */
  tick() {
    if (muted) return
    const c = getCtx(); if (!c) return
    const t = c.currentTime
    const buf = noiseBuffer(0.04); if (!buf) return
    const src = c.createBufferSource(); src.buffer = buf
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500
    const g = c.createGain()
    g.gain.setValueAtTime(0.18, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    src.connect(hp); hp.connect(g); g.connect(masterGain)
    src.start(t); src.stop(t + 0.06)
  },
}
