
// ═══ ANDROID SHIM — remplace l'API Electron ═══
window.api = {
  async get(url) {
    try {
      const r = await fetch(url);
      const text = await r.text();
      try { return JSON.parse(text); } catch { return text; }
    } catch(e) { throw e; }
  },
  async mpvPlay({url, isLive, title} = {}) {
    if (window.AndroidBridge) window.AndroidBridge.play(url||'', title||'', !!isLive);
    return {};
  },
  async mpvStop() {},
  async mpvCheck() { return {found:true}; },
  async getPaths() { return {downloads:'',pictures:''}; },
  async ensureDir() {},
  async mpvRecord() { return {ok:false}; },
  async mpvDownload() { return {ok:false}; },
  async mpvShot() { return {}; },
  async listFiles() { return []; },
  async deleteFile() {},
  async openFolder() {},
  async saveJson() {},
  async loadJson() { return {cancelled:true}; },
  onMpvClosed(cb) {},
  onMpvError(cb) {},
  onMpvMaxConn(cb) {},
  onRecordDone(cb) {},
  onDlDone(cb) {},
  onDlProgress(cb) {},
  winMin(){}, winMax(){}, winClose(){}
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {

    // Skip profiles - auto-select default profile
    const _origShow = window.show;
    if (_origShow) {
      window.show = function(name, slide) {
        if (name === 'profiles') {
          if (!window.S.profiles.length) {
            window.S.profiles.push({id:'tv_default',name:'TV',color:'#e05260',emoji:'📺'});
          }
          window.S.activePro = window.S.profiles[0];
          if (!window.S.history[window.S.activePro.id]) window.S.history[window.S.activePro.id] = [];
          const g = document.getElementById('home-greeting');
          if (g) g.textContent = 'StreamCore';
          _origShow('home');
          window.loadData && window.loadData();
          return;
        }
        _origShow(name, slide);
      };
    }


    // Afficher la version en haut à droite
    const vbadge = document.createElement('div');
    vbadge.style.cssText = 'position:fixed;top:10px;right:16px;z-index:9999;font-size:13px;color:rgba(255,255,255,.3);font-family:Inter,sans-serif;pointer-events:none;';
    vbadge.textContent = 'v1.6';
    document.body.appendChild(vbadge);
    // Android back button
    window.onAndroidBack = () => {
      for (const m of ['modal-detail','modal-profiles','modal-pin','modal-mood']) {
        const el = document.getElementById(m);
        if (el && !el.classList.contains('hide')) { el.classList.add('hide'); return; }
      }
      const overlay = document.getElementById('error-overlay');
      if (overlay && !overlay.classList.contains('hide')) { overlay.classList.add('hide'); return; }
      window.goBack && window.goBack();
    };

    // Add tabindex to all htile for D-pad
    document.querySelectorAll('.htile').forEach(t => t.setAttribute('tabindex','0'));

    // D-pad navigation
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.keyCode === 23) {
        e.preventDefault();
        document.activeElement?.click();
        return;
      }
      const cur = document.querySelector('.screen.active')?.id;

      if (cur === 'sc-home') {
        const tiles = [...document.querySelectorAll('.htile')];
        const idx = tiles.indexOf(document.activeElement);
        if (idx === -1 && tiles.length) { tiles[0].focus(); return; }
        if (e.key === 'ArrowRight' && idx < tiles.length-1) { e.preventDefault(); tiles[idx+1].focus(); }
        if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); tiles[idx-1].focus(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); const n=tiles[idx+3]; if(n)n.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); const n=tiles[idx-3]; if(n)n.focus(); }
      }

      if (cur === 'sc-live') {
        const cats = [...document.querySelectorAll('.live-cat-item')];
        const rows = [...document.querySelectorAll('.ch-row')];
        const focused = document.activeElement;
        const ci = cats.indexOf(focused);
        const ri = rows.indexOf(focused);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (ci >= 0 && ci < cats.length-1) { cats[ci+1].focus(); cats[ci+1].scrollIntoView({block:'nearest'}); }
          else if (ri >= 0 && ri < rows.length-1) { rows[ri+1].focus(); rows[ri+1].scrollIntoView({block:'nearest'}); }
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (ci > 0) { cats[ci-1].focus(); cats[ci-1].scrollIntoView({block:'nearest'}); }
          else if (ri > 0) { rows[ri-1].focus(); rows[ri-1].scrollIntoView({block:'nearest'}); }
        }
        if (e.key === 'ArrowRight' && ci >= 0 && rows.length) { e.preventDefault(); rows[0].focus(); }
        if (e.key === 'ArrowLeft' && ri >= 0 && cats.length) { e.preventDefault(); cats[0].focus(); }
      }

      if (cur === 'sc-vod') {
        const cards = [...document.querySelectorAll('.v-card')];
        const focused = document.activeElement;
        const idx = cards.indexOf(focused);
        const cols = Math.floor((document.querySelector('.vod-row-list')?.offsetWidth||860)/170)||5;
        if (e.key === 'ArrowRight' && idx < cards.length-1) { e.preventDefault(); cards[idx+1].focus(); }
        if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); cards[idx-1].focus(); }
        if (e.key === 'ArrowDown' && idx >= 0) { e.preventDefault(); const n=cards[idx+cols]; if(n){n.focus();n.scrollIntoView({block:'nearest'});} }
        if (e.key === 'ArrowUp' && idx >= 0) { e.preventDefault(); const p=cards[idx-cols]; if(p){p.focus();p.scrollIntoView({block:'nearest'});} }
      }

      if (cur === 'sc-serie') {
        const items = [...document.querySelectorAll('.ep-item')];
        const idx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' && idx < items.length-1) { e.preventDefault(); items[idx+1].focus(); }
        if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); items[idx-1].focus(); }
      }
    }, true);

  }, 150);
});
