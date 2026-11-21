import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { openingCutscene, missionOne, npcDirectory } from './data/story.js';
import './style.css';

const $ = selector => document.querySelector(selector);
const CHARACTER_HEIGHT_METERS = 2.0;
const PLAYER_CAMERA_LOOK_HEIGHT_METERS = CHARACTER_HEIGHT_METERS * 0.55;
const CUTSCENE_CAMERA_DISTANCE_METERS = 2.0;
const canvas = $('#game-canvas');
const loader = new GLTFLoader();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#91a7a2');
scene.fog = new THREE.FogExp2('#9db0a3', 0.000085);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 7000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

scene.add(new THREE.HemisphereLight('#e7f2e6', '#526054', 2.0));
const sun = new THREE.DirectionalLight('#fff0c9', 2.6);
sun.position.set(-100, 220, -70);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
sun.shadow.bias = -0.0004;
scene.add(sun);

const mapRoot = new THREE.Group();
// The supplied GLB already rotates its Z-up map meshes into Three.js Y-up.
// A second root rotation tips the island upright and hides the playable ground.
mapRoot.name = 'Supplied Kochi map (source GLB orientation)';
scene.add(mapRoot);
const editorGrid = new THREE.GridHelper(100, 40, '#d9ad6d', '#536052');
editorGrid.visible = false; scene.add(editorGrid);

const clock = new THREE.Timer();
clock.connect(document);
const raycaster = new THREE.Raycaster();
const keys = new Set();
const assets = new Map();
const actors = new Map();
const npcActors = [];
const collidables = [];
const markers = [];
const cameraTarget = new THREE.Vector3();
const cameraWanted = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
let storyMode = false;
let titleOpen = true;
let cutsceneIndex = -1;
let activeNpc = null;
let talkLanguage = 'mixed';
let voiceReady = { ml: false, en: false };
let voiceOn = false;
let mediaRecorder = null;
let micStream = null;
let audioContext = null;
let asrPromise = null;
let toastHandle = 0;
let lastMove = 0;
let frameTime = 0;
let cameraYaw = 0.08;
let cameraPitch = 0.25;
let pointerDown = false;
let lastPointer = null;
let paused = false;
let elapsed = 0;
let autoSaveAt = 0;
let playerMixer = null;
let playerActions = {};
let activePlayerAction = '';
let currentCar = null;
let inCar = false;
let carSpeed = 0;
let worldLoaded = false;
let currentMissionStep = 0;
let cash = 0;
let gameMode = 'story';
let missionComplete = false;
let editing = false;
let editorObjects = new Map();
let editorSelection = null;
let editorSelectionBox = null;
let editorCameraDistance = 24;
let gameCameraDistance = 2;
const editorCameraTarget = new THREE.Vector3(0, 1, 0);
let juiceShopGroup = null;
let defaultLayout = null;
let savedLayout = readLayout();
const bootData = readSave();

const player = {
  group: new THREE.Group(),
  mesh: null,
  position: new THREE.Vector3(-3, 0, 10),
  velocityY: 0,
  speed: 7.4,
  running: false,
  faceYaw: Math.PI,
};

const mapBounds = { minX: -2480, maxX: 2320, minZ: -2870, maxZ: 2750 };
const stationPositions = {
  mother: new THREE.Vector3(15, 0, -2.2),
  fruit: new THREE.Vector3(11.1, 0, -2.4),
  board: new THREE.Vector3(12.2, 0, -0.2),
  blender: new THREE.Vector3(12.2, 0, 1.7),
  customer: new THREE.Vector3(22, 0, 4),
  payment: new THREE.Vector3(22, 0, 4),
};

function setLoad(message, percent = null) {
  $('#load-message').textContent = message;
  if (percent !== null) $('#load-progress').style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function loadGLB(url, percentBase, percentSpan) {
  return new Promise((resolve, reject) => loader.load(url, gltf => resolve(gltf), event => {
    if (event.lengthComputable) setLoad(`Loading the supplied city… ${Math.round(event.loaded / event.total * 100)}%`, percentBase + event.loaded / event.total * percentSpan);
  }, reject));
}

function readSave() {
  try { return JSON.parse(localStorage.getItem('sheru-kochi-save') || '{}'); } catch { return {}; }
}

function readLayout() {
  try { return JSON.parse(localStorage.getItem('sheru-kochi-layout') || 'null'); } catch { return null; }
}

function saveGame(showMessage = true) {
  const snapshot = { version: 1, storyStep: currentMissionStep, cash, missionComplete, mode: gameMode, player: [player.position.x, player.position.y, player.position.z], at: Date.now() };
  localStorage.setItem('sheru-kochi-save', JSON.stringify(snapshot));
  if (showMessage) toast('Progress saved on this device.');
}

function makeMat(color, roughness = 0.82, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...opts });
}

