// ============================================================
// game.js — Main Orchestrator: Menus, Game Loop, HUD, Bullets
// ============================================================

// =====================================================================
// HUD
// =====================================================================
class HUD {
  constructor() {
    this.$ = id => document.getElementById(id);
    this.minimapCtx = this.$('minimap-canvas')?.getContext('2d');
  }

  vitals(hp, maxHp, sh, maxSh) {
    const hPct = (hp / maxHp) * 100;
    const sPct = (sh / maxSh) * 100;
    const hFill = this.$('health-fill');
    if (hFill) {
      hFill.style.width = hPct + '%';
      const hue = (hPct / 100) * 120;
      hFill.style.background = `hsl(${hue},100%,45%)`;
      hFill.style.boxShadow  = `0 0 8px hsl(${hue},100%,45%)`;
    }
    const hv = this.$('health-val'); if (hv) hv.textContent = Math.ceil(hp);
    const sf = this.$('shield-fill'); if (sf) sf.style.width = sPct + '%';
    const sv = this.$('shield-val'); if (sv) sv.textContent = Math.ceil(sh);
  }

  ammo(cur, res, name, reloading) {
    const ac = this.$('ammo-current'); if (ac) { ac.textContent = cur; ac.style.color = cur < 8 ? '#ff4400' : '#e8f4ff'; }
    const ar = this.$('ammo-reserve'); if (ar) ar.textContent = res;
    const wn = this.$('weapon-name');  if (wn) wn.textContent = name || '';
    const ri = this.$('reload-indicator');
    if (ri) reloading ? ri.classList.remove('hidden') : ri.classList.add('hidden');
  }

  score(a, b) {
    const sa = this.$('score-a'); if (sa) sa.textContent = a;
    const sb = this.$('score-b'); if (sb) sb.textContent = b;
  }

  timer(secs) {
    const el = this.$('match-timer');
    if (!el) return;
    const m = Math.floor(secs / 60), s = secs % 60;
    el.textContent = `${m}:${String(s).padStart(2,'0')}`;
    el.style.color  = secs <= 30 ? '#ff1a2e' : '';
  }

  abilities(charDef, cds) {
    if (!charDef) return;
    for (const k of ['e','q','f']) {
      const ab   = charDef.abilities[k];
      const cdEl = this.$(`ability-${k}-cd`);
      const icEl = this.$(`ability-${k}-icon`);
      if (icEl && ab) icEl.textContent = ab.icon;
      if (cdEl) {
        if ((cds[k] || 0) > 0) { cdEl.classList.add('active'); cdEl.textContent = Math.ceil(cds[k]/1000)+'s'; }
        else cdEl.classList.remove('active');
      }
    }
  }

