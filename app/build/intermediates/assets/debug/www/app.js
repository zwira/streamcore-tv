/* ══════════════════════════════════════════════════════════════
   STREAMCORE v6
   Registry pattern: toutes les données sont stockées dans REG{}
   Les onclick utilisent uniquement des IDs numériques sûrs
══════════════════════════════════════════════════════════════ */

/* ─── REGISTRY ───────────────────────────────────────────────── */
const REG = {};   // id (string) -> stream/serie object
const EPGREG = {}; // channelId -> [{start,stop,title,desc}]

function reg(item) {
  const id = String(item.stream_id || item.series_id || item.id || '');
  if (id) REG[id] = item;
  return id;
}

/* ─── STATE ──────────────────────────────────────────────────── */
const S = {
  // Auth
  accounts: [], activeAcc: null, baseUrl: '',
  // Profiles
  profiles: [], activePro: null,
  // Data
  liveCats: [], liveStreams: [],
  movieCats: [], movieStreams: [],
  serieCats: [], serieStreams: [],
  // Live UI
  liveCatIdx: 0, liveCatFilter: null, liveQuery: '',
  // VOD UI
  vodSec: 'movies', vodCat: null, vodQuery: '', vodSort: 'name',
  vodFavFilter: false, vodLaterFilter: false,
  // Serie
  activeSerie: null, activeSeason: 1, serieInfo: null,
  // EPG
  epgDay: 0, epgQuery: '', epgLoaded: false,
  // Player
  playing: null, pip: false, recording: false,
  nextEp: null, autoplayTimer: null, autoplaySecs: 5,
  // User data (per profile)
  favorites: {}, watchLater: {}, history: {},
  // Cache
  tmdb: {},
  // Recordings path
  recPath: '',
};

const PCOLORS = ['#e05260','#5082e0','#50c082','#c08250','#8250c0','#50b0c0','#d4a017'];
const PEMOJI  = ['🎬','🎭','🎮','⚽','🎵','📺','🌙'];
const TMDB_KEY = '4e44d9029b1270a757cddc766a1bcb63';

const YT_INSTS = [
  { label:'Yewtu.be',       url:'https://yewtu.be' },
  { label:'Inv.nadeko.net', url:'https://inv.nadeko.net' },
  { label:'Piped.video',    url:'https://piped.video' },
];
let ytInst = YT_INSTS[0].url;

/* ─── BOOT ───────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  loadPersist();
  clockTick();
  renderSavedAccounts();
  S.recPath = await api.getDownloadsPath();
  api.onMpvClosed(() => {
    if (S.recording) { S.recording = false; $('btn-rec')?.classList.remove('recording'); }
    // Autoplay next episode
    if (S.nextEp) scheduleAutoplay();
    else { S.playing = null; S.pip = false; $('now-playing').classList.add('hide'); $('btn-pip')?.classList.remove('on'); $('btn-live-pip')?.classList.remove('active'); }
  });
  api.onMpvError(m => toast('Erreur mpv : ' + m));
  api.onRecordDone(p => toast('Enregistré : ' + p.split('/').pop()));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDetail(); closeManageProfiles(); closeTracks(); cancelAutoplay(); }
  });
});

function clockTick() {
  const tick = () => {
    const n = new Date();
    const t = n.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    const d = n.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
    $('tb-time').textContent = t + '  ' + d;
    $('home-clock').textContent = t + ' · ' + d;
  };
  tick();
  setInterval(tick, 15000);
}

/* ─── PERSIST ────────────────────────────────────────────────── */
function loadPersist() {
  S.accounts   = ls('sc_accs')  || [];
  S.profiles   = ls('sc_profs') || [];
  S.favorites  = ls('sc_favs')  || {};
  S.watchLater = ls('sc_later') || {};
  S.history    = ls('sc_hist')  || {};
}
function persist() {
  lss('sc_accs',  S.accounts);
  lss('sc_profs', S.profiles);
  lss('sc_favs',  S.favorites);
  lss('sc_later', S.watchLater);
  lss('sc_hist',  S.history);
}

/* ─── ACCOUNTS ───────────────────────────────────────────────── */
function renderSavedAccounts() {
  const el = $('saved-accs');
  const form = $('login-form');
  const addBtn = $('btn-add-acc');
  if (!S.accounts.length) { el.innerHTML = ''; form.classList.remove('hide'); addBtn.classList.add('hide'); return; }
  el.innerHTML = '<div class="saved-accounts">' + S.accounts.map(a =>
    `<div class="acc-item" onclick="loginAs(${JSON.stringify(a.id)})">
      <div class="acc-av" style="background:${a.color}">${abbr(a.user)}</div>
      <div class="acc-info"><div class="acc-name">${esc(a.user)}</div><div class="acc-server">${esc(a.server)}</div></div>
      <button class="acc-del" onclick="event.stopPropagation();delAcc(${JSON.stringify(a.id)})">
        <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>`).join('') + '</div>';
  form.classList.add('hide');
  addBtn.classList.remove('hide');
}
function showLoginForm() { $('login-form').classList.remove('hide'); $('btn-add-acc').classList.add('hide'); }
async function loginAs(id) {
  const a = S.accounts.find(x => x.id === id); if (!a) return;
  $('f-url').value = a.server; $('f-user').value = a.user; $('f-pass').value = a.pass;
  await doLogin();
}
function delAcc(id) { S.accounts = S.accounts.filter(a => a.id !== id); persist(); renderSavedAccounts(); }

async function doLogin() {
  const server = $('f-url').value.trim().replace(/\/$/, '');
  const user   = $('f-user').value.trim();
  const pass   = $('f-pass').value.trim();
  if (!server || !user || !pass) return showErr('Remplissez tous les champs.');
  setBusy(true); hideErr();
  try {
    const url = server + '/player_api.php?username=' + enc(user) + '&password=' + enc(pass);
    const info = await api.get(url);
    if (!info?.user_info || info.user_info.auth == 0) throw new Error('Identifiants incorrects.');
    if (!S.accounts.find(a => a.server === server && a.user === user)) {
      S.accounts.push({ id: uid(), server, user, pass, color: PCOLORS[S.accounts.length % PCOLORS.length] });
      persist();
    }
    S.activeAcc = { server, user, pass };
    S.baseUrl = url;
    renderProfilesScreen();
    show('profiles');
  } catch(e) { showErr(e.message); }
  finally { setBusy(false); }
}
function setBusy(b) { const btn=$('btn-login'); btn.disabled=b; btn.textContent=b?'Connexion…':'Se connecter'; }
function showErr(m) { $('login-err').textContent=m; $('login-err').classList.remove('hide'); }
function hideErr() { $('login-err').classList.add('hide'); }

