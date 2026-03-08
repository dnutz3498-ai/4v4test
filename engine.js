// ============================================================
// engine.js — Renderer + Physics + Weapons + Player + Bots
// All bundled — no imports needed
// ============================================================

// =====================================================================
// RENDERER
// =====================================================================
class Renderer {
  constructor(canvas) {
    this.scene    = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.05, 500);
    this.scene.add(this.camera);

    window.addEventListener('resize', () => this._resize());
  }
  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  clearScene() {
    while (this.scene.children.length) {
      const c = this.scene.children[0];
      if (c.geometry) c.geometry.dispose();
      if (c.material) { if (Array.isArray(c.material)) c.material.forEach(m => m.dispose()); else c.material.dispose(); }
      this.scene.remove(c);
    }
    this.scene.fog = null; this.scene.background = null;
  }
  setQuality(q) {
    if (q === 'low')  { this.renderer.setPixelRatio(1); this.renderer.shadowMap.enabled = false; }
    if (q === 'high') { this.renderer.setPixelRatio(window.devicePixelRatio); }
  }
  render() { this.renderer.render(this.scene, this.camera); }
}

// =====================================================================
// WEAPON SYSTEM
// =====================================================================
class WeaponSystem {
  constructor(scene) {
    this.scene        = scene;
    this.ammo         = 0;
    this.reserve      = 0;
    this.isReloading  = false;
    this.reloadTimer  = 0;
    this.lastShotTime = 0;
    this.recoilY      = 0;
    this.recoilX      = 0;
    this.stats        = null;
    this.muzzleFlashes = [];
    this.viewMesh     = null;
  }

  equip(weaponId) {
    const s       = WEAPON_STATS[weaponId] || WEAPON_STATS.assaultRifle;
    this.stats    = s;
    this.weaponId = weaponId;
    this.ammo     = s.magSize;
    this.reserve  = s.reserveAmmo;
    this.isReloading = false;
    this.recoilY  = 0;
    this.recoilX  = 0;
    this.viewMesh = this._buildMesh(weaponId, s);
    return s;
  }

  _buildMesh(id, s) {
    const g = new THREE.Group();
    const m  = new THREE.MeshStandardMaterial({ color: s.color,       metalness: 0.85, roughness: 0.2 });
    const ma = new THREE.MeshStandardMaterial({ color: s.accentColor, metalness: 0.7,  roughness: 0.3, emissive: s.accentColor, emissiveIntensity: 0.25 });

    const body   = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.065, 0.38), m);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.3, 8), m);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.005, 0.34);
    const mag    = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.09, 0.032), ma);
    mag.position.set(0, -0.08, 0.02);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.065, 0.03), m);
    handle.position.set(0, -0.055, 0.02);
    const muzzlePt = new THREE.Object3D();
    muzzlePt.name = 'muzzle'; muzzlePt.position.set(0, 0.005, 0.5);

    if (id === 'sniperRifle') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), ma);
      scope.rotation.x = Math.PI/2; scope.position.set(0, 0.05, 0.05); g.add(scope);
    }
    if (id === 'shotgun') {
      body.scale.set(1.2, 1, 1); barrel.scale.set(1.7, 1, 1.2);
    }
    g.add(body, barrel, mag, handle, muzzlePt);
    return g;
  }

  canShoot(now) {
    if (!this.stats || this.isReloading || this.ammo <= 0) {
      if (this.ammo <= 0) this.startReload();
      return false;
    }
    return (now - this.lastShotTime) >= (60000 / this.stats.fireRate);
  }

  shoot(camera, now) {
    if (!this.canShoot(now)) return null;
    this.ammo--;
    this.lastShotTime = now;
    this.recoilY += 0.04 + Math.random() * 0.02;
    this.recoilX += (Math.random() - 0.5) * 0.02;
    this._spawnMuzzleFlash(camera);
    const bullets = [];
    for (let p = 0; p < this.stats.pellets; p++) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.x += (Math.random() - 0.5) * this.stats.spread;
      dir.y += (Math.random() - 0.5) * this.stats.spread;
      dir.z += (Math.random() - 0.5) * this.stats.spread;
      dir.normalize();
      bullets.push({
        id: Math.random().toString(36).substr(2, 8),
        position: camera.position.clone(),
        direction: dir,
        speed: 120, damage: this.stats.damage,
        range: this.stats.range, distanceTraveled: 0,
        alive: true, ownerId: 'local', ownerTeam: 'a', mesh: null
      });
    }
    return { bullets, ammo: this.ammo, reserve: this.reserve };
  }

  _spawnMuzzleFlash(camera) {
    const light = new THREE.PointLight(0xffaa44, 10, 4);
    const dir   = new THREE.Vector3(); camera.getWorldDirection(dir);
    light.position.copy(camera.position).addScaledVector(dir, 0.6);
    this.scene.add(light);
    this.muzzleFlashes.push({ light, life: 60 });
  }

  startReload() {
    if (this.isReloading || !this.stats || this.reserve <= 0 || this.ammo === this.stats.magSize) return;
    this.isReloading = true;
    this.reloadTimer = this.stats.reloadTime;
  }

  update(delta) {
    // Muzzle flashes
    this.muzzleFlashes = this.muzzleFlashes.filter(f => {
      f.life -= delta;
      f.light.intensity = Math.max(0, 10 * (f.life / 60));
      if (f.life <= 0) { this.scene.remove(f.light); return false; }
      return true;
    });
    // Recoil recovery
    this.recoilY *= 0.82; this.recoilX *= 0.82;
    if (Math.abs(this.recoilY) < 0.001) this.recoilY = 0;
    if (Math.abs(this.recoilX) < 0.001) this.recoilX = 0;
    // Reload
    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const need   = this.stats.magSize - this.ammo;
        const load   = Math.min(need, this.reserve);
        this.ammo   += load; this.reserve -= load;
        return { reloaded: true };
      }
    }
    return null;
  }
}

