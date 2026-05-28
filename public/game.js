const LEVEL_SPAWN_POINTS = {
  'level_1.glb': [
    { x: -39.64, y: 0.53, z: -31.33 },
    { x: -78.69, y: 0.53, z: -61.07 },
    { x: -57.51, y: 7.10, z: -60.48 },
    { x: -2.64, y: 0.53, z: -255.53 },
    { x: -46.90, y: 0.53, z: -309.56 },
    { x: -49.36, y: 0.46, z: -193.42 },
    { x: 46.60, y: 15.12, z: -173.82 },
    { x: 22.30, y: 0.53, z: -89.89 },
    { x: -81.11, y: 3.84, z: -464.15 },
    { x: -76.45, y: 0.53, z: -383.61 },
    { x: -60.66, y: 10.85, z: -160.14 },
    { x: -15.82, y: 35.39, z: -24.13 },
  ],
  'level_2.glb': [
    { x: -4.43, y: 161.88, z: -21.1 },
    { x: -5.72, y: 160.66, z: -3.36 },
    { x: 22.12, y: 168.59, z: 3.8 },
    { x: 24.99, y: 160.97, z: 3.07 },
    { x: -27.36, y: 161.88, z: 3.34 },
    { x: -27.66, y: 149.69, z: -28.19 },
    { x: -4.56, y: 145.73, z: -17.8 },
    { x: -4.86, y: 154.87, z: 1.14 },
    { x: 12.11, y: 160.05, z: 22.92 },
    { x: 37.7, y: 163.56, z: 20.13 },
    { x: 37.88, y: 163.56, z: -5.22 },
    { x: -34.88, y: 161.88, z: 18.03 },
    { x: 16.88, y: 151.22, z: 22.6 },
    { x: 13.89, y: 155.79, z: -3.39 },
  ],
};
let currentLevelName = 'level_1.glb';
let SPAWN_POINTS = LEVEL_SPAWN_POINTS['level_1.glb'];
function randomSpawn() { return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]; }

const MOVE_FORCE = 60;
const SPRINT_FORCE = 120;
const MAX_SPEED = 9;
const SPRINT_SPEED = 18;
const JUMP_IMPULSE = 8;
const JOYSTICK_DEADZONE = 0.15;
const TAG_DISTANCE = 1.5;

const TAG_COOLDOWN = 4;
const SPRINT_DURATION = 4;
const SPRINT_REFILL_TIME = 6;
const JUMP_CD_AT_FULL = 5;

const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || ('ontouchstart' in window);

// --- Three.js scene ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);
scene.add(camera);

const gimbal = new THREE.AxesHelper(0.2);
gimbal.position.set(-1.2, 0.7, -2.5);
gimbal.visible = false;
camera.add(gimbal);

// Helper to create axis labels for the gimbal
function createAxisLabel(text, color, position) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 48px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 36);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.2, 0.2, 1);
  sprite.position.copy(position);
  sprite.renderOrder = 1000;
  return sprite;
}
gimbal.add(createAxisLabel('X', '#ff4444', new THREE.Vector3(0.25, 0, 0)));
gimbal.add(createAxisLabel('Y', '#44ff44', new THREE.Vector3(0, 0.25, 0)));
gimbal.add(createAxisLabel('Z', '#4444ff', new THREE.Vector3(0, 0, 0.25)));

// --- Sky gradient ---
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 1; skyCanvas.height = 256;
const skyCtx = skyCanvas.getContext('2d');
const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
skyGrad.addColorStop(0, '#0a0a2e');
skyGrad.addColorStop(0.3, '#1a1a4e');
skyGrad.addColorStop(0.6, '#2d4a7a');
skyGrad.addColorStop(0.85, '#5a7faa');
skyGrad.addColorStop(1, '#8ab4d4');
skyCtx.fillStyle = skyGrad;
skyCtx.fillRect(0, 0, 1, 256);
const skyTex = new THREE.CanvasTexture(skyCanvas);
scene.background = skyTex;

// --- Sun light ---
const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.5);
sunLight.position.set(100, 200, 80);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 500;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x553322, 0.6);
scene.add(hemiLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

const sunGeo = new THREE.SphereGeometry(8, 16, 16);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunMesh.position.copy(sunLight.position);
scene.add(sunMesh);

let levelLoaded = false;
let currentLevelObj = null;

const loader = new THREE.GLTFLoader();

function loadGameLevel(filename) {
  if (currentLevelObj) {
    scene.remove(currentLevelObj);
    currentLevelObj = null;
  }
  levelMeshes.length = 0;
  levelLoaded = false;
  currentLevelName = filename;
  SPAWN_POINTS = LEVEL_SPAWN_POINTS[filename] || LEVEL_SPAWN_POINTS['level_1.glb'];

  loader.load('/levels/' + filename, (gltf) => {
    const level = gltf.scene;
    level.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
        addLevelCollider(child);
      }
    });
    scene.add(level);
    currentLevelObj = level;
    levelLoaded = true;
  }, undefined, (err) => {
    console.error('Failed to load level:', err);
    const groundGeo = new THREE.PlaneGeometry(5000, 5000);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x55aa55 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    currentLevelObj = ground;
    levelLoaded = true;
  });
}

// --- Cannon.js physics world ---
const world = new CANNON.World();
world.gravity.set(0, -20, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

const groundMaterial = new CANNON.Material('ground');
const playerMaterial = new CANNON.Material('player');

world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, playerMaterial, {
  friction: 0.7, restitution: 0.1
}));
world.addContactMaterial(new CANNON.ContactMaterial(playerMaterial, playerMaterial, {
  friction: 0.3, restitution: 0.2
}));

const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
groundBody.position.set(0, 0, 0);
world.addBody(groundBody);

// --- Raycast terrain detection ---
const PLAYER_RADIUS = 0.5;
const levelMeshes = [];

function addLevelCollider(mesh) {
  levelMeshes.push(mesh);
}

const raycaster = new THREE.Raycaster();
let rayGrounded = false;

function raycastLevel(origin, direction, maxDist) {
  raycaster.set(origin, direction);
  raycaster.far = maxDist;
  const hits = raycaster.intersectObjects(levelMeshes, false);
  return hits.length > 0 ? hits[0] : null;
}

function updateGroundPlane(body) {
  const p = body.position;
  const groundOrigin = new THREE.Vector3(p.x, p.y + 2, p.z);
  const groundHit = raycastLevel(groundOrigin, new THREE.Vector3(0, -1, 0), 50);

  if (groundHit) {
    groundBody.position.y = groundHit.point.y;
    rayGrounded = (p.y - groundHit.point.y) < 0.7;
  } else {
    groundBody.position.y = -1000;
    rayGrounded = false;
  }
}

function resolveWallCollisions(body) {
  const p = body.position;
  const wallDirs = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 0, 1).normalize(), new THREE.Vector3(-1, 0, 1).normalize(),
    new THREE.Vector3(1, 0, -1).normalize(), new THREE.Vector3(-1, 0, -1).normalize()
  ];

  const wallOrigin = new THREE.Vector3(p.x, p.y, p.z);
  for (const dir of wallDirs) {
    const hit = raycastLevel(wallOrigin, dir, PLAYER_RADIUS + 0.05);
    if (hit) {
      const pushDist = PLAYER_RADIUS + 0.05 - hit.distance;
      p.x -= dir.x * pushDist;
      p.z -= dir.z * pushDist;
      const velDot = body.velocity.x * dir.x + body.velocity.z * dir.z;
      if (velDot > 0) {
        body.velocity.x -= dir.x * velDot;
        body.velocity.z -= dir.z * velDot;
      }
    }
  }

  // Ceiling collision — prevent jumping through ceilings
  const ceilOrigin = new THREE.Vector3(p.x, p.y + 0.3, p.z);
  const ceilHit = raycastLevel(ceilOrigin, new THREE.Vector3(0, 1, 0), PLAYER_RADIUS + 0.5);
  if (ceilHit) {
    const headroom = ceilHit.distance;
    if (headroom < PLAYER_RADIUS + 0.1) {
      p.y = ceilHit.point.y - PLAYER_RADIUS - 0.1;
    }
    if (body.velocity.y > 0) {
      body.velocity.y = 0;
    }
  }
}