function addBox(parent, name, size, pos, color, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), makeMat(color, opts.roughness ?? 0.82, opts.material || {}));
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addTextTexture(text, width = 1024, height = 256, foreground = '#f3d99c', background = '#23312d') {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d');
  g.fillStyle = background; g.fillRect(0, 0, width, height);
  g.fillStyle = foreground; g.font = '800 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildJuiceShop() {
  const shop = new THREE.Group();
  juiceShopGroup = shop;
  shop.name = 'Amma’s Juice Shop · Mission 1';
  shop.position.set(15, 0, 0);
  const cream = makeMat('#d9bd87'), teal = makeMat('#334940'), red = makeMat('#b85a40'), wood = makeMat('#76543a'), steel = makeMat('#a6aaa2', 0.28, { metalness: 0.58 });
  addBox(shop, 'shop platform', [14, 0.22, 9], [0, 0.11, 0], '#c1a779');
  for (const [x, z] of [[-6.1,-3.6],[6.1,-3.6],[-6.1,3.6],[6.1,3.6]]) addBox(shop, 'shop post', [0.28, 3.9, 0.28], [x, 2.05, z], '#584f3c');
  addBox(shop, 'shop roof', [14.8, 0.45, 9.8], [0, 4.1, 0], teal);
  addBox(shop, 'shop awning', [14.8, 0.22, 1.5], [0, 3.55, 4.25], red);
  addBox(shop, 'wood counter', [10.6, 1.08, 0.95], [0, 1.05, 2.4], wood);
  addBox(shop, 'counter top', [11, 0.12, 1.2], [0, 1.65, 2.35], '#dfcfab');
  addBox(shop, 'fruit crate', [1.3, 0.72, 1.0], [-3.9, 0.6, -2.4], '#aa7541');
  addBox(shop, 'fruit crate 2', [1.3, 0.72, 1.0], [-2.5, 0.6, -2.4], '#9a643b');
  for (let i = 0; i < 7; i++) {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), makeMat(['#eb963b','#e8c64e','#d35b43'][i % 3], 0.55));
    fruit.position.set(-4.3 + (i % 4) * 0.43, 1.08 + (i > 3 ? 0.1 : 0), -2.4 + Math.floor(i / 4) * 0.35);
    fruit.castShadow = true; shop.add(fruit);
  }
  addBox(shop, 'cutting table', [1.8, 0.18, 1.3], [-2.8, 1.12, -0.2], '#ead7a9');
  addBox(shop, 'blender base', [0.68, 0.75, 0.68], [-2.8, 1.55, 1.7], '#e6e3d5');
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.7, 16), new THREE.MeshPhysicalMaterial({ color: '#dfe9de', transparent: true, opacity: 0.62, roughness: 0.12 }));
  jar.position.set(-2.8, 2.24, 1.7); shop.add(jar);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.8), new THREE.MeshBasicMaterial({ map: addTextTexture('AMMA’S JUICE SHOP'), side: THREE.DoubleSide }));
  sign.position.set(0, 3.18, 4.95); shop.add(sign);
  addBox(shop, 'fruit counter sign rail', [8.2,0.15,0.2], [0,2.25,2.95], '#a8573e');
  const blenderLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.42), new THREE.MeshBasicMaterial({ map: addTextTexture('PAPAYA · NO SUGAR', 768, 180, '#f5e5bb', '#873d31'), side: THREE.DoubleSide }));
  blenderLabel.position.set(-2.8, 3.1, 1.7); blenderLabel.rotation.x = -0.15; shop.add(blenderLabel);
  scene.add(shop);
}

function normalizeModel(model, targetHeight = 1.72) {
  const wrapper = new THREE.Group();
  const clone = cloneSkeleton(model.scene);
  wrapper.add(clone);
  // Measure skinned vertices: approximate bind-pose bounds include the
  // oversized rig and were shrinking the visible character to a speck.
  let bounds = new THREE.Box3().setFromObject(wrapper, true);
  const height = Math.max(0.01, bounds.max.y - bounds.min.y);
  const factor = targetHeight / height;
  wrapper.scale.setScalar(factor);
  bounds = new THREE.Box3().setFromObject(wrapper, true);
  wrapper.position.y -= bounds.min.y;
  wrapper.traverse(obj => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) { mat.side = THREE.DoubleSide; if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace; }
    }
  });
  return wrapper;
}

function addActor(id, data, model, position, { playerActor = false, wander = 0 } = {}) {
  const group = new THREE.Group();
  group.name = data.name;
  const bodyHeight = CHARACTER_HEIGHT_METERS;
  const body = normalizeModel(model, bodyHeight);
  group.add(body);
  group.position.copy(position);
  scene.add(group);
  let mixer = null;
  let actions = {};
  if (model.animations?.length) {
    mixer = new THREE.AnimationMixer(body);
    for (const clip of model.animations) {
      const key = clip.name.toLowerCase();
      if (key.includes('idle') && !actions.idle) actions.idle = mixer.clipAction(clip);
      if ((key.includes('walk') || key.includes('run')) && !actions.walk) actions.walk = mixer.clipAction(clip);
      if (key.includes('talk') && !actions.talk) actions.talk = mixer.clipAction(clip);
    }
    if (actions.idle) actions.idle.play();
  }
  const actor = { id, data, group, body, bodyHeight, mixer, actions, spawn: position.clone(), wander, wanderTarget: position.clone(), wanderWait: Math.random() * 2 };
  actors.set(id, actor);
  if (!playerActor) npcActors.push(actor);
  return actor;
}

function setPlayerAnimation(name) {
  if (activePlayerAction === name || !playerMixer || !playerActions[name]) return;
  playerActions[name]?.reset().fadeIn(0.2).play();
  playerActions[activePlayerAction]?.fadeOut(0.18);
  activePlayerAction = name;
}

function addShopMarker(position, label, hotkey = 'E', color = '#f2bf6d') {
  const root = new THREE.Group();
  root.position.copy(position);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.055, 8, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  ring.rotation.x = Math.PI / 2; root.add(ring);
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: addTextTexture(`${hotkey} · ${label}`, 900, 220, '#211d14', '#f0bd68'), depthTest: false }));
  badge.scale.set(2.8, 0.68, 1); badge.position.y = 1.55; root.add(badge);
  root.userData.baseY = position.y;
  scene.add(root); markers.push(root); return root;
}

function buildWorldActors() {
  const model = id => assets.get(`characters/${id}`);
  const sheru = addActor('sheru', { name: 'Sheru' }, model('player.glb'), player.position, { playerActor: true });
  player.group = sheru.group; player.mesh = sheru.body; playerMixer = sheru.mixer; playerActions = sheru.actions;
  const mother = addActor('mother', npcDirectory.mother, model('women-0.glb'), stationPositions.mother.clone());
  const customer = addActor('customer', npcDirectory.customer, model('men-0.glb'), stationPositions.customer.clone());
  const jomon = addActor('jomon', npcDirectory.jomon, model('men-1.glb'), new THREE.Vector3(-6,0,8), { wander: 2.8 });
  addActor('latha', npcDirectory.latha, model('women-1.glb'), new THREE.Vector3(-13,0,-11), { wander: 2.0 });
  addActor('raghavan', npcDirectory.raghavan, model('men-2.glb'), new THREE.Vector3(-21,0,10), { wander: 1.4 });
  addActor('shibu', npcDirectory.shibu, model('men-0.glb'), new THREE.Vector3(31,0,14), { wander: 2.0 });
  addActor('kunjikka', npcDirectory.kunjikka, model('men-3.glb'), new THREE.Vector3(-36,0,22), { wander: 1.3 });
  addActor('worker', npcDirectory.worker, model('men-2.glb'), new THREE.Vector3(48,0,-35), { wander: 1.6 });
  for (const [actor, yaw] of [[mother,Math.PI],[customer,Math.PI],[jomon,0]]) actor.group.rotation.y = yaw;
  buildJuiceShop();
  for (const actor of npcActors) {
    actor.nameTag = makeNameTag(actor.data.name);
    scene.add(actor.nameTag);
  }
  const sheruActor = actors.get('sheru');
  sheruActor.nameTag = makeNameTag('SHERU'); scene.add(sheruActor.nameTag);
  // The vehicle meshes are Kenney CC0 models; no unknown-license sports-car model is used.
  const carGltf = assets.get('cars/sedan.glb');
  currentCar = makeVehicle(carGltf, new THREE.Vector3(-9,0,-5));
  player.position.set(-3,0,10); player.group.position.copy(player.position);
  cameraTarget.copy(player.position).add(new THREE.Vector3(0,PLAYER_CAMERA_LOOK_HEIGHT_METERS,0));
}