// =====================================================================
// PLAYER CONTROLLER
// =====================================================================
class PlayerController {
  constructor(camera, scene, charId, config) {
    this.camera   = camera;
    this.scene    = scene;
    this.charDef  = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
    this.config   = { sensitivity: 0.002, fov: 90, invertY: false, ...config };

    // position / physics
    this.position  = new THREE.Vector3(0, 1.8, 0);
    this.velocity  = new THREE.Vector3();
    this.yaw       = 0;
    this.pitch     = 0;
    this.isGrounded= false;
    this.height    = 1.8;

    // stats
    this.health    = this.charDef.maxHealth;
    this.shield    = this.charDef.maxShield;
    this.maxHealth = this.charDef.maxHealth;
    this.maxShield = this.charDef.maxShield;
    this.isAlive   = true;
    this.isInvincible = false;
    this.kills = 0; this.deaths = 0; this.assists = 0;
    this.isPlayer  = true;
    this.team      = 'a';
    this.name      = 'YOU';
    this.id        = 'local';

    // movement flags
    this.isSprinting = false;
    this.isCrouching = false;
    this.isAiming    = false;
    this.speedMult   = 1;
    this.damageMult  = 1;

    // ability cooldowns (ms)
    this.abilityCooldowns = { e: 0, q: 0, f: 0 };

    // weapon
    this.weaponSystem = new WeaponSystem(scene);
    this.weaponSystem.equip(this.charDef.weapon || 'assaultRifle');
    this._setupViewmodel();

    // input
    this.keys   = {};
    this.mouse  = {};
    this._prevFire = false;
    this._bindInput();
  }

  _setupViewmodel() {
    if (!this.weaponSystem.viewMesh) return;
    this.viewmodel = new THREE.Group();
    const mesh = this.weaponSystem.viewMesh.clone();
    mesh.position.set(0.2, -0.2, -0.38);
    mesh.rotation.y = Math.PI;
    this.viewmodel.add(mesh);
    this.camera.add(this.viewmodel);
  }