// --- State ---
const clock = new THREE.Clock(false);
const keys = {};
let localPlayer = null;
let localMesh = null;
let localBody = null;
let selfId = null;
const remotePlayers = new Map();
const remoteMeshes = new Map();
const remoteBodies = new Map();
const outlineMeshes = new Map();
let joystickX = 0, joystickZ = 0;
let mobileSprinting = false;
let lastJoystickTap = 0;
let airTime = 0;
let lastGroundedTime = 0;
const COYOTE_TIME = 0.025;

// --- Charge jump state ---
const CHARGE_RATE = 3;
const MAX_CHARGE_MULT = 4;
let jumpCharge = 0;
let isChargingJump = false;
let jumpCooldownTimer = 0;
let jumpCooldownMax = 0;
let jumpCooldownStartPct = 0;

// --- Sprint stamina state ---
let sprintStamina = SPRINT_DURATION;
let sprintExhausted = false;
let wasSprinting = false;

// --- Tag cooldown state ---
let tagCooldownTimer = 0;

// --- Ball morph state ---
let sprintMorphT = 0;
let originalSmoothing = 0.25;
let morphedPhysicsToSphere = false;
let speedCapCurrent = MAX_SPEED;

// --- Oddball state ---
let holderID = null;
let allScores = {};
let leaderID = null;

// --- Audio state ---
const music = new Audio('/music/background.mp3');
music.loop = true;
let musicVolume = 0;
music.volume = musicVolume;
let musicPlaying = false;

const boostSound = new Audio('/sound/boost.wav');
boostSound.volume = 0.4;

const jumpSounds = [
  new Audio('/sound/jump_1.wav'),
  new Audio('/sound/jump_2.wav'),
  new Audio('/sound/jump_3.wav'),
  new Audio('/sound/jump_4.wav'),
];
const JUMP_SOUND_BASE_VOLUME = 0.5;

const MAX_SOUND_DIST = 50;

function playWorldSound(sound, position, baseVolume = 1.0) {
  if (!position) return;
  const dist = camera.position.distanceTo(position);

  if (dist > MAX_SOUND_DIST) return;

  const volume = baseVolume * Math.max(0, 1 - (dist / MAX_SOUND_DIST));
  sound.volume = volume;

  if (sound.volume > 0.01) {
    sound.currentTime = 0;
    sound.play().catch(e => { /* ignore play error */ });
  }
}

function playRandomJumpSound(position) {
  const sound = jumpSounds[Math.floor(Math.random() * jumpSounds.length)];
  playWorldSound(sound, position, JUMP_SOUND_BASE_VOLUME);
}

// --- Spawn editor state ---
const spawnMarkers = [];
let spawnClickCooldown = 0;

// --- Join screen ---
const nameScreen = document.getElementById('name-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const hud = document.getElementById('hud');
const leaderDisplay = document.getElementById('leader-display');
const colorPicker = document.getElementById('color-picker');
const skinImageInput = document.getElementById('skin-image-input');
let playerName = 'Player';
let playerShape = 'roundcube';
let playerColor = '#4488ff';
let playerSkinImage = '';
let gameStarted = false;

function joinGame() {
  playerName = nameInput.value.trim().slice(0, 16) || 'Player';
  playerColor = colorPicker.value;
  playerSkinImage = skinImageInput.value.trim();
  nameScreen.style.display = 'none';
  hud.style.display = '';
  leaderDisplay.style.display = '';

  // Start music on first join
  if (!musicPlaying) {
    // play() must be called in a user interaction event (like this click)
    const playPromise = music.play();
    if (playPromise) playPromise.catch(e => console.warn("Music autoplay was blocked by the browser."));
    musicPlaying = true;
  }

  // Load the selected or active level
  const levelToLoad = selectedLevel || serverActiveLevel || 'level_1.glb';
  socket.emit('selectLevel', levelToLoad);
  loadGameLevel(levelToLoad);
  cleanupPreviews();

  gameStarted = true;
  clock.start();
  startGame();
}

joinBtn.addEventListener('click', joinGame);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });

// --- Scoreboard UI ---
let tabHeld = false;
document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); tabHeld = true; }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); tabHeld = false; }
});

const scoreboardEl = document.createElement('div');
scoreboardEl.id = 'scoreboard';
scoreboardEl.innerHTML = '<h3>PLAYERS</h3><div id="scoreboard-list"></div>';
document.body.appendChild(scoreboardEl);

function updateScoreboard() {
  const list = document.getElementById('scoreboard-list');
  if (!list) return;
  const entries = [];
  if (selfId) entries.push({ id: selfId, name: playerName, score: allScores[selfId] || 0 });
  for (const [id, name] of playerNames) {
    entries.push({ id, name, score: allScores[id] || 0 });
  }
  entries.sort((a, b) => b.score - a.score);
  list.innerHTML = entries.map(e => {
    const classes = [];
    if (e.id === holderID) classes.push('holder');
    if (e.id === leaderID) classes.push('leader');
    return `<div class="sb-row ${classes.join(' ')}"><span class="sb-name">${e.id === leaderID ? '\u{1F451} ' : ''}${e.id === holderID ? '[IT] ' : ''}${e.name}</span><span class="sb-score">${e.score}</span></div>`;
  }).join('');
}

// --- Meter UI ---
function createMeter(id, label) {
  const wrap = document.createElement('div');
  wrap.className = 'meter-wrap';
  wrap.id = id;
  wrap.style.display = 'none';
  const lbl = document.createElement('div');
  lbl.className = 'meter-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  const fill = document.createElement('div');
  fill.className = 'meter-fill';
  wrap.appendChild(fill);
  document.body.appendChild(wrap);
  return { wrap, fill };
}

const sprintMeter = createMeter('sprint-meter', '>> SPRINT');
const jumpMeter = createMeter('jump-meter', '^ JUMP');

function updateMeters() {
  // Sprint meter
  sprintMeter.wrap.style.display = gameStarted ? '' : 'none';
  const sprintPct = sprintStamina / SPRINT_DURATION;
  sprintMeter.fill.style.width = (sprintPct * 100) + '%';
  sprintMeter.fill.style.backgroundColor = sprintExhausted ? '#cc2222' : '#22cc44';

  // Jump meter
  jumpMeter.wrap.style.display = gameStarted ? '' : 'none';
  if (jumpCooldownTimer > 0) {
    const cdProgress = (jumpCooldownMax > 0) ? (jumpCooldownTimer / jumpCooldownMax) : 0; // 1 -> 0
    jumpMeter.fill.style.width = (jumpCooldownStartPct * cdProgress * 100) + '%';
    jumpMeter.fill.style.backgroundColor = '#cc2222';
  } else if (isChargingJump) {
    const chargePct = (jumpCharge - 1) / (MAX_CHARGE_MULT - 1);
    jumpMeter.fill.style.width = (chargePct * 100) + '%';
    jumpMeter.fill.style.backgroundColor = '#22cc44';
  } else {
    jumpMeter.fill.style.width = '0%';
    jumpMeter.fill.style.backgroundColor = '#22cc44';
  }
}