function getEditorObjects() {
  const result = new Map();
  for (const actor of actors.values()) result.set(actor.id, { id: actor.id, label: actor.data.name || 'Sheru', group: actor.group, actor });
  if (currentCar) result.set('sedan', { id: 'sedan', label: 'Sedan', group: currentCar.group });
  if (juiceShopGroup) result.set('juice-shop', { id: 'juice-shop', label: 'Amma’s Juice Shop', group: juiceShopGroup });
  return result;
}

function readObjectTransforms() {
  const objects = {};
  for (const [id, item] of getEditorObjects()) objects[id] = { position: item.group.position.toArray(), rotationY: item.group.rotation.y, scale: item.group.scale.x };
  return objects;
}

function applyLayout(layout) {
  if (!layout?.objects) return;
  for (const [id, transform] of Object.entries(layout.objects)) {
    const item = getEditorObjects().get(id);
    if (!item || !transform) continue;
    if (Array.isArray(transform.position)) item.group.position.fromArray(transform.position);
    if (Number.isFinite(transform.rotationY)) item.group.rotation.y = transform.rotationY;
    if (Number.isFinite(transform.scale)) item.group.scale.setScalar(Math.max(0.05, transform.scale));
    if (item.actor) {
      item.actor.spawn.copy(item.group.position);
      item.actor.wanderTarget.copy(item.group.position);
      if (id === 'sheru') player.position.copy(item.group.position);
    }
  }
  const shopTransform = layout.objects['juice-shop']?.position;
  if (shopTransform) {
    const dx = shopTransform[0] - 15, dz = shopTransform[2] - 0;
    const base = { mother: [15,0,-2.2], fruit: [11.1,0,-2.4], board: [12.2,0,-0.2], blender: [12.2,0,1.7], customer: [22,0,4], payment: [22,0,4] };
    for (const [key, p] of Object.entries(base)) stationPositions[key].set(p[0]+dx,p[1],p[2]+dz);
  }
}

function setObjectTransform(id, position, rotationY = 0, scale = 1) {
  const item = getEditorObjects().get(id);
  if (!item) return;
  item.group.position.fromArray(position); item.group.rotation.y = rotationY; item.group.scale.setScalar(scale);
  if (item.actor) { item.actor.spawn.copy(item.group.position); item.actor.wanderTarget.copy(item.group.position); if (id === 'sheru') player.position.copy(item.group.position); }
}

function stagePositions() {
  const ids = [...actors.keys()];
  ids.forEach((id, index) => {
    const col = index % 5, row = Math.floor(index / 5);
    setObjectTransform(id, [(col-2)*5,0,row*5], 0, 1);
  });
  setObjectTransform('sedan',[15,0,5],0,1);
  setObjectTransform('juice-shop',[0,0,-15],0,1);
}

function updateEditorFields() {
  if (!editorSelection) return;
  const { group } = editorSelection;
  $('#edit-x').value = group.position.x.toFixed(2); $('#edit-y').value = group.position.y.toFixed(2); $('#edit-z').value = group.position.z.toFixed(2);
  $('#edit-yaw').value = THREE.MathUtils.radToDeg(group.rotation.y).toFixed(0); $('#edit-scale').value = group.scale.x.toFixed(2);
}

function selectEditorObject(id) {
  editorSelection = editorObjects.get(id) || null;
  if (editorSelectionBox) scene.remove(editorSelectionBox);
  editorSelectionBox = editorSelection ? new THREE.BoxHelper(editorSelection.group, '#f1bd6d') : null;
  if (editorSelectionBox) scene.add(editorSelectionBox);
  updateEditorFields();
}

function enterEditing() {
  editing = true; titleOpen = false; paused = false; storyMode = false; gameMode = 'editing';
  $('#title-screen').classList.add('hidden'); $('#hud').classList.add('hidden'); $('#cutscene').classList.add('hidden');
  $('#editor-panel').classList.remove('hidden'); $('#pause-menu').classList.add('hidden');
  mapRoot.visible = false; editorGrid.visible = true; player.group.visible = true;
  if (!defaultLayout) defaultLayout = { objects: readObjectTransforms() };
  if (savedLayout?.objects) applyLayout(savedLayout); else stagePositions();
  editorObjects = getEditorObjects();
  const select = $('#editor-object'); select.replaceChildren();
  for (const item of editorObjects.values()) { const option=document.createElement('option'); option.value=item.id; option.textContent=item.label; select.append(option); }
  selectEditorObject('sheru');
  const cameraData = savedLayout?.camera || {};
  editorCameraDistance = 24; gameCameraDistance = cameraData.gameDistance ?? 2;
  $('#edit-camera').value = String(editorCameraDistance); $('#edit-camera-value').textContent = String(editorCameraDistance);
  $('#edit-game-camera').value = String(gameCameraDistance); $('#edit-game-camera-value').textContent = String(gameCameraDistance);
  cameraYaw = cameraData.yaw ?? 0.25; cameraPitch = cameraData.pitch ?? 0.25;
  editorCameraTarget.set(0,1,0); cameraTarget.copy(editorCameraTarget);
  $('#editor-status').textContent = savedLayout ? 'Loaded your saved layout. Select and edit any item.' : 'Arrange the characters, shop, and car. Save to use this layout in both modes.';
}

function saveEditorLayout() {
  const layout = { version: 1, objects: readObjectTransforms(), camera: { gameDistance: gameCameraDistance, yaw: cameraYaw, pitch: cameraPitch } };
  localStorage.setItem('sheru-kochi-layout', JSON.stringify(layout)); savedLayout = layout;
  $('#editor-status').textContent = 'Layout saved on this device. Story and Open World will use it.';
}