  _bindInput() {
    this._onKeyDown = e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR') this.weaponSystem.startReload();
      if (e.code === 'KeyE') this._useAbility('e');
      if (e.code === 'KeyQ') this._useAbility('q');
      if (e.code === 'KeyF') this._useAbility('f');
    };
    this._onKeyUp   = e => { this.keys[e.code] = false; };
    this._onMouseMove = e => {
      if (document.pointerLockElement !== document.getElementById('game-canvas')) return;
      const s = this.config.sensitivity;
      this.yaw   -= e.movementX * s;
      this.pitch += e.movementY * s * (this.config.invertY ? 1 : -1);
      this.pitch  = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch));
    };
    this._onMouseDown = e => { this.mouse[e.button] = true; };
    this._onMouseUp   = e => { this.mouse[e.button] = false; };
    document.addEventListener('keydown',   this._onKeyDown);
    document.addEventListener('keyup',     this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup',   this._onMouseUp);
  }

  _useAbility(key) {
    if (this.abilityCooldowns[key] > 0 || !this.isAlive) return null;
    const ab = this.charDef.abilities[key];
    if (!ab) return null;
    this.abilityCooldowns[key] = ab.cooldown * 1000;
    this._execAbility(ab);
    return ab;
  }

  _execAbility(ab) {
    const t = ab.type;
    if (t === 'dash') {
      const d = new THREE.Vector3(); this.camera.getWorldDirection(d); d.y = 0.3; d.normalize();
      this.velocity.addScaledVector(d, 18);
    } else if (t === 'teleport') {
      const d = new THREE.Vector3(); this.camera.getWorldDirection(d); d.y = 0; d.normalize();
      this.position.addScaledVector(d, 12);
    } else if (t === 'boost') {
      this.speedMult = 1.4; this.damageMult = 1.6;
      setTimeout(() => { this.speedMult = 1; this.damageMult = 1; }, 6000);
    } else if (t === 'invis') {
      this.isInvincible = false; // not invincible while invis
      if (this.viewmodel) this.viewmodel.visible = false;
      setTimeout(() => { if (this.viewmodel) this.viewmodel.visible = true; }, 3000);
    } else if (t === 'shield') {
      this.isInvincible = true;
      setTimeout(() => { this.isInvincible = false; }, 3000);
    } else if (t === 'phantom') {
      this.isInvincible = true; this.speedMult = 1.5;
      setTimeout(() => { this.isInvincible = false; this.speedMult = 1; }, 5000);
    } else if (t === 'grapple') {
      const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
      this.velocity.copy(d.multiplyScalar(28));
    } else if (t === 'movement') {
      this.velocity.y = 10;
    }
  }

  update(delta, colliders) {
    if (!this.isAlive) return null;
    const dt = delta / 1000;

    // Camera rotation
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    // Movement input
    let mx = 0, mz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    mz = -1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  mz =  1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  mx = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) mx =  1;
    const len = Math.sqrt(mx*mx + mz*mz);
    if (len > 0) { mx /= len; mz /= len; }

    this.isSprinting = this.keys['ShiftLeft'] && mz < 0;
    this.isCrouching = this.keys['ControlLeft'] || this.keys['KeyC'];
    this.isAiming    = !!this.mouse[2];

    let spd = this.isSprinting ? 11 : this.isCrouching ? 3.5 : 7;
    spd *= this.charDef.speed * this.speedMult;

    const accel = this.isGrounded ? 0.35 : 0.08;
    const cos   = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const wx    = mx * cos + mz * sin;
    const wz    = -mx * sin + mz * cos;
    this.velocity.x = this._lerp(this.velocity.x, wx * spd, accel);
    this.velocity.z = this._lerp(this.velocity.z, wz * spd, accel);
    if (len === 0) { this.velocity.x *= this.isGrounded ? 0.8 : 0.97; this.velocity.z *= this.isGrounded ? 0.8 : 0.97; }

    // Jump
    if ((this.keys['Space']) && this.isGrounded) {
      this.velocity.y = 9; this.isGrounded = false;
    }

    // Gravity
    if (!this.isGrounded) this.velocity.y += -22 * dt;

    // Integrate
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Ground
    const ground = this._getGround(colliders);
    const eyeH   = this.isCrouching ? 1.1 : this.height;
    if (this.position.y <= ground + eyeH * 0.5) {
      this.position.y = ground + eyeH * 0.5;
      this.velocity.y = 0; this.isGrounded = true;
    } else { this.isGrounded = false; }

    // Wall collisions
    this._walls(colliders);

    // Clamp
    this.position.x = Math.max(-195, Math.min(195, this.position.x));
    this.position.z = Math.max(-195, Math.min(195, this.position.z));

    // Camera position
    const camY = this.position.y + (this.isCrouching ? 0 : 0.25);
    this.camera.position.set(this.position.x, camY, this.position.z);

    // FOV
    const tFov = this.isAiming ? this.config.fov * 0.65 : this.config.fov;
    this.camera.fov = this._lerp(this.camera.fov, tFov, 0.14);
    this.camera.updateProjectionMatrix();

    // Viewmodel bob
    if (this.viewmodel) {
      const t  = performance.now() * 0.001;
      const mv = len > 0 && this.isGrounded;
      const bs = this.isSprinting ? 14 : 7;
      const ba = this.isSprinting ? 0.02 : 0.008;
      const bob = mv ? Math.sin(t * bs) * ba : 0;
      this.viewmodel.position.y  = -0.2 + bob;
      this.viewmodel.position.x  = this.isAiming ? 0.08 : 0.2;
      this.viewmodel.rotation.z  = this.weaponSystem.recoilX;
      this.viewmodel.rotation.x  = -this.weaponSystem.recoilY * 0.5;
    }

    // Shooting
    const now      = performance.now();
    const autoFire = this.weaponSystem.stats?.auto && this.mouse[0];
    const singleFire = !this.weaponSystem.stats?.auto && this.mouse[0] && !this._prevFire;
    this._prevFire = !!this.mouse[0];
    if (autoFire || singleFire) {
      const res = this.weaponSystem.shoot(this.camera, now);
      if (res) return { shot: true, ...res };
    }

    this.weaponSystem.update(delta);

    // Ability cooldowns
    for (const k of ['e','q','f']) {
      if (this.abilityCooldowns[k] > 0) this.abilityCooldowns[k] = Math.max(0, this.abilityCooldowns[k] - delta);
    }

    return null;
  }

  _getGround(cols) {
    if (!cols) return 0;
    for (const c of cols) { if (c.isGround) return c.y || 0; }
    return 0;
  }

  _walls(cols) {
    if (!cols) return;
    const pad = 0.45;
    for (const c of cols) {
      if (!c.box) continue;
      const b = c.box;
      if (this.position.x > b.min.x - pad && this.position.x < b.max.x + pad &&
          this.position.z > b.min.z - pad && this.position.z < b.max.z + pad &&
          this.position.y > b.min.y       && this.position.y < b.max.y + 2.5) {
        const ox = Math.min(Math.abs(this.position.x - b.min.x), Math.abs(this.position.x - b.max.x));
        const oz = Math.min(Math.abs(this.position.z - b.min.z), Math.abs(this.position.z - b.max.z));
        if (ox < oz) {
          this.position.x = this.position.x < (b.min.x + b.max.x) / 2 ? b.min.x - pad : b.max.x + pad;
          this.velocity.x = 0;
        } else {
          this.position.z = this.position.z < (b.min.z + b.max.z) / 2 ? b.min.z - pad : b.max.z + pad;
          this.velocity.z = 0;
        }
      }
    }
  }

  takeDamage(amount) {
    if (!this.isAlive || this.isInvincible) return 0;
    let dmg = amount;
    if (this.shield > 0) { const a = Math.min(this.shield, dmg); this.shield -= a; dmg -= a; }
    this.health -= dmg;
    if (this.health <= 0) { this.health = 0; this.isAlive = false; this.deaths++; }
    return dmg;
  }

  heal(v) { this.health = Math.min(this.maxHealth, this.health + v); }

  respawn(sp) {
    this.isAlive = true;
    this.health  = this.maxHealth;
    this.shield  = this.charDef.maxShield;
    this.position.copy(sp);
    this.velocity.set(0, 0, 0);
    this.isInvincible = true;
    setTimeout(() => { this.isInvincible = false; }, 2500);
    this.weaponSystem.equip(this.charDef.weapon || 'assaultRifle');
  }

  getState() {
    return {
      position: this.position.clone(), yaw: this.yaw, pitch: this.pitch,
      health: this.health, shield: this.shield, isAlive: this.isAlive,
      isSprinting: this.isSprinting, ammo: this.weaponSystem.ammo,
      reserve: this.weaponSystem.reserve, isReloading: this.weaponSystem.isReloading,
      abilityCooldowns: { ...this.abilityCooldowns }, kills: this.kills, deaths: this.deaths
    };
  }

  destroy() {
    document.removeEventListener('keydown',   this._onKeyDown);
    document.removeEventListener('keyup',     this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup',   this._onMouseUp);
    if (this.viewmodel && this.camera) this.camera.remove(this.viewmodel);
  }

  _lerp(a, b, t) { return a + (b - a) * t; }
}