// --- Level select system ---
let selectedLevel = null;
let serverActiveLevel = 'level_1.glb';
const levelPreviews = [];
let previewsActive = false;

async function initLevelSelect() {
  try {
    const [levelsRes, stateRes] = await Promise.all([
      fetch('/api/levels').then(r => r.json()),
      fetch('/api/game-state').then(r => r.json())
    ]);

    serverActiveLevel = stateRes.activeLevel;
    selectedLevel = serverActiveLevel;

    const selectDiv = document.getElementById('level-select');
    if (!selectDiv) return;

    if (stateRes.playerCount > 0) {
      selectDiv.style.display = 'none';
      return;
    }

    if (levelsRes.length <= 1) {
      selectDiv.style.display = 'none';
      selectedLevel = levelsRes[0] || 'level_1.glb';
      return;
    }

    selectDiv.style.display = 'block';
    selectDiv.innerHTML = '<h2>SELECT LEVEL</h2><div class="level-grid"></div>';
    const grid = selectDiv.querySelector('.level-grid');

    for (const filename of levelsRes) {
      const preview = createLevelPreview(filename, grid);
      levelPreviews.push(preview);

      preview.wrapper.addEventListener('click', () => {
        selectedLevel = filename;
        for (const p of levelPreviews) {
          p.wrapper.classList.toggle('selected', p.filename === filename);
        }
      });

      if (filename === selectedLevel) {
        preview.wrapper.classList.add('selected');
      }
    }

    previewsActive = true;
    animatePreviews();
  } catch (e) {
    console.error('Level select init failed:', e);
    selectedLevel = 'level_1.glb';
  }
}

function createLevelPreview(filename, container) {
  const canvas = document.createElement('canvas');
  canvas.width = 220;
  canvas.height = 160;

  const pRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  pRenderer.setSize(220, 160);

  const pScene = new THREE.Scene();
  pScene.background = new THREE.Color(0x1a1a2e);
  const pCamera = new THREE.PerspectiveCamera(50, 220 / 160, 0.1, 10000);

  pScene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const pDirLight = new THREE.DirectionalLight(0xfff4e0, 1.2);
  pDirLight.position.set(1, 2, 1);
  pScene.add(pDirLight);
  pScene.add(new THREE.HemisphereLight(0x87ceeb, 0x553322, 0.4));

  let levelGroup = null;

  const pLoader = new THREE.GLTFLoader();
  pLoader.load('/levels/' + filename, (gltf) => {
    levelGroup = gltf.scene;
    pScene.add(levelGroup);

    const box = new THREE.Box3().setFromObject(levelGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    levelGroup.position.sub(center);

    const fov = pCamera.fov * (Math.PI / 180);
    const camDist = (maxDim / (2 * Math.tan(fov / 2))) * 1.4;
    pCamera.position.set(0, maxDim * 0.3, camDist);
    pCamera.lookAt(0, 0, 0);
    pCamera.far = camDist * 4;
    pCamera.updateProjectionMatrix();
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'level-card';
  wrapper.appendChild(canvas);
  const label = document.createElement('div');
  label.className = 'level-label';
  label.textContent = filename.replace('.glb', '').replace(/_/g, ' ');
  wrapper.appendChild(label);
  container.appendChild(wrapper);

  return { renderer: pRenderer, scene: pScene, camera: pCamera, getGroup: () => levelGroup, wrapper, filename };
}

function animatePreviews() {
  if (!previewsActive) return;
  requestAnimationFrame(animatePreviews);
  for (const p of levelPreviews) {
    const g = p.getGroup();
    if (g) g.rotation.y += 0.003;
    p.renderer.render(p.scene, p.camera);
  }
}

function cleanupPreviews() {
  previewsActive = false;
  for (const p of levelPreviews) {
    p.renderer.dispose();
  }
  levelPreviews.length = 0;
}

initLevelSelect();

// --- Score sprite for leader ---
function createScoreSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.5, 0.35, 1);
  sprite.renderOrder = 999;
  sprite.visible = false;
  sprite.userData.canvas = canvas;
  sprite.userData.ctx = ctx;
  return sprite;
}

function updateScoreSpriteText(sprite, score) {
  const canvas = sprite.userData.canvas;
  const ctx = sprite.userData.ctx;
  ctx.clearRect(0, 0, 128, 32);
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeText(String(score), 64, 24);
  ctx.fillText(String(score), 64, 24);
  sprite.material.map.needsUpdate = true;
}

const playerScoreSprites = new Map();
let localScoreSprite = null;

// --- Mobile controls ---
if (isMobile) {
  hud.textContent = 'Drag joystick to move · Tap JUMP';

  const joystickBase = document.createElement('div');
  joystickBase.id = 'joystick-base';
  const joystickKnob = document.createElement('div');
  joystickKnob.id = 'joystick-knob';
  joystickBase.appendChild(joystickKnob);
  document.body.appendChild(joystickBase);

  const jumpBtn = document.createElement('div');
  jumpBtn.id = 'jump-btn';
  jumpBtn.textContent = 'JUMP';
  document.body.appendChild(jumpBtn);

  jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys['Space'] = true; });
  jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); keys['Space'] = false; });

  let joystickTouchId = null;
  const JOYSTICK_RADIUS = 50;

  joystickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickTouchId = e.changedTouches[0].identifier;
    updateJoystick(e.changedTouches[0]);
    const now = performance.now();
    if (now - lastJoystickTap < 300) {
      mobileSprinting = true;
    }
    lastJoystickTap = now;
  });
  window.addEventListener('touchmove', (e) => {
    if (joystickTouchId === null) return;
    const t = findTouch(e.touches, joystickTouchId);
    if (!t) return;
    e.preventDefault();
    updateJoystick(t);
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    if (!findTouch(e.changedTouches, joystickTouchId)) return;
    joystickTouchId = null;
    joystickKnob.style.transform = 'translate(-50%, -50%)';
    joystickX = 0; joystickZ = 0;
    mobileSprinting = false;
  });

  function findTouch(touches, id) {
    for (let i = 0; i < touches.length; i++) if (touches[i].identifier === id) return touches[i];
    return null;
  }

  function updateJoystick(touch) {
    const rect = joystickBase.getBoundingClientRect();
    let dx = touch.clientX - (rect.left + rect.width / 2);
    let dy = touch.clientY - (rect.top + rect.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_RADIUS) { dx = (dx / dist) * JOYSTICK_RADIUS; dy = (dy / dist) * JOYSTICK_RADIUS; }
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const rawX = dx / JOYSTICK_RADIUS, rawZ = dy / JOYSTICK_RADIUS;
    const mag = Math.sqrt(rawX * rawX + rawZ * rawZ);
    joystickX = mag < JOYSTICK_DEADZONE ? 0 : rawX;
    joystickZ = mag < JOYSTICK_DEADZONE ? 0 : rawZ;
  }
} else {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'Tab') e.preventDefault();
    if (e.altKey || e.code.startsWith('F')) {
      if (document.pointerLockElement) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Name label sprite ---
function createNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.roundRect(28, 4, 200, 44, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 128, 38);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2, 0.5, 1);
  return sprite;
}

