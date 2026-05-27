const MAX_SPEED = 5;
const SPRINT_SPEED = 9;
const ACCELERATION = 12;
const SPRINT_ACCELERATION = 20;
const FRICTION = 8;
const JUMP_FORCE = 8;
const GRAVITY = -20;
const GROUND_Y = 0.5;
const COLLISION_RADIUS = 1.0;
const COLLISION_PUSH = 4;
const JOYSTICK_DEADZONE = 0.15;

const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || ('ontouchstart' in window);

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
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const clock = new THREE.Clock(false);
const keys = {};
let localPlayer = null;
let selfId = null;
let velocityX = 0, velocityZ = 0, velocityY = 0;
let isGrounded = true;
const remotePlayers = new Map();

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

  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    keys['Space'] = true;
  });
  jumpBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    keys['Space'] = false;
  });

  let joystickTouchId = null;
  const JOYSTICK_RADIUS = 50;

  joystickBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    updateJoystick(touch);
  });
  window.addEventListener('touchmove', (e) => {
    if (joystickTouchId === null) return;
    const touch = findTouch(e.touches, joystickTouchId);
    if (!touch) return;
    e.preventDefault();
    updateJoystick(touch);
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    const touch = findTouch(e.changedTouches, joystickTouchId);
    if (!touch) return;
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
    if (mag < JOYSTICK_DEADZONE) {
      joystickX = 0;
      joystickZ = 0;
    } else {
      joystickX = rawX;
      joystickZ = rawZ;
    }
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

function createPlayerMesh(color, type, name) {
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
  return group;
}

// --- Movement with acceleration ---
function handleMovement(delta) {
  if (!localPlayer) return;

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
  if (inputLen > 0) {
    const inputMag = Math.min(inputLen, 1);
    const nx = inputX / inputLen;
    const nz = inputZ / inputLen;

    // Transform input relative to camera direction
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const worldX = right.x * nx + forward.x * (-nz);
    const worldZ = right.z * nx + forward.z * (-nz);

    const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
    const accel = sprinting ? SPRINT_ACCELERATION : ACCELERATION;
    velocityX += worldX * inputMag * accel * delta;
    velocityZ += worldZ * inputMag * accel * delta;
  }

  // Friction
  const speed = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ);
  if (speed > 0) {
    const friction = FRICTION * delta;
    const newSpeed = Math.max(0, speed - friction);
    velocityX = (velocityX / speed) * newSpeed;
    velocityZ = (velocityZ / speed) * newSpeed;
  }

  // Clamp to max speed
  const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
  const cap = sprinting ? SPRINT_SPEED : MAX_SPEED;
  const currentSpeed = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ);
  if (currentSpeed > cap) {
    velocityX = (velocityX / currentSpeed) * cap;
    velocityZ = (velocityZ / currentSpeed) * cap;
  }

  localPlayer.position.x += velocityX * delta;
  localPlayer.position.z += velocityZ * delta;

  // Jump
  if (keys['Space'] && isGrounded) {
    velocityY = JUMP_FORCE;
    isGrounded = false;
  }

  velocityY += GRAVITY * delta;
  localPlayer.position.y += velocityY * delta;

  if (localPlayer.position.y <= GROUND_Y) {
    localPlayer.position.y = GROUND_Y;
    velocityY = 0;
    isGrounded = true;
  }

  // AABB collisions with remote players
  const HALF = 0.5;
  for (const [id, remote] of remotePlayers) {
    const dx = localPlayer.position.x - remote.position.x;
    const dy = localPlayer.position.y - remote.position.y;
    const dz = localPlayer.position.z - remote.position.z;

    const overlapX = HALF + HALF - Math.abs(dx);
    const overlapY = HALF + HALF - Math.abs(dy);
    const overlapZ = HALF + HALF - Math.abs(dz);

    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) continue;

    // Resolve on the axis with smallest overlap
    if (overlapY < overlapX && overlapY < overlapZ) {
      if (dy > 0) {
        // Local is above — land on top
        localPlayer.position.y = remote.position.y + 1.0;
        if (velocityY < 0) { velocityY = 0; isGrounded = true; }
      } else {
        // Local is below — bonk head
        localPlayer.position.y = remote.position.y - 1.0;
        if (velocityY > 0) velocityY = 0;
      }
    } else if (overlapX < overlapZ) {
      localPlayer.position.x += (dx > 0 ? overlapX : -overlapX);
      velocityX *= 0.5;
    } else {
      localPlayer.position.z += (dz > 0 ? overlapZ : -overlapZ);
      velocityZ *= 0.5;
    }
  }
}

