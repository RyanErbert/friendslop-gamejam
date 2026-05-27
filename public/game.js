const MOVE_FORCE = 60;
const SPRINT_FORCE = 100;
const MAX_SPEED = 9;
const SPRINT_SPEED = 14;
const JUMP_IMPULSE = 8;
const JOYSTICK_DEADZONE = 0.15;

const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || ('ontouchstart' in window);

// --- Three.js scene ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

const groundGeo = new THREE.PlaneGeometry(50, 50);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x55aa55 });
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// --- Cannon.js physics world ---
const world = new CANNON.World();
world.gravity.set(0, -20, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

const groundMaterial = new CANNON.Material('ground');
const playerMaterial = new CANNON.Material('player');

const groundPlayerContact = new CANNON.ContactMaterial(groundMaterial, playerMaterial, {
  friction: 0.15,
  restitution: 0.05
});
const playerPlayerContact = new CANNON.ContactMaterial(playerMaterial, playerMaterial, {
  friction: 0.3,
  restitution: 0.2
});
world.addContactMaterial(groundPlayerContact);
world.addContactMaterial(playerPlayerContact);

const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

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
let joystickX = 0, joystickZ = 0;

// --- Name entry ---
const nameScreen = document.getElementById('name-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const hud = document.getElementById('hud');
let playerName = 'Player';
let gameStarted = false;

function joinGame() {
  playerName = nameInput.value.trim().slice(0, 16) || 'Player';
  nameScreen.style.display = 'none';
  hud.style.display = '';
  gameStarted = true;
  clock.start();
  startGame();
}

joinBtn.addEventListener('click', joinGame);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});

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
    const touch = findTouch(e.touches, joystickTouchId);
    if (!touch) return;
    e.preventDefault();
    updateJoystick(touch);
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    if (!findTouch(e.changedTouches, joystickTouchId)) return;
    joystickTouchId = null;
    joystickKnob.style.transform = 'translate(-50%, -50%)';
    joystickX = 0;
    joystickZ = 0;
  });

  function findTouch(touches, id) {
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === id) return touches[i];
    }
    return null;
  }

  function updateJoystick(touch) {
    const rect = joystickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_RADIUS) {
      dx = (dx / dist) * JOYSTICK_RADIUS;
      dy = (dy / dist) * JOYSTICK_RADIUS;
    }
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const rawX = dx / JOYSTICK_RADIUS;
    const rawZ = dy / JOYSTICK_RADIUS;
    const mag = Math.sqrt(rawX * rawX + rawZ * rawZ);
    joystickX = mag < JOYSTICK_DEADZONE ? 0 : rawX;
    joystickZ = mag < JOYSTICK_DEADZONE ? 0 : rawZ;
  }
} else {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
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
  canvas.width = 256;
  canvas.height = 64;
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

// --- Player creation ---
function createPlayerVisual(color, type, name) {
  const group = new THREE.Group();
  const geo = type === 'ball'
    ? new THREE.SphereGeometry(0.5, 24, 24)
    : new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  group.add(mesh);
  const label = createNameSprite(name);
  label.position.y = 1.2;
  group.add(label);
  scene.add(group);
  return { group, mesh };
}

function createPlayerBody(type, isLocal) {
  const shape = type === 'ball'
    ? new CANNON.Sphere(0.5)
    : new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));

  const body = new CANNON.Body({
    mass: isLocal ? 1 : 0,
    material: playerMaterial,
    shape: shape,
    linearDamping: 0.1,
    angularDamping: 0.05
  });
  body.position.set(0, 1, 0);
  world.addBody(body);
  return body;
}

// --- Check if player is on the ground ---
function isGrounded() {
  if (!localBody) return false;
  // Cast downward from body center
  const from = localBody.position;
  const to = new CANNON.Vec3(from.x, from.y - 0.7, from.z);
  const ray = new CANNON.Ray(from, to);
  ray.mode = CANNON.Ray.CLOSEST;
  ray.skipBackfaces = true;
  const result = new CANNON.RaycastResult();
  ray.intersectBodies(world.bodies.filter(b => b !== localBody), result);
  return result.hasHit;
}

// --- Movement ---
function handleMovement(delta) {
  if (!localBody) return;

  let inputX = 0, inputZ = 0;
  if (isMobile) {
    inputX = joystickX;
    inputZ = joystickZ;
  } else {
    if (keys['KeyW']) inputZ -= 1;
    if (keys['KeyS']) inputZ += 1;
    if (keys['KeyA']) inputX -= 1;
    if (keys['KeyD']) inputX += 1;
  }

  const inputLen = Math.sqrt(inputX * inputX + inputZ * inputZ);
  const grounded = isGrounded();

  if (inputLen > 0) {
    const inputMag = Math.min(inputLen, 1);
    const nx = inputX / inputLen;
    const nz = inputZ / inputLen;

    // Camera-relative direction
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const worldX = right.x * nx + forward.x * (-nz);
    const worldZ = right.z * nx + forward.z * (-nz);

    const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
    const force = sprinting ? SPRINT_FORCE : MOVE_FORCE;

    // Apply force at body center
    localBody.applyForce(
      new CANNON.Vec3(worldX * force * inputMag, 0, worldZ * force * inputMag),
      localBody.position
    );

    // Speed cap via velocity clamping
    const cap = sprinting ? SPRINT_SPEED : MAX_SPEED;
    const vx = localBody.velocity.x;
    const vz = localBody.velocity.z;
    const hSpeed = Math.sqrt(vx * vx + vz * vz);
    if (hSpeed > cap) {
      localBody.velocity.x = (vx / hSpeed) * cap;
      localBody.velocity.z = (vz / hSpeed) * cap;
    }
  }

  // Jump
  if (keys['Space'] && grounded) {
    localBody.velocity.y = JUMP_IMPULSE;
    keys['Space'] = false;
  }
}