// --- Crown sprite for leader (big, always visible) ---
function createCrownSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '96px serif';
  ctx.textAlign = 'center';
  ctx.fillText('\u{1F451}', 128, 100);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2, 1, 1);
  sprite.renderOrder = 999;
  sprite.visible = false;
  return sprite;
}

function updateCrownScale(crown, playerPos) {
  if (!crown || !crown.visible) return;
  const dist = camera.position.distanceTo(playerPos);
  const s = Math.max(2, dist * 0.15);
  crown.scale.set(s, s * 0.5, 1);
}

// --- Outline mesh for "it" player ---
function createOutlineMesh(sourceMesh) {
  const geo = sourceMesh.geometry.clone();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.BackSide
  });
  const outline = new THREE.Mesh(geo, mat);
  outline.scale.multiplyScalar(1.15);
  outline.visible = false;
  return outline;
}

// --- Player geometry by shape ---
function createShapeGeo(shape) {
  switch (shape) {
    case 'roundcube': return new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
    case 'sphere': return new THREE.SphereGeometry(0.5, 24, 24);
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

function createRoundcubePhysicsShape(smoothing) {
  if (smoothing < 0.75) {
    const s = 0.5 * (1 - smoothing * 0.3);
    return new CANNON.Box(new CANNON.Vec3(s, s, s));
  }
  const r = 0.5 * (0.85 + smoothing * 0.15);
  return new CANNON.Sphere(r);
}

function createPhysicsShape(shape) {
  switch (shape) {
    case 'sphere': return new CANNON.Sphere(0.5);
    case 'cylinder': return new CANNON.Cylinder(0.5, 0.5, 1, 16);
    case 'roundcube': return createRoundcubePhysicsShape(roundcubeSmoothing);
    default: return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
  }
}

let roundcubeSmoothing = 0.25;
function smoothRoundcube(geo, smoothingVal = roundcubeSmoothing) {
  const pos = geo.attributes.position;
  const box = new THREE.Vector3();
  const sphere = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    box.fromBufferAttribute(pos, i);
    sphere.copy(box).normalize().multiplyScalar(0.5);
    box.lerp(sphere, smoothingVal);
    pos.setXYZ(i, box.x, box.y, box.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createPlayerVisual(color, shape, name, skinImage) {
  const group = new THREE.Group();

  let geo = createShapeGeo(shape);
  if (shape === 'roundcube') geo = smoothRoundcube(geo);

  let mat;
  if (skinImage) {
    const tex = new THREE.TextureLoader().load(skinImage);
    mat = new THREE.MeshStandardMaterial({ map: tex });
  } else {
    mat = new THREE.MeshStandardMaterial({ color });
  }

  const mesh = new THREE.Mesh(geo, mat);
  if (shape === 'roundcube') mesh.userData.smoothing = 0.25;
  mesh.castShadow = true;
  group.add(mesh);

  const outline = createOutlineMesh(mesh);
  mesh.add(outline);

  const label = createNameSprite(name);
  label.position.y = 1.2;
  group.add(label);

  const scoreSprite = createScoreSprite();
  scoreSprite.position.y = 1.55;
  group.add(scoreSprite);

  const crown = createCrownSprite();
  crown.position.y = 2.1;
  group.add(crown);

  scene.add(group);
  return { group, mesh, outline, crown, scoreSprite };
}

function createPlayerBody(shape, isLocal) {
  const angDamp = (shape === 'sphere' || shape === 'cylinder') ? 0.6 : 0.05;
  const body = new CANNON.Body({
    mass: isLocal ? 1 : 0,
    material: playerMaterial,
    shape: createPhysicsShape(shape),
    linearDamping: 0.1,
    angularDamping: angDamp
  });
  world.addBody(body);
  return body;
}

// --- Ball morph (animated roundcube → sphere transition) ---
function updateSprintMorph() {
  if (!localMesh || playerShape !== 'roundcube') return;

  const targetSmoothing = originalSmoothing + (1 - originalSmoothing) * sprintMorphT;
  roundcubeSmoothing = targetSmoothing;

  const oldGeo = localMesh.geometry;
  let geo = new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
  geo = smoothRoundcube(geo);
  localMesh.geometry = geo;
  oldGeo.dispose();
  const outline = localMesh.children.find(c => c.isMesh);
  if (outline) {
    const oldOutGeo = outline.geometry;
    outline.geometry = geo.clone();
    oldOutGeo.dispose();
  }

  const shouldBeSphere = roundcubeSmoothing >= 0.75;
  if (shouldBeSphere && !morphedPhysicsToSphere) {
    morphedPhysicsToSphere = true;
    rebuildSprintPhysics();
  } else if (!shouldBeSphere && morphedPhysicsToSphere) {
    morphedPhysicsToSphere = false;
    rebuildSprintPhysics();
  }
}

function rebuildSprintPhysics() {
  if (!localBody) return;
  const pos = localBody.position.clone();
  const vel = localBody.velocity.clone();
  const angVel = localBody.angularVelocity.clone();
  const quat = localBody.quaternion.clone();
  world.removeBody(localBody);
  const isSpherePhysics = roundcubeSmoothing >= 0.75;
  localBody = new CANNON.Body({
    mass: godmode ? 0 : 1,
    material: playerMaterial,
    shape: createRoundcubePhysicsShape(roundcubeSmoothing),
    linearDamping: 0.1,
    angularDamping: isSpherePhysics ? 0.6 : 0.05
  });
  localBody.position.copy(pos);
  localBody.velocity.copy(vel);
  localBody.angularVelocity.copy(angVel);
  localBody.quaternion.copy(quat);
  world.addBody(localBody);
}

// --- Ground check ---
function checkGrounded() {
  return rayGrounded;
}

// --- Movement ---
function handleMovement(delta) {
  if (!localBody) return;

  let inputX = 0, inputZ = 0;
  if (isMobile) { inputX = joystickX; inputZ = joystickZ; }
  else {
    if (keys['KeyW']) inputZ -= 1;
    if (keys['KeyS']) inputZ += 1;
    if (keys['KeyA']) inputX -= 1;
    if (keys['KeyD']) inputX += 1;
  }

  const inputLen = Math.sqrt(inputX * inputX + inputZ * inputZ);
  const grounded = checkGrounded();

  // Sprint stamina
  const wantsSprint = keys['ShiftLeft'] || keys['ShiftRight'] || mobileSprinting;
  const sprinting = wantsSprint && !sprintExhausted && inputLen > 0;

  if (sprinting && !wasSprinting) {
    playWorldSound(boostSound, localBody.position, 0.4);
    socket.emit('sprintStart');
  }
  wasSprinting = sprinting;

  if (sprinting) {
    sprintStamina -= delta;
    if (sprintStamina <= 0) {
      sprintStamina = 0;
      sprintExhausted = true;
    }
  } else {
    const refillRate = SPRINT_DURATION / SPRINT_REFILL_TIME;
    sprintStamina = Math.min(SPRINT_DURATION, sprintStamina + refillRate * delta);
    if (sprintExhausted && sprintStamina >= SPRINT_DURATION) {
      sprintExhausted = false;
    }
  }

  // Animated ball morph while sprinting (roundcube only)
  const wantBall = sprinting && inputLen > 0;
  if (playerShape === 'roundcube') {
    const prevT = sprintMorphT;
    if (wantBall && sprintMorphT < 1) {
      sprintMorphT = Math.min(1, sprintMorphT + 3 * delta);
    } else if (!wantBall && sprintMorphT > 0) {
      sprintMorphT = Math.max(0, sprintMorphT - 3 * delta);
    }
    if (sprintMorphT !== prevT) updateSprintMorph();
  }

  // Smooth speed cap transition
  const targetCap = sprinting ? SPRINT_SPEED : MAX_SPEED;
  speedCapCurrent += (targetCap - speedCapCurrent) * Math.min(1, 2.5 * delta);

  if (inputLen > 0) {
    const inputMag = Math.min(inputLen, 1);
    const nx = inputX / inputLen;
    const nz = inputZ / inputLen;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const worldX = right.x * nx + forward.x * (-nz);
    const worldZ = right.z * nx + forward.z * (-nz);

    const force = sprinting ? SPRINT_FORCE : MOVE_FORCE;

    localBody.applyForce(new CANNON.Vec3(worldX * force * inputMag, 0, worldZ * force * inputMag), localBody.position);
  }

  // Always apply gradual speed cap
  const vx = localBody.velocity.x, vz = localBody.velocity.z;
  const hSpeed = Math.sqrt(vx * vx + vz * vz);
  if (hSpeed > speedCapCurrent) {
    localBody.velocity.x = (vx / hSpeed) * speedCapCurrent;
    localBody.velocity.z = (vz / hSpeed) * speedCapCurrent;
  }

  // Jump cooldown tick
  if (jumpCooldownTimer > 0) {
    jumpCooldownTimer -= delta;
    if (jumpCooldownTimer < 0) jumpCooldownTimer = 0;
  }

  // Track coyote time
  const now = performance.now() / 1000;
  if (grounded) lastGroundedTime = now;
  const timeSinceGrounded = now - lastGroundedTime;
  const canJump = timeSinceGrounded < COYOTE_TIME;

  // Charge whenever space is held and jump is not on cooldown
  if (keys['Space'] && jumpCooldownTimer <= 0) {
    if (!isChargingJump) {
      isChargingJump = true;
      jumpCharge = 1;
    }
    jumpCharge = Math.min(jumpCharge + CHARGE_RATE * delta, MAX_CHARGE_MULT);
  }

  // Jump fires ONLY on space release, and resets charge
  if (!keys['Space'] && isChargingJump) {
    // Only jump if we are on the ground or within coyote time window
    if (canJump) {
      localBody.velocity.y = JUMP_IMPULSE * jumpCharge;
      // Cooldown duration is proportional to jump charge (1s per 1x).
      // The bar starts at a width proportional to charge and shrinks at a constant rate.
      jumpCooldownMax = jumpCharge;
      jumpCooldownTimer = jumpCharge;
      jumpCooldownStartPct = jumpCharge / MAX_CHARGE_MULT;
      playRandomJumpSound(localBody.position);
      socket.emit('jump');
    }
    // Reset charge regardless of success (i.e. if you release in mid-air)
    isChargingJump = false;
    jumpCharge = 0;
  }

  // Tag cooldown tick
  if (tagCooldownTimer > 0) tagCooldownTimer -= delta;

  // Auto-tag: if holder bumps into another player (respect cooldown)
  if (holderID === selfId && tagCooldownTimer <= 0) {
    for (const [id, group] of remotePlayers) {
      const dx = localBody.position.x - group.position.x;
      const dy = localBody.position.y - group.position.y;
      const dz = localBody.position.z - group.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < TAG_DISTANCE) {
        socket.emit('tagPlayer', id);
        break;
      }
    }
  }
}

function syncMeshToBody(group, mesh, body) {
  group.position.copy(body.position);
  mesh.quaternion.copy(body.quaternion);
}

// --- Camera ---
let BASE_CHAIN_LENGTH = 10;
let chainLength = BASE_CHAIN_LENGTH;
let camHeight = 5.8;
let camYaw = Math.PI;
let camPitch = 0.4;
const CAM_PITCH_MIN = -0.3;
const CAM_PITCH_MAX = 1.2;
const MOUSE_SENSITIVITY = 0.003;
const CAM_DRAG_SPEED = 1.8;
let lastMouseMoveTime = 0;
const MOUSE_IDLE_DELAY = 0.6;
let cameraLookAtTarget = new THREE.Vector3();

let mouseDragging = false;
let pointerLockSupported = false;

renderer.domElement.addEventListener('click', () => {
  if (!pointerLockSupported) return;
  if (godmode) return;
  renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) pointerLockSupported = true;
});
document.addEventListener('pointerlockerror', () => {
  pointerLockSupported = false;
});

renderer.domElement.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement === renderer.domElement) return;
  if (godmode) {
    if (e.button === 2) mouseDragging = true;
    return;
  }
  if (e.button === 0 || e.button === 2) mouseDragging = true;
});
window.addEventListener('mouseup', () => { mouseDragging = false; });