// =====================================================================
// BOT AI
// =====================================================================
const BOT_NAMES = ['ALPHA-7','NEXUS-3','VECTOR','GHOST-X','CIPHER','UNIT-9','PHANTOM','BINARY','ROGUE-5','APEX-BOT','STATIC','PULSE'];

class BotAI {
  constructor(scene, charId, team, spawnPos, difficulty) {
    this.scene    = scene;
    this.charDef  = CHARACTERS.find(c => c.id === charId) || CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    this.team     = team;
    this.name     = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    this.id       = 'bot_' + Math.random().toString(36).substr(2, 6);
    this.isPlayer = false;

    const P = { easy:{ acc:0.4,react:1200,fr:0.5,spd:0.7 }, medium:{ acc:0.72,react:600,fr:0.8,spd:0.9 }, hard:{ acc:0.9,react:250,fr:1.0,spd:1.1 } };
    this.p = P[difficulty] || P.medium;

    this.health   = this.charDef.maxHealth;
    this.shield   = this.charDef.maxShield;
    this.maxHealth= this.charDef.maxHealth;
    this.maxShield= this.charDef.maxShield;
    this.isAlive  = true;
    this.isInvincible = false;
    this.kills = 0; this.deaths = 0; this.assists = 0;

    this.position   = spawnPos.clone();
    this.velocity   = new THREE.Vector3();
    this.rotation   = 0; // yaw only
    this.isGrounded = true;
    this.speed      = 7 * this.charDef.speed * this.p.spd;

    const ws = WEAPON_STATS[this.charDef.weapon] || WEAPON_STATS.assaultRifle;
    this.wStats     = ws;
    this.ammo       = ws.magSize;
    this.reserve    = ws.reserveAmmo;
    this.isReloading= false;
    this.reloadTimer= 0;
    this.lastShot   = 0;

    this.state      = 'patrol';
    this.target     = null;
    this.reactionT  = 0;
    this.reacted    = false;
    this.strafeDir  = 1;
    this.strafeT    = 0;
    this.patrolPts  = [];
    this.patrolIdx  = 0;
    this.patrolWait = 0;
    this.stuckT     = 0;
    this.prevPos    = this.position.clone();
    this.jumpT      = Math.random() * 3000;

    this.mesh = this._buildMesh();
    this.mesh.position.copy(this.position);
    scene.add(this.mesh);
  }