// --- Sync Three.js from physics ---
function syncMeshToBody(group, mesh, body) {
  group.position.copy(body.position);
  mesh.quaternion.copy(body.quaternion);
}

// --- Camera: fixed radius, dragged anchor ---
let chainLength = 6;
let camHeight = 3.5;

function updateCamera(delta) {
  if (!localPlayer) return;

  const targetY = localPlayer.position.y + camHeight;
  camera.position.y += (targetY - camera.position.y) * 0.1;

  const dx = camera.position.x - localPlayer.position.x;
  const dz = camera.position.z - localPlayer.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > 0.001) {
    camera.position.x = localPlayer.position.x + (dx / dist) * chainLength;
    camera.position.z = localPlayer.position.z + (dz / dist) * chainLength;
  }

  camera.lookAt(localPlayer.position);
}

// --- Networking ---
const socket = io();
let lastSentPos = { x: 0, y: 0, z: 0 };

function startGame() {
  const myType = isMobile ? 'ball' : 'box';
  socket.emit('setType', myType);
  socket.emit('setName', playerName);
  socket.emit('ready');
}

socket.on('currentPlayers', (data) => {
  selfId = data.selfId;
  for (const [id, info] of Object.entries(data.players)) {
    const { group, mesh } = createPlayerVisual(info.color, info.type, info.name);
    group.position.set(info.x, info.y, info.z);
    if (id === selfId) {
      localPlayer = group;
      localMesh = mesh;
      localBody = createPlayerBody(info.type, true);
      localBody.position.set(info.x, info.y || 1, info.z);
    } else {
      remotePlayers.set(id, group);
      remoteMeshes.set(id, mesh);
      const body = createPlayerBody(info.type, false);
      body.position.set(info.x, info.y, info.z);
      remoteBodies.set(id, body);
    }
  }
});

socket.on('newPlayer', (data) => {
  const { group, mesh } = createPlayerVisual(data.color, data.type, data.name);
  group.position.set(data.x, data.y, data.z);
  remotePlayers.set(data.id, group);
  remoteMeshes.set(data.id, mesh);
  const body = createPlayerBody(data.type, false);
  body.position.set(data.x, data.y, data.z);
  remoteBodies.set(data.id, body);
});

const remoteTargets = new Map();

socket.on('playerMoved', (data) => {
  if (remotePlayers.has(data.id)) {
    remoteTargets.set(data.id, data);
  }
});

socket.on('playerDisconnected', (id) => {
  const group = remotePlayers.get(id);
  if (group) {
    scene.remove(group);
    remotePlayers.delete(id);
    remoteMeshes.delete(id);
    remoteTargets.delete(id);
    const body = remoteBodies.get(id);
    if (body) { world.remove(body); remoteBodies.delete(id); }
  }
});

function sendPosition() {
  if (!localBody) return;
  const p = localBody.position;
  const q = localBody.quaternion;
  socket.emit('playerMoved', {
    x: p.x, y: p.y, z: p.z,
    qx: q.x, qy: q.y, qz: q.z, qw: q.w
  });
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
  }
  if (e.code === 'BracketRight') { chainLength = Math.min(20, chainLength + 0.5); camHeight = chainLength * 0.58; }
  if (e.code === 'BracketLeft') { chainLength = Math.max(2, chainLength - 0.5); camHeight = chainLength * 0.58; }
});

let fpsFrames = 0, fpsTime = 0, fpsDisplay = 0;

function updateDebug(delta) {
  if (!debugVisible || !localBody) return;
  fpsFrames++;
  fpsTime += delta;
  if (fpsTime >= 0.5) {
    fpsDisplay = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }
  const v = localBody.velocity;
  const hSpeed = Math.sqrt(v.x * v.x + v.z * v.z);
  const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
  const p = localBody.position;
  const av = localBody.angularVelocity;
  const angSpeed = Math.sqrt(av.x * av.x + av.y * av.y + av.z * av.z);
  debugEl.textContent =
    `FPS:   ${fpsDisplay}\n` +
    `Speed: ${hSpeed.toFixed(2)} / ${sprinting ? SPRINT_SPEED : MAX_SPEED}\n` +
    `Vel:   (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})\n` +
    `Pos:   (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})\n` +
    `Spin:  ${angSpeed.toFixed(2)} rad/s\n` +
    `State: ${sprinting ? 'SPRINT' : 'walk'}${isGrounded() ? '' : ' (air)'}\n` +
    `Delta: ${(delta * 1000).toFixed(1)}ms\n` +
    `Chain: ${chainLength.toFixed(1)} [ / ] to adjust`;
}

// --- Main loop ---
const PHYSICS_STEP = 1 / 60;

function animate() {
  requestAnimationFrame(animate);
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.05);

  if (gameStarted && localBody) {
    // Update remote body positions (kinematic)
    for (const [id, target] of remoteTargets) {
      const body = remoteBodies.get(id);
      if (body) {
        body.position.set(target.x, target.y, target.z);
        if (target.qx !== undefined) {
          body.quaternion.set(target.qx, target.qy, target.qz, target.qw);
        }
      }
    }

    handleMovement(delta);
    world.step(PHYSICS_STEP, delta, 3);

    // Sync local player
    syncMeshToBody(localPlayer, localMesh, localBody);

    // Sync remote players (interpolate visuals)
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