document.addEventListener('mousemove', (e) => {
  const hasLock = document.pointerLockElement === renderer.domElement;
  if (!hasLock && !mouseDragging) return;
  lastMouseMoveTime = performance.now() / 1000;

  if (godmode) {
    camera.rotation.order = 'YXZ';
    camera.rotation.y -= e.movementX * MOUSE_SENSITIVITY;
    camera.rotation.x -= e.movementY * MOUSE_SENSITIVITY;
    camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
    camera.rotation.z = 0;
  } else {
    camYaw -= e.movementX * MOUSE_SENSITIVITY;
    camPitch += e.movementY * MOUSE_SENSITIVITY;
    camPitch = Math.max(CAM_PITCH_MIN, Math.min(CAM_PITCH_MAX, camPitch));
  }
});

window.addEventListener('wheel', (e) => {
  if (!gameStarted || godmode) return;
  BASE_CHAIN_LENGTH += e.deltaY * 0.005;
  BASE_CHAIN_LENGTH = Math.max(2, Math.min(20, BASE_CHAIN_LENGTH));
}, { passive: true });

// --- Spawn point editor ---
const spawnDiamondGeo = new THREE.OctahedronGeometry(0.4, 0);
const spawnDiamondMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00aa88, emissiveIntensity: 0.6 });
const spawnClickRaycaster = new THREE.Raycaster();
const spawnClickNDC = new THREE.Vector2();

function createSpawnMarker(pt) {
  const diamond = new THREE.Mesh(spawnDiamondGeo, spawnDiamondMat.clone());
  diamond.position.set(pt.x, pt.y + 1.5, pt.z);
  diamond.scale.set(1, 1.5, 1);
  diamond.userData.spawnPoint = pt;
  scene.add(diamond);
  spawnMarkers.push(diamond);
  return diamond;
}

function showSpawnMarkers() {
  for (const sp of SPAWN_POINTS) {
    createSpawnMarker(sp);
  }
}

function hideSpawnMarkers() {
  for (const m of spawnMarkers) {
    scene.remove(m);
  }
  spawnMarkers.length = 0;
}