/* ─── PROFILES ───────────────────────────────────────────────── */
function renderProfilesScreen() {
  $('profiles-grid').innerHTML =
    S.profiles.map(p =>
      `<div class="p-item" onclick="selectProfile(${JSON.stringify(p.id)})">
        <div class="p-av" id="pav-${p.id}" style="background:${p.color};color:#fff">${p.emoji||abbr(p.name)}</div>
        <div class="p-name">${esc(p.name)}</div>
      </div>`).join('') +
    (S.profiles.length < 5 ?
      `<div class="p-item p-add" onclick="quickAddProfile()"><div class="p-av">+</div><div class="p-name">Ajouter</div></div>` : '');
}
function selectProfile(id) {
  S.activePro = S.profiles.find(p => p.id === id); if (!S.activePro) return;
  const av = $('pav-' + id);
  if (av) { av.classList.add('zoom'); setTimeout(goHomeScreen, 480); }
  else goHomeScreen();
}
function quickAddProfile() {
  const name = prompt('Nom du profil :'); if (!name?.trim()) return;
  S.profiles.push({ id:uid(), name:name.trim(), color:PCOLORS[S.profiles.length%PCOLORS.length], emoji:PEMOJI[S.profiles.length%PEMOJI.length] });
  persist(); renderProfilesScreen();
}
function goHomeScreen() {
  $('home-greeting').textContent = 'Bonjour, ' + S.activePro.name + ' 👋';
  show('home'); loadData();
}
function goHome() { api.ytHide(); show('home'); }

/* ─── LOAD DATA ──────────────────────────────────────────────── */
async function loadData() {
  try {
    const b = S.baseUrl;
    const [lc,mc,sc] = await Promise.all([
      api.get(b+'&action=get_live_categories'),
      api.get(b+'&action=get_vod_categories'),
      api.get(b+'&action=get_series_categories'),
    ]);
    S.liveCats = arr(lc); S.movieCats = arr(mc); S.serieCats = arr(sc);
    const [ls,ms,ss] = await Promise.all([
      api.get(b+'&action=get_live_streams'),
      api.get(b+'&action=get_vod_streams'),
      api.get(b+'&action=get_series'),
    ]);
    S.liveStreams  = arr(ls); S.movieStreams = arr(ms); S.serieStreams = arr(ss);
    S.liveStreams.forEach(reg); S.movieStreams.forEach(reg); S.serieStreams.forEach(reg);
    $('home-live-sub').textContent  = fmt(S.liveStreams.length) + ' chaînes';
    $('home-movies-sub').textContent = fmt(S.movieStreams.length) + ' films';
    $('home-series-sub').textContent = fmt(S.serieStreams.length) + ' séries';
    const cur = document.querySelector('.screen.active')?.id;
    if (cur === 'sc-live') renderLiveList();
    if (cur === 'sc-vod')  renderVodScreen();
    if (cur === 'sc-epg')  renderEpg();
  } catch(e) { toast('Erreur chargement : ' + e.message); }
}

/* ─── NAVIGATION ─────────────────────────────────────────────── */
function goSection(sec) {
  api.ytHide();
  cancelAutoplay();
  if (sec === 'youtube') { show('youtube'); initYoutube(); return; }
  if (sec === 'stats')   { show('stats'); renderStats(); return; }
  if (sec === 'epg')     { show('epg'); renderEpg(); return; }
  if (sec === 'live')    { show('live'); renderLiveScreen(); return; }
  S.vodSec = sec; S.vodCat = null; S.vodQuery = ''; S.vodFavFilter = false; S.vodLaterFilter = false;
  $('vod-sq').value = '';
  show('vod'); renderVodScreen();
}

/* ─── LIVE TV ────────────────────────────────────────────────── */
function renderLiveScreen() {
  S.liveCatIdx = 0; S.liveCatFilter = null;
  updateLiveCatNav(); renderLiveList();
}
function updateLiveCatNav() {
  const all = [{ category_id:null, category_name:'Toutes' }, ...S.liveCats];
  const c = all[S.liveCatIdx] || all[0];
  $('live-cat-name').textContent = c.category_name;
  S.liveCatFilter = c.category_id ?? null;
}
function prevCat() {
  S.liveCatIdx = (S.liveCatIdx - 1 + S.liveCats.length + 1) % (S.liveCats.length + 1);
  updateLiveCatNav(); renderLiveList();
}
function nextCat() {
  S.liveCatIdx = (S.liveCatIdx + 1) % (S.liveCats.length + 1);
  updateLiveCatNav(); renderLiveList();
}
function filterLive(q) { S.liveQuery = q; renderLiveList(); }

