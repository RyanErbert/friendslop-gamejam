const SPAWN_POINTS = [
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
];
function randomSpawn() { return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]; }

const MOVE_FORCE = 60;
const SPRINT_FORCE = 100;
const MAX_SPEED = 9;
const SPRINT_SPEED = 14;
const JUMP_IMPULSE = 8;
const JOYSTICK_DEADZONE = 0.15;
const TAG_DISTANCE = 1.5;

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

const gimbal = new THREE.AxesHelper(0.5);
gimbal.position.set(0.8, -0.6, -2);
gimbal.visible = false;
camera.add(gimbal);

// --- Sky gradient ---
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 1; skyCanvas.height = 256;
const skyCtx = skyCanvas.getContext('2d');
const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
skyGrad.addColorStop(0, '#0a0a2e');    // dark top
skyGrad.addColorStop(0.3, '#1a1a4e');  // deep blue
skyGrad.addColorStop(0.6, '#2d4a7a');  // medium blue
skyGrad.addColorStop(0.85, '#5a7faa'); // lighter horizon
skyGrad.addColorStop(1, '#8ab4d4');    // bright horizon
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

// Hemisphere light for natural sky/ground tint
const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x553322, 0.6);
scene.add(hemiLight);

scene.add(new THREE.AmbientLight(0xffffff, 0.3));

// --- Sun visual (bright sphere in the sky) ---
const sunGeo = new THREE.SphereGeometry(8, 16, 16);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunMesh.position.copy(sunLight.position);
scene.add(sunMesh);

let levelLoaded = false;

// --- Load GLB level ---
const loader = new THREE.GLTFLoader();
loader.load('/levels/level_1.glb', (gltf) => {
  const level = gltf.scene;
  level.traverse((child) => {
    if (child.isMesh) {
      child.receiveShadow = true;
      child.castShadow = true;
      // Add physics collision for level geometry
      addLevelCollider(child);
    }
  });
  scene.add(level);
  levelLoaded = true;
}, undefined, (err) => {
  console.error('Failed to load level:', err);
  // Fallback ground plane
  const groundGeo = new THREE.PlaneGeometry(5000, 5000);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x55aa55 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  levelLoaded = true;
});

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

// Dynamic ground plane — follows terrain height under the player
const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
groundBody.position.set(0, 0, 0);
world.addBody(groundBody);

// --- Raycast terrain detection (finds ground height + walls) ---
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

// Move the Cannon ground plane to match terrain height under the player
function updateGroundPlane(body) {
  const p = body.position;
  const groundOrigin = new THREE.Vector3(p.x, p.y + 2, p.z);
  const groundHit = raycastLevel(groundOrigin, new THREE.Vector3(0, -1, 0), 50);

  if (groundHit) {
    groundBody.position.y = groundHit.point.y;
    rayGrounded = (p.y - groundHit.point.y) < 0.7;
  } else {
    // No ground below — put plane far below so player falls
    groundBody.position.y = -1000;
    rayGrounded = false;
  }
}

// Wall collision via raycast (Cannon can't do this with terrain)
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
let airTime = 0;

// --- Charge jump state ---
const CHARGE_RATE = 3;
const MAX_CHARGE_MULT = 4;
const SUPERCHARGE_THRESHOLD = 2;
const SUPERCHARGE_COOLDOWN = 5.5;
let jumpCharge = 0;
let isChargingJump = false;
let superchargeCooldownTimer = 0;

// --- Oddball state ---
let holderID = null;
let allScores = {};
let leaderID = null;

// --- Join screen ---
const nameScreen = document.getElementById('name-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const hud = document.getElementById('hud');
const leaderDisplay = document.getElementById('leader-display');
const colorPicker = document.getElementById('color-picker');
const skinImageInput = document.getElementById('skin-image-input');
let playerName = 'Player';
let playerShape = 'box';
let playerColor = '#4488ff';
let playerSkinImage = '';
let gameStarted = false;

// Shape selection buttons
document.querySelectorAll('.shape-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    playerShape = btn.dataset.shape;
  });
});