renderer.domElement.addEventListener('click', (e) => {
  if (!godmode) return;

  const now = performance.now() / 1000;

  spawnClickNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  spawnClickNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  spawnClickRaycaster.setFromCamera(spawnClickNDC, camera);
  spawnClickRaycaster.far = 500;

  // Check if clicking on an existing spawn marker to remove it
  const markerHits = spawnClickRaycaster.intersectObjects(spawnMarkers, false);
  if (markerHits.length > 0) {
    const hitMarker = markerHits[0].object;
    const sp = hitMarker.userData.spawnPoint;
    SPAWN_POINTS = SPAWN_POINTS.filter(p => p !== sp);
    scene.remove(hitMarker);
    const idx = spawnMarkers.indexOf(hitMarker);
    if (idx !== -1) spawnMarkers.splice(idx, 1);
    console.log(`REMOVED SPAWN POINT: { x: ${sp.x.toFixed(2)}, y: ${sp.y.toFixed(2)}, z: ${sp.z.toFixed(2)} } — ${SPAWN_POINTS.length} remaining`);
    return;
  }

  // Cooldown for placement
  if (now - spawnClickCooldown < 0.5) return;
  spawnClickCooldown = now;

  // Place new spawn point
  const hits = spawnClickRaycaster.intersectObjects(levelMeshes, false);
  if (hits.length === 0) return;
  const pt = hits[0].point;
  const newSp = { x: parseFloat(pt.x.toFixed(2)), y: parseFloat(pt.y.toFixed(2)), z: parseFloat(pt.z.toFixed(2)) };
  SPAWN_POINTS.push(newSp);
  createSpawnMarker(newSp);
  console.log(`SPAWN POINT ADDED: { x: ${newSp.x}, y: ${newSp.y}, z: ${newSp.z} } — ${SPAWN_POINTS.length} total`);
});

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

function updateCamera(delta) {
  if (godmode || !localPlayer) return;

  let playerSpeed = 0;
  if (localBody) {
    const vx = localBody.velocity.x;
    const vz = localBody.velocity.z;
    playerSpeed = Math.sqrt(vx * vx + vz * vz);
    const now = performance.now() / 1000;
    const mouseIdle = (now - lastMouseMoveTime) > MOUSE_IDLE_DELAY;

    if (playerSpeed > 1.5 && mouseIdle) {
      const behindYaw = Math.atan2(vx, vz) + Math.PI;
      let diff = behindYaw - camYaw;
      diff = diff - Math.round(diff / (2 * Math.PI)) * 2 * Math.PI;
      camYaw += diff * CAM_DRAG_SPEED * delta;
    }
  }

  // Sprint camera pull-away: chain extends with speed, giving a "catching up" feel
  const speedExtra = Math.max(0, playerSpeed - MAX_SPEED) * 0.4;
  const targetChain = BASE_CHAIN_LENGTH + speedExtra;
  chainLength += (targetChain - chainLength) * Math.min(1, 2 * delta);
  camHeight = chainLength * 0.58;

  const offsetX = Math.sin(camYaw) * Math.cos(camPitch) * chainLength;
  const offsetZ = Math.cos(camYaw) * Math.cos(camPitch) * chainLength;
  const offsetY = Math.sin(camPitch) * chainLength;

  // Frame-rate independent exponential smoothing
  // Slower follow when sprinting = camera lags behind, feels like it's catching up
  const speedFactor = Math.min(1, playerSpeed / SPRINT_SPEED);
  const baseLerp = 1 - Math.exp(-6 * delta);
  const camLerp = baseLerp * (1 - speedFactor * 0.4);

  // Smoothly move the look-at target towards the player's head
  const lookAtTargetPos = new THREE.Vector3().copy(localPlayer.position).add(new THREE.Vector3(0, 1.0, 0));
  const lookAtLerp = 1 - Math.exp(-15 * delta); // A fairly snappy but smooth lerp
  cameraLookAtTarget.lerp(lookAtTargetPos, lookAtLerp);

  // Base the camera's target position on the smoothed look-at point, not the raw player position.
  // This prevents camera bobbing from physics ground jitter.
  const targetX = localPlayer.position.x + offsetX;
  const targetY = cameraLookAtTarget.y + 0.5 + offsetY;
  const targetZ = localPlayer.position.z + offsetZ;

  const desiredPos = new THREE.Vector3(targetX, targetY, targetZ);

  // Camera wall collision — pull camera closer if environment is between player and camera
  const camOrigin = new THREE.Vector3().copy(cameraLookAtTarget);
  const camDir = new THREE.Vector3().subVectors(desiredPos, camOrigin);
  const camDist = camDir.length();
  if (camDist > 0.1) {
    camDir.normalize();
    const camHit = raycastLevel(camOrigin, camDir, camDist);
    if (camHit) {
      const safeDist = Math.max(0.5, camHit.distance - 0.3);
      desiredPos.copy(camOrigin).addScaledVector(camDir, safeDist);
    }
  }

  camera.position.lerp(desiredPos, camLerp);
  camera.lookAt(cameraLookAtTarget);
}

// --- Oddball visuals ---
const playerCrowns = new Map();
const playerOutlines = new Map();
let localCrown = null;
let localOutline = null;

function updateOddballVisuals() {
  // Update outlines — only holder has outline
  if (localOutline) localOutline.visible = (holderID === selfId);
  for (const [id, outline] of playerOutlines) {
    outline.visible = (id === holderID);
  }

  // Update crowns — only leader has crown
  if (localCrown) localCrown.visible = (leaderID === selfId);
  for (const [id, crown] of playerCrowns) {
    crown.visible = (id === leaderID);
  }

  // Update score sprites — only leader shows score above head
  if (localScoreSprite) {
    localScoreSprite.visible = (leaderID === selfId);
    if (leaderID === selfId) updateScoreSpriteText(localScoreSprite, allScores[selfId] || 0);
  }
  for (const [id, ss] of playerScoreSprites) {
    ss.visible = (id === leaderID);
    if (id === leaderID) updateScoreSpriteText(ss, allScores[id] || 0);
  }

  // Update leader display
  if (leaderID && allScores[leaderID] > 0) {
    const leaderName = getPlayerName(leaderID);
    const score = allScores[leaderID] || 0;
    leaderDisplay.innerHTML = `<span class="crown">\u{1F451}</span> ${leaderName}: ${score}`;
    leaderDisplay.style.display = '';
  }
}

function getPlayerName(id) {
  if (id === selfId) return playerName;
  return playerNames.get(id) || 'Player';
}

const playerNames = new Map();

function findLeader() {
  let maxScore = 0;
  leaderID = null;
  for (const [id, score] of Object.entries(allScores)) {
    if (score > maxScore) { maxScore = score; leaderID = id; }
  }
}

// --- Tag cooldown strobe ---
function updateTagStrobe() {
  if (tagCooldownTimer <= 0) return;

  const t = performance.now() * 0.012;
  const r = Math.sin(t) * 0.5 + 0.5;
  const g = Math.sin(t + 2.1) * 0.5 + 0.5;
  const b = Math.sin(t + 4.2) * 0.5 + 0.5;

  // Strobe the holder's outline
  if (holderID === selfId && localOutline) {
    localOutline.visible = true;
    localOutline.material.color.setRGB(r, g, b);
  }
  for (const [id, outline] of playerOutlines) {
    if (id === holderID) {
      outline.visible = true;
      outline.material.color.setRGB(r, g, b);
    }
  }
}

function resetOutlineColors() {
  if (localOutline) localOutline.material.color.set(0xffffff);
  for (const [id, outline] of playerOutlines) {
    outline.material.color.set(0xffffff);
  }
}

// --- Crown distance scaling ---
function scaleLeaderSprites(playerPos, nameSprite, scoreSprite, crown) {
  const dist = camera.position.distanceTo(playerPos);
  const s = Math.max(2, dist * 0.15);
  if (crown && crown.visible) crown.scale.set(s, s * 0.5, 1);
  if (nameSprite) nameSprite.scale.set(s, s * 0.25, 1);
  if (scoreSprite && scoreSprite.visible) scoreSprite.scale.set(s * 0.75, s * 0.2, 1);
}

function resetLabelScale(nameSprite) {
  if (nameSprite) nameSprite.scale.set(2, 0.5, 1);
}