function exitEditing() {
  editing = false; $('#editor-panel').classList.add('hidden'); $('#title-screen').classList.remove('hidden');
  mapRoot.visible = true; editorGrid.visible = false; titleOpen = true;
  if (editorSelectionBox) scene.remove(editorSelectionBox); editorSelectionBox = null; editorSelection = null;
  applyLayout(savedLayout || defaultLayout);
}

function makeNameTag(name) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const c = canvas.getContext('2d'); c.fillStyle = '#17201ddd'; c.beginPath(); c.roundRect(12, 15, 488, 100, 22); c.fill();
  c.fillStyle = '#f5e8cd'; c.font = '700 46px Segoe UI, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name.toUpperCase(), 256, 65);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(2.4,0.6,1); sprite.position.y=0.6; sprite.userData.isNameTag=true; return sprite;
}

function makeVehicle(model, position) {
  const group = new THREE.Group();
  const body = cloneSkeleton(model.scene);
  group.add(body);
  let bounds = new THREE.Box3().setFromObject(group);
  const length = Math.max(bounds.max.x-bounds.min.x, bounds.max.z-bounds.min.z);
  group.scale.setScalar(4.2 / Math.max(length,0.01));
  bounds = new THREE.Box3().setFromObject(group);
  group.position.y -= bounds.min.y;
  group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material?.map)o.material.map.colorSpace=THREE.SRGBColorSpace}});
  group.position.x=position.x; group.position.z=position.z;
  group.userData={isVehicle:true};
  scene.add(group);
  return { group, speed: 0, maxSpeed: 36, length: 4.2 };
}

function nearestActor(maxDist = Infinity) {
  let best = null; let bestDist = maxDist;
  for (const actor of npcActors) {
    const d = player.position.distanceTo(actor.group.position);
    if (d < bestDist) { bestDist=d; best=actor; }
  }
  return best ? { actor: best, distance: bestDist } : null;
}

function storyStation() {
  if (!storyMode || missionComplete) return null;
  const key = missionOne.stations[currentMissionStep];
  return key ? { key, position: stationPositions[key], action: missionOne.steps[currentMissionStep] } : null;
}

function activeStationKey() {
  return missionOne.stations[currentMissionStep];
}

function refreshStationMarker() {
  for (const marker of markers) { scene.remove(marker); marker.traverse(o=>{if(o.material?.map)o.material.map.dispose()}); }
  markers.length=0;
  const station = storyStation();
  if (station) addShopMarker(station.position, station.key === 'mother' ? 'TALK TO AMMA' : station.key === 'fruit' ? 'PAPAYA' : station.key === 'board' ? 'PREPARE' : station.key === 'blender' ? 'BLEND' : station.key === 'customer' ? 'SERVE' : 'PAYMENT', station.key === 'mother' ? 'T' : 'E');
}

function updateMissionHud() {
  $('#mode-label').textContent = storyMode ? 'STORY MODE' : 'OPEN WORLD';
  $('#mission-kicker').textContent = storyMode ? (missionComplete ? 'STORY · FREE ROAM' : 'MAIN MISSION · 01') : 'SANDBOX · ALL VEHICLES';
  $('#mission-title').textContent = storyMode ? (missionComplete ? 'A DAY IN MAHE' : 'JUICE MASTER') : 'KOCHI FREE ROAM';
  $('#objective-text').textContent = storyMode ? (missionComplete ? 'Explore the city, talk to locals, and take the wheel.' : missionOne.steps[currentMissionStep]) : 'Explore, drive, or press T near any local to talk.';
  $('#money-text').textContent = `₹ ${Number(cash).toLocaleString('en-IN')}`;
  refreshStationMarker();
}