function joinGame() {
  playerName = nameInput.value.trim().slice(0, 16) || 'Player';
  playerColor = colorPicker.value;
  playerSkinImage = skinImageInput.value.trim();
  nameScreen.style.display = 'none';
  hud.style.display = '';
  leaderDisplay.style.display = '';
  gameStarted = true;
  clock.start();
  startGame();
}

joinBtn.addEventListener('click', joinGame);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });

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

// --- Crown sprite for leader ---
function createCrownSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '48px serif';
  ctx.textAlign = 'center';
  ctx.fillText('\u{1F451}', 64, 48);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1, 0.5, 1);
  sprite.renderOrder = 999;
  sprite.visible = false;
  return sprite;
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
    case 'roundcube': return new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
    case 'sphere': return new THREE.SphereGeometry(0.5, 24, 24);
    case 'cylinder': return new THREE.CylinderGeometry(0.4, 0.4, 1, 16);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

function createPhysicsShape(shape) {
  switch (shape) {
    case 'sphere': return new CANNON.Sphere(0.5);
    case 'cylinder': return new CANNON.Cylinder(0.4, 0.4, 1, 16);
    case 'roundcube': return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
    default: return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
  }
}

// Smooth roundcube vertices
function smoothRoundcube(geo) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.normalize().multiplyScalar(0.58);
    pos.setXYZ(i, v.x, v.y, v.z);
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
  mesh.castShadow = true;
  group.add(mesh);

  const outline = createOutlineMesh(mesh);
  mesh.add(outline);

  const label = createNameSprite(name);
  label.position.y = 1.2;
  group.add(label);

  const crown = createCrownSprite();
  crown.position.y = 1.6;
  group.add(crown);

  scene.add(group);
  return { group, mesh, outline, crown };
}

function createPlayerBody(shape, isLocal) {
  const body = new CANNON.Body({
    mass: isLocal ? 1 : 0,
    material: playerMaterial,
    shape: createPhysicsShape(shape),
    linearDamping: 0.1,
    angularDamping: 0.05
  });
  world.addBody(body);
  return body;
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

    const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
    const force = sprinting ? SPRINT_FORCE : MOVE_FORCE;

    localBody.applyForce(new CANNON.Vec3(worldX * force * inputMag, 0, worldZ * force * inputMag), localBody.position);

    const cap = sprinting ? SPRINT_SPEED : MAX_SPEED;
    const vx = localBody.velocity.x, vz = localBody.velocity.z;
    const hSpeed = Math.sqrt(vx * vx + vz * vz);
    if (hSpeed > cap) {
      localBody.velocity.x = (vx / hSpeed) * cap;
      localBody.velocity.z = (vz / hSpeed) * cap;
    }
  }

  if (superchargeCooldownTimer > 0) superchargeCooldownTimer -= delta;

  if (keys['Space'] && grounded) {
    if (!isChargingJump) {
      isChargingJump = true;
      jumpCharge = 1;
    }
    const chargeLimit = superchargeCooldownTimer > 0 ? SUPERCHARGE_THRESHOLD : MAX_CHARGE_MULT;
    jumpCharge = Math.min(jumpCharge + CHARGE_RATE * delta, chargeLimit);
  } else if (isChargingJump) {
    localBody.velocity.y = JUMP_IMPULSE * jumpCharge;
    if (jumpCharge > SUPERCHARGE_THRESHOLD) superchargeCooldownTimer = SUPERCHARGE_COOLDOWN;
    isChargingJump = false;
    jumpCharge = 0;
  }

  // Auto-tag: if holder bumps into another player
  if (holderID === selfId) {
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
let chainLength = 6;
let camHeight = 3.5;
let camYaw = Math.PI;
let camPitch = 0.4;
const CAM_PITCH_MIN = -0.3;
const CAM_PITCH_MAX = 1.2;
const MOUSE_SENSITIVITY = 0.003;
const CAM_DRAG_SPEED = 1.8;
let lastMouseMoveTime = 0;
const MOUSE_IDLE_DELAY = 0.6;

// Pointer lock (with click-drag fallback)
let mouseDragging = false;
let pointerLockSupported = false;

renderer.domElement.addEventListener('click', () => {
  if (!pointerLockSupported) return; // use drag fallback
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
    camPitch -= e.movementY * MOUSE_SENSITIVITY;
    camPitch = Math.max(CAM_PITCH_MIN, Math.min(CAM_PITCH_MAX, camPitch));
  }
});