  _buildMesh() {
    const g = new THREE.Group();
    const bm = new THREE.MeshStandardMaterial({ color: this.charDef.bodyColor, metalness: 0.4, roughness: 0.4, emissive: this.charDef.accentColor, emissiveIntensity: 0.1 });
    const am = new THREE.MeshStandardMaterial({ color: this.charDef.accentColor, emissive: this.charDef.accentColor, emissiveIntensity: 0.5, metalness: 0.8 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.28), bm); torso.position.y = 0.95; torso.castShadow = true;
    const head  = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.30, 0.28), bm); head.position.y  = 1.45; head.castShadow  = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.06), am); visor.position.set(0, 1.46, 0.17);
    const legL  = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.24), bm); legL.position.set(-0.14, 0.35, 0);
    const legR  = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.24), bm); legR.position.set( 0.14, 0.35, 0);
    const armL  = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), bm); armL.position.set(-0.37, 0.90, 0);
    const armR  = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), bm); armR.position.set( 0.37, 0.90, 0);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.06, 0.30), am); strip.position.y = 1.10;
    const gun   = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9 })); gun.position.set(0.42, 0.90, 0.2);

    const teamColor = this.team === 'a' ? 0x00a8ff : 0xff4400;
    const tLight = new THREE.PointLight(teamColor, 0.6, 2); tLight.position.y = 1.6;

    g.add(torso, head, visor, legL, legR, armL, armR, strip, gun, tLight);

    // Health bar
    const hbg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.07), new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
    this.hbFill = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.07), new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide }));
    this.hbFill.position.z = 0.001;
    const hbg2 = new THREE.Group(); hbg2.add(hbg, this.hbFill); hbg2.position.y = 2.0;
    g.add(hbg2); this.healthBarGroup = hbg2;

    g.name = this.id; g.userData = { isBot: true, botRef: this };
    return g;
  }

  setPatrolPoints(pts) { this.patrolPts = pts; }

  update(delta, enemies) {
    if (!this.isAlive) return null;
    this.strafeT -= delta; this.jumpT -= delta;

    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const n = Math.min(this.wStats.magSize - this.ammo, this.reserve);
        this.ammo += n; this.reserve -= n;
      }
    }

    const enemy = this._nearest(enemies);
    this._transition(enemy, delta);

    let bullets = null;
    if      (this.state === 'patrol') this._patrol(delta);
    else if (this.state === 'chase')  this._chase(delta, enemy);
    else if (this.state === 'attack') bullets = this._attack(enemy);
    else if (this.state === 'strafe') { this._strafe(delta, enemy); bullets = this._attack(enemy); }
    else if (this.state === 'flee')   this._flee(delta, enemy);
    else if (this.state === 'search') this._search(delta);

    this._physics(delta);
    this.mesh.position.copy(this.position);

    if (enemy && (this.state === 'attack' || this.state === 'strafe')) {
      this.rotation = Math.atan2(enemy.position.x - this.position.x, enemy.position.z - this.position.z);
    } else if (this.velocity.length() > 0.5) {
      this.rotation = Math.atan2(this.velocity.x, this.velocity.z);
    }
    this.mesh.rotation.y = this.rotation;

    // Leg animation
    const spd = Math.sqrt(this.velocity.x**2 + this.velocity.z**2);
    if (spd > 0.3 && this.isGrounded) {
      const t = performance.now() * 0.006 * (spd / this.speed);
      if (this.mesh.children[3]) this.mesh.children[3].rotation.x =  Math.sin(t) * 0.4;
      if (this.mesh.children[4]) this.mesh.children[4].rotation.x = -Math.sin(t) * 0.4;
    }

    // Health bar
    if (this.hbFill) {
      const r = this.health / this.maxHealth;
      this.hbFill.scale.x = r;
      this.hbFill.position.x = (r - 1) * 0.4;
      this.hbFill.material.color.setHex(r > 0.5 ? 0x00ff88 : r > 0.25 ? 0xffaa00 : 0xff2200);
    }
    if (this.healthBarGroup) this.healthBarGroup.lookAt(new THREE.Vector3(this.position.x, this.position.y + 5, this.position.z + 30));

    // Stuck detection
    if (this.prevPos.distanceTo(this.position) < 0.01 && this.state === 'chase') {
      this.stuckT += delta;
      if (this.stuckT > 1800) { this.stuckT = 0; this.velocity.x = (Math.random()-0.5)*10; this.velocity.z = (Math.random()-0.5)*10; }
    } else this.stuckT = 0;
    this.prevPos.copy(this.position);

    return bullets;
  }

  _nearest(enemies) {
    if (!enemies?.length) return null;
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (!e.isAlive) continue;
      const d = this.position.distanceTo(e.position);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  _transition(enemy, delta) {
    if (this.ammo === 0 && !this.isReloading) { this.state = 'reload'; this._startReload(); return; }
    if (this.isReloading) { this.state = 'reload'; return; }
    const hp   = this.health / this.maxHealth;
    const dist = enemy ? this.position.distanceTo(enemy.position) : Infinity;
    if (hp < 0.25 && dist < 35) { this.state = 'flee'; return; }
    if (!enemy) { this.state = this._lastSeenPos ? 'search' : 'patrol'; return; }
    this._lastSeenPos = enemy.position.clone(); this._lastSeenTime = Date.now();
    if (dist <= 30) {
      if (!this.reacted) { this.reactionT += delta; if (this.reactionT >= this.p.react) { this.reacted = true; this.reactionT = 0; } }
      this.state = this.reacted ? (this.strafeT > 0 ? 'strafe' : 'attack') : 'chase';
      if (this.strafeT <= 0) { this.strafeT = 1200 + Math.random() * 1200; this.strafeDir *= -1; }
    } else if (dist < 45) { this.state = 'chase'; this.reacted = false; this.reactionT = 0; }
    else { this.state = 'patrol'; }
    if (this.jumpT <= 0 && this.isGrounded) { this.velocity.y = 8; this.isGrounded = false; this.jumpT = 3000 + Math.random()*4000; }
  }

  _patrol(delta) {
    if (!this.patrolPts.length) return;
    this.patrolWait -= delta;
    if (this.patrolWait > 0) return;
    const tgt = this.patrolPts[this.patrolIdx];
    const dx  = tgt.x - this.position.x, dz = tgt.z - this.position.z;
    const d   = Math.sqrt(dx*dx + dz*dz);
    if (d < 2) { this.patrolIdx = (this.patrolIdx + 1) % this.patrolPts.length; this.patrolWait = 1000 + Math.random()*1000; return; }
    const spd = this.speed * 0.55;
    this.velocity.x += (dx/d * spd - this.velocity.x) * 0.1;
    this.velocity.z += (dz/d * spd - this.velocity.z) * 0.1;
  }

  _chase(delta, e) {
    if (!e) return;
    const dx = e.position.x - this.position.x, dz = e.position.z - this.position.z;
    const d  = Math.sqrt(dx*dx + dz*dz) || 1;
    this.velocity.x += (dx/d * this.speed - this.velocity.x) * 0.14;
    this.velocity.z += (dz/d * this.speed - this.velocity.z) * 0.14;
  }

  _attack(e) {
    if (!e || !this.reacted || this.isReloading || this.ammo <= 0) return null;
    const now = performance.now();
    if (now - this.lastShot < (60000 / this.wStats.fireRate) / this.p.fr) return null;
    this.lastShot = now; this.ammo--;
    const origin = this.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const target = e.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    const dir    = target.sub(origin).normalize();
    const sp     = (1 - this.p.acc) * 0.12;
    dir.x += (Math.random()-0.5)*sp; dir.y += (Math.random()-0.5)*sp; dir.z += (Math.random()-0.5)*sp; dir.normalize();
    return [{ id: Math.random().toString(36).substr(2,8), position: origin, direction: dir,
              speed: 100, damage: this.wStats.damage, range: this.wStats.range,
              distanceTraveled: 0, alive: true, ownerId: this.id, ownerTeam: this.team, mesh: null }];
  }

  _strafe(delta, e) {
    if (!e) return;
    const dx = e.position.x - this.position.x, dz = e.position.z - this.position.z;
    const d  = Math.sqrt(dx*dx + dz*dz) || 1;
    const sx = -dz/d * this.strafeDir * this.speed * 0.9;
    const sz =  dx/d * this.strafeDir * this.speed * 0.9;
    this.velocity.x += (sx - this.velocity.x) * 0.16;
    this.velocity.z += (sz - this.velocity.z) * 0.16;
  }

  _flee(delta, e) {
    if (!e) return;
    const dx = this.position.x - e.position.x, dz = this.position.z - e.position.z;
    const d  = Math.sqrt(dx*dx + dz*dz) || 1;
    this.velocity.x += (dx/d * this.speed * 1.2 - this.velocity.x) * 0.18;
    this.velocity.z += (dz/d * this.speed * 1.2 - this.velocity.z) * 0.18;
  }

  _search(delta) {
    if (!this._lastSeenPos) return;
    const dx = this._lastSeenPos.x - this.position.x, dz = this._lastSeenPos.z - this.position.z;
    const d  = Math.sqrt(dx*dx + dz*dz);
    if (d < 2 || (Date.now() - this._lastSeenTime) > 5000) { this._lastSeenPos = null; this.state = 'patrol'; return; }
    this.velocity.x += (dx/d * this.speed * 0.65 - this.velocity.x) * 0.1;
    this.velocity.z += (dz/d * this.speed * 0.65 - this.velocity.z) * 0.1;
  }

  _startReload() {
    if (this.isReloading || this.reserve <= 0) return;
    this.isReloading = true; this.reloadTimer = this.wStats.reloadTime * 1.2;
  }

  _physics(delta) {
    const dt = delta / 1000;
    if (!this.isGrounded) this.velocity.y += -22 * dt;
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;
    if (this.position.y <= this.height * 0.5) { this.position.y = this.height * 0.5; this.velocity.y = 0; this.isGrounded = true; }
    this.velocity.x *= 0.76; this.velocity.z *= 0.76;
    this.position.x = Math.max(-190, Math.min(190, this.position.x));
    this.position.z = Math.max(-190, Math.min(190, this.position.z));
  }

  get height() { return 1.8; }

  takeDamage(amount) {
    if (!this.isAlive || this.isInvincible) return 0;
    let dmg = amount;
    if (this.shield > 0) { const a = Math.min(this.shield, dmg); this.shield -= a; dmg -= a; }
    this.health -= dmg;
    // Flash red on hit
    this.mesh?.children.forEach(c => { if (c.isMesh && c.material?.emissiveIntensity !== undefined) { c.material.emissiveIntensity = 2; setTimeout(() => { if (c.material) c.material.emissiveIntensity = 0.1; }, 100); } });
    if (this.health <= 0) { this.health = 0; this.isAlive = false; this.deaths++; this._die(); }
    return dmg;
  }

  _die() {
    this.mesh.rotation.x = Math.PI / 2;
    setTimeout(() => { if (this.scene) this.scene.remove(this.mesh); }, 4000);
  }

  respawn(sp) {
    this.isAlive = true; this.health = this.maxHealth; this.shield = this.charDef.maxShield;
    this.position.copy(sp); this.velocity.set(0,0,0);
    this.mesh.rotation.x = 0; this.mesh.position.copy(this.position);
    if (!this.mesh.parent) this.scene.add(this.mesh);
    this.ammo = this.wStats.magSize; this.isReloading = false;
    this.state = 'patrol'; this.reacted = false;
  }
}