// --- Camera trailing behind movement direction ---
let chainLength = 6;
let camHeight = 3.5;

function updateCamera(delta) {
  if (!localPlayer) return;

  // Height follows smoothly
  const targetY = localPlayer.position.y + camHeight;
  camera.position.y += (targetY - camera.position.y) * 0.1;

  // XZ: camera gets dragged when chain goes taut
  const dx = camera.position.x - localPlayer.position.x;
  const dz = camera.position.z - localPlayer.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > chainLength) {
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
    const group = createPlayerMesh(info.color, info.type, info.name);
    group.position.set(info.x, info.y, info.z);
    if (id === selfId) {
      localPlayer = group;
    } else {
      remotePlayers.set(id, group);
    }
  }
});

socket.on('newPlayer', (data) => {
  const group = createPlayerMesh(data.color, data.type, data.name);
  group.position.set(data.x, data.y, data.z);
  remotePlayers.set(data.id, group);
});

const remoteTargets = new Map();

socket.on('playerMoved', (data) => {
  const group = remotePlayers.get(data.id);
  if (group) {
    remoteTargets.set(data.id, { x: data.x, y: data.y, z: data.z });
  }
});

socket.on('playerDisconnected', (id) => {
  const group = remotePlayers.get(id);
  if (group) {
    scene.remove(group);
    remotePlayers.delete(id);
    remoteTargets.delete(id);
  }
});

function sendPosition() {
  if (!localPlayer) return;
  const p = localPlayer.position;
  if (p.x !== lastSentPos.x || p.y !== lastSentPos.y || p.z !== lastSentPos.z) {
    lastSentPos = { x: p.x, y: p.y, z: p.z };
    socket.emit('playerMoved', lastSentPos);
  }
}

// --- Debug HUD (toggle with F3) ---
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
  if (!debugVisible || !localPlayer) return;
  fpsFrames++;
  fpsTime += delta;
  if (fpsTime >= 0.5) {
    fpsDisplay = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }
  const speed = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ);
  const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
  const p = localPlayer.position;
  debugEl.textContent =
    `FPS:   ${fpsDisplay}\n` +
    `Speed: ${speed.toFixed(2)} / ${sprinting ? SPRINT_SPEED : MAX_SPEED}\n` +
    `Vel:   (${velocityX.toFixed(2)}, ${velocityZ.toFixed(2)})\n` +
    `Pos:   (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})\n` +
    `State: ${sprinting ? 'SPRINT' : 'walk'}${isGrounded ? '' : ' (air)'}\n` +
    `Delta: ${(delta * 1000).toFixed(1)}ms\n` +
    `Chain: ${chainLength.toFixed(1)} [ / ] to adjust`;
}

function animate() {
  requestAnimationFrame(animate);
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.05);
  if (gameStarted && localPlayer) {
    // Interpolate remote players toward their targets
    for (const [id, target] of remoteTargets) {
      const group = remotePlayers.get(id);
      if (group) {
        group.position.x += (target.x - group.position.x) * 0.3;
        group.position.y += (target.y - group.position.y) * 0.3;
        group.position.z += (target.z - group.position.z) * 0.3;
      }
    }
    handleMovement(delta);
    updateCamera(delta);
    sendPosition();
    updateDebug(delta);
  }
  renderer.render(scene, camera);
}
animate();