// Mouse wheel zoom
window.addEventListener('wheel', (e) => {
  if (!gameStarted || godmode) return;
  chainLength += e.deltaY * 0.005;
  chainLength = Math.max(2, Math.min(20, chainLength));
  camHeight = chainLength * 0.58;
}, { passive: true });

// God mode: left-click to place spawn diamond and log coordinates
const spawnDiamondGeo = new THREE.OctahedronGeometry(0.4, 0);
const spawnDiamondMat = new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00aa88, emissiveIntensity: 0.6 });
const spawnClickRaycaster = new THREE.Raycaster();
const spawnClickNDC = new THREE.Vector2();

renderer.domElement.addEventListener('click', (e) => {
  if (!godmode) return;
  spawnClickNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  spawnClickNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  spawnClickRaycaster.setFromCamera(spawnClickNDC, camera);
  spawnClickRaycaster.far = 500;
  const hits = spawnClickRaycaster.intersectObjects(levelMeshes, false);
  if (hits.length === 0) return;
  const pt = hits[0].point;
  const diamond = new THREE.Mesh(spawnDiamondGeo, spawnDiamondMat);
  diamond.position.set(pt.x, pt.y + 1.5, pt.z);
  diamond.scale.set(1, 1.5, 1);
  scene.add(diamond);
  console.log(`SPAWN POINT: { x: ${pt.x.toFixed(2)}, y: ${pt.y.toFixed(2)}, z: ${pt.z.toFixed(2)} }`);
});

// Disable context menu on canvas so right-drag works
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

function updateCamera(delta) {
  if (godmode || !localPlayer) return;

  // Drag cam yaw toward "behind the player" when moving and mouse is idle
  if (localBody) {
    const vx = localBody.velocity.x;
    const vz = localBody.velocity.z;
    const hSpeed = Math.sqrt(vx * vx + vz * vz);
    const now = performance.now() / 1000;
    const mouseIdle = (now - lastMouseMoveTime) > MOUSE_IDLE_DELAY;

    if (hSpeed > 1.5 && mouseIdle) {
      const behindYaw = Math.atan2(vx, vz) + Math.PI;
      let diff = behindYaw - camYaw;
      // Normalize to [-PI, PI]
      diff = diff - Math.round(diff / (2 * Math.PI)) * 2 * Math.PI;
      camYaw += diff * CAM_DRAG_SPEED * delta;
    }
  }

  const offsetX = Math.sin(camYaw) * Math.cos(camPitch) * chainLength;
  const offsetZ = Math.cos(camYaw) * Math.cos(camPitch) * chainLength;
  const offsetY = Math.sin(camPitch) * chainLength;

  const targetX = localPlayer.position.x + offsetX;
  const targetY = localPlayer.position.y + offsetY + 1.5;
  const targetZ = localPlayer.position.z + offsetZ;

  camera.position.x += (targetX - camera.position.x) * 0.15;
  camera.position.y += (targetY - camera.position.y) * 0.15;
  camera.position.z += (targetZ - camera.position.z) * 0.15;

  camera.lookAt(localPlayer.position);
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
  // Check the name from the label sprite — stored in playerNames
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
    const { group, mesh, outline, crown } = createPlayerVisual(color, shape, info.name, info.skinImage);
    group.position.set(info.x, info.y, info.z);
    if (id === selfId) {
      localPlayer = group;
      localMesh = mesh;
      localOutline = outline;
      localCrown = crown;
      localBody = createPlayerBody(shape, true);
      const sp = randomSpawn();
      localBody.position.set(sp.x, sp.y, sp.z);
      camera.position.set(sp.x, sp.y + camHeight, sp.z + chainLength);
    } else {
      remotePlayers.set(id, group);
      remoteMeshes.set(id, mesh);
      playerOutlines.set(id, outline);
      playerCrowns.set(id, crown);
      playerNames.set(id, info.name);
    }
  }
});