  hitMarker(crit) {
    const el = this.$('hit-indicator');
    if (!el) return;
    el.classList.remove('hidden');
    el.style.borderColor = crit ? '#ffaa00' : '#ff1a2e';
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => el.classList.add('hidden'), 120);
  }

  killfeed(killer, victim, weapon, own) {
    const kf = this.$('killfeed');
    if (!kf) return;
    const div = document.createElement('div');
    div.className = `kill-entry${own?' own':''}`;
    div.innerHTML = `<span class="killer">${killer}</span><span class="weapon-tag"> [${weapon}] </span><span class="victim">${victim}</span>`;
    kf.appendChild(div);
    setTimeout(() => { div.style.opacity='0'; setTimeout(()=>div.remove(),500); }, 4500);
    while (kf.children.length > 6) kf.children[0].remove();
  }

  killNotif(name) {
    const el = this.$('kill-notification');
    if (!el) return;
    el.textContent = `✕ ${name} ELIMINATED`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'killNotif 2s ease forwards';
    clearTimeout(this._knT);
    this._knT = setTimeout(() => el.classList.add('hidden'), 2100);
  }

  elimBanner(delay) {
    const el = this.$('elim-banner');
    if (!el) return;
    el.classList.remove('hidden');
    let t = delay;
    const iv = setInterval(() => {
      const rt = this.$('respawn-timer'); if (rt) rt.textContent = --t;
      if (t <= 0) { clearInterval(iv); el.classList.add('hidden'); }
    }, 1000);
  }

  matchEnd(won, stats) {
    const el = this.$('match-end'); if (!el) return;
    el.classList.remove('hidden');
    const mr = this.$('match-result');
    if (mr) { mr.textContent = won ? 'VICTORY' : 'DEFEAT'; mr.className = `match-result ${won?'win':'loss'}`; }
    const ms = this.$('match-stats');
    if (ms) ms.innerHTML = `K: ${stats.kills} &nbsp; D: ${stats.deaths} &nbsp; A: ${stats.assists}<br>Accuracy: ${stats.acc}%`;
  }

  sprint(on) {
    const el = document.getElementById('sprint-indicator');
    if (el) on ? el.classList.remove('hidden') : el.classList.add('hidden');
  }

  minimap(playerState, units, mapSz) {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const sz = 150;
    ctx.clearRect(0,0,sz,sz);
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0,0,sz,sz);
    ctx.strokeStyle='rgba(0,245,255,0.12)'; ctx.lineWidth=.5;
    for(let i=0;i<=5;i++){ctx.beginPath();ctx.moveTo(i*30,0);ctx.lineTo(i*30,sz);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*30);ctx.lineTo(sz,i*30);ctx.stroke();}
    const toM = p => ({ x:((p.x+mapSz/2)/mapSz)*sz, y:((p.z+mapSz/2)/mapSz)*sz });
    for(const u of units) {
      if(!u.isAlive) continue;
      const m=toM(u.position);
      ctx.beginPath(); ctx.arc(m.x,m.y,u.isPlayer?5:3,0,Math.PI*2);
      ctx.fillStyle = u.isPlayer ? '#00f5ff' : u.team==='a' ? '#00a8ff' : '#ff4400';
      ctx.shadowColor = u.isPlayer ? '#00f5ff' : 'transparent';
      ctx.shadowBlur  = u.isPlayer ? 6 : 0;
      ctx.fill(); ctx.shadowBlur=0;
    }
    if(playerState){
      const m=toM(playerState.position);
      ctx.strokeStyle='#00f5ff'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(m.x,m.y);
      ctx.lineTo(m.x+Math.sin(playerState.yaw)*10, m.y+Math.cos(playerState.yaw)*10);
      ctx.stroke();
    }
    ctx.strokeStyle='rgba(0,245,255,0.4)'; ctx.lineWidth=1; ctx.strokeRect(0,0,sz,sz);
  }
}

// =====================================================================
// NEXUS STRIKE — MAIN GAME
// =====================================================================
class NexusStrike {
  constructor() {
    this.state   = 'menu';
    this.renderer= null;
    this.player  = null;
    this.bots    = [];
    this.bullets = [];
    this.hud     = null;
    this.mapBuild= null;
    this._colliders   = [];
    this._spawnPoints = { a:[], b:[] };
    this._loopId = null;
    this._lastTs = 0;
    this._timerAccum = 0;

    // Match
    this.scoreA = 0; this.scoreB = 0;
    this.scoreLimit    = 30;
    this.matchDuration = 5 * 60;
    this.matchTimeLeft = this.matchDuration;
    this.matchActive   = false;
    this.respawnDelay  = 5;
    this.shotsF = 0; this.shotsH = 0;

    // Selection
    this.selectedChar = 'vex';
    this.selectedMap  = 'neonCity';

    // Settings
    this.settings = { sensitivity:0.002, fov:90, invertY:false, quality:'medium' };
    try { const s=localStorage.getItem('nxs'); if(s) Object.assign(this.settings, JSON.parse(s)); } catch(_){}

    this._buildUI();
    this._menuBg();
  }

  // ---- helpers ----
  $(id) { return document.getElementById(id); }
  on(id, fn) { this.$(id)?.addEventListener('click', fn); }
  show(id) {
    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
    const t = this.$(id); if (!t) return;
    t.classList.add('active');
    if (id === 'game-screen') t.style.display = 'block';
  }