// =====================================================================
// MAP BUILDER
// =====================================================================
class MapBuilder {
  constructor(scene) {
    this.scene    = scene;
    this.colliders= [];
    this.spawnPoints = { a: [], b: [] };
  }

  build(mapId) {
    this.colliders = []; this.spawnPoints = { a: [], b: [] };
    const fn = {
      neonCity:     () => this._neonCity(),
      jungle:       () => this._jungle(),
      desertRuins:  () => this._desert(),
      neonJungle:   () => this._neonJungle(),
      cyberDesert:  () => this._cyberDesert(),
      factory:      () => this._factory(),
      skyPlatforms: () => this._sky()
    };
    (fn[mapId] || fn.neonCity)();
    return { colliders: this.colliders, spawnPoints: this.spawnPoints };
  }

  _sky(color, emissive, options = {}) {
    const mat = new THREE.MeshStandardMaterial({
      color, metalness: options.metalness ?? 0.3, roughness: options.roughness ?? 0.5,
      emissive: new THREE.Color(emissive || 0), emissiveIntensity: emissive ? (options.ei ?? 0.2) : 0
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  _box(w, h, d, x, y, z, color, emissive, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      color, metalness: opts.metalness ?? 0.3, roughness: opts.roughness ?? 0.5,
      emissive: new THREE.Color(emissive || 0), emissiveIntensity: emissive ? (opts.ei ?? 0.2) : 0
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h/2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.colliders.push({ box: new THREE.Box3().setFromObject(mesh) });
    return mesh;
  }

  _floor(w, d, y, color) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    mesh.rotation.x = -Math.PI/2; mesh.position.y = y; mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.colliders.push({ isGround: true, y });
  }

  _light(x, y, z, color, intensity=2, dist=20) {
    const l = new THREE.PointLight(color, intensity, dist);
    l.position.set(x, y, z); this.scene.add(l);
  }

  _ambience(sky, fog, fogNear, fogFar, ambInt = 0.4) {
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(fog, fogNear, fogFar);
    this.scene.add(new THREE.AmbientLight(0xffffff, ambInt));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(60, 100, 40); dir.castShadow = true;
    dir.shadow.mapSize.width = dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.left = dir.shadow.camera.bottom = -120;
    dir.shadow.camera.right = dir.shadow.camera.top = 120;
    this.scene.add(dir);
  }

  _spawns(ax, az, bx, bz) {
    for (let i = 0; i < 4; i++) {
      this.spawnPoints.a.push(new THREE.Vector3(ax + (Math.random()-0.5)*8, 1, az + (Math.random()-0.5)*8));
      this.spawnPoints.b.push(new THREE.Vector3(bx + (Math.random()-0.5)*8, 1, bz + (Math.random()-0.5)*8));
    }
  }

  _neonCity() {
    this._ambience(0x050a1a, 0x050a1a, 40, 150);
    this._floor(260, 260, 0, 0x0d1117);

    // buildings
    const bdata = [
      [12,28,12, -40,-40, 0x0a1a2a, 0x00f5ff], [8,18,10, -28,-35, 0x0a1422, 0x00aaff],
      [15,34,12, -50,-20, 0x080e1c, 0xff6600], [10,22, 8, -20,-50, 0x0a1a2a, 0x00f5ff],
      [6,42, 6,  -55,-45, 0x050c18, 0xff00aa], [12,28,12,  40, 40, 0x1a0a0a, 0xff4400],
      [8,18,10,   28, 35, 0x1a0e0a, 0xff8800], [15,34,12,  50, 20, 0x180808, 0xff0022],
      [10,22, 8,  20, 50, 0x1a0a0a, 0xff4400], [6,42, 6,   55, 45, 0x100508, 0xff44aa],
    ];
    for (const [w,h,d,x,z,c,ac] of bdata) {
      this._box(w,h,d, x,0,z, c,ac,{ei:0.25});
      this._light(x, h*0.6, z, ac, 1.5, 18);
    }
    // Cover walls
    const cov = [[12,2,1, 0,0,-5],[12,2,1, 0,0,5],[1,2,8,-6,0,0],[1,2,8,6,0,0],
                 [4,2,1,-15,0,-2],[4,2,1,15,0,2],[4,2,1,-12,0,8],[4,2,1,12,0,-8]];
    for (const [w,h,d,x,y,z] of cov) this._box(w,h,d,x,y,z, 0x223344, 0x00aaff, {ei:0.15});
    // Elevated platform center
    this._box(18,1,6, -38,12,-25, 0x222233, 0x00f5ff, {ei:0.2});
    this._box(14,1,6,  38,12, 25, 0x332222, 0xff4400, {ei:0.2});
    const cols = [0x00f5ff,0xff6b00,0xff0080,0x00ff88,0xaa00ff];
    for (let i=0;i<16;i++) { const a=(i/16)*Math.PI*2, r=30+Math.random()*40; this._light(Math.cos(a)*r, 8+Math.random()*18, Math.sin(a)*r, cols[i%5], 1.5, 18); }
    this._spawns(-52,-52, 52,52);
  }

  _jungle() {
    this._ambience(0x0a1a0a, 0x0a2010, 15, 75, 0.5);
    this.scene.fog = new THREE.Fog(0x0a2010, 12, 70);
    this._floor(260, 260, 0, 0x1a2a0a);
    for (let i=0;i<70;i++) {
      const x=(Math.random()-.5)*180, z=(Math.random()-.5)*180;
      if (Math.abs(x)<18 && Math.abs(z)<28) continue;
      this._tree(x,z);
    }
    const temple=[[20,2,2,0,0,-10],[20,2,2,0,0,10],[2,2,20,-10,0,0],[2,2,20,10,0,0],
                  [4,6,4,-8,0,-8],[4,6,4,8,0,-8],[4,6,4,-8,0,8],[4,6,4,8,0,8],[6,10,6,0,0,0],[16,1,16,0,2,0]];
    for (const [w,h,d,x,y,z] of temple) this._box(w,h,d,x,y,z, 0x4a3a2a,0,{roughness:0.95,metalness:0});
    const bridges=[[24,.5,2.5,0,4,-20],[24,.5,2.5,0,4,20],[2.5,.5,24,-20,4,0],[2.5,.5,24,20,4,0]];
    for (const [w,h,d,x,y,z] of bridges) this._box(w,h,d,x,y,z, 0x6b4423,0,{roughness:1,metalness:0});
    const gc=[0x00ff44,0x44ff88,0x00ffaa];
    for (let i=0;i<20;i++){const a=(i/20)*Math.PI*2,r=20+Math.random()*50;this._light(Math.cos(a)*r,3,Math.sin(a)*r,gc[i%3],1,12);}
    this._spawns(-55,-55, 55,55);
  }

  _tree(x, z) {
    const h = 5+Math.random()*8;
    const tm = new THREE.Mesh(new THREE.CylinderGeometry(.3,.5,h,6), new THREE.MeshStandardMaterial({color:0x3a2210,roughness:1}));
    tm.position.set(x,h/2,z); tm.castShadow=true; this.scene.add(tm);
    this.colliders.push({box:new THREE.Box3().setFromObject(tm)});
    const lc=[0x0a3a08,0x0d4a0a,0x0a5a0c];
    for(let i=0;i<3;i++){
      const lm=new THREE.Mesh(new THREE.ConeGeometry(2.5-i*.4,3+i,8),new THREE.MeshStandardMaterial({color:lc[i],roughness:.9}));
      lm.position.set(x,h-1+i*2,z); lm.castShadow=true; this.scene.add(lm);
    }
  }

  _desert() {
    this._ambience(0x1a1208, 0xc8a850, 30, 130);
    this._floor(260,260,0, 0xc8a850);
    const ruins=[[8,15,8,-20,0,-20],[3,12,3,-15,0,-18],[8,15,8,20,0,20],[3,12,3,15,0,18],
                 [24,1.5,4,0,2,-8],[24,1.5,4,0,2,8],[4,8,4,-6,0,0],[4,8,4,6,0,0],[12,.8,12,0,4,0],
                 [4,6,4,-30,0,0],[4,6,4,30,0,0],[4,6,4,0,0,-30],[4,6,4,0,0,30]];
    for (const [w,h,d,x,y,z] of ruins) this._box(w,h,d,x,y,z, 0xc8a850,0,{roughness:.95,metalness:0});
    const sun=new THREE.DirectionalLight(0xffa844,1.8); sun.position.set(80,100,40); sun.castShadow=true; this.scene.add(sun);
    this._spawns(-60,-60, 60,60);
  }

  _neonJungle() {
    this._ambience(0x020a02, 0x010801, 20, 85, 0.3);
    this.scene.fog = new THREE.Fog(0x010a01, 18, 80);
    this._floor(260,260,0, 0x0a1a08);
    for(let i=0;i<45;i++){const x=(Math.random()-.5)*160,z=(Math.random()-.5)*160;if(Math.abs(x)<22&&Math.abs(z)<22)continue;this._cybertree(x,z);}
    const tc=[0x00ff44,0x00ffaa,0xff00aa,0xaaff00,0x00aaff];
    for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2,r=35+Math.random()*20,h=15+Math.random()*30,x=Math.cos(a)*r,z=Math.sin(a)*r,c=tc[i%5];this._box(8,h,8,x,0,z,0x0a1a0a,c,{ei:.3});this._light(x,h*.7,z,c,2,15);}
    const pl=[[16,.5,16,0,3,0],[8,.5,8,-12,6,-12],[8,.5,8,12,6,12],[6,.5,6,0,9,0]];
    for(const [w,h,d,x,y,z] of pl) this._box(w,h,d,x,y,z,0x1a2a1a,0x00ff44,{ei:.25});
    this._spawns(-55,-55, 55,55);
  }

  _cybertree(x,z) {
    const gc=[0x00ff44,0x44ffaa,0xff00aa]; const c=gc[Math.floor(Math.random()*3)];
    const t=new THREE.Mesh(new THREE.CylinderGeometry(.25,.4,8,5),new THREE.MeshStandardMaterial({color:0x1a3a1a,emissive:c,emissiveIntensity:.15}));
    t.position.set(x,4,z); this.scene.add(t);
    const l=new THREE.Mesh(new THREE.ConeGeometry(2,4,6),new THREE.MeshStandardMaterial({color:0x0a2a0a,emissive:c,emissiveIntensity:.4}));
    l.position.set(x,9,z); this.scene.add(l);
    this._light(x,8,z,c,.7,7);
  }

  _cyberDesert() {
    this._ambience(0x100c00, 0x201800, 40, 140);
    this._floor(260,260,0, 0x2a1e08);
    const s=[[10,18,10,-25,0,-25,0xb89840,0x00f5ff],[10,18,10,25,0,25,0xb89840,0xff4400],
              [5,25,5,-30,0,0,0xaa8830,0x00ffaa],[5,25,5,30,0,0,0xaa8830,0xff00aa],
              [20,1.5,4,0,3,-6,0xcc9940,0x00aaff],[20,1.5,4,0,3,6,0xcc9940,0x00aaff],[8,1,8,0,5,0,0xcc9940,0xffaa00]];
    for(const [w,h,d,x,y,z,c,ac] of s){this._box(w,h,d,x,y,z,c,ac,{ei:.4});this._light(x,y+h/2+2,z,ac,1.5,12);}
    for(let i=0;i<18;i++){const x=(Math.random()-.5)*120,z=(Math.random()-.5)*120,c=[0x00aaff,0xff6600,0x00ff88][i%3];this._box(1+Math.random()*3,.5+Math.random()*2,1+Math.random()*3,x,0,z,0x2a1800,c,{ei:.6});}
    this._spawns(-60,-60, 60,60);
  }

  _factory() {
    this._ambience(0x0a0808, 0x120a08, 30, 110);
    this._floor(260,260,0, 0x1a1212);
    const mach=[[6,8,6,-20,0,-20],[6,8,6,20,0,20],[12,4,4,0,0,-8],[12,4,4,0,0,8],[4,12,4,-8,0,0],[4,12,4,8,0,0],
                [3,16,3,-25,0,0],[3,16,3,25,0,0],[3,16,3,0,0,-25],[3,16,3,0,0,25]];
    for(const [w,h,d,x,y,z] of mach) this._box(w,h,d,x,y,z,0x222222,0xff4400,{ei:.15,metalness:.9,roughness:.2});
    const wk=[[30,.5,3,0,8,0],[3,.5,30,0,8,0],[20,.5,3,-12,5,-12],[20,.5,3,12,5,12]];
    for(const [w,h,d,x,y,z] of wk) this._box(w,h,d,x,y,z,0x333344,0,{metalness:.8,roughness:.3});
    for(let i=0;i<20;i++){const x=-50+(i%5)*25,z=-30+Math.floor(i/5)*20;this._light(x,12,z,[0xff6600,0xffaa00,0xff4400][i%3],2,20);}
    this._spawns(-55,-55, 55,55);
  }

  _sky() {
    this._ambience(0x050820, 0x080c2a, 60, 250);
    this.colliders.push({isGround:true, y:-500}); // kill plane

    const pl=[[20,20,0,5,0],[12,12,-30,8,0],[12,12,30,8,0],[8,8,0,12,-30],[8,8,0,12,30],
              [6,6,-20,16,-20],[6,6,20,16,20],[6,6,-20,16,20],[6,6,20,16,-20],[10,10,0,20,0],
              [4,4,-15,6,-15],[4,4,15,6,15],[4,4,-15,6,15],[4,4,15,6,-15]];
    const pc=[0x00aaff,0x4444ff,0xff4444,0x00ff88,0xaa44ff];
    for(let i=0;i<pl.length;i++){
      const [w,d,x,y,z]=pl[i],c=pc[i%5];
      this._box(w,.8,d,x,y,z,0x1a2a3a,c,{ei:.3,metalness:.6});
      this._light(x,y+2,z,c,1.5,14);
    }
    // Stars
    const sg=new THREE.BufferGeometry(); const sv=[];
    for(let i=0;i<2000;i++) sv.push((Math.random()-.5)*400, 30+Math.random()*200, (Math.random()-.5)*400);
    sg.setAttribute('position',new THREE.Float32BufferAttribute(sv,3));
    this.scene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:.3})));
    this.spawnPoints.a=[new THREE.Vector3(-28,9,0),new THREE.Vector3(-32,9,4),new THREE.Vector3(-26,9,-4),new THREE.Vector3(-30,9,-4)];
    this.spawnPoints.b=[new THREE.Vector3( 28,9,0),new THREE.Vector3( 32,9,4),new THREE.Vector3( 26,9,-4),new THREE.Vector3( 30,9,-4)];
  }
}
