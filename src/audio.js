const spec = { A: null, B: null };
function analyzeTable(side) {
  const t = tables[side];
  spec[side] = { k: t.frames.length, re: [], im: [] };
  t.frames.forEach(f => { const a = MorphEngine.analyze(f); spec[side].re.push(a.re); spec[side].im.push(a.im); });
}
function analyzeFrame(side, j) {
  const a = MorphEngine.analyze(tables[side].frames[j]);
  spec[side].re[j] = a.re; spec[side].im[j] = a.im;
}
analyzeTable('A'); analyzeTable('B');

/* ---------- audio startup ---------- */
let ctx = null, send = () => {}, ready = false, starting = null, queue = [];
const post = m => { if (ready) send(m); else { queue.push(m); ensureAudio(); } };
const sendState = () => send({ type:'state', A: state.A, B: state.B, C: state.C, morph: state.morph });
const postTable = side => send({ type:'table', side, re: spec[side].re.slice(), im: spec[side].im.slice() });
const sendTableNow = side => { if (ready) postTable(side); };
const tableTimers = {};
function sendTable(side) {
  if (tableTimers[side]) return;
  tableTimers[side] = setTimeout(() => { tableTimers[side] = null; sendTableNow(side); }, 50);
}
function sendAll() {
  sendState(); postTable('A'); postTable('B');   // runs during startup, before ready is set
  send({ type:'blend', v: state.spectral });
  send({ type:'dlmode', v: state.dlSpill }); send({ type:'bpm', v: state.bpm }); send({ type:'walk', v: state.walk }); send({ type:'mono', v: state.mono }); state.fxOn.forEach((on, i) => send({ type:'bypass', i, on })); send({ type:'dlmode', v: state.dlSpill });
  if (typeof buildSeq === 'function') { const s = buildSeq(); send({ type:'seq', seq: { events: s.events, loop: s.loop, scale: s.scale } }); }
}

// Mobile browsers only allow audio to start inside certain gestures, and some
// (notably iOS) can drop back to a suspended or "interrupted" state later.
// Every tap, click and key press therefore tries to wake the audio up again.
function kick() {
  if (!ctx || userMuted) return;
  if (ctx.state !== 'running') {
    try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(0); } catch (e) {}
    ctx.resume().then(updateAudioBtn, () => {});
  }
}
function ensureAudio() {
  if (ctx) { kick(); return starting; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { engineInfo('This browser has no Web Audio support.'); return Promise.resolve(); }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}   // lets iPhone play with the ringer on silent
  ctx = new AC({ latencyHint: 'interactive' });
  ctx.onstatechange = updateAudioBtn;
  kick();
  starting = (async () => {
    const defs = DEFS.map(({ id, min, max, curve, snap }) => ({ id, min, max, curve, snap: !!snap }));
    let kind = null;
    if (ctx.audioWorklet) {
      const src = `${MorphEngine.toString()}
class MorphProcessor extends AudioWorkletProcessor {
  constructor(o){ super(); this.e = new MorphEngine(sampleRate, o.processorOptions.defs); this.port.onmessage = ev => this.e.handle(ev.data); }
  process(inputs, outputs){ const o = outputs[0]; const L = o[0], R = o[1]; L.fill(0); R.fill(0); this.e.render(L, R, L.length); const q = this.e.reports; for (let k = 0; k < q.length; k++) this.port.postMessage(q[k]); q.length = 0; return true; }
}
registerProcessor('morph-engine', MorphProcessor);`;
      const urls = [];
      try { urls.push(URL.createObjectURL(new Blob([src], { type:'application/javascript' }))); } catch (e) {}
      urls.push('data:application/javascript;charset=utf-8,' + encodeURIComponent(src));
      for (const u of urls) {
        try {
          await ctx.audioWorklet.addModule(u);
          const node = new AudioWorkletNode(ctx, 'morph-engine', { numberOfInputs:0, numberOfOutputs:1, outputChannelCount:[2], processorOptions:{ defs } });
          node.connect(ctx.destination);
          node.port.onmessage = ev => onReport(ev.data);
          send = m => node.port.postMessage(m);
          kind = 'AudioWorklet (dedicated audio thread)';
          break;
        } catch (e) {}
      }
    }
    if (!kind) {
      const eng = new MorphEngine(ctx.sampleRate, defs);
      const sp = ctx.createScriptProcessor(1024, 1, 2);
      sp.onaudioprocess = e => {
        const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
        L.fill(0); R.fill(0); eng.render(L, R, L.length);
        eng.reports.forEach(onReport); eng.reports.length = 0;
      };
      sp.connect(ctx.destination);
      window.__sp = sp;
      send = m => eng.handle(m);
      kind = 'compatibility mode (main thread)';
    }
    sendAll();
    queue.forEach(m => send(m)); queue = [];
    ready = true;
    engineInfo(`Audio engine: ${kind}, ${ctx.sampleRate} Hz.`);
    updateAudioBtn();
  })();
  return starting;
}
function engineInfo(t) { document.getElementById('engineInfo').textContent = t; }
let userMuted = false;
const audioBtn = document.getElementById('audioBtn');
function updateAudioBtn() {
  const off = !ready || !ctx || (ctx.state !== 'running' && !userMuted);
  audioBtn.textContent = off ? 'Tap to start audio' : userMuted ? 'Unmute' : 'Mute';
  audioBtn.classList.toggle('attn', off);
}
audioBtn.addEventListener('click', () => {
  if (!ready || ctx.state !== 'running' && !userMuted) { ensureAudio(); kick(); return; }
  userMuted = !userMuted;
  if (userMuted) { send({ type:'panic' }); ctx.suspend(); } else ctx.resume();
  updateAudioBtn();
});
['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click', 'keydown'].forEach(t =>
  document.addEventListener(t, () => ensureAudio(), { capture:true, passive:true }));
document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