  // =====================================================================
  // MENU BACKGROUND
  // =====================================================================
  _menuBg() {
    const canvas = this.$('menu-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width=innerWidth; canvas.height=innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const pts = Array.from({length:100}, ()=>({ x:Math.random()*innerWidth, y:Math.random()*innerHeight, vx:(Math.random()-.5)*.7, vy:(Math.random()-.5)*.7, r:Math.random()*1.8+.4, h:180+Math.random()*60 }));
    const draw = () => {
      if (this.state === 'playing') return;
      requestAnimationFrame(draw);
      ctx.fillStyle='rgba(5,8,20,.18)'; ctx.fillRect(0,0,canvas.width,canvas.height);
      for(const p of pts){
        p.x+=p.vx; p.y+=p.vy;
        if(p.x<0)p.x=canvas.width; if(p.x>canvas.width)p.x=0;
        if(p.y<0)p.y=canvas.height; if(p.y>canvas.height)p.y=0;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=`hsla(${p.h},100%,60%,.7)`; ctx.fill();
      }
      ctx.lineWidth=.5;
      for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
        if(d<88){ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.strokeStyle=`rgba(0,245,255,${.06*(1-d/88)})`;ctx.stroke();}
      }
    };
    draw();
  }

  // =====================================================================
  // UI WIRING
  // =====================================================================
  _buildUI() {
    // Main menu
    this.on('btn-solo',        () => this._goChar(true));
    this.on('btn-multiplayer', () => this._goLobby());
    this.on('btn-settings',    () => this.show('settings-screen'));

    // Back buttons
    this.on('back-from-chars',    () => { this.show('main-menu'); this.state='menu'; });
    this.on('back-from-lobby',    () => { this.show('main-menu'); this.state='menu'; });
    this.on('back-from-settings', () => {
      this._saveSettings();
      this.show(this.state==='paused'?'game-screen':'main-menu');
      if(this.state==='paused') this._resume();
    });

    // Solo start
    this.on('btn-start-solo', () => this._startGame(true));

    // Lobby (P2P stub — opens char select for both slots)
    this.on('btn-create-lobby', () => {
      const code = Math.random().toString(36).substr(2,6).toUpperCase();
      this.$('lobby-options')?.classList.add('hidden');
      this.$('lobby-room')?.classList.remove('hidden');
      this.$('lobby-code-display').textContent = code;
      this.$('btn-start-match')?.classList.remove('hidden');
      this._fillLobbySlots();
    });
    this.on('btn-join-lobby',  () => {
      const v = this.$('lobby-code-input')?.value?.trim();
      if (v) { alert('P2P lobby join: connect to host peer via lobby code. (WebRTC signalling requires a server — for local play use Solo mode.)'); }
    });
    this.on('copy-code-btn', () => {
      navigator.clipboard?.writeText(this.$('lobby-code-display')?.textContent).catch(()=>{});
      this.$('copy-code-btn').textContent='COPIED!'; setTimeout(()=>{this.$('copy-code-btn').textContent='COPY';},1500);
    });
    this.on('btn-start-match', () => this._startGame(false));

    // In-game
    this.on('btn-resume',           () => this._resume());
    this.on('btn-settings-ingame',  () => { this.$('esc-menu')?.classList.add('hidden'); this.show('settings-screen'); });
    this.on('btn-quit-game',        () => this._quit());
    this.on('btn-rematch',          () => this._rematch());
    this.on('btn-main-menu-end',    () => this._quit());

    // ESC
    document.addEventListener('keydown', e => {
      if (e.code==='Escape' && (this.state==='playing'||this.state==='paused')) this._togglePause();
    });

    // Pointer lock
    this.$('pointer-lock-overlay')?.addEventListener('click', () => {
      if(this.state==='playing') this.$('game-canvas')?.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement===this.$('game-canvas');
      const ov = this.$('pointer-lock-overlay');
      if(ov) locked?ov.classList.add('hidden'):ov.classList.remove('hidden');
    });

    // Settings sliders
    this._slider('sens-slider','sens-val','', n=>{this.settings.sensitivity=n*.00025; if(this.player)this.player.config.sensitivity=n*.00025;});
    this._slider('fov-slider', 'fov-val', '°', n=>{this.settings.fov=n; if(this.renderer){this.renderer.camera.fov=n;this.renderer.camera.updateProjectionMatrix();}});
    this.$('invert-y')?.addEventListener('change',e=>{this.settings.invertY=e.target.checked; if(this.player)this.player.config.invertY=e.target.checked;});
    this.$('quality-select')?.addEventListener('change',e=>{this.settings.quality=e.target.value; if(this.renderer)this.renderer.setQuality(e.target.value);});

    this._buildCharGrid();
    this._buildMapGrid();
  }