function updateCrowns() {
  // Scale leader's name, score, crown with distance. Reset non-leaders to default.
  if (localPlayer) {
    const nameLabel = localPlayer.children.find(c => c.isSprite && c !== localCrown && c !== localScoreSprite);
    if (leaderID === selfId) {
      scaleLeaderSprites(localPlayer.position, nameLabel, localScoreSprite, localCrown);
    } else {
      resetLabelScale(nameLabel);
    }
  }
  for (const [id, group] of remotePlayers) {
    const crown = playerCrowns.get(id);
    const ss = playerScoreSprites.get(id);
    const nameLabel = group.children.find(c => c.isSprite && c !== crown && c !== ss);
    if (id === leaderID) {
      scaleLeaderSprites(group.position, nameLabel, ss, crown);
    } else {
      resetLabelScale(nameLabel);
    }
  }
}

// --- Networking ---
const socket = io();

function startGame() {
  socket.emit('setType', isMobile ? 'ball' : playerShape);
  socket.emit('setName', playerName);
  socket.emit('setAppearance', { shape: playerShape, skinColor: playerColor, skinImage: playerSkinImage });
  socket.emit('ready');
}

socket.on('currentPlayers', (data) => {
  selfId = data.selfId;
  for (const [id, info] of Object.entries(data.players)) {
    const shape = info.shape || info.type || 'box';
    const color = info.skinColor || info.color;
    const { group, mesh, outline, crown, scoreSprite } = createPlayerVisual(color, shape, info.name, info.skinImage);
    group.position.set(info.x, info.y, info.z);
    if (id === selfId) {
      localPlayer = group;
      localMesh = mesh;
      localOutline = outline;
      localCrown = crown;
      localScoreSprite = scoreSprite;
      localBody = createPlayerBody(shape, true);
      localBody.position.set(info.x, info.y, info.z);
      camera.position.set(group.position.x, group.position.y + camHeight, group.position.z + chainLength);
      cameraLookAtTarget.copy(localBody.position);
    } else {
      remotePlayers.set(id, group);
      remoteMeshes.set(id, mesh);
      playerOutlines.set(id, outline);
      playerCrowns.set(id, crown);
      playerScoreSprites.set(id, scoreSprite);
      playerNames.set(id, info.name);
    }
  }
});

socket.on('newPlayer', (data) => {
  const shape = data.shape || data.type || 'box';
  const color = data.skinColor || data.color;
  const { group, mesh, outline, crown, scoreSprite } = createPlayerVisual(color, shape, data.name, data.skinImage);
  group.position.set(data.x, data.y, data.z);
  remotePlayers.set(data.id, group);
  remoteMeshes.set(data.id, mesh);
  playerOutlines.set(data.id, outline);
  playerCrowns.set(data.id, crown);
  playerScoreSprites.set(data.id, scoreSprite);
  playerNames.set(data.id, data.name);
});

const remoteTargets = new Map();

socket.on('playerJumped', (id) => {
  const playerGroup = remotePlayers.get(id);
  if (playerGroup) {
    playRandomJumpSound(playerGroup.position);
  }
});

socket.on('playerSprintStart', (id) => {
  const playerGroup = remotePlayers.get(id);
  if (playerGroup) {
    playWorldSound(boostSound, playerGroup.position, 0.4);
  }
});

socket.on('playerMoved', (data) => {
  if (remotePlayers.has(data.id)) remoteTargets.set(data.id, data);
});

socket.on('playerDisconnected', (id) => {
  const group = remotePlayers.get(id);
  if (group) {
    scene.remove(group);
    remotePlayers.delete(id);
    remoteMeshes.delete(id);
    remoteTargets.delete(id);
    playerOutlines.delete(id);
    playerCrowns.delete(id);
    playerScoreSprites.delete(id);
    playerNames.delete(id);
  }
});

socket.on('holderChanged', (id) => {
  holderID = id;
  updateOddballVisuals();
});

socket.on('tagCooldown', (ms) => {
  tagCooldownTimer = ms / 1000;
  resetOutlineColors();
});

socket.on('scores', (s) => {
  allScores = s;
  findLeader();
  updateOddballVisuals();
});

socket.on('levelChanged', (level) => {
  if (gameStarted) loadGameLevel(level);
});

function sendPosition() {
  if (!localBody) return;
  const p = localBody.position;
  const q = localBody.quaternion;
  socket.emit('playerMoved', { x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, smoothing: roundcubeSmoothing });
}

// --- Godmode / Noclip ---
let godmode = false;
const godCamSpeed = 40;

function handleGodmode(delta) {
  let mx = 0, my = 0, mz = 0;
  if (keys['KeyW']) mz -= 1;
  if (keys['KeyS']) mz += 1;
  if (keys['KeyA']) mx -= 1;
  if (keys['KeyD']) mx += 1;
  if (keys['Space'] || keys['KeyE']) my += 1;
  if (keys['KeyQ'] || keys['ShiftLeft'] || keys['ShiftRight']) my -= 1;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  camera.position.x += (right.x * mx + forward.x * (-mz)) * godCamSpeed * delta;
  camera.position.y += my * godCamSpeed * delta;
  camera.position.z += (right.z * mx + forward.z * (-mz)) * godCamSpeed * delta;

  if (keys['ArrowLeft']) camera.rotation.y += 2 * delta;
  if (keys['ArrowRight']) camera.rotation.y -= 2 * delta;
  if (keys['ArrowUp']) camera.rotation.x += 1.5 * delta;
  if (keys['ArrowDown']) camera.rotation.x -= 1.5 * delta;

  camera.rotation.z = 0;
}

// --- Debug HUD ---
let debugVisible = false;
const debugEl = document.createElement('div');
debugEl.id = 'debug-hud';
debugEl.style.cssText = 'position:absolute;top:10px;right:10px;color:#0f0;font:12px monospace;background:rgba(0,0,0,0.6);padding:8px 12px;border-radius:4px;white-space:pre;display:none;pointer-events:none;';
document.body.appendChild(debugEl);

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();
    debugVisible = !debugVisible;
    debugEl.style.display = debugVisible ? '' : 'none';
    gimbal.visible = debugVisible;
  }
  if (e.code === 'F4' && gameStarted) {
    e.preventDefault();
    godmode = !godmode;
    if (godmode && localBody) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const yaw = Math.atan2(-dir.x, -dir.z);
      const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
      localBody.mass = 0;
      localBody.updateMassProperties();
      // Show spawn markers
      showSpawnMarkers();
      // Exit pointer lock so clicks work for spawn editing
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (!godmode && localBody) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const spawnDist = 5;
      localBody.position.set(
        camera.position.x + dir.x * spawnDist,
        camera.position.y + dir.y * spawnDist,
        camera.position.z + dir.z * spawnDist
      );
      localBody.velocity.set(0, 0, 0);
      localBody.angularVelocity.set(0, 0, 0);
      localBody.mass = 1;
      localBody.updateMassProperties();
      camera.rotation.order = 'XYZ';
      camera.up.set(0, 1, 0);
      camera.quaternion.identity();
      camera.rotation.set(0, 0, 0);
      const toPlayer = new THREE.Vector3().subVectors(localPlayer.position, camera.position);
      camYaw = Math.atan2(toPlayer.x, toPlayer.z);
      camPitch = 0.4;
      // Hide spawn markers
      hideSpawnMarkers();
    }
  }
  if (e.code === 'BracketRight') { BASE_CHAIN_LENGTH = Math.min(20, BASE_CHAIN_LENGTH + 0.5); }
  if (e.code === 'BracketLeft') { BASE_CHAIN_LENGTH = Math.max(2, BASE_CHAIN_LENGTH - 0.5); }
  if (e.code === 'Comma' && playerShape === 'roundcube' && localMesh) {
    roundcubeSmoothing = Math.max(0, roundcubeSmoothing - 0.05);
    originalSmoothing = roundcubeSmoothing;
    rebuildLocalRoundcube();
  }
  if (e.code === 'Period' && playerShape === 'roundcube' && localMesh) {
    roundcubeSmoothing = Math.min(1, roundcubeSmoothing + 0.05);
    originalSmoothing = roundcubeSmoothing;
    rebuildLocalRoundcube();
  }
  if (debugVisible) {
    if (e.code === 'PageUp') {
      musicVolume = Math.min(1, musicVolume + 0.1);
      music.volume = musicVolume;
    } else if (e.code === 'PageDown') {
      musicVolume = Math.max(0, musicVolume - 0.1);
      music.volume = musicVolume;
    }
  }
});