socket.on('newPlayer', (data) => {
  const shape = data.shape || data.type || 'box';
  const color = data.skinColor || data.color;
  const { group, mesh, outline, crown } = createPlayerVisual(color, shape, data.name, data.skinImage);
  group.position.set(data.x, data.y, data.z);
  remotePlayers.set(data.id, group);
  remoteMeshes.set(data.id, mesh);
  playerOutlines.set(data.id, outline);
  playerCrowns.set(data.id, crown);
  playerNames.set(data.id, data.name);
});

const remoteTargets = new Map();

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
    playerNames.delete(id);
  }
});

socket.on('holderChanged', (id) => {
  holderID = id;
  updateOddballVisuals();
});

socket.on('scores', (s) => {
  allScores = s;
  findLeader();
  updateOddballVisuals();
});

function sendPosition() {
  if (!localBody) return;
  const p = localBody.position;
  const q = localBody.quaternion;
  socket.emit('playerMoved', { x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w });
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

  // Arrow keys to rotate camera
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
      // Capture current view direction and convert to YXZ euler cleanly
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const yaw = Math.atan2(-dir.x, -dir.z);
      const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
      localBody.mass = 0;
      localBody.updateMassProperties();
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
    }
  }
  if (e.code === 'BracketRight') { chainLength = Math.min(20, chainLength + 0.5); camHeight = chainLength * 0.58; }
  if (e.code === 'BracketLeft') { chainLength = Math.max(2, chainLength - 0.5); camHeight = chainLength * 0.58; }
});

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
      `Arrows/Mouse: rotate camera\n` +
      `Chain:  ${chainLength.toFixed(1)} [ / ] to adjust`;
    return;
  }

  if (!localBody) return;
  const v = localBody.velocity;
  const hSpeed = Math.sqrt(v.x * v.x + v.z * v.z);
  const totalSpeed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
  const p = localBody.position;
  const myScore = allScores[selfId] || 0;
  debugEl.textContent =
    `FPS:   ${fpsDisplay}\n` +
    `Speed: ${hSpeed.toFixed(2)} / ${sprinting ? SPRINT_SPEED : MAX_SPEED}\n` +
    `Vel:   (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}) |${totalSpeed.toFixed(2)}|\n` +
    `Pos:   (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})\n` +
    `State: ${sprinting ? 'SPRINT' : 'walk'}${checkGrounded() ? '' : ' (air)'}\n` +
    `Jump:  ${isChargingJump ? '>' + '='.repeat(Math.round(jumpCharge * 5)) + ' ' + jumpCharge.toFixed(1) + 'x' : (superchargeCooldownTimer > 0 ? 'CD ' + superchargeCooldownTimer.toFixed(1) + 's' : 'ready')}\n` +
    `Score: ${myScore}  ${holderID === selfId ? '[IT]' : ''}\n` +
    `Chain: ${chainLength.toFixed(1)} [ / ] to adjust\n` +
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
    } else {
      handleMovement(delta);
      // Move Cannon ground plane to terrain height, then step physics
      updateGroundPlane(localBody);
      if (levelLoaded) world.step(PHYSICS_STEP, delta, 3);
      // Wall collisions via raycast after physics step
      resolveWallCollisions(localBody);
      syncMeshToBody(localPlayer, localMesh, localBody);
      // Respawn if falling too long
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
      }
    }

    updateCamera(delta);
    sendPosition();
    updateDebug(delta);
  }

  renderer.render(scene, camera);
}
animate();