  _slider(id, valId, suffix, fn) {
    this.$(id)?.addEventListener('input', e => {
      const n = parseFloat(e.target.value);
      const v = this.$(valId); if(v) v.textContent = n+suffix;
      fn(n);
    });
  }

  _saveSettings() {
    try { localStorage.setItem('nxs', JSON.stringify(this.settings)); } catch(_){}
  }

  // =====================================================================
  // CHARACTER GRID
  // =====================================================================
  _buildCharGrid() {
    const grid = this.$('char-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const ch of CHARACTERS) {
      const card = document.createElement('div');
      card.className = 'char-card';
      card.style.setProperty('--char-color', ch.color);

      const cv = document.createElement('canvas');
      cv.width=120; cv.height=150;
      cv.style.cssText='width:100%;height:70%;display:block;';
      card.appendChild(cv);
      card.insertAdjacentHTML('beforeend',`<div class="char-card-info"><div class="char-card-name">${ch.name}</div><div class="char-card-role">${ch.role}</div></div>`);
      card.addEventListener('click', () => {
        grid.querySelectorAll('.char-card').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedChar = ch.id;
        this._showCharInfo(ch);
      });
      grid.appendChild(card);
      this._miniChar(cv, ch);
    }
    grid.firstElementChild?.click();
  }