function rebuildLocalRoundcube() {
  if (!localMesh) return;
  const oldGeo = localMesh.geometry;
  let geo = new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
  geo = smoothRoundcube(geo);
  localMesh.geometry = geo;
  oldGeo.dispose();
  const outline = localMesh.children.find(c => c.isMesh);
  if (outline) {
    const oldOutGeo = outline.geometry;
    outline.geometry = geo.clone();
    oldOutGeo.dispose();
  }
  if (localBody) {
    const pos = localBody.position.clone();
    const vel = localBody.velocity.clone();
    const angVel = localBody.angularVelocity.clone();
    const quat = localBody.quaternion.clone();
    world.removeBody(localBody);
    const isSpherePhysics = roundcubeSmoothing >= 0.75;
    localBody = new CANNON.Body({
      mass: 1,
      material: playerMaterial,
      shape: createRoundcubePhysicsShape(roundcubeSmoothing),
      linearDamping: 0.1,
      angularDamping: isSpherePhysics ? 0.6 : 0.05
    });
    localBody.position.copy(pos);
    localBody.velocity.copy(vel);
    localBody.angularVelocity.copy(angVel);
    localBody.quaternion.copy(quat);
    world.addBody(localBody);
  }
}

let fpsFrames = 0, fpsTime = 0, fpsDisplay = 0;

function updateDebug(delta) {
  if (!debugVisible) return;

  gimbal.quaternion.copy(camera.quaternion).invert();

  fpsFrames++; fpsTime += delta;
  if (fpsTime >= 0.5) { fpsDisplay = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }

  if (godmode) {
    const c = camera.position;
    const r = camera.rotation;
    debugEl.textContent =
      `=== GODMODE (F4 to exit) ===\n` +
      `FPS:    ${fpsDisplay}\n` +
      `CamPos: (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})\n` +
      `CamRot: (${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)})\n` +
      `WASD: fly  E/Q/Shift: up/down\n` +
      `Click: place spawn  Click marker: remove\n` +
      `Spawns: ${SPAWN_POINTS.length}\n` +
      `Chain:  ${chainLength.toFixed(1)} [ / ] to adjust`;
    return;
  }

  if (!localBody) return;
  const v = localBody.velocity;
  const hSpeed = Math.sqrt(v.x * v.x + v.z * v.z);
  const totalSpeed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const sprinting = (keys['ShiftLeft'] || keys['ShiftRight']) && !sprintExhausted;
  const p = localBody.position;
  const myScore = allScores[selfId] || 0;
  debugEl.textContent =
    `FPS:   ${fpsDisplay}\n` +
    `Speed: ${hSpeed.toFixed(2)} / ${sprinting ? SPRINT_SPEED : MAX_SPEED}\n` +
    `Vel:   (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}) |${totalSpeed.toFixed(2)}|\n` +
    `Pos:   (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})\n` +
    `State: ${sprinting ? 'SPRINT' : 'walk'}${sprintExhausted ? ' (exhausted)' : ''}${checkGrounded() ? '' : ' (air)'}\n` +
    `Sprint:${sprintStamina.toFixed(1)}/${SPRINT_DURATION}s\n` +
    `Jump:  ${isChargingJump ? '>' + '='.repeat(Math.round(jumpCharge * 5)) + ' ' + jumpCharge.toFixed(1) + 'x' : (jumpCooldownTimer > 0 ? 'CD ' + jumpCooldownTimer.toFixed(1) + 's' : 'ready')}\n` +
    `Tag CD:${tagCooldownTimer > 0 ? tagCooldownTimer.toFixed(1) + 's' : 'none'}\n` +
    `Score: ${myScore}  ${holderID === selfId ? '[IT]' : ''}\n` +
    `Chain: ${chainLength.toFixed(1)} [ / ] to adjust\n` +
    (playerShape === 'roundcube' ? `Round: ${roundcubeSmoothing.toFixed(2)} (<, >)\n` : '') +
    `Music: ${Math.round(musicVolume * 100)}% (PgUp/PgDn)\n` +
    `F4: godmode`;
}

// --- Main loop ---
const PHYSICS_STEP = 1 / 60;

function animate() {
  requestAnimationFrame(animate);
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.05);

  if (gameStarted && localBody) {
    if (godmode) {
      handleGodmode(delta);
      // Spin spawn markers
      for (const m of spawnMarkers) {
        m.rotation.y += delta * 1.5;
      }
    } else {
      handleMovement(delta);
      updateGroundPlane(localBody);
      if (levelLoaded) world.step(PHYSICS_STEP, delta, 3);
      resolveWallCollisions(localBody);
      syncMeshToBody(localPlayer, localMesh, localBody);

      if (checkGrounded()) {
        airTime = 0;
      } else {
        airTime += delta;
      }
      if (airTime > 5) {
        const rsp = randomSpawn();
        localBody.position.set(rsp.x, rsp.y, rsp.z);
        localBody.velocity.set(0, 0, 0);
        localBody.angularVelocity.set(0, 0, 0);
        airTime = 0;
      }
    }

    for (const [id, target] of remoteTargets) {
      const group = remotePlayers.get(id);
      const mesh = remoteMeshes.get(id);
      if (group && mesh) {
        group.position.x += (target.x - group.position.x) * 0.3;
        group.position.y += (target.y - group.position.y) * 0.3;
        group.position.z += (target.z - group.position.z) * 0.3;
        if (target.qx !== undefined) {
          mesh.quaternion.slerp(new THREE.Quaternion(target.qx, target.qy, target.qz, target.qw), 0.3);
        }
        if (target.smoothing !== undefined && mesh.userData.smoothing !== undefined && mesh.userData.smoothing !== target.smoothing) {
          mesh.userData.smoothing = target.smoothing;
          const oldGeo = mesh.geometry;
          let geo = new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
          geo = smoothRoundcube(geo, target.smoothing);
          mesh.geometry = geo;
          oldGeo.dispose();
          const outline = mesh.children.find(c => c.isMesh);
          if (outline) {
            const oldOutGeo = outline.geometry;
            outline.geometry = geo.clone();
            oldOutGeo.dispose();
          }
        }
      }
    }

    updateCamera(delta);
    sendPosition();
    updateDebug(delta);

    // Tag strobe effect
    updateTagStrobe();

    // Crown scaling
    updateCrowns();

    // Meters
    updateMeters();

    // Tab scoreboard
    if (tabHeld) {
      scoreboardEl.style.display = 'block';
      updateScoreboard();
    } else {
      scoreboardEl.style.display = 'none';
    }
  }

  renderer.render(scene, camera);
}
animate();