function toast(message, duration = 2600) {
  const el = $('#toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(toastHandle); toastHandle = setTimeout(() => el.classList.remove('visible'), duration);
}

function missionUpdate(message, reward = null) {
  if (reward) cash += reward;
  $('#mission-toast-text').textContent = message;
  $('#mission-toast').classList.remove('hidden');
  setTimeout(() => $('#mission-toast').classList.add('hidden'), 3000);
  updateMissionHud(); saveGame(false);
}

function setMissionStep(step, message = null) {
  currentMissionStep = step;
  if (step >= missionOne.steps.length) {
    missionComplete = true;
    currentMissionStep = missionOne.steps.length - 1;
  }
  updateMissionHud();
  if (message) missionUpdate(message, step >= missionOne.steps.length ? missionOne.rewards : null);
}

function startCutscene() {
  cutsceneIndex = 0;
  cameraYaw = Math.PI;
  $('#cutscene').classList.remove('hidden');
  $('#hud').classList.add('hidden');
  showCutsceneLine();
}

function showCutsceneLine() {
  const item = openingCutscene[cutsceneIndex];
  if (!item) return finishCutscene();
  $('#cutscene-count').textContent = `SCENE 01 / ${String(openingCutscene.length).padStart(2,'0')}`;
  $('#cutscene-speaker').textContent = item.speaker;
  $('#cutscene-line').textContent = item.line;
  const actor = actors.get(item.character);
  if (actor) {
    cameraTarget.copy(actor.group.position).add(new THREE.Vector3(0,1.1,0));
    cameraYaw += 0.035;
  }
}

function nextCutsceneLine() {
  if (cutsceneIndex < 0) return;
  cutsceneIndex += 1;
  if (cutsceneIndex >= openingCutscene.length) finishCutscene();
  else showCutsceneLine();
}

function finishCutscene() {
  cutsceneIndex = -1;
  $('#cutscene').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  player.group.position.copy(player.position);
  cameraYaw = savedLayout?.camera?.yaw ?? 0.08;
  cameraTarget.copy(player.position).add(new THREE.Vector3(0,PLAYER_CAMERA_LOOK_HEIGHT_METERS,0));
  setMissionStep(0);
  missionUpdate('MISSION STARTED · JUICE MASTER');
}

function startMode(mode) {
  editing = false; editorGrid.visible = false; mapRoot.visible = true; $('#editor-panel').classList.add('hidden');
  applyLayout(savedLayout); gameCameraDistance = savedLayout?.camera?.gameDistance ?? 2;
  cameraYaw = savedLayout?.camera?.yaw ?? 0.08; cameraPitch = savedLayout?.camera?.pitch ?? 0.25;
  player.group.visible = true; inCar = false;
  cameraTarget.copy(player.position).add(new THREE.Vector3(0,PLAYER_CAMERA_LOOK_HEIGHT_METERS,0));
  storyMode = mode === 'story'; gameMode = storyMode ? 'story' : 'open'; paused = false; titleOpen = false;
  $('#title-screen').classList.add('hidden'); $('#pause-menu').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  if (storyMode) {
    currentMissionStep = 0; missionComplete = false; cash = 0;
    if (bootData.version === 1 && bootData.mode === 'story' && bootData.storyStep > 0) {
      currentMissionStep = Math.min(bootData.storyStep, missionOne.steps.length - 1);
      cash = bootData.cash || 0; missionComplete = !!bootData.missionComplete;
    }
    updateMissionHud(); startCutscene();
  } else {
    missionComplete = true; cash = 1_000_000; currentMissionStep = 0;
    updateMissionHud(); toast('Sandbox loaded · cash and vehicles unlocked.');
  }
}

function setPause(state) {
  if (titleOpen || activeNpc || cutsceneIndex >= 0) return;
  paused = state;
  $('#pause-menu').classList.toggle('hidden', !state);
  if (state && document.pointerLockElement === canvas) document.exitPointerLock();
}

function completeInteraction() {
  if (inCar) return toast('Press F to step out of the car.');
  if (storyMode && !missionComplete) {
    const key = activeStationKey();
    const station = stationPositions[key];
    if (player.position.distanceTo(station) < 4.5) {
      if (key === 'mother') {
        openDialogue(actors.get('mother'));
      } else if (key === 'fruit') {
        setMissionStep(2, 'PAPAYA PICKED UP');
        toast('Papaya is ready. Take it to the cutting board.');
      } else if (key === 'board') {
        setMissionStep(3, 'PAPAYA PREPARED');
      } else if (key === 'blender') {
        setMissionStep(4, 'PAPAYA JUICE READY · NO SUGAR');
      } else if (key === 'customer') {
        setMissionStep(5, 'ORDER SERVED');
      } else if (key === 'payment') {
        missionComplete = true; currentMissionStep = missionOne.steps.length - 1; cash += missionOne.rewards;
        updateMissionHud(); missionUpdate('MISSION PASSED · JUICE MASTER', 0);
        $('#objective-text').textContent = 'The customer paid. Open world free roam is now unlocked.';
        toast('₹120 collected · open world free roam unlocked.'); saveGame(false);
      }
      return;
    }
  }
  const found = nearestActor(5.5);
  if (found) return openDialogue(found.actor);
  toast('Move closer to the highlighted shop station or a person.');
}

function enterExitVehicle() {
  if (!currentCar) return;
  if (inCar) {
    inCar = false;
    player.position.copy(currentCar.group.position).add(new THREE.Vector3(2.3,0,0));
    player.group.position.copy(player.position); player.group.visible = true;
    toast('Back on foot.'); return;
  }
  if (player.position.distanceTo(currentCar.group.position) < 5.8) {
    inCar = true; player.group.visible = false; carSpeed = 0; toast('Driving · WASD steer and accelerate · F to exit.');
  } else toast('Walk to the parked sedan and press F.');
}

function advanceCutscene() {
  if (cutsceneIndex >= 0) nextCutsceneLine();
}

function openDialogue(actor) {
  activeNpc = actor;
  if (!actor.data?.opener) actor.data = npcDirectory[actor.id] || npcDirectory.stranger;
  if (storyMode && !missionComplete && currentMissionStep === 0 && actor.id === 'mother') {
    setMissionStep(1, 'AMMA’S ORDER IS IN · MAKE A PAPAYA JUICE');
  }
  $('#npc-initial').textContent = actor.data.initials || actor.data.name.slice(0,2).toUpperCase();
  $('#npc-name').textContent = actor.data.name;
  $('#npc-role').textContent = actor.data.role;
  $('#npc-opener').textContent = actor.data.opener;
  $('#chat-log').replaceChildren();
  $('#dialogue-panel').classList.remove('hidden');
  $('#talk-input').focus();
  addChatBubble(actor.data.opener, 'npc');
  if (actor.actions?.talk) { actor.actions.idle?.fadeOut(0.1); actor.actions.talk.reset().play(); }
}

function closeDialogue() {
  if (!activeNpc) return;
  if (activeNpc.actions?.talk) { activeNpc.actions.talk.fadeOut(0.16); activeNpc.actions.idle?.reset().fadeIn(0.16).play(); }
  activeNpc = null;
  $('#dialogue-panel').classList.add('hidden');
  $('#talk-input').blur();
}

function addChatBubble(text, who) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${who === 'player' ? 'player-bubble' : 'npc-bubble'}`;
  bubble.textContent = text;
  $('#chat-log').append(bubble);
  $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
}

async function sendNpcLine(text) {
  const message = text.trim();
  if (!message || !activeNpc) return;
  const npcId = activeNpc.id;
  addChatBubble(message, 'player'); $('#talk-input').value = '';
  $('#chat-status').textContent = 'QWEN 0.6B · LOCAL THINKING…';
  const wait = document.createElement('div'); wait.className='chat-bubble npc-bubble waiting'; wait.textContent='Thinking…'; $('#chat-log').append(wait);
  try {
    const response = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({npc:npcId,message,language:talkLanguage}) });
    const data = await response.json();
    wait.remove();
    if (!response.ok) throw new Error(data.error || 'Local chat could not answer.');
    addChatBubble(data.reply, 'npc');
    $('#chat-status').textContent = `${data.model} · ${data.elapsedMs} ms · LOCAL`;
    if (voiceOn) speakLine(data.reply, talkLanguage, activeNpc.data.voice).catch(()=>{});
  } catch (error) {
    wait.remove(); addChatBubble(error.message, 'npc'); $('#chat-status').textContent='LOCAL NPC CHAT UNAVAILABLE';
  }
}

async function speakLine(text, preferredLanguage = 'mixed', voice = 'male') {
  const chunks = text.match(/[\u0d00-\u0d7f]+(?:[\u0d00-\u0d7f\s,!?।]+)?|[^\u0d00-\u0d7f]+/g) || [text];
  for (const chunk of chunks) {
    const line = chunk.trim(); if (!line) continue;
    const language = /[\u0d00-\u0d7f]/.test(line) ? 'ml' : preferredLanguage === 'ml' ? 'ml' : 'en';
    const response = await fetch('/api/tts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:line,language,voice}) });
    if (!response.ok) continue;
    const blob = await response.blob();
    await new Promise(resolve => { const audio = new Audio(URL.createObjectURL(blob)); audio.onended=resolve; audio.onerror=resolve; audio.play().catch(resolve); });
  }
}

function resampleTo16k(buffer) {
  const sampleRate = 16000;
  const length = Math.ceil(buffer.duration * sampleRate);
  const offline = new OfflineAudioContext(1, length, sampleRate);
  const source = offline.createBufferSource(); source.buffer=buffer; source.connect(offline.destination); source.start(0);
  return offline.startRendering().then(rendered => rendered.getChannelData(0));
}

async function loadShruti() {
  if (!asrPromise) asrPromise = (async () => {
    $('#chat-status').textContent = 'LOADING SHRUTI MALAYALAM MODEL…';
    const [{ createShruti }, ort] = await Promise.all([import('shruti-onnx'), import('onnxruntime-web/wasm')]);
    ort.env.wasm.numThreads = 1;
    return createShruti({ ort, language: 'malayalam' });
  })();
  return asrPromise;
}

async function toggleRecording() {
  const button = $('#record-talk');
  if (mediaRecorder?.state === 'recording') { mediaRecorder.stop(); button.classList.remove('recording'); button.textContent='●'; return; }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, channelCount:1 } });
    const chunks=[];
    mediaRecorder = new MediaRecorder(micStream);
    mediaRecorder.ondataavailable = event => { if(event.data.size) chunks.push(event.data); };
    mediaRecorder.onstop = async () => {
      micStream?.getTracks().forEach(track=>track.stop()); micStream=null;
      try {
        $('#chat-status').textContent='SHRUTI · TRANSCRIBING ON THIS DEVICE…';
        const blob = new Blob(chunks,{type:mediaRecorder.mimeType||'audio/webm'});
        const context = audioContext || (audioContext = new AudioContext());
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        const pcm = await resampleTo16k(decoded);
        const recognizer = await loadShruti();
        const result = await recognizer.transcribe(pcm, { loops:'cut' });
        const spoken = result.text?.trim();
        if (spoken) { $('#talk-input').value=spoken; $('#chat-status').textContent='SHRUTI · REVIEW YOUR TRANSCRIPT, THEN SEND'; }
        else $('#chat-status').textContent='SHRUTI HEARD NO CLEAR WORDS · TRY AGAIN';
      } catch(error) { $('#chat-status').textContent='SHRUTI ERROR · '+String(error.message||error).slice(0,95); toast('Speech stayed on this device. Type the line if recognition is unclear.'); }
    };
    mediaRecorder.start(); button.classList.add('recording'); button.textContent='■'; $('#chat-status').textContent='RECORDING · PRESS ■ WHEN YOU FINISH';
  } catch(error) { toast('Microphone permission is needed to record. You can type instead.'); }
}

function updateNpcWander(dt) {
  if (editing) return;
  for (const npc of npcActors) {
    if (!npc.wander || activeNpc === npc) continue;
    npc.wanderWait -= dt;
    if (npc.wanderWait <= 0 && npc.group.position.distanceTo(npc.wanderTarget) < 0.3) {
      npc.wanderTarget.copy(npc.spawn).add(new THREE.Vector3((Math.random()-.5)*npc.wander*2,0,(Math.random()-.5)*npc.wander*2));
      npc.wanderWait = 1.2 + Math.random()*3;
    }
    const delta = npc.wanderTarget.clone().sub(npc.group.position); delta.y=0;
    if (delta.length() > 0.25) {
      delta.normalize(); npc.group.position.addScaledVector(delta,dt*0.72); npc.group.rotation.y=Math.atan2(delta.x,delta.z); npc.actions.walk?.play();
    } else npc.actions.walk?.fadeOut(0.15);
    npc.mixer?.update(dt);
    if(npc.nameTag){npc.nameTag.position.set(npc.group.position.x,npc.group.position.y+npc.bodyHeight+0.6,npc.group.position.z)}
  }
}

function updatePlayer(dt) {
  if (editing || (storyMode && cutsceneIndex >= 0)) return;
  if (activeNpc || titleOpen || paused) return;
  const forwardInput = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const sideInput = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const run = keys.has('shift');
  const max = run ? 12.2 : player.speed;
  if (inCar && currentCar) {
    const throttle = forwardInput;
    carSpeed = THREE.MathUtils.damp(carSpeed, throttle * currentCar.maxSpeed * (run ? 1 : 0.74), 1.7, dt);
    if (!throttle && Math.abs(carSpeed)<0.15) carSpeed=0;
    currentCar.group.rotation.y += sideInput * Math.min(1.4,Math.abs(carSpeed)*0.045)*dt*Math.sign(carSpeed||1);
    const forward = new THREE.Vector3(Math.sin(currentCar.group.rotation.y),0,Math.cos(currentCar.group.rotation.y));
    currentCar.group.position.addScaledVector(forward,-carSpeed*dt);
    currentCar.group.position.x=THREE.MathUtils.clamp(currentCar.group.position.x,mapBounds.minX,mapBounds.maxX);
    currentCar.group.position.z=THREE.MathUtils.clamp(currentCar.group.position.z,mapBounds.minZ,mapBounds.maxZ);
    player.position.copy(currentCar.group.position);
    if(Math.abs(carSpeed)>0.3) cameraYaw=THREE.MathUtils.damp(cameraYaw,currentCar.group.rotation.y,1.4,dt);
    setPlayerAnimation('idle');
    return;
  }
  moveVector.set(sideInput,0,-forwardInput);
  if (moveVector.lengthSq()>0) {
    moveVector.normalize();
    const cos=Math.cos(cameraYaw),sin=Math.sin(cameraYaw);
    cameraForward.set(moveVector.x*cos+moveVector.z*sin,0,-moveVector.x*sin+moveVector.z*cos).normalize();
    const distance=max*dt;
    player.position.addScaledVector(cameraForward,distance);
    player.position.x=THREE.MathUtils.clamp(player.position.x,mapBounds.minX,mapBounds.maxX);
    player.position.z=THREE.MathUtils.clamp(player.position.z,mapBounds.minZ,mapBounds.maxZ);
    player.group.rotation.y=Math.atan2(cameraForward.x,cameraForward.z);
    player.running=run;
    setPlayerAnimation(run?'run':'walk');
  } else { player.running=false; setPlayerAnimation('idle'); }
  player.group.position.copy(player.position);
}

function updateInteractionPrompt() {
  if (titleOpen || paused || cutsceneIndex >= 0) return;
  const tip=$('#interaction-tip');
  if (activeNpc) { tip.textContent='TALKING · ESC TO CLOSE'; return; }
  if (inCar) { tip.innerHTML='<kbd>W A S D</kbd> DRIVE · <kbd>F</kbd> EXIT'; return; }
  const station=storyStation();
  if (station) {
    const d=player.position.distanceTo(station.position);
    const action=station.key==='mother'?'T · TALK TO AMMA':'E · '+station.key.toUpperCase();
    tip.innerHTML=d<5?`<kbd>${action}</kbd>`:`OBJECTIVE · ${station.action.toUpperCase()}`;
    return;
  }
  const npc=nearestActor(5.5);
  if (npc) { tip.innerHTML=`<kbd>T</kbd> TALK TO ${npc.actor.data.name.toUpperCase()}`; return; }
  if (currentCar && player.position.distanceTo(currentCar.group.position)<5.8) { tip.innerHTML='<kbd>F</kbd> ENTER SEDAN'; return; }
  tip.textContent=storyMode?'EXPLORE MAHE · TALK TO LOCALS':'WALK, DRIVE AND MEET THE LOCALS';
}

function updateCamera(dt) {
  if (editing) {
    cameraTarget.lerp(editorCameraTarget,Math.min(1,dt*4));
    const lift=Math.max(4,editorCameraDistance*0.32);
    cameraWanted.set(cameraTarget.x-Math.sin(cameraYaw)*editorCameraDistance,cameraTarget.y+lift+cameraPitch*5,cameraTarget.z+Math.cos(cameraYaw)*editorCameraDistance);
  } else if (storyMode && cutsceneIndex>=0) {
    cameraTarget.lerp(actors.get(openingCutscene[cutsceneIndex]?.character)?.group.position.clone().add(new THREE.Vector3(0,1.1,0)) || player.position, Math.min(1,dt*0.7));
    const closeDistance=CUTSCENE_CAMERA_DISTANCE_METERS;
    cameraWanted.set(cameraTarget.x-Math.sin(cameraYaw)*closeDistance,cameraTarget.y+0.9+cameraPitch*1.5,cameraTarget.z+Math.cos(cameraYaw)*closeDistance);
  } else {
    const targetPos=inCar&&currentCar?currentCar.group.position:player.position;
    cameraTarget.lerp(targetPos.clone().add(new THREE.Vector3(0,inCar?1.3:1.1,0)),Math.min(1,dt*5));
    const distance=inCar?10:gameCameraDistance;
    const cameraLift=inCar?2.6:0.9;
    cameraWanted.set(cameraTarget.x-Math.sin(cameraYaw)*distance,cameraTarget.y+cameraLift+cameraPitch*5,cameraTarget.z+Math.cos(cameraYaw)*distance);
  }
  camera.position.lerp(cameraWanted,Math.min(1,dt*4.7));
  camera.lookAt(cameraTarget);
}

function updateMarkers(dt) {
  for (const marker of markers) {
    marker.position.y = marker.userData.baseY + Math.sin(elapsed*2.3)*0.12;
    marker.rotation.y += dt*0.32;
    const show = storyMode && !titleOpen && cutsceneIndex < 0 && !paused && !missionComplete && storyStation();
    marker.visible = !!show;
  }
}

function animate(timestamp) {
  requestAnimationFrame(animate);
  clock.update(timestamp);
  const dt=Math.min(clock.getDelta(),0.04); elapsed+=dt; frameTime+=dt;
  if (!paused) {
    updatePlayer(dt);
    playerMixer?.update(dt);
    updateNpcWander(dt);
    updateCamera(dt);
    updateMarkers(dt);
    if (editing && editorSelectionBox) editorSelectionBox.update();
    for (const actor of actors.values()) if (actor.nameTag) actor.nameTag.position.set(actor.group.position.x,actor.group.position.y+actor.bodyHeight*actor.group.scale.y+0.6,actor.group.position.z);
    if (frameTime>0.24) { updateInteractionPrompt(); frameTime=0; }
    if (elapsed-autoSaveAt>30 && !titleOpen && !editing) { saveGame(false); autoSaveAt=elapsed; }
  }
  renderer.render(scene,camera);
}

async function loadWorld() {
  try {
    setLoad('Loading your map · 81 MB…', 2);
    const files = [
      ['map','/maps/map_game_ready.glb',2,74],
      ['player.glb','/assets/characters/player.glb'],
      ['men-0.glb','/assets/characters/men-0.glb'],
      ['men-1.glb','/assets/characters/men-1.glb'],
      ['men-2.glb','/assets/characters/men-2.glb'],
      ['men-3.glb','/assets/characters/men-3.glb'],
      ['women-0.glb','/assets/characters/women-0.glb'],
      ['women-1.glb','/assets/characters/women-1.glb'],
      ['sedan.glb','/assets/cars/sedan.glb'],
    ];
    const results=await Promise.all(files.map(async ([key,url,base,span])=>[key,await loadGLB(url,base||75,span||2)]));
    for(const [key,gltf] of results) assets.set(key==='map'?'map':key.startsWith('men')||key.startsWith('women')||key==='player.glb'?`characters/${key}`:`cars/${key}`,gltf);
    setLoad('Building the streets of Kochi…', 79);
    const gltf=assets.get('map');
    const map=gltf.scene;
    map.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=false;o.frustumCulled=true;if(o.material){const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){if(m.map)m.map.colorSpace=THREE.SRGBColorSpace;m.side=THREE.DoubleSide}}}});
    mapRoot.add(map);
    buildWorldActors();
    defaultLayout = { objects: readObjectTransforms() };
    applyLayout(savedLayout);
    worldLoaded=true;
    $('#loading-screen').classList.add('hidden');
    $('#title-screen').classList.remove('hidden');
    updateMissionHud();
    const saved=$('#continue-game');
    if(bootData.version===1 && (bootData.storyStep>0||bootData.missionComplete)) saved.classList.remove('hidden');
    await checkLocalServices();
    animate();
  } catch(error) {
    console.error(error);
    setLoad('Could not load one of the local models. Check public/assets and restart.', 100);
  }
}

async function checkLocalServices() {
  try {
    const r=await fetch('/api/health'); const d=await r.json();
    voiceReady={ml:d.ttsMalayalam,en:d.ttsEnglish};
    $('#voice-status').textContent=`LOCAL AI · ${d.ollama?'QWEN 0.6B READY':'START OLLAMA FOR NPC CHAT'} · SHRUTI STT · TINY TTS ${d.ttsMalayalam&&d.ttsEnglish?'READY':'SETUP OPTIONAL'}`;
  } catch { $('#voice-status').textContent='LOCAL AI SERVICES WILL APPEAR WHEN THE WEB SERVER STARTS'; }
}

window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6))});
document.addEventListener('keydown',event=>{
  const key=event.key.toLowerCase();
  if (editing) {
    if (key==='escape') { exitEditing(); return; }
    if (event.target.matches('input,select')) return;
    const step = event.shiftKey ? 2 : 0.5;
    if (key==='w'||key==='arrowup') editorCameraTarget.z -= step;
    if (key==='s'||key==='arrowdown') editorCameraTarget.z += step;
    if (key==='a'||key==='arrowleft') editorCameraTarget.x -= step;
    if (key==='d'||key==='arrowright') editorCameraTarget.x += step;
    return;
  }
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift',' '].includes(key)&&!event.target.matches('input')){keys.add(key);if(key===' ')event.preventDefault()}
  if(event.repeat)return;
  if(key==='escape'){
    if(activeNpc)closeDialogue();
    else if(cutsceneIndex>=0)advanceCutscene();
    else if(!titleOpen)setPause(!paused);
  }
  if(key==='enter'&&cutsceneIndex>=0)advanceCutscene();
  if((key==='t')&&!event.target.matches('input')&&!titleOpen&&!paused){
    if(activeNpc)closeDialogue();
    else {const found=nearestActor(5.5);if(found)openDialogue(found.actor);else toast('Walk within a few steps of someone first.')}
  }
  if(key==='e'&&!event.target.matches('input')&&!titleOpen&&!paused&&!activeNpc)completeInteraction();
  if(key==='f'&&!event.target.matches('input')&&!titleOpen&&!paused&&!activeNpc)enterExitVehicle();
  if(key==='m'&&!event.target.matches('input')&&!titleOpen)toast('Map view will open after this first playable slice.',2000);
});
document.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
window.addEventListener('blur',()=>keys.clear());
canvas.addEventListener('pointerdown',event=>{pointerDown=true;lastPointer={x:event.clientX,y:event.clientY};canvas.setPointerCapture?.(event.pointerId)});
canvas.addEventListener('pointerup',()=>{pointerDown=false;lastPointer=null});
canvas.addEventListener('pointermove',event=>{if(!pointerDown||!lastPointer)return;cameraYaw-=(event.clientX-lastPointer.x)*0.003;cameraPitch=THREE.MathUtils.clamp(cameraPitch+(event.clientY-lastPointer.y)*0.0018,-0.1,0.72);lastPointer={x:event.clientX,y:event.clientY}});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('wheel',event=>{if(!editing)return;event.preventDefault();editorCameraDistance=THREE.MathUtils.clamp(editorCameraDistance+Math.sign(event.deltaY)*1.5,8,55);$('#edit-camera').value=String(editorCameraDistance);$('#edit-camera-value').textContent=String(editorCameraDistance)},{passive:false});

$('#start-story').onclick=()=>startMode('story');
$('#start-free').onclick=()=>startMode('free');
$('#start-edit').onclick=enterEditing;
$('#continue-game').onclick=()=>startMode('story');
$('#skip-cutscene').onclick=()=>finishCutscene();
$('#cutscene').addEventListener('click',event=>{if(event.target.id!=='skip-cutscene')advanceCutscene()});
$('#close-dialogue').onclick=closeDialogue;
$('#talk-input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();sendNpcLine($('#talk-input').value)}});
$('#send-talk').onclick=()=>sendNpcLine($('#talk-input').value);
$('#record-talk').onclick=toggleRecording;
document.querySelectorAll('.quick-lines button').forEach(button=>button.onclick=()=>sendNpcLine(button.dataset.line));
document.querySelectorAll('.language').forEach(button=>button.onclick=()=>{document.querySelectorAll('.language').forEach(b=>b.classList.remove('active'));button.classList.add('active');talkLanguage=button.dataset.language;});
$('#voice-toggle').onclick=()=>{voiceOn=!voiceOn;$('#voice-toggle').textContent=voiceOn?'VOICE ON':'VOICE OFF';$('#voice-toggle').classList.toggle('active',voiceOn);if(voiceOn&&(!voiceReady.ml||!voiceReady.en))toast('Install local Indic Tiny voices with npm run voice:models.');};
$('#resume-game').onclick=()=>setPause(false);
$('#save-game').onclick=()=>saveGame(true);
$('#back-title').onclick=()=>{saveGame(false);setPause(false);$('#hud').classList.add('hidden');$('#title-screen').classList.remove('hidden');titleOpen=true};

$('#editor-object').onchange=event=>selectEditorObject(event.target.value);
for (const id of ['edit-x','edit-y','edit-z','edit-yaw','edit-scale']) $('#'+id).addEventListener('input',()=>{
  if(!editorSelection)return;
  const n=(key,fallback=0)=>Number.isFinite(Number($('#'+key).value))?Number($('#'+key).value):fallback;
  const {group}=editorSelection;
  group.position.set(n('edit-x'),n('edit-y'),n('edit-z'));
  group.rotation.y=THREE.MathUtils.degToRad(n('edit-yaw'));
  group.scale.setScalar(THREE.MathUtils.clamp(n('edit-scale',1),0.05,20));
  if(editorSelection.actor){editorSelection.actor.spawn.copy(group.position);editorSelection.actor.wanderTarget.copy(group.position);if(editorSelection.id==='sheru')player.position.copy(group.position);}
  if(editorSelection.id==='juice-shop')applyLayout({objects:{'juice-shop':{position:group.position.toArray()}}});
});
$('#edit-camera').addEventListener('input',event=>{editorCameraDistance=Number(event.target.value);$('#edit-camera-value').textContent=String(editorCameraDistance)});
$('#edit-game-camera').addEventListener('input',event=>{gameCameraDistance=Number(event.target.value);$('#edit-game-camera-value').textContent=String(gameCameraDistance)});
$('#save-layout').onclick=saveEditorLayout;
$('#reset-layout').onclick=()=>{stagePositions();editorCameraDistance=24;gameCameraDistance=2;cameraYaw=0.25;cameraPitch=0.25;$('#edit-camera').value='24';$('#edit-camera-value').textContent='24';$('#edit-game-camera').value='2';$('#edit-game-camera-value').textContent='2';selectEditorObject(editorSelection?.id||'sheru');$('#editor-status').textContent='Staging layout reset. Save to keep these positions.';};
$('#editor-exit').onclick=exitEditing;

loadWorld();