  _miniChar(canvas, ch) {
    const r   = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true});
    r.setSize(120,150); r.setClearColor(0,0);
    const sc  = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42,120/150,.1,50);
    cam.position.set(0,1.1,2.6); cam.lookAt(0,.9,0);
    sc.add(new THREE.AmbientLight(0x404070,1));
    const kl = new THREE.PointLight(new THREE.Color(ch.color),2.5,8); kl.position.set(1.5,2.5,2); sc.add(kl);
    const bm = new THREE.MeshStandardMaterial({color:ch.bodyColor,metalness:.45,roughness:.4});
    const am = new THREE.MeshStandardMaterial({color:ch.accentColor,emissive:ch.accentColor,emissiveIntensity:.55,metalness:.8});
    const parts=[];
    const add=(geo,mat,px,py,pz)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(px,py,pz); sc.add(m); parts.push(m); };
    add(new THREE.BoxGeometry(.50,.60,.26),bm,0,.90,0);
    add(new THREE.BoxGeometry(.28,.28,.26),bm,0,1.39,0);
    add(new THREE.BoxGeometry(.21,.09,.05),am,0,1.40,.16);
    add(new THREE.BoxGeometry(.20,.60,.22),bm,-.13,.32,0);
    add(new THREE.BoxGeometry(.20,.60,.22),bm, .13,.32,0);
    add(new THREE.BoxGeometry(.16,.55,.18),bm,-.35,.90,0);
    add(new THREE.BoxGeometry(.16,.55,.18),bm, .35,.90,0);
    add(new THREE.BoxGeometry(.52,.06,.28),am,0,1.10,0);
    let ang=0;
    const tick=()=>{ if(!canvas.isConnected){r.dispose();return;} requestAnimationFrame(tick); ang+=.016; parts.forEach(p=>p.rotation.y=ang); r.render(sc,cam); };
    tick();
  }

  _showCharInfo(ch) {
    const el = this.$('char-info'); if (!el) return;
    el.innerHTML = `
      <h3 style="color:${ch.color}">${ch.name}</h3>
      <div style="color:${ch.color};opacity:.7;font-family:var(--font-display);font-size:11px;letter-spacing:.3em;margin-bottom:10px">${ch.role}</div>
      <p class="char-lore">${ch.lore}</p>
      <div class="ability-list">
        ${Object.entries(ch.abilities).map(([k,ab])=>`
          <div class="ability-item">
            <span class="ability-key-badge">${k.toUpperCase()}</span>
            <div>
              <div class="ability-name">${ab.icon} ${ab.name} <span style="opacity:.4;font-size:10px">${ab.cooldown}s CD</span></div>
              <div class="ability-desc">${ab.desc}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  // =====================================================================
  // MAP GRID
  // =====================================================================
  _buildMapGrid() {
    const grid = this.$('map-grid'); if (!grid) return;
    grid.innerHTML = '';
    for (const m of MAP_CONFIGS) {
      const card = document.createElement('div');
      card.className = 'map-card';
      card.style.cssText=`background:linear-gradient(135deg,${m.color}18,${m.color}38);border-color:${m.color}55`;
      card.innerHTML=`<div class="map-card-name" style="color:${m.color}">${m.name}</div>`;
      card.addEventListener('click', () => { grid.querySelectorAll('.map-card').forEach(c=>c.classList.remove('selected')); card.classList.add('selected'); this.selectedMap=m.id; });
      grid.appendChild(card);
    }
    grid.firstElementChild?.click();
  }

  // =====================================================================
  // LOBBY STUB
  // =====================================================================
  _fillLobbySlots() {
    const makeSlot = (name, isBot) => `<div class="player-slot${isBot?' bot':''}"><span class="slot-icon">${isBot?'🤖':'👤'}</span><span>${name}</span></div>`;
    const sa = this.$('team-a-slots'), sb = this.$('team-b-slots');
    if (sa) sa.innerHTML = makeSlot('YOU',false)+makeSlot('BOT 2',true)+makeSlot('BOT 3',true)+makeSlot('BOT 4',true);
    if (sb) sb.innerHTML = makeSlot('BOT 5',true)+makeSlot('BOT 6',true)+makeSlot('BOT 7',true)+makeSlot('BOT 8',true);
  }

  // =====================================================================
  // GAME FLOW
  // =====================================================================
  _goChar(solo) { this.isSolo=solo; this.state='charselect'; this.show('char-select-screen'); }
  _goLobby()    { this.state='lobby'; this.show('lobby-screen'); this.$('lobby-options')?.classList.remove('hidden'); this.$('lobby-room')?.classList.add('hidden'); }

  _startGame(solo) {
    this.isSolo  = solo;
    this.state   = 'loading';
    this.show('loading-screen');
    this._loadingAnim(() => this._init());
  }

  _loadingAnim(onDone) {
    const bar  = this.$('loading-bar');
    const text = this.$('loading-text');
    const tips = this.$('loading-tips');
    const steps = ['INITIALIZING...','LOADING MAP...','SPAWNING AGENTS...','CALIBRATING WEAPONS...','DEPLOYING BOTS...','READY'];
    const tipList = ['TIP: Headshots deal 1.5× damage','TIP: Sprint reduces accuracy','TIP: Shield absorbs damage first','TIP: Each hero has a unique ult','TIP: Watch the minimap'];
    let p=0, step=0;
    const iv = setInterval(()=>{
      p += Math.random()*18+8;
      if(p>=100){ p=100; clearInterval(iv); if(text)text.textContent='READY'; setTimeout(()=>onDone?.(),300); return; }
      if(bar)  bar.style.width=p+'%';
      if(text) text.textContent=steps[Math.min(step,steps.length-1)];
      if(tips) tips.textContent=tipList[step%tipList.length];
      step++;
    },200);
  }

  _init() {
    // Renderer
    if (!this.renderer) this.renderer = new Renderer(this.$('game-canvas'));
    else this.renderer.clearScene();
    this.renderer.setQuality(this.settings.quality);
    this.renderer.camera.fov = this.settings.fov;
    this.renderer.camera.updateProjectionMatrix();

    // HUD
    this.hud = new HUD();

    // Map
    const mb = new MapBuilder(this.renderer.scene);
    const { colliders, spawnPoints } = mb.build(this.selectedMap);
    this._colliders   = colliders;
    this._spawnPoints = spawnPoints;

    // Player
    const sp = (spawnPoints.a[0] || new THREE.Vector3(0,2,0)).clone();
    if (this.player) this.player.destroy();
    this.player = new PlayerController(this.renderer.camera, this.renderer.scene, this.selectedChar, {
      sensitivity: this.settings.sensitivity,
      fov:         this.settings.fov,
      invertY:     this.settings.invertY
    });
    this.player.position.copy(sp);
    this.player.team = 'a';

    // Bots
    this.bots = [];
    this._spawnBots(spawnPoints);

    // Match reset
    this.scoreA=0; this.scoreB=0;
    this.matchTimeLeft=this.matchDuration; this._timerAccum=0;
    this.matchActive=true;
    this.bullets=[];
    this.shotsF=0; this.shotsH=0;
    this._lastTs=performance.now();

    // Show game screen
    this.show('game-screen');
    this.state='playing';
    this.$('match-end')?.classList.add('hidden');
    this.$('esc-menu')?.classList.add('hidden');
    this.$('elim-banner')?.classList.add('hidden');
    this.$('pointer-lock-overlay')?.classList.remove('hidden');

    setTimeout(()=>this.$('game-canvas')?.requestPointerLock(), 500);
    cancelAnimationFrame(this._loopId);
    this._loopId = requestAnimationFrame(ts=>this._loop(ts));
  }

  _spawnBots(spawnPoints) {
    const charIds = CHARACTERS.map(c=>c.id).filter(id=>id!==this.selectedChar);
    let ci = 0;
    const pick = () => charIds[ci++ % charIds.length];
    const sA = spawnPoints.a || []; const sB = spawnPoints.b || [];
    // 3 ally bots
    for (let i=0;i<3;i++) {
      const sp = sA[i+1] || sA[0] || new THREE.Vector3(-8,2,-8);
      const b  = new BotAI(this.renderer.scene, pick(), 'a', sp.clone(), 'medium');
      b.setPatrolPoints(sA.length?sA:[sp]);
      this.bots.push(b);
    }
    // 4 enemy bots
    for (let i=0;i<4;i++) {
      const sp = sB[i] || sB[0] || new THREE.Vector3(8,2,8);
      const b  = new BotAI(this.renderer.scene, pick(), 'b', sp.clone(), 'medium');
      b.setPatrolPoints(sB.length?sB:[sp]);
      this.bots.push(b);
    }
  }

  // =====================================================================
  // GAME LOOP
  // =====================================================================
  _loop(ts) {
    if (this.state !== 'playing') return;
    const delta = Math.min(ts - this._lastTs, 50);
    this._lastTs = ts;

    // Player
    if (this.player?.isAlive) {
      const res = this.player.update(delta, this._colliders);
      if (res?.shot) {
        this.shotsF += res.bullets.length;
        for (const b of res.bullets) this.bullets.push(b);
      }
    }

    // Bots
    for (const bot of this.bots) {
      if (!bot.isAlive) continue;
      const enemies = bot.team==='a'
        ? [this.player, ...this.bots.filter(b=>b.team==='b'&&b.isAlive)]
        : [this.player, ...this.bots.filter(b=>b.team==='a'&&b.isAlive)];
      const newB = bot.update(delta, enemies);
      if (newB) for (const b of newB) this.bullets.push(b);
    }

    // Bullets
    this._tickBullets(delta);

    // Match timer
    if (this.matchActive) {
      this._timerAccum += delta;
      if (this._timerAccum >= 1000) {
        this._timerAccum -= 1000;
        this.matchTimeLeft = Math.max(0, this.matchTimeLeft-1);
        this.hud.timer(this.matchTimeLeft);
        if (this.matchTimeLeft===0) this._endMatch(this.scoreA>=this.scoreB?'a':'b');
      }
    }

    // HUD
    this._refreshHUD();

    // Render
    this.renderer.render();
    this._loopId = requestAnimationFrame(ts=>this._loop(ts));
  }

  // =====================================================================
  // BULLET SYSTEM
  // =====================================================================
  _tickBullets(delta) {
    const dt = delta/1000;
    const scene = this.renderer.scene;
    const dead = [];

    for (let i=this.bullets.length-1; i>=0; i--) {
      const b = this.bullets[i];
      if (!b.alive) { dead.push(i); if(b.mesh)scene.remove(b.mesh); continue; }

      b.position.addScaledVector(b.direction, b.speed*dt);
      b.distanceTraveled += b.speed*dt;
      if (b.mesh) b.mesh.position.copy(b.position);

      if (b.distanceTraveled > b.range) { b.alive=false; dead.push(i); if(b.mesh)scene.remove(b.mesh); continue; }

      // World collision
      let worldHit=false;
      for (const c of this._colliders) {
        if (!c.box) continue;
        if (c.box.containsPoint(b.position)) { this._impactDecal(b.position); b.alive=false; worldHit=true; break; }
      }
      if (worldHit) { dead.push(i); if(b.mesh)scene.remove(b.mesh); continue; }

      // Entity collision
      const targets = b.ownerTeam==='a'
        ? this.bots.filter(bt=>bt.team==='b'&&bt.isAlive)
        : [...(this.player?.isAlive?[this.player]:[]), ...this.bots.filter(bt=>bt.team==='a'&&bt.isAlive)];

      let entityHit=false;
      for (const t of targets) {
        if (t.id===b.ownerId) continue;
        if (b.position.distanceTo(t.position) < 0.7) {
          const headshot = b.position.y > t.position.y + 1.25;
          const dmg      = headshot ? b.damage*1.5 : b.damage;
          const killed   = this._damage(t, dmg);
          this._particles(b.position, headshot);
          if (b.ownerId==='local') {
            this.shotsH++;
            this.hud.hitMarker(headshot);
            if (killed) {
              this.player.kills++;
              this.hud.killNotif(t.name||'ENEMY');
              this.hud.killfeed('YOU', t.name||'ENEMY', this.player.weaponSystem.stats?.name||'WEAPON', true);
              this._addScore('a');
            }
          } else {
            if (killed) {
              const killer = this.bots.find(x=>x.id===b.ownerId);
              if (killer) killer.kills++;
              const kn = killer?.name||'BOT';
              const vn = t.isPlayer?'YOU':(t.name||'ENEMY');
              this.hud.killfeed(kn, vn, 'WEAPON', false);
              this._addScore(b.ownerTeam);
              if (t.isPlayer) this._playerDied();
            }
          }
          b.alive=false; entityHit=true; break;
        }
      }
      if (entityHit) { dead.push(i); if(b.mesh)scene.remove(b.mesh); }
    }

    for (let i=dead.length-1; i>=0; i--) this.bullets.splice(dead[i],1);
  }

  _damage(target, amount) {
    const was = target.isAlive;
    target.takeDamage(amount);
    const died = was && !target.isAlive;
    if (died) {
      target.deaths++;
      if (!target.isPlayer) {
        const pts  = target.team==='a' ? this._spawnPoints.a : this._spawnPoints.b;
        const sp   = pts[Math.floor(Math.random()*pts.length)] || new THREE.Vector3(0,2,0);
        setTimeout(()=>{ if(this.matchActive) target.respawn(sp.clone()); }, this.respawnDelay*1000);
      }
    }
    return died;
  }

  _addScore(team) {
    if (team==='a') this.scoreA++; else this.scoreB++;
    this.hud.score(this.scoreA, this.scoreB);
    if (this.scoreA>=this.scoreLimit) this._endMatch('a');
    if (this.scoreB>=this.scoreLimit) this._endMatch('b');
  }

  _playerDied() {
    this.hud.elimBanner(this.respawnDelay);
    document.exitPointerLock();
    setTimeout(()=>{
      if(!this.matchActive) return;
      const pts = this._spawnPoints.a;
      const sp  = pts[Math.floor(Math.random()*pts.length)] || new THREE.Vector3(0,2,0);
      this.player.respawn(sp.clone());
      this.$('game-canvas')?.requestPointerLock();
    }, this.respawnDelay*1000);
  }

  // =====================================================================
  // VISUAL EFFECTS
  // =====================================================================
  _particles(pos, headshot) {
    const color=headshot?0xffaa00:0xff3300, count=headshot?10:5;
    const scene=this.renderer.scene;
    for(let i=0;i<count;i++){
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(.035,4,4),new THREE.MeshBasicMaterial({color,transparent:true}));
      mesh.position.copy(pos); scene.add(mesh);
      const vel=new THREE.Vector3((Math.random()-.5)*9,Math.random()*6+1,(Math.random()-.5)*9);
      const t0=performance.now();
      const tick=()=>{
        const t=(performance.now()-t0)/1000;
        mesh.position.addScaledVector(vel,.016); vel.y-=14*.016;
        mesh.material.opacity=Math.max(0,1-t*2.8);
        if(mesh.material.opacity<=0||t>.8){scene.remove(mesh);return;}
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  _impactDecal(pos) {
    const scene=this.renderer.scene;
    const d=new THREE.Mesh(new THREE.CircleGeometry(.055,6),new THREE.MeshBasicMaterial({color:0x111111,side:THREE.DoubleSide,depthWrite:false}));
    d.position.copy(pos); d.position.y=Math.max(.02,d.position.y); d.rotation.x=-Math.PI/2;
    scene.add(d); setTimeout(()=>scene.remove(d),12000);
  }

  // =====================================================================
  // HUD REFRESH
  // =====================================================================
  _refreshHUD() {
    if (!this.hud||!this.player) return;
    this.hud.vitals(this.player.health,this.player.maxHealth,this.player.shield,this.player.maxShield);
    this.hud.ammo(this.player.weaponSystem.ammo,this.player.weaponSystem.reserve,this.player.weaponSystem.stats?.name||'',this.player.weaponSystem.isReloading);
    const ch=CHARACTERS.find(c=>c.id===this.selectedChar);
    this.hud.abilities(ch,this.player.abilityCooldowns);
    this.hud.sprint(this.player.isSprinting);
    const units=[
      {position:this.player.position,team:'a',isPlayer:true,isAlive:this.player.isAlive},
      ...this.bots.map(b=>({position:b.position,team:b.team,isPlayer:false,isAlive:b.isAlive}))
    ];
    this.hud.minimap({position:this.player.position,yaw:this.player.yaw},units,200);
  }

  // =====================================================================
  // MATCH END
  // =====================================================================
  _endMatch(winner) {
    if (!this.matchActive) return;
    this.matchActive=false; this.state='ended';
    document.exitPointerLock();
    cancelAnimationFrame(this._loopId);
    const acc=this.shotsF>0?Math.round((this.shotsH/this.shotsF)*100):0;
    this.hud.matchEnd(winner==='a',{kills:this.player?.kills||0,deaths:this.player?.deaths||0,assists:0,acc});
  }

  // =====================================================================
  // PAUSE / RESUME / QUIT
  // =====================================================================
  _togglePause() {
    if (this.state==='playing') {
      this.state='paused';
      this.$('esc-menu')?.classList.remove('hidden');
      document.exitPointerLock();
      cancelAnimationFrame(this._loopId);
    } else this._resume();
  }

  _resume() {
    if (this.state!=='paused') return;
    this.state='playing';
    this.$('esc-menu')?.classList.add('hidden');
    this.$('game-canvas')?.requestPointerLock();
    this._lastTs=performance.now();
    this._loopId=requestAnimationFrame(ts=>this._loop(ts));
  }

  _quit() {
    this.matchActive=false; this.state='menu';
    cancelAnimationFrame(this._loopId);
    document.exitPointerLock();
    this.renderer?.clearScene();
    this.player?.destroy();
    this.player=null; this.bots=[]; this.bullets=[];
    this.$('match-end')?.classList.add('hidden');
    this.$('esc-menu')?.classList.add('hidden');
    this.$('pointer-lock-overlay')?.classList.add('hidden');
    this.show('main-menu');
    this.state='menu';
    this._menuBg();
  }

  _rematch() {
    this.$('match-end')?.classList.add('hidden');
    this._startGame(this.isSolo);
  }
}

// Boot
const game = new NexusStrike();
window.__nexus = game;