function renderLiveList() {
  let streams = [...S.liveStreams];
  if (S.liveCatFilter !== null) streams = streams.filter(s => s.category_id == S.liveCatFilter);
  if (S.liveQuery) streams = streams.filter(s => (s.name||'').toLowerCase().includes(S.liveQuery.toLowerCase()));
  streams.sort((a,b) => (parseInt(a.num)||0) - (parseInt(b.num)||0));
  const favs = getFavs('live');
  const el = $('live-ch-list');
  if (!streams.length) { el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--t3)">Aucune chaîne</div>'; return; }
  el.innerHTML = streams.map(ch => {
    const id = reg(ch);
    const isFav = favs.includes(id);
    const epgNow = getEpgNow(id);
    const logo = ch.stream_icon
      ? `<img src="${ch.stream_icon}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<span>${abbr(ch.name)}</span>`;
    return `<div class="lci ${S.playing?.liveId===id?'active':''}" id="lci-${id}" onclick="onChClick(${JSON.stringify(id)})">
      <span class="lci-num">${ch.num||''}</span>
      <div class="lci-logo">${logo}</div>
      <div class="lci-info">
        <div class="lci-name">${esc(ch.name)}</div>
        ${epgNow ? `<div class="lci-epg">${esc(epgNow.title)}</div>` : ''}
      </div>
      <div class="lci-dot"></div>
      <button class="lci-fav ${isFav?'on':''}" onclick="event.stopPropagation();toggleFavLive(${JSON.stringify(id)})">
        <svg viewBox="0 0 20 20" fill="${isFav?'currentColor':'none'}"><path d="M10 3l2 4 4.5.7-3.2 3.1.7 4.5L10 13.3l-4 2 .7-4.5L3.5 7.7 8 7 10 3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
  }).join('');
}

function onChClick(id) { const ch = REG[id]; if (ch) playLive(ch); }

async function playLive(ch) {
  const id = reg(ch);
  $$('.lci').forEach(e => e.classList.remove('active'));
  $('lci-' + id)?.classList.add('active');
  // Update info panel
  $('li-status').textContent = 'LIVE';
  $('li-name').textContent = ch.name || '—';
  const cat = S.liveCats.find(c => c.category_id == ch.category_id);
  $('li-cat').textContent = cat?.category_name || '';
  $('li-logo').innerHTML = ch.stream_icon ? `<img src="${ch.stream_icon}" style="width:100%;height:100%;object-fit:contain">` : '';
  $('live-ctrl-name').textContent = ch.name || '';
  // EPG info
  const epgNow  = getEpgNow(id);
  const epgNext = getEpgNext(id);
  $('li-epg-now').innerHTML  = epgNow  ? `<strong>${esc(epgNow.title)}</strong><span>${fmtTime(epgNow.start)} – ${fmtTime(epgNow.stop)}</span>` : '';
  $('li-epg-next').innerHTML = epgNext ? `<strong>Ensuite :</strong> ${esc(epgNext.title)} à ${fmtTime(epgNext.start)}` : '';
  $('live-placeholder').classList.add('hide');
  // Play
  const { server, user, pass } = S.activeAcc;
  const url = server + '/live/' + enc(user) + '/' + enc(pass) + '/' + ch.stream_id + '.m3u8';
  await launch(url, ch.name, 'live', ch.stream_icon || '');
  S.playing = { ...S.playing, liveId: id };
  addHistory({ id, name:ch.name, type:'live', poster:ch.stream_icon||'' });
}

function stopLive() {
  doStop(); $('live-placeholder').classList.remove('hide');
  $$('.lci').forEach(e => e.classList.remove('active'));
  $('live-ctrl-name').textContent = ''; $('li-name').textContent = '—';
  $('li-status').textContent = ''; $('li-logo').innerHTML = '';
  $('li-epg-now').innerHTML = ''; $('li-epg-next').innerHTML = '';
}

async function toggleLivePip() {
  if (!S.playing) return;
  S.pip = !S.pip;
  $('btn-live-pip').classList.toggle('active', S.pip);
  $('btn-pip')?.classList.toggle('on', S.pip);
  await api.mpvPlay({ url:S.playing.url, isLive:true, pip:S.pip });
}

async function toggleTimeshift() {
  if (!S.playing) return;
  toast('Timeshift : utilisez les touches ← → dans mpv pour naviguer dans le buffer');
}

async function startRecord() {
  if (!S.playing) return;
  if (S.recording) { toast('Enregistrement déjà en cours'); return; }
  await api.ensureDir(S.recPath);
  const name = (S.playing.title || 'stream').replace(/[^a-z0-9]/gi, '_');
  const outPath = S.recPath + '/' + name + '_' + Date.now() + '.ts';
  const res = await api.mpvRecord({ url: S.playing.url, outPath });
  if (res.ok) { S.recording = true; $('btn-rec').classList.add('recording'); toast('⏺ Enregistrement démarré'); }
  else toast('Erreur enregistrement');
}

/* ─── VOD SCREEN ─────────────────────────────────────────────── */
function renderVodScreen() {
  $('vod-sec-title').textContent = S.vodSec === 'movies' ? 'Films' : 'Séries';
  $('vod-sq').value = S.vodQuery;
  renderVodCats();
  renderHero();
  renderContinue();
  renderVodRows();
}

function renderVodCats() {
  const cats = S.vodSec === 'movies' ? S.movieCats : S.serieCats;
  $('vod-cats-wrap').innerHTML =
    `<button class="vcat ${S.vodCat===null?'active':''}" onclick="setVodCat(null)">Toutes</button>` +
    cats.map(c => `<button class="vcat ${S.vodCat==c.category_id?'active':''}" onclick="setVodCat(${c.category_id})">${esc(c.category_name)}</button>`).join('');
}
function setVodCat(id) { S.vodCat=id; renderVodCats(); renderVodRows(); }
function filterVod(q) { S.vodQuery=q; renderVodRows(); }
function setVodSort(by, btn) {
  S.vodSort=by; $$('.sort-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); renderVodRows();
}
function toggleFavFilter() {
  S.vodFavFilter=!S.vodFavFilter; S.vodLaterFilter=false;
  $('btn-favs').classList.toggle('active',S.vodFavFilter); $('btn-later').classList.remove('active'); renderVodRows();
}
function toggleLaterFilter() {
  S.vodLaterFilter=!S.vodLaterFilter; S.vodFavFilter=false;
  $('btn-later').classList.toggle('active',S.vodLaterFilter); $('btn-favs').classList.remove('active'); renderVodRows();
}

function getVodFiltered() {
  let s = [...(S.vodSec==='movies' ? S.movieStreams : S.serieStreams)];
  if (S.vodCat !== null) s = s.filter(x => x.category_id == S.vodCat);
  if (S.vodQuery) s = s.filter(x => (x.name||'').toLowerCase().includes(S.vodQuery.toLowerCase()));
  if (S.vodFavFilter)   { const f=getFavs('vod'); s=s.filter(x=>f.includes(reg(x))); }
  if (S.vodLaterFilter) { const l=getLater();      s=s.filter(x=>l.includes(reg(x))); }
  if (S.vodSort==='name')   s.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  if (S.vodSort==='rating') s.sort((a,b)=>(parseFloat(b.rating||b.rating_5based)||0)-(parseFloat(a.rating||a.rating_5based)||0));
  if (S.vodSort==='year')   s.sort((a,b)=>(parseInt(b.year||b.releaseDate)||0)-(parseInt(a.year||a.releaseDate)||0));
  if (S.vodSort==='new')    s.sort((a,b)=>(parseInt(b.last_modified||b.added)||0)-(parseInt(a.last_modified||a.added)||0));
  return s;
}

function renderHero() {
  const streams = S.vodSec==='movies' ? S.movieStreams : S.serieStreams;
  const wp = streams.filter(s => s.stream_icon || s.cover);
  if (!wp.length) { $('vod-hero').classList.add('hide'); return; }
  $('vod-hero').classList.remove('hide');
  const v = wp[Math.floor(Math.random() * Math.min(wp.length,30))];
  const id = reg(v);
  const poster = v.stream_icon || v.cover || '';
  const r = parseFloat(v.rating||v.rating_5based);
  $('vod-hero-bg').style.backgroundImage = 'url(' + poster + ')';
  $('home-bg').style.backgroundImage = 'url(' + poster + ')';
  $('vod-hero-content').innerHTML =
    `<div class="hero-title">${esc(v.name)}</div>
     <div class="hero-meta">${v.year?`<span>${v.year}</span>`:''} ${r>0?`<span>★ ${r.toFixed(1)}</span>`:''}</div>
     <div class="hero-overview" id="hero-ov"></div>
     <div class="hero-actions">
       <button class="btn-hero-play" onclick="onVodPlay(${JSON.stringify(id)})"><svg viewBox="0 0 20 20" fill="none"><path d="M6 4l10 6-10 6V4z" fill="currentColor"/></svg>Lire</button>
       <button class="btn-hero-info" onclick="onVodDetail(${JSON.stringify(id)})">+ Infos</button>
     </div>`;
  fetchTmdb(v.name, v.year||v.releaseDate, S.vodSec).then(info => {
    const el = $('hero-ov'); if (el && info?.overview) el.textContent = info.overview;
  });
}

function renderContinue() {
  const wrap = $('continue-wrap');
  const hist = getHist().filter(h => h.progress && h.progress<0.95 && h.type!=='live' && h.poster);
  if (!hist.length) { wrap.innerHTML=''; return; }
  wrap.innerHTML = `<div class="continue-row">
    <div class="continue-lbl">Continuer à regarder</div>
    <div class="continue-list">${hist.slice(0,12).map(h =>
      `<div class="c-card" onclick="onVodPlay(${JSON.stringify(h.id)})">
        <img class="c-card-img" src="${h.poster}" alt="" onerror="this.style.display='none'">
        <div class="c-prog"><div class="c-prog-bar" style="width:${Math.round((h.progress||0)*100)}%"></div></div>
        <div class="c-name">${esc(h.name)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderVodRows() {
  const container = $('vod-rows');
  const all = getVodFiltered();
  if (!all.length) { container.innerHTML = '<div class="empty">Aucun contenu trouvé.</div>'; return; }

  let html = '';

  // Top 10
  const top10 = [...(S.vodSec==='movies' ? S.movieStreams : S.serieStreams)]
    .filter(v => parseFloat(v.rating||v.rating_5based) > 7 && (v.stream_icon||v.cover))
    .sort((a,b) => (parseFloat(b.rating||b.rating_5based)||0)-(parseFloat(a.rating||a.rating_5based)||0))
    .slice(0, 10);
  if (top10.length && !S.vodQuery && !S.vodFavFilter && !S.vodLaterFilter) {
    html += `<div class="vod-row">
      <div class="vod-row-title">🏆 Top 10 <span class="row-count">${top10.length} titres</span></div>
      <div class="top10-list">${top10.map((v,i) => {
        const id = reg(v); const poster = v.stream_icon||v.cover||'';
        return `<div class="top10-card" onclick="onVodDetail(${JSON.stringify(id)})">
          <div class="top10-num">${i+1}</div>
          <div class="top10-poster"><img src="${poster}" alt="" loading="lazy" onerror="this.parentElement.style.background='var(--bg4)'"></div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  // Nouveautés (14 derniers jours)
  const now = Date.now();
  const newItems = all.filter(v => v.last_modified && (now/1000 - parseInt(v.last_modified)) < 86400*14).slice(0,20);
  if (newItems.length && !S.vodQuery) {
    html += buildRow('🆕 Nouveautés', newItems);
  }

  // Par genre (catégories)
  const cats = S.vodSec==='movies' ? S.movieCats : S.serieCats;
  if (!S.vodCat && !S.vodQuery && !S.vodFavFilter && !S.vodLaterFilter) {
    // Show up to 5 category rows
    const catsToShow = cats.slice(0, 5);
    for (const cat of catsToShow) {
      const items = all.filter(v => v.category_id == cat.category_id).slice(0, 20);
      if (items.length >= 3) html += buildRow(esc(cat.category_name), items);
    }
  }

  // All results (filtered)
  const label = S.vodQuery ? `Résultats pour "${esc(S.vodQuery)}"` : (S.vodCat ? esc(cats.find(c=>c.category_id==S.vodCat)?.category_name||'') : 'Tout le catalogue');
  html += buildRow(label, all.slice(0, 200), true);

  container.innerHTML = html;
}

function buildRow(title, items, showCount=false) {
  if (!items.length) return '';
  const favs = getFavs('vod'); const later = getLater(); const hist = getHist();
  const now = Date.now();
  const cards = items.map(v => {
    const id = reg(v);
    const poster = v.stream_icon||v.cover||'';
    const r = parseFloat(v.rating||v.rating_5based);
    const isFav = favs.includes(id); const isLat = later.includes(id);
    const watched = hist.find(h=>h.id===id);
    const isNew = v.last_modified && (now/1000-parseInt(v.last_modified)) < 86400*14;
    const hdM = (v.name||'').match(/\b(4K|UHD|FHD|HD|1080p|2160p)\b/i);
    const img = poster
      ? `<img src="${poster}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="v-no-img"><svg viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/></svg><span>${esc(v.name)}</span></div>`;
    return `<div class="v-card" onclick="onVodDetail(${JSON.stringify(id)})">
      <div class="v-poster">
        ${img}
        ${r>0?`<div class="v-rating">★ ${r.toFixed(1)}</div>`:''}
        ${isNew&&!watched?'<div class="v-new">NOUVEAU</div>':''}
        ${watched&&watched.progress>.05?`<div class="v-watched">${Math.round(watched.progress*100)}%</div>`:''}
        ${hdM?`<div class="hd-badge">${hdM[0].toUpperCase()}</div>`:''}
        <div class="v-overlay"><svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" fill="rgba(0,0,0,.5)"/><path d="M8 6.5l5.5 3.5L8 13.5V6.5z" fill="white"/></svg></div>
        <button class="v-fav-btn ${isFav?'on':''}" onclick="event.stopPropagation();toggleFavVod(${JSON.stringify(id)})">
          <svg viewBox="0 0 20 20" fill="${isFav?'currentColor':'none'}"><path d="M10 3l2 4 4.5.7-3.2 3.1.7 4.5L10 13.3l-4 2 .7-4.5L3.5 7.7 8 7 10 3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
        </button>
        <button class="v-later-btn ${isLat?'on':''}" onclick="event.stopPropagation();toggleLater(${JSON.stringify(id)})">
          <svg viewBox="0 0 20 20" fill="${isLat?'currentColor':'none'}"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.3"/><path d="M10 6v4l2.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="v-info"><div class="v-title">${esc(v.name)}</div>${v.year||v.releaseDate?`<div class="v-year">${v.year||v.releaseDate}</div>`:''}</div>
    </div>`;
  }).join('');
  return `<div class="vod-row">
    <div class="vod-row-title">${title}${showCount&&items.length>0?` <span class="row-count">${items.length} titres</span>`:''}</div>
    <div class="vod-row-list">${cards}</div>
  </div>`;
}

/* ─── VOD DETAIL ─────────────────────────────────────────────── */
function onVodPlay(id) { const v=REG[id]; if(v) { if(v.series_id) openSerie(v); else playVodItem(v); } }
function onVodDetail(id) { const v=REG[id]; if(v) { if(v.series_id||S.vodSec==='series') openSerie(v); else openDetail(v); } }
function onVodFav(id) { toggleFavVod(id); }
function onVodLater(id) { toggleLater(id); }

async function openDetail(v) {
  const id = reg(v);
  const poster = v.stream_icon||v.cover||'';
  const r = parseFloat(v.rating||v.rating_5based);
  const year = v.year||v.releaseDate||'';
  const isFav = getFavs('vod').includes(id);
  const isLat = getLater().includes(id);
  $('modal-box').innerHTML = `
    <div class="det-hero">
      ${poster?`<img src="${poster}" alt="">`:`<div style="background:var(--bg4);height:230px"></div>`}
      <div class="det-hero-fade"></div>
    </div>
    <div class="det-body">
      <div class="det-title">${esc(v.name)}</div>
      <div class="det-meta">${year?`<span>${year}</span>`:''} ${r>0?`<span class="r">★ ${r.toFixed(1)}</span>`:''}<span id="det-genres"></span></div>
      <div class="det-overview" id="det-ov">Chargement…</div>
      <div class="det-cast" id="det-cast"></div>
      <div class="det-actions">
        <button class="btn-det-play" onclick="closeDetail();onVodPlay(${JSON.stringify(id)})">
          <svg viewBox="0 0 20 20" fill="none"><path d="M6 4l10 6-10 6V4z" fill="currentColor"/></svg>Lire
        </button>
        <button class="btn-det-sec" onclick="toggleFavVod(${JSON.stringify(id)});renderDetBtns(${JSON.stringify(id)})">
          <svg viewBox="0 0 20 20" fill="${isFav?'currentColor':'none'}" id="det-fav-ico"><path d="M10 3l2 4 4.5.7-3.2 3.1.7 4.5L10 13.3l-4 2 .7-4.5L3.5 7.7 8 7 10 3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          <span id="det-fav-lbl">${isFav?'Retirer des favoris':'Favoris'}</span>
        </button>
        <button class="btn-det-sec" onclick="toggleLater(${JSON.stringify(id)});renderDetBtns(${JSON.stringify(id)})">
          <svg viewBox="0 0 20 20" fill="${isLat?'currentColor':'none'}" id="det-lat-ico"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.3"/><path d="M10 6v4l2.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          <span id="det-lat-lbl">${isLat?'Retirer':'À voir plus tard'}</span>
        </button>
      </div>
    </div>`;
  $('modal-detail').classList.remove('hide');
  fetchTmdb(v.name, year, S.vodSec).then(info => {
    if (!info) { const e=$('det-ov'); if(e) e.textContent='Aucune description.'; return; }
    const ov=$('det-ov'); if(ov&&info.overview) ov.textContent=info.overview;
    const g=$('det-genres'); if(g&&info.genres?.length) g.textContent=info.genres.map(x=>x.name).join(', ');
    const c=$('det-cast'); if(c&&info.credits?.cast?.length) c.textContent='Avec : '+info.credits.cast.slice(0,5).map(a=>a.name).join(', ');
  });
}
function renderDetBtns(id) {
  const isFav=getFavs('vod').includes(id); const isLat=getLater().includes(id);
  const fi=$('det-fav-ico'); if(fi) fi.setAttribute('fill',isFav?'currentColor':'none');
  const fl=$('det-fav-lbl'); if(fl) fl.textContent=isFav?'Retirer des favoris':'Favoris';
  const li=$('det-lat-ico'); if(li) li.setAttribute('fill',isLat?'currentColor':'none');
  const ll=$('det-lat-lbl'); if(ll) ll.textContent=isLat?'Retirer':'À voir plus tard';
}
function closeDetail() { $('modal-detail').classList.add('hide'); }

/* ─── SERIE ──────────────────────────────────────────────────── */
async function openSerie(serie) {
  S.activeSerie = reg(serie);
  S.activeSeason = 1; S.serieInfo = null;
  show('serie');
  renderSerieHero(serie);
  renderSerieLoading();
  try {
    const info = await api.get(S.baseUrl + '&action=get_series_info&series_id=' + (serie.series_id||serie.stream_id));
    S.serieInfo = info;
    renderSerieTabs();
    renderSerieEpisodes();
  } catch(e) { $('serie-body').innerHTML = '<div class="empty">Impossible de charger les épisodes.</div>'; }
}

function renderSerieHero(serie) {
  const poster = serie.stream_icon||serie.cover||'';
  const r = parseFloat(serie.rating||serie.rating_5based);
  $('serie-hero').innerHTML = `
    <div class="serie-hero-bg" style="background-image:url(${poster});background-size:cover;background-position:center"></div>
    <div class="serie-hero-overlay"></div>
    <div class="serie-hero-content">
      <h1 style="font-family:'Syne',sans-serif;font-size:28px;font-weight:700;margin-bottom:6px">${esc(serie.name)}</h1>
      <div style="font-size:12.5px;color:var(--t2);display:flex;gap:10px">
        ${serie.year||serie.releaseDate?`<span>${serie.year||serie.releaseDate}</span>`:''}
        ${r>0?`<span>★ ${r.toFixed(1)}</span>`:''}
      </div>
    </div>
    <button class="serie-hero-back btn-back-sm" onclick="goSection('series')">
      <svg viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Retour
    </button>`;
}
function renderSerieLoading() { $('serie-body').innerHTML = '<div class="loader"><div class="spinner"></div><span>Chargement des épisodes…</span></div>'; }

function renderSerieTabs() {
  if (!S.serieInfo?.seasons) return;
  const seasons = Object.keys(S.serieInfo.seasons||{}).sort((a,b)=>parseInt(a)-parseInt(b));
  $('serie-body').innerHTML = `
    <div class="season-tabs" id="season-tabs">
      ${seasons.map(s => `<button class="season-tab ${parseInt(s)===S.activeSeason?'active':''}" onclick="selectSeason(${parseInt(s)},this)">Saison ${s}</button>`).join('')}
    </div>
    <div class="episodes-list" id="episodes-list"></div>`;
  renderSerieEpisodes();
}

function selectSeason(n, btn) {
  S.activeSeason = n;
  $$('.season-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderSerieEpisodes();
}

function renderSerieEpisodes() {
  const el = $('episodes-list'); if (!el||!S.serieInfo) return;
  const eps = S.serieInfo.episodes?.[S.activeSeason] || [];
  if (!eps.length) { el.innerHTML = '<div class="empty">Aucun épisode disponible.</div>'; return; }
  el.innerHTML = eps.map((ep,i) => {
    const epId = reg({ id: ep.id||i, ...ep });
    return `<div class="ep-item" onclick="playEpisode(${JSON.stringify(epId)},${i},${JSON.stringify(eps.length)})">
      <div class="ep-num">${ep.episode_num||i+1}</div>
      ${ep.info?.movie_image?`<img class="ep-thumb" src="${ep.info.movie_image}" alt="" onerror="this.style.display='none'">`:`<div class="ep-thumb"></div>`}
      <div class="ep-info">
        <div class="ep-title">${esc(ep.title||ep.info?.name||'Épisode '+(i+1))}</div>
        <div class="ep-meta">${ep.info?.releasedate||''} ${ep.info?.duration_secs?'· '+fmtDuration(ep.info.duration_secs):''}</div>
      </div>
      <button class="ep-play"><svg viewBox="0 0 20 20" fill="none"><path d="M6 4l10 6-10 6V4z" fill="currentColor"/></svg></button>
    </div>`;
  }).join('');
}

async function playEpisode(epId, idx, total) {
  const ep = REG[epId]; if (!ep) return;
  const { server, user, pass } = S.activeAcc;
  const url = server + '/series/' + enc(user) + '/' + enc(pass) + '/' + (ep.id||epId) + '.' + (ep.container_extension||'mkv');
  const serie = REG[S.activeSerie];
  const title = (serie?.name||'Série') + ' S' + S.activeSeason + 'E' + (idx+1);
  // Set next episode for autoplay
  const eps = S.serieInfo?.episodes?.[S.activeSeason] || [];
  if (idx + 1 < total) {
    const nextEp = eps[idx+1];
    if (nextEp) {
      const nextId = reg({ id:nextEp.id||idx+1, ...nextEp });
      S.nextEp = { epId:nextId, idx:idx+1, total, title:'S'+S.activeSeason+'E'+(idx+2) };
    }
  } else { S.nextEp = null; }
  await launch(url, title, 'vod', serie?.stream_icon||'');
  addHistory({ id:epId, name:title, type:'vod', poster:serie?.stream_icon||'', progress:0.01 });
}

function scheduleAutoplay() {
  if (!S.nextEp) return;
  $('autoplay-title').textContent = 'Prochain : ' + S.nextEp.title;
  $('autoplay-count').textContent = S.autoplaySecs;
  $('autoplay-bar').classList.remove('hide');
  let secs = S.autoplaySecs;
  S.autoplayTimer = setInterval(() => {
    secs--;
    $('autoplay-count').textContent = secs;
    if (secs <= 0) { clearInterval(S.autoplayTimer); doAutoplay(); }
  }, 1000);
}
function doAutoplay() {
  cancelAutoplay();
  if (S.nextEp) { playEpisode(S.nextEp.epId, S.nextEp.idx, S.nextEp.total); S.nextEp = null; }
}
function cancelAutoplay() {
  clearInterval(S.autoplayTimer); S.autoplayTimer = null;
  $('autoplay-bar').classList.add('hide');
}

/* ─── EPG ────────────────────────────────────────────────────── */
async function renderEpg() {
  const wrap = $('epg-grid-wrap');
  updateEpgDateLabel();
  if (!S.liveStreams.length) { wrap.innerHTML = '<div class="epg-load-info">Chargement des données en cours…</div>'; return; }
  wrap.innerHTML = '<div class="loader"><div class="spinner"></div><span>Chargement du guide…</span></div>';
  // Load EPG for all channels if not cached
  if (!S.epgLoaded) await loadEpgData();
  buildEpgGrid();
}

async function loadEpgData() {
  // Load EPG from server (Xtream provides EPG via XML or API)
  try {
    const data = await api.get(S.baseUrl + '&action=get_short_epg&stream_id=0&limit=4');
    // Try to load the full EPG XMLTV
    // For now, use short EPG per channel on demand
    S.epgLoaded = true;
  } catch { S.epgLoaded = true; }
}

async function getChannelEpg(streamId) {
  if (EPGREG[streamId]) return EPGREG[streamId];
  try {
    const data = await api.get(S.baseUrl + '&action=get_simple_data_table&stream_id=' + streamId);
    const listings = arr(data?.epg_listings||data);
    EPGREG[streamId] = listings.map(e => ({
      title: e.title ? atob(e.title) : (e.name||''),
      start: new Date(e.start_timestamp ? e.start_timestamp*1000 : e.start),
      stop:  new Date(e.stop_timestamp  ? e.stop_timestamp*1000  : e.end),
      desc:  e.description ? atob(e.description) : '',
    }));
    return EPGREG[streamId];
  } catch { EPGREG[streamId] = []; return []; }
}

function buildEpgGrid() {
  const wrap = $('epg-grid-wrap');
  const streams = S.liveStreams.slice(0, 50); // Show first 50 channels
  const now = new Date();
  const q = S.epgQuery.toLowerCase();

  wrap.innerHTML = `<div class="epg-table" id="epg-table">
    ${streams.map(ch => {
      const id = reg(ch);
      const epg = EPGREG[id] || [];
      const filtered = q ? epg.filter(e => e.title.toLowerCase().includes(q)) : epg;
      const slots = filtered.length
        ? filtered.slice(0,8).map(e => {
            const isNow = e.start <= now && e.stop >= now;
            const isPast = e.stop < now;
            return `<div class="epg-slot ${isNow?'now':''} ${isPast?'catchup':''}" onclick="${isPast?'playCatchup('+JSON.stringify(id)+','+JSON.stringify(e.start.toISOString())+','+JSON.stringify(e.stop.toISOString())+')':'onChClick('+JSON.stringify(id)+')'}">
              <div class="epg-slot-time">${fmtTime(e.start)} – ${fmtTime(e.stop)}${isPast?' (replay)':''}</div>
              <div class="epg-slot-title">${esc(e.title)}</div>
            </div>`;
          }).join('')
        : `<div class="epg-empty">—</div>`;
      const logo = ch.stream_icon ? `<img src="${ch.stream_icon}" style="width:100%;height:100%;object-fit:contain" onerror="this.style.display='none'">` : abbr(ch.name);
      return `<div class="epg-row">
        <div class="epg-ch" onclick="onChClick(${JSON.stringify(id)});goSection('live')">
          <div class="epg-ch-logo">${logo}</div>
          <div class="epg-ch-name">${esc(ch.name)}</div>
        </div>
        <div class="epg-slots">${slots}</div>
      </div>`;
    }).join('')}
  </div>`;

  // Lazy load EPG data for visible channels
  lazyLoadEpg(streams);
}

async function lazyLoadEpg(streams) {
  for (const ch of streams) {
    const id = reg(ch);
    if (!EPGREG[id]) {
      await getChannelEpg(ch.stream_id);
      // Refresh just this row
      const row = document.querySelector(`[onclick*="${JSON.stringify(id)};goSection"]`)?.closest('.epg-row');
      if (row) {
        const epg = EPGREG[id] || [];
        const now = new Date();
        const slots = epg.slice(0,8).map(e => {
          const isNow = e.start <= now && e.stop >= now;
          const isPast = e.stop < now;
          return `<div class="epg-slot ${isNow?'now':''} ${isPast?'catchup':''}">
            <div class="epg-slot-time">${fmtTime(e.start)} – ${fmtTime(e.stop)}</div>
            <div class="epg-slot-title">${esc(e.title)}</div>
          </div>`;
        }).join('') || '<div class="epg-empty">—</div>';
        const slotsEl = row.querySelector('.epg-slots');
        if (slotsEl) slotsEl.innerHTML = slots;
      }
    }
  }
}

function filterEpg(q) { S.epgQuery = q; buildEpgGrid(); }
function epgPrevDay() { S.epgDay--; updateEpgDateLabel(); buildEpgGrid(); }
function epgNextDay() { S.epgDay++; updateEpgDateLabel(); buildEpgGrid(); }
function updateEpgDateLabel() {
  const d = new Date(); d.setDate(d.getDate() + S.epgDay);
  $('epg-date-label').textContent = S.epgDay===0 ? "Aujourd'hui" : S.epgDay===-1 ? 'Hier' : S.epgDay===1 ? 'Demain' : d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});
}

function getEpgNow(channelId) {
  const now = new Date(); const epg = EPGREG[channelId] || [];
  return epg.find(e => e.start <= now && e.stop >= now) || null;
}
function getEpgNext(channelId) {
  const now = new Date(); const epg = EPGREG[channelId] || [];
  return epg.find(e => e.start > now) || null;
}

async function playCatchup(channelId, start, stop) {
  const ch = REG[channelId]; if (!ch) return;
  const { server, user, pass } = S.activeAcc;
  // Xtream catchup URL format
  const startTs = new Date(start).getTime()/1000;
  const stopTs  = new Date(stop).getTime()/1000;
  const url = server + '/timeshift/' + enc(user) + '/' + enc(pass) + '/' + Math.round((stopTs-startTs)/60) + '/' + new Date(start).toISOString().replace('T',' ').slice(0,16) + '/' + ch.stream_id + '.ts';
  const epgNow = (EPGREG[channelId]||[]).find(e => new Date(e.start).toISOString()===new Date(start).toISOString());
  await launch(url, (epgNow?.title||ch.name) + ' (replay)', 'live', ch.stream_icon||'');
}

/* ─── TMDB ───────────────────────────────────────────────────── */
async function fetchTmdb(name, year, type) {
  const k = name + '_' + year + '_' + type;
  if (S.tmdb[k] !== undefined) return S.tmdb[k];
  try {
    const mt = type==='series' ? 'tv' : 'movie';
    const r = await api.get('https://api.themoviedb.org/3/search/'+mt+'?api_key='+TMDB_KEY+'&query='+enc(name)+(year?'&year='+year:'')+'&language=fr-FR');
    if (!r?.results?.length) { S.tmdb[k]=null; return null; }
    const d = await api.get('https://api.themoviedb.org/3/'+mt+'/'+r.results[0].id+'?api_key='+TMDB_KEY+'&append_to_response=credits&language=fr-FR');
    S.tmdb[k]=d; return d;
  } catch { S.tmdb[k]=null; return null; }
}

/* ─── PLAYER ─────────────────────────────────────────────────── */
async function playVodItem(v) {
  const { server, user, pass } = S.activeAcc;
  const id = reg(v);
  const url = server + '/movie/' + enc(user) + '/' + enc(pass) + '/' + v.stream_id + '.mkv';
  await launch(url, v.name, 'vod', v.stream_icon||v.cover||'');
  addHistory({ id, name:v.name, type:'vod', poster:v.stream_icon||v.cover||'', progress:0.01 });
}

async function launch(url, title, type, poster) {
  const ok = await api.mpvCheck(); if (!ok.found) { toast('mpv non trouvé — brew install mpv'); return; }
  const res = await api.mpvPlay({ url, isLive:type==='live', pip:S.pip });
  if (res.error) { toast('Erreur mpv'); return; }
  S.playing = { url, title, type, poster }; S.nextEp = null;
  $('np-title').textContent = title;
  $('np-sub').textContent = type==='live' ? '● En direct' : 'VOD';
  $('now-playing').classList.remove('hide');
}

function doStop() {
  api.mpvStop(); cancelAutoplay();
  S.playing=null; S.pip=false; S.recording=false;
  $('now-playing').classList.add('hide');
  $('btn-pip')?.classList.remove('on');
  $('btn-live-pip')?.classList.remove('active');
  $('btn-rec')?.classList.remove('recording');
}

async function togglePip() {
  if (!S.playing) return;
  S.pip=!S.pip; $('btn-pip').classList.toggle('on',S.pip);
  await api.mpvPlay({ url:S.playing.url, isLive:S.playing.type==='live', pip:S.pip });
}

/* ─── TRACKS (sous-titres / audio) ──────────────────────────── */
// mpv gère les pistes nativement. On propose un guide.
function openTracks() {
  $('modal-tracks-box').innerHTML = `
    <div class="tracks-title">Pistes & Sous-titres</div>
    <div class="tracks-section">
      <h4>Raccourcis dans mpv</h4>
      <div class="track-item"><span class="track-label">J — Changer les sous-titres</span></div>
      <div class="track-item"><span class="track-label"># — Changer la piste audio</span></div>
      <div class="track-item"><span class="track-label">V — Afficher/masquer les sous-titres</span></div>
      <div class="track-item"><span class="track-label">[ / ] — Vitesse lecture -/+</span></div>
      <div class="track-item"><span class="track-label">← / → — Reculer / avancer 5s</span></div>
      <div class="track-item"><span class="track-label">F — Plein écran</span></div>
      <div class="track-item"><span class="track-label">M — Muet</span></div>
      <div class="track-item"><span class="track-label">Q — Quitter et sauvegarder la position</span></div>
    </div>`;
  $('modal-tracks').classList.remove('hide');
}
function closeTracks() { $('modal-tracks').classList.add('hide'); }

/* ─── FAVORITES / LATER ──────────────────────────────────────── */
const pid  = () => S.activePro?.id || 'default';
const getFavs  = type => S.favorites[pid()]?.[type] || [];
const getLater = ()   => S.watchLater[pid()] || [];

function toggleFavLive(id) {
  const p=pid(); if(!S.favorites[p]) S.favorites[p]={live:[],vod:[]};
  toggleArr(S.favorites[p].live, String(id)); persist(); renderLiveList();
}
function toggleFavVod(id) {
  const p=pid(); if(!S.favorites[p]) S.favorites[p]={live:[],vod:[]};
  toggleArr(S.favorites[p].vod, String(id)); persist();
}
function toggleLater(id) {
  const p=pid(); if(!S.watchLater[p]) S.watchLater[p]=[];
  toggleArr(S.watchLater[p], String(id)); persist();
}
function toggleArr(arr, val) { const i=arr.indexOf(val); if(i>=0) arr.splice(i,1); else arr.push(val); }

/* ─── HISTORY ────────────────────────────────────────────────── */
const getHist = () => S.history[pid()] || [];
function addHistory(item) {
  const p=pid(); if(!S.history[p]) S.history[p]=[];
  S.history[p] = S.history[p].filter(h=>h.id!==item.id);
  S.history[p].unshift({ ...item, ts:Date.now() });
  S.history[p] = S.history[p].slice(0,100);
  persist();
  if(item.poster) $('home-bg').style.backgroundImage='url('+item.poster+')';
}

/* ─── YOUTUBE ────────────────────────────────────────────────── */
function initYoutube() {
  $('yt-insts').innerHTML = YT_INSTS.map(i =>
    `<button class="yt-inst ${i.url===ytInst?'active':''}" onclick="switchYtInst(${JSON.stringify(i.url)},this)">${i.label}</button>`
  ).join('');
  api.ytShow(ytInst);
}
function closeYoutube() { api.ytHide(); goHome(); }
async function switchYtInst(url, btn) {
  ytInst=url; $$('.yt-inst').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); await api.ytNav(url);
}
async function ytSearch(q) { if(q.trim()) await api.ytNav(ytInst.replace(/\/$/,'') + '/search?q=' + enc(q)); }

/* ─── STATS ──────────────────────────────────────────────────── */
function renderStats() {
  const hist=getHist();
  const top=hist.reduce((a,h)=>{a[h.name]=(a[h.name]||0)+1;return a;},{});
  const topName=Object.entries(top).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
  $('stats-body').innerHTML = `
    <div class="stats-cards">
      <div class="s-card"><div class="s-val">${hist.length}</div><div class="s-lbl">Contenus regardés</div></div>
      <div class="s-card"><div class="s-val">${hist.filter(h=>h.type==='live').length}</div><div class="s-lbl">Sessions live</div></div>
      <div class="s-card"><div class="s-val">${hist.filter(h=>h.type!=='live').length}</div><div class="s-lbl">Films & séries</div></div>
    </div>
    <div class="stats-sec"><div class="stats-stitle">Plus regardé</div><div style="font-size:16px;font-weight:500;margin-top:4px">${esc(topName)}</div></div>
    <div class="stats-sec"><div class="stats-stitle">Historique récent</div>
      ${hist.slice(0,30).map(h=>`
        <div class="h-item" onclick="onVodPlay(${JSON.stringify(h.id)})">
          ${h.poster?`<img class="h-thumb" src="${h.poster}" alt="" onerror="this.style.display='none'">`:`<div class="h-thumb"></div>`}
          <div class="h-info"><div class="h-name">${esc(h.name)}</div><div class="h-meta">${h.type==='live'?'Live':'VOD'} · ${ago(h.ts)}</div></div>
          ${h.progress&&h.type!=='live'?`<div class="h-prog">${Math.round(h.progress*100)}%</div>`:''}
        </div>`).join('')}
    </div>`;
}

/* ─── MANAGE PROFILES ────────────────────────────────────────── */
let _selColor=PCOLORS[0], _selEmoji=PEMOJI[0];
function openManageProfiles() {
  $('modal-profiles-box').innerHTML = `
    <div class="mp-title">Gérer les profils</div>
    <div class="mp-list">${S.profiles.map(p=>`
      <div class="mp-item">
        <div class="mp-av" style="background:${p.color};color:#fff">${p.emoji||abbr(p.name)}</div>
        <div class="mp-name">${esc(p.name)}</div>
        <button class="mp-del" onclick="delProfile(${JSON.stringify(p.id)})">
          <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>`).join('')}</div>
    ${S.profiles.length<5?`
    <div class="mp-add-form">
      <input id="mp-inp" placeholder="Nom du profil" maxlength="20"/>
      <div class="mp-colors">${PCOLORS.map(c=>`<div class="mp-col ${c===_selColor?'sel':''}" style="background:${c}" onclick="mpCol(${JSON.stringify(c)},this)"></div>`).join('')}</div>
      <div class="mp-emojis">${PEMOJI.map(e=>`<span class="${e===_selEmoji?'sel':''}" onclick="mpEmoji(${JSON.stringify(e)},this)">${e}</span>`).join('')}</div>
      <button class="btn-primary" style="margin-top:0" onclick="addProfileModal()">Ajouter</button>
    </div>`:''}`;
  $('modal-profiles').classList.remove('hide');
}
function mpCol(c,el){_selColor=c;$$('.mp-col').forEach(e=>e.classList.remove('sel'));el.classList.add('sel');}
function mpEmoji(e,el){_selEmoji=e;$$('.mp-emojis span').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');}
function addProfileModal() {
  const name=$('mp-inp')?.value?.trim(); if(!name) return;
  S.profiles.push({id:uid(),name,color:_selColor,emoji:_selEmoji});
  persist(); openManageProfiles(); renderProfilesScreen();
}
function delProfile(id) {
  if(S.profiles.length<=1){toast('Gardez au moins un profil.');return;}
  S.profiles=S.profiles.filter(p=>p.id!==id); persist(); openManageProfiles(); renderProfilesScreen();
}
function closeManageProfiles(){$('modal-profiles').classList.add('hide');}

/* ─── SCREEN ─────────────────────────────────────────────────── */
function show(name) {
  $$('.screen').forEach(s=>{s.classList.remove('active');s.style.display='none';});
  const el=$('sc-'+name); el.style.display='flex';
  requestAnimationFrame(()=>el.classList.add('active'));
}

/* ─── UTILS ──────────────────────────────────────────────────── */
let _toast;
function toast(msg,ms=4000){const el=$('toast');el.textContent=msg;el.classList.remove('hide');clearTimeout(_toast);_toast=setTimeout(()=>el.classList.add('hide'),ms);}
function ago(ts){const d=Date.now()-ts;if(d<60000)return'À l\'instant';if(d<3600000)return Math.floor(d/60000)+' min';if(d<86400000)return Math.floor(d/3600000)+' h';return Math.floor(d/86400000)+' j';}
function fmtTime(d){if(!d)return'';const dt=new Date(d);return dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});}
function fmtDuration(secs){const m=Math.floor(secs/60);const h=Math.floor(m/60);return h>0?h+'h '+(m%60)+'min':m+'min';}
const $   = id => document.getElementById(id);
const $$  = s  => document.querySelectorAll(s);
const enc = s  => encodeURIComponent(s||'');
const esc = s  => s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):'';
const abbr= n  => n?n.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join(''):'?';
const arr = x  => Array.isArray(x)?x:[];
const fmt = n  => n>=1000?(n/1000).toFixed(1)+'k':String(n);
const uid = () => Math.random().toString(36).slice(2,10);
const ls  = k  => {try{return JSON.parse(localStorage.getItem(k));}catch{return null;}};
const lss = (k,v)=> localStorage.setItem(k,JSON.stringify(v));
