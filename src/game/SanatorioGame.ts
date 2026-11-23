import * as THREE from 'three';
import { BlackwoodAudio } from './audio';
import { DoorLoadingController } from './doorLoading';
import { BLACKWOOD_DOCUMENT_ORDER, BLACKWOOD_DOCUMENTS } from './documents';
import { BLACKWOOD_ITEM_CATALOG, createInitialInventory } from './inventory';
import { BLACKWOOD_KEY_ORDER, BLACKWOOD_KEYS } from './keys';
import { createPropMaterials, PropMaterialBank, SHARED_VERTEX_SNAP } from './materials';
import {
  createFlashlightModel,
  createPistolModel,
  createVolumetricBeam,
  FlashlightViewmodel,
  PistolViewmodel,
  VolumetricBeam,
} from './props';
import { Ps2Pipeline } from './ps2Pipeline';
import { createBlackwoodTextures, BlackwoodTextureBank } from './textures';
import {
  AABBCollider,
  CapsuleCollider,
  DoorState,
  DrawerState,
  FloorKey,
  GameCallbacks,
  HideCabinetState,
  InspectableDocument,
  InventoryItem,
  KeyItem,
  NudgeProp,
  PistolHudState,
  PS2_PRESETS,
  Ps2PresetId,
  Ps2Settings,
  SurfaceType,
} from './types';
import { buildTownMap, TownMapBuildResult } from './world/townMap';

const EYE_HEIGHT = 1.66;
const CROUCH_EYE_HEIGHT = 1.04;
const HIDE_EYE_HEIGHT = 1.53;
const PLAYER_RADIUS = 0.32;

const OUTDOOR_FOG_COLOR = new THREE.Color(0x212c30);
const INDOOR_FOG_COLOR = new THREE.Color(0x111514);

const OUTDOOR_HEMI_SKY = new THREE.Color(0x7d95a3);
const INDOOR_HEMI_SKY = new THREE.Color(0x46524e);
const OUTDOOR_HEMI_GROUND = new THREE.Color(0x363b30);
const INDOOR_HEMI_GROUND = new THREE.Color(0x221c16);

const COMPASS_DIRS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'] as const;

function detectSoftwareWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
  } catch {
    return false;
  }
}

export class SanatorioGame {
  private container: HTMLElement;
  private callbacks: GameCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private pipeline: Ps2Pipeline;
  private audio = new BlackwoodAudio();

  private textures: BlackwoodTextureBank;
  private propMats: PropMaterialBank;
  private townEnv: TownMapBuildResult;

  private hemiLight!: THREE.HemisphereLight;
  private stormDirLight!: THREE.DirectionalLight;
  private stormTarget!: THREE.Object3D;

  private flashlightCore!: THREE.SpotLight;
  private flashlightSpill!: THREE.SpotLight;
  private flashlightBounce!: THREE.PointLight;
  private flashlightTarget!: THREE.Object3D;
  private flashlightModel!: FlashlightViewmodel;
  private pistolModel!: PistolViewmodel;
  private muzzleLight!: THREE.PointLight;
  private impactSparkGeo!: THREE.OctahedronGeometry;
  private impactSparks: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private impactSparkIdx = 0;
  private coreBeam!: VolumetricBeam;
  private wideBeam!: VolumetricBeam;

  private doors: DoorState[] = [];
  private drawers: DrawerState[] = [];
  private hideCabinets: HideCabinetState[] = [];
  private nudgeProps: NudgeProp[] = [];
  private staticColliders: AABBCollider[] = [];
  private capsuleColliders: CapsuleCollider[] = [];
  private doorObstacles: AABBCollider[] | null = null;
  private keyPickups: Record<string, THREE.Group> = {};
  private lightDistPairs: { idx: number; distSq: number }[] = [];

  private settings: Ps2Settings = {
    ...PS2_PRESETS['silent-fog'],
    visionMode: 'flashlight',
  };

  private flashlightOn = true;
  private flashlightRaise = 1;
  private pistolEquipped = true;
  private pistolRaise = 1;
  private pistolAmmo = 7;
  private readonly pistolMagSize = 7;
  private pistolReserve = 28;
  private pistolReloadTimer = 0;
  private readonly pistolReloadDuration = 1.12;
  private pistolCooldown = 0;
  private pistolRecoil = 0;
  private pistolSlide = 0;
  private pistolFlash = 0;
  private pistolFlashRoll = 0;
  private pistolKickPitch = 0;
  private readonly scratchMuzzlePos = new THREE.Vector3();

  private isInside = false;
  private currentFloor: FloorKey = 'entrada';
  private zone = 'Rodovia Sul · Entrada de Vale Cinzento';
  private lastCompass = 'N';
  private lastPrompt: string | null = null;
  private doorTransitionActive = false;
  private documentModalOpen = false;
  private inventoryModalOpen = false;
  private collectedDocIds = new Set<string>();
  private collectedKeyIds = new Set<string>();

  private inventory: InventoryItem[] = createInitialInventory();
  private crouched = false;
  private currentEyeHeight = EYE_HEIGHT;
  private hidingCabinet: HideCabinetState | null = null;
  private hidePhase: 'entering' | 'inside' | 'exiting' | null = null;
  private hidePistolWasEquipped = false;
  private battery = 100;
  private calmTimer = 0;
  private statusEmitTimer = 0;

  private playerPos = new THREE.Vector3(0, EYE_HEIGHT, 49.5);
  private yaw = 0.02;
  private pitch = -0.01;
  private flashYaw = 0.02;
  private flashPitch = -0.01;
  private wallPullback = 0;

  private walkBobPhase = 0;
  private bobWeight = 0;
  private sprintWeight = 0;
  private lastStepCycle = -1;
  private totalWalkedDist = 0;

  private indoorBlend = 0;
  private tension = 0;
  private flashFlicker = 0;
  private nextHeartbeat = 0;
  private nextBuzz = 8;

  private bouncePos = new THREE.Vector3(0, EYE_HEIGHT, 46);
  private bounceIntensity = 0;
  private bounceInitialized = false;

  private elapsed = 0;
  private lastTime = performance.now();
  private frameId = 0;
  private disposed = false;
  private dustFrame = 0;
  private raycastFrame = 0;
  private doorLoader: DoorLoadingController;
  private lastDoorHudKey = '';
  private cachedFlashDist = 14;

  // Input states
  private keys: Record<string, boolean> = {};
  private joystickVec = { x: 0, y: 0 };
  private mobileSprint = false;
  private pointerDragging = false;
  private pointerDownPos = { x: 0, y: 0, time: 0 };
  private lastPointerPos = { x: 0, y: 0 };
  private lookTouchId: number | null = null;
  private lookTouchLast = { x: 0, y: 0 };
  private touchTapCandidate: { id: number; x: number; y: number; time: number } | null = null;

  // Pre-allocated scratch math helpers (zero allocation in tick)
  private readonly scratchColorA = new THREE.Color();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndcCenter = new THREE.Vector2(0, 0);
  private readonly scratchFwd = new THREE.Vector3();
  private readonly scratchRight = new THREE.Vector3();
  private readonly scratchMove = new THREE.Vector3();
  private readonly scratchUp = new THREE.Vector3(0, 1, 0);
  private readonly scratchBeamDir = new THREE.Vector3();
  private readonly scratchBeamRight = new THREE.Vector3();
  private readonly scratchBeamUp = new THREE.Vector3();
  private readonly scratchMat4 = new THREE.Matrix4();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly scratchBounceTarget = new THREE.Vector3();
  private readonly scratchCorner = new THREE.Vector3();

  constructor(container: HTMLElement, callbacks: GameCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x212c30, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x212c30);
    this.scene.fog = new THREE.FogExp2(0x212c30, this.settings.fogDensity * 0.65);

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.08, 220);
    this.camera.rotation.order = 'YXZ';

    this.textures = createBlackwoodTextures(
      this.settings.pixelTextures,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.propMats = createPropMaterials(this.textures);
    this.doorLoader = new DoorLoadingController(this.propMats);

    this.townEnv = buildTownMap(this.propMats, this.textures);
    this.scene.add(this.townEnv.group);
    this.doors.push(...this.townEnv.doors);
    this.drawers.push(...this.townEnv.drawers);
    this.hideCabinets.push(...this.townEnv.hideCabinets);
    this.nudgeProps.push(...this.townEnv.nudgeProps);
    this.staticColliders.push(...this.townEnv.colliders);
    this.capsuleColliders.push(...this.townEnv.capsuleColliders);
    this.keyPickups = { ...this.townEnv.keyPickups };

    for (let i = 0; i < this.townEnv.dynamicLights.length; i++) {
      this.townEnv.dynamicLights[i].visible = false;
      this.lightDistPairs.push({ idx: i, distSq: 0 });
    }

    this.buildLightingAndFlashlight();
    this.pipeline = new Ps2Pipeline(this.renderer, this.scene, this.camera, this.settings);
    this.pipeline.setSize(w, h);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.updateDynamicTownLights();
    this.syncCameraAndFlashlight(1);
    this.bindEvents();

    this.callbacks.onZoneChange?.(this.zone);
    this.callbacks.onFloorChange?.(this.currentFloor);
    this.callbacks.onFlashlightChange?.(this.flashlightOn);
    this.emitPistolState();
    this.emitInventory();
    this.emitPlayerStatus();
    this.callbacks.onSettingsChange?.({ ...this.settings });
    this.callbacks.onKeysChange?.([]);

    this.tick();
  }

  private buildLightingAndFlashlight(): void {
    this.hemiLight = new THREE.HemisphereLight(0x7d95a3, 0x363b30, 1.55);
    this.scene.add(this.hemiLight);

    this.stormTarget = new THREE.Object3D();
    this.stormTarget.position.set(0, 0, 48);
    this.scene.add(this.stormTarget);

    this.stormDirLight = new THREE.DirectionalLight(0xd2e4ef, 1.55);
    this.stormDirLight.position.set(-18, 34, 72);
    this.stormDirLight.target = this.stormTarget;
    if (!this.isSoftwareGl) {
      this.stormDirLight.castShadow = true;
      this.stormDirLight.shadow.mapSize.set(1024, 1024);
      this.stormDirLight.shadow.camera.near = 2;
      this.stormDirLight.shadow.camera.far = 120;
      this.stormDirLight.shadow.camera.left = -38;
      this.stormDirLight.shadow.camera.right = 38;
      this.stormDirLight.shadow.camera.top = 38;
      this.stormDirLight.shadow.camera.bottom = -38;
      this.stormDirLight.shadow.bias = -0.0005;
    }
    this.scene.add(this.stormDirLight);

    this.flashlightModel = createFlashlightModel(this.propMats, this.textures, 'left');
    this.flashlightModel.group.visible = true;
    this.flashlightModel.setPowered(this.flashlightOn);
    this.scene.add(this.flashlightModel.group);

    this.pistolModel = createPistolModel(this.propMats);
    this.pistolModel.group.visible = this.pistolEquipped;
    this.scene.add(this.pistolModel.group);

    this.muzzleLight = new THREE.PointLight(0xffb85c, 0, 16, 1.15);
    this.muzzleLight.visible = false;
    this.scene.add(this.muzzleLight);

    this.impactSparkGeo = new THREE.OctahedronGeometry(0.045, 0);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.impactSparkGeo, mat);
      mesh.visible = false;
      mesh.raycast = () => {};
      this.scene.add(mesh);
      this.impactSparks.push({ mesh, mat, life: 0 });
    }

    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlightTarget);

    this.flashlightCore = new THREE.SpotLight(0xfff2cf, 155, 54, Math.PI / 4.3, 0.55, 0.78);
    this.flashlightCore.target = this.flashlightTarget;
    if (!this.isSoftwareGl) {
      this.flashlightCore.castShadow = true;
      this.flashlightCore.shadow.mapSize.set(1024, 1024);
      this.flashlightCore.shadow.camera.near = 0.1;
      this.flashlightCore.shadow.camera.far = 54;
      this.flashlightCore.shadow.bias = -0.0004;
    }
    this.scene.add(this.flashlightCore);

    this.flashlightSpill = new THREE.SpotLight(0xffe2b5, 18.0, 28.0, Math.PI / 2.65, 0.9, 0.85);
    this.flashlightSpill.target = this.flashlightTarget;
    this.scene.add(this.flashlightSpill);

    this.flashlightBounce = new THREE.PointLight(0xffe0b2, 0, 14.0, 0.95);
    this.scene.add(this.flashlightBounce);

    this.coreBeam = createVolumetricBeam(0xfff2d2);
    this.wideBeam = createVolumetricBeam(0xeaf1ff);
    this.scene.add(this.coreBeam.mesh, this.wideBeam.mesh);

    this.flashlightCore.visible = this.flashlightOn;
    this.flashlightSpill.visible = this.flashlightOn;
    this.flashlightBounce.visible = this.flashlightOn;
    this.coreBeam.mesh.visible = this.flashlightOn;
    this.wideBeam.mesh.visible = this.flashlightOn;
  }

  // ==================== PUBLIC CONTROLS FOR REACT HUD ====================

  getSettings(): Ps2Settings {
    return { ...this.settings };
  }

  applyPreset(preset: Ps2PresetId): void {
    const base = PS2_PRESETS[preset];
    this.settings = {
      ...base,
      visionMode: preset === 'camcorder-480i' ? 'ir-camcorder' : 'flashlight',
    };
    this.syncVisualSettings();
  }

  updateSettings(patch: Partial<Ps2Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.syncVisualSettings();
  }

  private syncVisualSettings(): void {
    SHARED_VERTEX_SNAP.value = this.settings.vertexSnap ? 170.0 : 0.0;
    this.textures.setPixelMode(this.settings.pixelTextures);
    this.pipeline.applySettings(this.settings);
    this.callbacks.onSettingsChange?.({ ...this.settings });
  }

  private setFlashlightPowered(on: boolean, silent = false): void {
    this.flashlightOn = on;
    this.flashlightModel.setPowered(on);
    this.flashlightModel.group.visible = true;
    this.flashlightCore.visible = on;
    this.flashlightSpill.visible = on;
    this.flashlightBounce.visible = on;
    this.coreBeam.mesh.visible = on;
    this.wideBeam.mesh.visible = on;
    if (!silent) this.audio.playFlashlightClick();
    this.callbacks.onFlashlightChange?.(on);
  }

  toggleFlashlight(): boolean {
    if (this.hidingCabinet) {
      this.callbacks.onStatusToast?.('Desligada enquanto escondido');
      return false;
    }
    this.audio.unlock();
    this.setFlashlightPowered(!this.flashlightOn);
    return this.flashlightOn;
  }

  private computeCompassDir(): string {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const deg = ((Math.atan2(fx, -fz) * 180) / Math.PI + 360) % 360;
    return COMPASS_DIRS[Math.round(deg / 45) % 8];
  }

  private emitPistolState(): void {
    const state: PistolHudState = {
      equipped: this.pistolEquipped,
      ammo: this.pistolAmmo,
      magSize: this.pistolMagSize,
      reserve: this.pistolReserve,
      reloading: this.pistolReloadTimer > 0,
    };
    this.callbacks.onPistolChange?.(state);
  }

  private emitInventory(): void {
    this.callbacks.onInventoryChange?.(this.inventory.map((it) => ({ ...it })));
  }

  private emitPlayerStatus(): void {
    this.lastCompass = this.computeCompassDir();
    this.callbacks.onPlayerStatusChange?.({
      crouched: this.crouched,
      hiding: this.hidingCabinet !== null,
      hidingLabel: this.hidingCabinet?.label,
      tension: this.tension,
      battery: Math.round(this.battery),
      compass: this.lastCompass,
    });
  }

  private syncAmmoInInventory(): void {
    const idx = this.inventory.findIndex((it) => it.id === 'item-ammo-32');
    if (this.pistolReserve > 0) {
      if (idx >= 0) {
        this.inventory[idx].quantity = this.pistolReserve;
      } else {
        this.inventory.push({
          ...BLACKWOOD_ITEM_CATALOG['item-ammo-32'],
          quantity: this.pistolReserve,
        });
      }
    } else if (idx >= 0) {
      this.inventory.splice(idx, 1);
    }
    this.emitInventory();
  }

  private addInventoryItem(itemId: string): string {
    const entry = BLACKWOOD_ITEM_CATALOG[itemId];
    if (!entry) return 'Item coletado';
    const grant = entry.grantAmount ?? 1;

    if (itemId === 'item-ammo-32') {
      this.pistolReserve += grant;
      this.syncAmmoInventoryAndHud();
      return `${entry.name} (+${grant})`;
    }

    const existing = this.inventory.find((it) => it.id === itemId);
    if (existing) {
      existing.quantity = Math.min(existing.maxStack, existing.quantity + grant);
    } else {
      this.inventory.push({ ...entry, quantity: Math.min(entry.maxStack, grant) });
    }
    this.emitInventory();
    return entry.name;
  }

  private syncAmmoInventoryAndHud(): void {
    this.syncAmmoInInventory();
    this.emitPistolState();
  }

  toggleCrouch(): boolean {
    if (this.documentModalOpen || this.inventoryModalOpen || this.doorTransitionActive || this.hidingCabinet) {
      return this.crouched;
    }
    this.audio.unlock();
    this.crouched = !this.crouched;
    this.audio.playCrouchToggle(this.crouched);
    this.emitPlayerStatus();
    return this.crouched;
  }

  useInventoryItem(itemId: string): boolean {
    this.audio.unlock();
    if (itemId === 'tool-flashlight') {
      if (this.hidingCabinet) return false;
      this.setFlashlightPowered(!this.flashlightOn);
      return true;
    }
    if (itemId === 'weapon-pistol') {
      if (this.hidingCabinet) return false;
      this.pistolEquipped = !this.pistolEquipped;
      if (!this.pistolEquipped) this.pistolReloadTimer = 0;
      this.audio.playPistolEquip(this.pistolEquipped);
      this.emitPistolState();
      return true;
    }
    if (itemId === 'item-ammo-32') {
      if (this.hidingCabinet) return false;
      this.setInventoryModalOpen(false);
      return this.reloadPistol();
    }

    const idx = this.inventory.findIndex((it) => it.id === itemId);
    if (idx < 0 || this.inventory[idx].quantity <= 0) return false;

    if (itemId === 'item-bandage') {
      this.inventory[idx].quantity -= 1;
      if (this.inventory[idx].quantity <= 0) this.inventory.splice(idx, 1);
      this.tension = Math.max(0, this.tension - 0.55);
      this.calmTimer = Math.max(this.calmTimer, 18);
      this.audio.playUseMedical();
      this.emitInventory();
      this.emitPlayerStatus();
      this.callbacks.onStatusToast?.('Bandagem aplicada · respiração estabilizada');
      return true;
    }

    if (itemId === 'item-laudanum') {
      this.inventory[idx].quantity -= 1;
      if (this.inventory[idx].quantity <= 0) this.inventory.splice(idx, 1);
      this.tension = 0;
      this.calmTimer = 45;
      this.flashFlicker = 0;
      this.audio.playUseMedical();
      this.emitInventory();
      this.emitPlayerStatus();
      this.callbacks.onStatusToast?.('Tônico tomado · pulso firme por 45s');
      return true;
    }

    if (itemId === 'item-battery') {
      if (this.battery >= 99) {
        this.callbacks.onStatusToast?.('A lanterna já está com carga máxima');
        return false;
      }
      this.inventory[idx].quantity -= 1;
      if (this.inventory[idx].quantity <= 0) this.inventory.splice(idx, 1);
      this.battery = Math.min(100, this.battery + 65);
      this.audio.playFlashlightClick();
      this.emitInventory();
      this.emitPlayerStatus();
      this.callbacks.onStatusToast?.(`Pilha substituída (${Math.round(this.battery)}% carga)`);
      return true;
    }

    return false;
  }

  togglePistol(): boolean {
    if (this.documentModalOpen || this.inventoryModalOpen || this.doorLoader.isActive() || this.hidingCabinet) {
      return this.pistolEquipped;
    }
    this.audio.unlock();
    this.pistolEquipped = !this.pistolEquipped;
    if (!this.pistolEquipped) {
      this.pistolReloadTimer = 0;
    }
    this.audio.playPistolEquip(this.pistolEquipped);
    this.emitPistolState();
    return this.pistolEquipped;
  }

  reloadPistol(): boolean {
    if (this.documentModalOpen || this.inventoryModalOpen || this.doorLoader.isActive() || this.hidingCabinet) {
      return false;
    }
    this.audio.unlock();
    if (!this.pistolEquipped) {
      this.pistolEquipped = true;
    }
    if (this.pistolReloadTimer > 0 || this.pistolAmmo >= this.pistolMagSize || this.pistolReserve <= 0) {
      return false;
    }
    this.pistolReloadTimer = this.pistolReloadDuration;
    this.audio.playPistolReload();
    this.emitPistolState();
    return true;
  }

  firePistol(): boolean {
    if (
      this.documentModalOpen ||
      this.inventoryModalOpen ||
      this.doorTransitionActive ||
      this.doorLoader.isActive() ||
      this.hidingCabinet
    ) {
      return false;
    }
    this.audio.unlock();
    if (!this.pistolEquipped) {
      this.pistolEquipped = true;
      this.audio.playPistolEquip(true);
      this.emitPistolState();
      return false;
    }
    if (this.pistolReloadTimer > 0 || this.pistolCooldown > 0) return false;
    if (this.pistolAmmo <= 0) {
      this.pistolCooldown = 0.22;
      this.audio.playPistolEmpty();
      if (this.pistolReserve > 0) {
        this.reloadPistol();
      } else {
        this.callbacks.onStatusToast?.('Munição esgotada');
      }
      return false;
    }

    this.pistolAmmo -= 1;
    this.pistolCooldown = 0.24;
    this.pistolRecoil = 1.0;
    this.pistolSlide = 1.0;
    this.pistolFlash = 1.0;
    this.pistolFlashRoll = Math.random() * Math.PI * 2;
    this.pistolKickPitch = Math.min(0.055, this.pistolKickPitch + 0.022);
    this.audio.playPistolShot();
    this.emitPistolState();

    this.ndcCenter.set(0, 0);
    this.raycaster.setFromCamera(this.ndcCenter, this.camera);
    this.raycaster.near = 0.12;
    this.raycaster.far = 55;
    this.raycaster.layers.set(0);
    this.raycaster.layers.enable(1);

    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      if (
        hit.object.userData.isViewmodel ||
        hit.object instanceof THREE.Points ||
        hit.object instanceof THREE.LineSegments
      ) {
        continue;
      }

      const spark = this.impactSparks[this.impactSparkIdx];
      this.impactSparkIdx = (this.impactSparkIdx + 1) % this.impactSparks.length;
      spark.mesh.position.copy(hit.point);
      if (hit.face) {
        spark.mesh.position.addScaledVector(hit.face.normal, 0.025);
      }
      spark.mesh.scale.setScalar(1);
      spark.mesh.visible = true;
      spark.mat.opacity = 0.95;
      spark.life = 0.18;

      const hitId = hit.object.userData.interactionId as string | undefined;
      let metallic = false;
      if (hitId) {
        const door = this.doors.find((d) => d.id === hitId);
        if (door) {
          door.shudderTime = 0.28;
          metallic = door.locked;
        }
        const prop = this.nudgeProps.find((p) => p.group.userData.interactionId === hitId);
        if (prop) {
          this.scratchFwd.set(0, 0, -1).applyAxisAngle(this.scratchUp, this.yaw);
          prop.impulse = 1.0;
          prop.impulseDirX = this.scratchFwd.x;
          prop.impulseDirZ = this.scratchFwd.z;
          metallic = prop.kind === 'cart';
        }
      }

      this.audio.playBulletImpact(0, hit.distance, metallic);
      break;
    }

    return true;
  }

  toggleAudioMute(): boolean {
    this.audio.unlock();
    const muted = this.audio.toggleMute();
    this.callbacks.onAudioMuteChange?.(muted);
    return muted;
  }

  setMobileMoveVector(x: number, y: number): void {
    if (x !== 0 || y !== 0) this.audio.unlock();
    this.joystickVec.x = THREE.MathUtils.clamp(x, -1, 1);
    this.joystickVec.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  setMobileSprint(on: boolean): void {
    this.mobileSprint = !!on;
  }

  triggerInteract(): void {
    if (this.documentModalOpen || this.inventoryModalOpen) return;
    this.audio.unlock();
    if (this.hidingCabinet) {
      this.exitHideCabinet();
      return;
    }
    this.tryInteractAtNdc(0, 0);
  }

  private clearModalInputs(): void {
    this.keys = {};
    this.joystickVec.x = 0;
    this.joystickVec.y = 0;
    this.pointerDragging = false;
    this.mobileSprint = false;
    this.lookTouchId = null;
    this.touchTapCandidate = null;
  }

  setDocumentModalOpen(open: boolean): void {
    this.documentModalOpen = open;
    if (open) {
      this.clearModalInputs();
    }
  }

  setInventoryModalOpen(open: boolean): void {
    this.inventoryModalOpen = open;
    if (open) {
      this.clearModalInputs();
    }
  }

  playPaperTurnSound(): void {
    this.audio.playPaperRustle();
  }

  jumpToFloor(zone: FloorKey): void {
    this.audio.unlock();
    if (this.doorLoader.isActive()) return;
    this.doorTransitionActive = false;
    this.crouched = false;
    this.currentEyeHeight = EYE_HEIGHT;
    if (this.hidingCabinet) {
      this.hidingCabinet.targetDoorAngle = 0;
      this.hidingCabinet.doorAngle = 0;
      this.hidingCabinet.doorPivot.rotation.y = 0;
      this.hidingCabinet = null;
      this.hidePhase = null;
    }

    if (zone === 'entrada') {
      this.playerPos.set(0, EYE_HEIGHT, 49.5);
      this.yaw = 0.02;
    } else if (zone === 'praca') {
      this.playerPos.set(7.6, EYE_HEIGHT, 17.5);
      this.yaw = -Math.PI / 2;
    } else if (zone === 'posto') {
      this.playerPos.set(-6.5, EYE_HEIGHT, 23.5);
      this.yaw = Math.PI / 2;
    } else if (zone === 'delegacia') {
      this.playerPos.set(-15.0, EYE_HEIGHT, -7.2);
      this.yaw = 0;
    } else if (zone === 'mercado') {
      this.playerPos.set(16.0, EYE_HEIGHT, -7.2);
      this.yaw = 0;
    } else {
      this.playerPos.set(-19.0, EYE_HEIGHT, -41.8);
      this.yaw = 0;
    }
    this.pitch = -0.01;
    this.currentFloor = zone;
    this.isInside = false;
    this.indoorBlend = 0;
    this.updateDynamicTownLights();
    this.emitPlayerStatus();
    this.callbacks.onFloorChange?.(zone);
  }

  // ==================== INPUT EVENTS ====================

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('touchstart', this.onTouchStart, { passive: false });
    dom.addEventListener('touchmove', this.onTouchMove, { passive: false });
    dom.addEventListener('touchend', this.onTouchEnd, { passive: false });
    dom.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
    dom.addEventListener('webglcontextlost', this.onContextLost);
  }

  private unbindEvents(): void {
    const dom = this.renderer.domElement;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('touchstart', this.onTouchStart);
    dom.removeEventListener('touchmove', this.onTouchMove);
    dom.removeEventListener('touchend', this.onTouchEnd);
    dom.removeEventListener('touchcancel', this.onTouchEnd);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
  }

  private onWindowBlur = (): void => {
    this.keys = {};
    this.pointerDragging = false;
    this.joystickVec.x = 0;
    this.joystickVec.y = 0;
    this.mobileSprint = false;
    this.lookTouchId = null;
    this.touchTapCandidate = null;
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private onResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.pipeline.setSize(w, h);
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    this.audio.unlock();
    if (this.doorLoader.isActive()) {
      if ((e.code === 'Space' || e.code === 'Escape' || e.code === 'KeyE') && !e.repeat) {
        this.doorLoader.skip();
      }
      return;
    }
    this.keys[e.code] = true;
    if (e.code === 'KeyE' || e.code === 'Space') {
      if (!e.repeat) {
        if (this.hidingCabinet) {
          this.exitHideCabinet();
        } else {
          this.tryInteractAtNdc(0, 0);
        }
      }
    } else if ((e.code === 'KeyC' || e.code === 'ControlLeft' || e.code === 'ControlRight') && !e.repeat) {
      this.toggleCrouch();
    } else if (e.code === 'KeyF' && !e.repeat) {
      this.toggleFlashlight();
    } else if (e.code === 'KeyG' && !e.repeat) {
      this.togglePistol();
    } else if (e.code === 'KeyQ' && !e.repeat) {
      this.firePistol();
    } else if (e.code === 'KeyR' && !e.repeat) {
      this.reloadPistol();
    } else if (e.code === 'KeyV' && !e.repeat) {
      const next = this.settings.visionMode === 'ir-camcorder' ? 'flashlight' : 'ir-camcorder';
      this.updateSettings({ visionMode: next });
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen || e.pointerType === 'touch') return;
    this.audio.unlock();
    if (e.button === 2) {
      this.firePistol();
      return;
    }
    if (e.button !== 0) return;
    this.pointerDragging = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY, time: performance.now() };
    this.lastPointerPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen || this.doorTransitionActive || e.pointerType === 'touch') return;
    if (document.pointerLockElement === this.renderer.domElement) {
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.25, 1.25);
      return;
    }
    if (!this.pointerDragging) return;
    const dx = e.clientX - this.lastPointerPos.x;
    const dy = e.clientY - this.lastPointerPos.y;
    this.lastPointerPos = { x: e.clientX, y: e.clientY };
    this.yaw -= dx * 0.0036;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0036, -1.25, 1.25);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || !this.pointerDragging) return;
    this.pointerDragging = false;
    if (this.documentModalOpen || this.inventoryModalOpen) return;
    const dtMs = performance.now() - this.pointerDownPos.time;
    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (dtMs < 260 && dist < 8) {
      if (this.doorLoader.isActive()) {
        this.doorLoader.skip();
        return;
      }
      if (this.hidingCabinet) {
        return;
      }
      const rect = this.renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.tryInteractAtNdc(nx, ny);
    }
  };

  private onTouchStart = (e: TouchEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen) return;
    e.preventDefault();
    this.audio.unlock();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (!this.touchTapCandidate) {
        this.touchTapCandidate = { id: t.identifier, x: t.clientX, y: t.clientY, time: performance.now() };
      }
      if (this.lookTouchId === null) {
        this.lookTouchId = t.identifier;
        this.lookTouchLast = { x: t.clientX, y: t.clientY };
      }
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen || this.doorTransitionActive) return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.lookTouchId) {
        const dx = t.clientX - this.lookTouchLast.x;
        const dy = t.clientY - this.lookTouchLast.y;
        this.lookTouchLast = { x: t.clientX, y: t.clientY };
        this.yaw -= dx * 0.0044;
        this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -1.25, 1.25);
      }
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (this.documentModalOpen || this.inventoryModalOpen) {
      this.lookTouchId = null;
      this.touchTapCandidate = null;
      return;
    }
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (
        this.touchTapCandidate &&
        t.identifier === this.touchTapCandidate.id &&
        performance.now() - this.touchTapCandidate.time < 260 &&
        Math.hypot(t.clientX - this.touchTapCandidate.x, t.clientY - this.touchTapCandidate.y) < 14
      ) {
        if (this.doorLoader.isActive()) {
          this.doorLoader.skip();
        } else if (this.hidingCabinet) {
          this.exitHideCabinet();
        } else {
          const rect = this.renderer.domElement.getBoundingClientRect();
          const nx = ((t.clientX - rect.left) / rect.width) * 2 - 1;
          const ny = -((t.clientY - rect.top) / rect.height) * 2 + 1;
          this.tryInteractAtNdc(nx, ny);
        }
      }
      if (t.identifier === this.lookTouchId) this.lookTouchId = null;
      if (this.touchTapCandidate && t.identifier === this.touchTapCandidate.id) {
        this.touchTapCandidate = null;
      }
    }
    if (e.touches.length === 0) {
      this.lookTouchId = null;
      this.touchTapCandidate = null;
    }
  };

  // ==================== INTERACTIONS & HOVER HINTS ====================

  private enterHideCabinet(cab: HideCabinetState): void {
    if (this.hidingCabinet || this.doorTransitionActive || this.documentModalOpen || this.inventoryModalOpen) return;
    if (this.crouched) {
      this.crouched = false;
    }
    this.hidePistolWasEquipped = this.pistolEquipped;
    if (this.flashlightOn) {
      this.setFlashlightPowered(false, true);
    }
    if (this.pistolEquipped) {
      this.pistolEquipped = false;
      this.pistolReloadTimer = 0;
      this.emitPistolState();
    }
    this.hidingCabinet = cab;
    this.hidePhase = 'entering';
    cab.targetDoorAngle = -1.48;
    this.audio.playCabinetDoor(true);
    this.emitPlayerStatus();
  }

  exitHideCabinet(): void {
    if (!this.hidingCabinet || this.hidePhase === 'exiting') return;
    this.hidePhase = 'exiting';
    this.hidingCabinet.targetDoorAngle = -1.48;
    this.audio.playCabinetDoor(false);
  }

  private getInteractionLabel(id: string | undefined): string | null {
    if (this.hidingCabinet) return '[E] Sair do armário';
    if (!id) return null;
    const doc = BLACKWOOD_DOCUMENTS[id];
    if (doc) return `[E] Ler: ${doc.title}`;
    const keyItem = BLACKWOOD_KEYS[id];
    if (keyItem && !this.collectedKeyIds.has(id)) return `[E] Pegar: ${keyItem.name}`;

    if (id.startsWith('pickup:')) {
      const dr = this.drawers.find((d) => d.pickupId === id && !d.pickupCollected);
      if (dr?.pickupItemId) {
        const entry = BLACKWOOD_ITEM_CATALOG[dr.pickupItemId];
        return `[E] Pegar: ${entry ? entry.name : 'Item'}`;
      }
    }
    if (id.startsWith('drawer:')) {
      const dId = id.slice(7);
      const dr = this.drawers.find((d) => d.id === dId);
      if (dr) {
        return dr.isOpen ? '[E] Fechar gaveta' : '[E] Abrir gaveta';
      }
    }
    if (id.startsWith('cabinet:')) {
      const cId = id.slice(8);
      const cab = this.hideCabinets.find((c) => c.id === cId);
      if (cab) {
        return `[E] Esconder-se (${cab.label})`;
      }
    }

    if (id === 'reception-bell') return '[E] Tocar campainha do balcão';

    const door = this.doors.find((d) => d.id === id);
    if (door) {
      if (door.locked) {
        if (door.requiredKeyId) {
          return this.collectedKeyIds.has(door.requiredKeyId)
            ? `[E] Destrancar (${door.requiredKeyName})`
            : `Trancada · Requer ${door.requiredKeyName}`;
        }
        return 'Porta trancada';
      }
      return door.isOpen ? '[E] Fechar porta' : '[E] Abrir porta';
    }

    const prop = this.nudgeProps.find((p) => p.group.userData.interactionId === id);
    if (prop) {
      if (prop.kind === 'cart') return '[E] Mover carrinho';
      return '[E] Mover cadeira';
    }
    return null;
  }

  private updateHoverPrompt(): void {
    if (this.documentModalOpen || this.inventoryModalOpen) {
      if (this.lastPrompt !== null) {
        this.lastPrompt = null;
        this.callbacks.onInteractPrompt?.(null);
      }
      return;
    }
    if (this.hidingCabinet) {
      const label = '[E] Sair do armário';
      if (label !== this.lastPrompt) {
        this.lastPrompt = label;
        this.callbacks.onInteractPrompt?.(label);
      }
      return;
    }
    this.raycaster.setFromCamera(this.ndcCenter, this.camera);
    this.raycaster.near = 0.08;
    this.raycaster.far = 3.2;
    this.raycaster.layers.set(1);

    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    let label: string | null = null;
    if (hits.length > 0) {
      const id = hits[0].object.userData.interactionId as string | undefined;
      label = this.getInteractionLabel(id);
    }

    if (label !== this.lastPrompt) {
      this.lastPrompt = label;
      this.callbacks.onInteractPrompt?.(label);
    }
  }

  private tryInteractAtNdc(nx: number, ny: number): void {
    if (this.documentModalOpen || this.inventoryModalOpen) return;
    if (this.hidingCabinet) {
      this.exitHideCabinet();
      return;
    }

    this.ndcCenter.set(nx, ny);
    this.raycaster.setFromCamera(this.ndcCenter, this.camera);
    this.raycaster.near = 0.08;
    this.raycaster.far = 3.2;
    this.raycaster.layers.set(0);
    this.raycaster.layers.enable(1);

    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    const id = hits.length > 0 ? (hits[0].object.userData.interactionId as string | undefined) : undefined;
    if (!id) return;

    if (id.startsWith('pickup:')) {
      const dr = this.drawers.find((d) => d.pickupId === id && !d.pickupCollected);
      if (dr && dr.pickupItemId) {
        dr.pickupCollected = true;
        if (dr.pickupGroup) {
          dr.pickupGroup.visible = false;
          dr.pickupGroup.traverse((child) => {
            child.layers.disable(1);
            child.userData.interactionId = undefined;
          });
        }
        const label = this.addInventoryItem(dr.pickupItemId);
        this.audio.playItemPickup();
        this.callbacks.onStatusToast?.(`Coletado: ${label}`);
        return;
      }
    }

    if (id.startsWith('drawer:')) {
      const dId = id.slice(7);
      const dr = this.drawers.find((d) => d.id === dId);
      if (dr) {
        dr.isOpen = !dr.isOpen;
        this.audio.playDrawerSlide(dr.isOpen, dr.metallic);
        return;
      }
    }

    if (id.startsWith('cabinet:')) {
      const cId = id.slice(8);
      const cab = this.hideCabinets.find((c) => c.id === cId);
      if (cab) {
        this.enterHideCabinet(cab);
        return;
      }
    }

    const doc: InspectableDocument | undefined = BLACKWOOD_DOCUMENTS[id];
    if (doc) {
      this.collectedDocIds.add(doc.id);
      const collectedDocs = BLACKWOOD_DOCUMENT_ORDER
        .filter((docId) => this.collectedDocIds.has(docId))
        .map((docId) => BLACKWOOD_DOCUMENTS[docId]);
      this.audio.playPaperRustle();
      this.callbacks.onOpenDocument?.(doc, collectedDocs);
      return;
    }

    const keyItem: KeyItem | undefined = BLACKWOOD_KEYS[id];
    if (keyItem && !this.collectedKeyIds.has(id)) {
      this.collectedKeyIds.add(id);
      const kGroup = this.keyPickups[id];
      if (kGroup) {
        kGroup.userData.collected = true;
        kGroup.visible = false;
        kGroup.traverse((child) => {
          child.userData.interactionId = undefined;
          child.layers.set(0);
        });
      }
      this.audio.playKeyPickup();
      const collectedKeys = BLACKWOOD_KEY_ORDER
        .filter((kId) => this.collectedKeyIds.has(kId))
        .map((kId) => BLACKWOOD_KEYS[kId]);
      this.callbacks.onKeysChange?.(collectedKeys);
      this.callbacks.onStatusToast?.(`Chave coletada: ${keyItem.name}`);
      return;
    }

    if (id === 'reception-bell') {
      this.townEnv.ringBell();
      this.audio.playServiceBell();
      return;
    }

    const door = this.doors.find((d) => d.id === id);
    if (door) {
      if (door.locked) {
        if (door.requiredKeyId && this.collectedKeyIds.has(door.requiredKeyId)) {
          door.locked = false;
          this.audio.playDoorUnlock();
          this.applyDoorSwing(door, true);
          this.callbacks.onStatusToast?.(`Destrancado com ${door.requiredKeyName}`);
          return;
        }
        door.shudderTime = 0.45;
        this.audio.playHeavyDoorRattle();
        if (door.requiredKeyName) {
          this.callbacks.onStatusToast?.(`Requer: ${door.requiredKeyName}`);
        }
      } else {
        if (this.settings.doorLoading === 'classic' && !door.isOpen) {
          this.beginRoomDoorTransition(door);
          return;
        }
        this.applyDoorSwing(door, !door.isOpen);
      }
      return;
    }

    const prop = this.nudgeProps.find((p) => p.group.userData.interactionId === id);
    if (prop) {
      this.scratchFwd.set(0, 0, -1).applyAxisAngle(this.scratchUp, this.yaw);
      prop.impulse = 1;
      prop.impulseDirX = this.scratchFwd.x;
      prop.impulseDirZ = this.scratchFwd.z;
      if (prop.kind === 'cart') {
        this.audio.playMetalClink();
      } else {
        this.audio.playWoodNudge();
      }
    }
  }

  private getDoorObstacles(): AABBCollider[] {
    if (this.doorObstacles) return this.doorObstacles;
    const obs: AABBCollider[] = [];
    for (const prop of this.nudgeProps) {
      const grp = prop.group;
      grp.updateMatrixWorld(true);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      grp.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.geometry) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        const bb = child.geometry.boundingBox;
        if (!bb) return;
        for (let b = 0; b < 8; b++) {
          this.scratchCorner
            .set(b & 1 ? bb.max.x : bb.min.x, b & 2 ? bb.max.y : bb.min.y, b & 4 ? bb.max.z : bb.min.z)
            .applyMatrix4(child.matrixWorld);
          if (this.scratchCorner.y > 2.3) continue;
          minX = Math.min(minX, this.scratchCorner.x);
          maxX = Math.max(maxX, this.scratchCorner.x);
          minZ = Math.min(minZ, this.scratchCorner.z);
          maxZ = Math.max(maxZ, this.scratchCorner.z);
        }
      });
      if (minX < Infinity) obs.push({ minX, maxX, minZ, maxZ });
    }
    this.doorObstacles = obs;
    return obs;
  }

  private clampDoorAngle(door: DoorState): number {
    const obs = this.getDoorObstacles();
    if (obs.length === 0) return door.openAngle;
    const cosB = Math.cos(door.baseRotationY);
    const sinB = Math.sin(door.baseRotationY);
    const collides = (ang: number) => {
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (let f = 0.12; f <= 1.001; f += 0.11) {
        const len = door.leafWidth * f;
        const ux = len * ca;
        const uz = -len * sa;
        const wx = door.hingeWorldX + ux * cosB + uz * sinB;
        const wz = door.hingeWorldZ - ux * sinB + uz * cosB;
        for (const o of obs) {
          if (wx > o.minX - 0.07 && wx < o.maxX + 0.07 && wz > o.minZ - 0.07 && wz < o.maxZ + 0.07) {
            return true;
          }
        }
      }
      return false;
    };

    let best = 0;
    for (let step = 1; step <= 24; step++) {
      const ang = (door.openAngle * step) / 24;
      if (collides(ang)) break;
      best = ang;
    }
    return best;
  }

  private applyDoorSwing(
    door: DoorState,
    open: boolean,
    closeDur = 0.68,
    spatial?: { pan: number; dist: number },
  ): void {
    const tgt = open ? this.clampDoorAngle(door) : door.closedAngle;
    door.isOpen = open && Math.abs(tgt) > 0.05;
    const diff = Math.abs(tgt - door.currentAngle);
    const range = Math.max(0.01, Math.abs(door.openAngle - door.closedAngle));
    const frac = THREE.MathUtils.clamp(diff / range, 0.05, 1);
    door.targetAngle = tgt;
    door.animStartAngle = door.currentAngle;
    door.animTargetAngle = tgt;
    door.animElapsed = 0;
    door.animFrac = frac;
    door.animMode = open ? 'open' : 'close';
    door.animDuration = open ? Math.max(0.32, frac * 1.65) : Math.max(0.18, frac * closeDur);
    door.animating = diff > 0.002;
    if (door.animating) {
      this.audio.playDoorAction(door.id, open, frac, door.animDuration, spatial?.pan ?? 0, spatial?.dist ?? 0);
    }
  }

  private beginRoomDoorTransition(door: DoorState): void {
    if (this.doorTransitionActive) return;
    const nx = Math.sin(door.baseRotationY);
    const nz = Math.cos(door.baseRotationY);
    const dx = this.playerPos.x - door.group.position.x;
    const dz = this.playerPos.z - door.group.position.z;
    const side = dx * nx + dz * nz >= 0 ? 1 : -1;
    const rawX = door.group.position.x - side * nx * 1.15;
    const rawZ = door.group.position.z - side * nz * 1.15;
    const targetYaw = Math.atan2(side * nx, side * nz);

    this.doorTransitionActive = true;
    this.clearModalInputs();
    this.lastDoorHudKey = '';

    this.doorLoader.start({
      variant: 'ward',
      label: this.zone,
      sublabel: 'Atravessando porta...',
      fastMode: false,
      onSwap: () => {
        const safe = this.resolveCollisions(rawX, rawZ);
        this.playerPos.x = safe.x;
        this.playerPos.z = safe.z;
        this.yaw = targetYaw;
        this.pitch = -0.01;
      },
      onComplete: () => {
        this.doorTransitionActive = false;
        this.lastDoorHudKey = '';
        this.pipeline.setFade(0);
        this.callbacks.onDoorLoadingChange?.(null);
      },
    });
  }

  // ==================== COLLISION & SIMULATION ====================

  private resolveCollisions(nx: number, nz: number): { x: number; z: number } {
    let x = nx;
    let z = nz;

    const pushOutBox = (minX: number, maxX: number, minZ: number, maxZ: number) => {
      const cx = THREE.MathUtils.clamp(x, minX, maxX);
      const cz = THREE.MathUtils.clamp(z, minZ, maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const dSq = dx * dx + dz * dz;
      if (dSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        const d = Math.sqrt(dSq);
        if (d > 1e-4) {
          const push = PLAYER_RADIUS - d;
          x += (dx / d) * push;
          z += (dz / d) * push;
        } else {
          z += PLAYER_RADIUS;
        }
      }
    };

    for (const b of this.staticColliders) {
      pushOutBox(b.minX, b.maxX, b.minZ, b.maxZ);
    }

    for (const c of this.capsuleColliders) {
      const segX = c.x2 - c.x1;
      const segZ = c.z2 - c.z1;
      const lenSq = segX * segX + segZ * segZ;
      const t = lenSq > 1e-4 ? THREE.MathUtils.clamp(((x - c.x1) * segX + (z - c.z1) * segZ) / lenSq, 0, 1) : 0;
      const px = c.x1 + segX * t;
      const pz = c.z1 + segZ * t;
      const dx = x - px;
      const dz = z - pz;
      const minD = PLAYER_RADIUS + c.radius;
      const dSq = dx * dx + dz * dz;
      if (dSq < minD * minD) {
        const d = Math.sqrt(dSq);
        if (d > 1e-4) {
          const push = minD - d;
          x += (dx / d) * push;
          z += (dz / d) * push;
        }
      }
    }

    for (const d of this.doors) {
      const ang = d.baseRotationY + d.currentAngle;
      const ca = Math.cos(ang);
      const sa = -Math.sin(ang);
      for (let i = 0; i < 4; i++) {
        const frac = (i + 0.5) / 4;
        const wx = d.hingeWorldX + ca * d.leafWidth * frac;
        const wz = d.hingeWorldZ + sa * d.leafWidth * frac;
        const dx = x - wx;
        const dz = z - wz;
        const minD = 0.44;
        const dSq = dx * dx + dz * dz;
        if (dSq < minD * minD) {
          const dist = Math.sqrt(dSq);
          if (dist > 1e-4) {
            const push = minD - dist;
            x += (dx / dist) * push;
            z += (dz / dist) * push;
          }
        }
      }
    }

    x = THREE.MathUtils.clamp(x, -53.5, 53.5);
    z = THREE.MathUtils.clamp(z, -61.0, 55.5);
    return { x, z };
  }

  private getDoorSpatial(door: DoorState): { pan: number; dist: number } {
    const dx = door.group.position.x - this.playerPos.x;
    const dz = door.group.position.z - this.playerPos.z;
    const dist = Math.hypot(dx, dz);
    const inv = 1 / Math.max(0.001, dist);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    return { pan: (dx * rx + dz * rz) * inv, dist };
  }

  private isInsideBuilding(x: number, z: number): boolean {
    if (x >= -24 && x <= -13 && z >= 18 && z <= 29) return true; // Posto Vale
    if (x >= 10 && x <= 22 && z >= 32 && z <= 43) return true; // Lanchonete
    if (x >= -26 && x <= -10 && z >= -25 && z <= -10) return true; // Delegacia
    if (x >= 10 && x <= 26 && z >= -25 && z <= -10) return true; // Mercado
    if (x >= -48 && x <= -33 && z >= 10 && z <= 24) return true; // Armazem
    if (x >= -26 && x <= -12 && z >= -60 && z <= -45) return true; // Igreja
    if (x >= 11 && x <= 23 && z >= -57 && z <= -45) return true; // Casa 1
    if (x >= 30 && x <= 44 && z >= -24 && z <= -11) return true; // Casa Prefeito
    return false;
  }

  private resolveCurrentSurface(): SurfaceType {
    const x = this.playerPos.x;
    const z = this.playerPos.z;
    if (x >= -24 && x <= -13 && z >= 18 && z <= 29) return 'concrete';
    if (x >= 10 && x <= 22 && z >= 32 && z <= 43) return 'tile';
    if (x >= -26 && x <= -19 && z >= -25 && z <= -10) return 'concrete';
    if (x > -19 && x <= -10 && z >= -25 && z <= -10) return 'stone';
    if (x >= 10 && x <= 26 && z >= -25 && z <= -10) return 'tile';
    if (x >= -48 && x <= -33 && z >= 10 && z <= 24) return 'concrete';
    if (x >= -26 && x <= -12 && z >= -60 && z <= -45) return 'wood';
    if (x >= 11 && x <= 23 && z >= -57 && z <= -45) return 'wood';
    if (x >= 30 && x <= 44 && z >= -24 && z <= -11) return 'wood';
    if (x >= 8.5 && x <= 26.5 && z >= 8.5 && z <= 26.5) return 'stone';
    return 'exterior';
  }

  private resolveCurrentZone(): string {
    const x = this.playerPos.x;
    const z = this.playerPos.z;
    if (x >= -24 && x <= -13 && z >= 18 && z <= 29) return 'Posto Vale · Loja de Conveniência';
    if (x >= -13 && x <= -7.5 && z >= 18 && z <= 29) return 'Posto Vale · Bombas de Combustível';
    if (x >= 10 && x <= 22 && z >= 32 && z <= 43) return 'Lanchonete Estrela da Estrada';
    if (x >= -26 && x <= -19 && z >= -25 && z <= -10) return 'Delegacia · Sala de Evidências';
    if (x > -19 && x <= -10 && z >= -25 && z <= -10) return 'Delegacia Municipal · Recepção';
    if (x >= 10 && x <= 26 && z >= -25 && z <= -10) return 'Mercado & Farmácia São Jorge';
    if (x >= -48 && x <= -33 && z >= 10 && z <= 24) return 'Armazém & Serraria Oeste';
    if (x >= -26 && x <= -12 && z >= -60 && z <= -45) return 'Igreja da Colina · Paróquia';
    if (x >= 11 && x <= 23 && z >= -57 && z <= -45) return 'Bairro Residencial · Casa dos Pinheiros';
    if (x >= 30 && x <= 44 && z >= -24 && z <= -11) return 'Bairro Residencial · Casa do Prefeito';
    if (x >= 8.5 && x <= 26.5 && z >= 8.5 && z <= 26.5) return 'Praça Central · Fonte Municipal';
    if (z > 32 && Math.abs(x) <= 7.5) return 'Rodovia Sul · Entrada de Vale Cinzento';
    if (Math.abs(x) <= 6.8) return 'Avenida Central · Centro';
    if (Math.abs(z) <= 6.8) return 'Rua do Comércio';
    if (z >= -42.6 && z <= -30.4) return 'Rua da Colina · Bairro Alto';
    return 'Vale Cinzento · Perímetro';
  }

  private resolveNearestDistrict(): FloorKey {
    const x = this.playerPos.x;
    const z = this.playerPos.z;
    if (z > 36 && Math.abs(x) < 12) return 'entrada';
    if (x < -7 && z > 12) return 'posto';
    if (x >= 5 && z > 6 && z <= 32) return 'praca';
    if (x < -5 && z <= -4 && z > -32) return 'delegacia';
    if (x >= 5 && z <= -4 && z > -32) return 'mercado';
    if (z <= -32) return 'igreja';
    return this.currentFloor;
  }

  private updateHideState(dt: number): void {
    const cab = this.hidingCabinet;
    if (!cab) return;

    if (this.hidePhase === 'entering') {
      this.playerPos.x = THREE.MathUtils.damp(this.playerPos.x, cab.insidePos.x, 8.5, dt);
      this.playerPos.z = THREE.MathUtils.damp(this.playerPos.z, cab.insidePos.z, 8.5, dt);
      this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, HIDE_EYE_HEIGHT, 9, dt);
      this.playerPos.y = this.currentEyeHeight;

      let dYaw = ((cab.outwardYaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dYaw < -Math.PI) dYaw += Math.PI * 2;
      this.yaw += dYaw * Math.min(1, dt * 8.5);
      this.pitch = THREE.MathUtils.damp(this.pitch, 0, 8.5, dt);

      if (Math.hypot(this.playerPos.x - cab.insidePos.x, this.playerPos.z - cab.insidePos.z) < 0.08) {
        this.playerPos.x = cab.insidePos.x;
        this.playerPos.z = cab.insidePos.z;
        this.hidePhase = 'inside';
        cab.targetDoorAngle = 0;
      }
    } else if (this.hidePhase === 'inside') {
      this.playerPos.x = cab.insidePos.x;
      this.playerPos.z = cab.insidePos.z;
      this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, HIDE_EYE_HEIGHT, 9, dt);
      this.playerPos.y = this.currentEyeHeight;

      let dYaw = ((this.yaw - cab.outwardYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (dYaw < -Math.PI) dYaw += Math.PI * 2;
      const clampedYaw = THREE.MathUtils.clamp(dYaw, -0.42, 0.42);
      this.yaw = cab.outwardYaw + clampedYaw;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.35, 0.35);
    } else if (this.hidePhase === 'exiting') {
      this.playerPos.x = THREE.MathUtils.damp(this.playerPos.x, cab.exitPos.x, 8.5, dt);
      this.playerPos.z = THREE.MathUtils.damp(this.playerPos.z, cab.exitPos.z, 8.5, dt);
      this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, EYE_HEIGHT, 9, dt);
      this.playerPos.y = this.currentEyeHeight;

      if (Math.hypot(this.playerPos.x - cab.exitPos.x, this.playerPos.z - cab.exitPos.z) < 0.09) {
        const safe = this.resolveCollisions(cab.exitPos.x, cab.exitPos.z);
        this.playerPos.x = safe.x;
        this.playerPos.z = safe.z;
        cab.targetDoorAngle = 0;
        this.hidingCabinet = null;
        this.hidePhase = null;
        if (this.hidePistolWasEquipped) {
          this.pistolEquipped = true;
          this.emitPistolState();
        }
        this.emitPlayerStatus();
      }
    }
  }

  private updatePlayer(dt: number): void {
    if (this.documentModalOpen || this.inventoryModalOpen || this.doorTransitionActive) {
      this.bobWeight = THREE.MathUtils.damp(this.bobWeight, 0, 8, dt);
      this.sprintWeight = THREE.MathUtils.damp(this.sprintWeight, 0, 8, dt);
      this.syncCameraAndFlashlight(dt);
      return;
    }

    if (this.hidingCabinet) {
      this.bobWeight = THREE.MathUtils.damp(this.bobWeight, 0, 10, dt);
      this.sprintWeight = THREE.MathUtils.damp(this.sprintWeight, 0, 10, dt);
      this.updateHideState(dt);
      this.syncCameraAndFlashlight(dt);
      return;
    }

    const moveFwd =
      (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) -
      (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0) +
      this.joystickVec.y;
    const moveStrafe =
      (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) -
      (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0) +
      this.joystickVec.x;
    const sprinting = !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.mobileSprint);

    if (sprinting && this.crouched && (moveFwd !== 0 || moveStrafe !== 0)) {
      this.crouched = false;
      this.emitPlayerStatus();
    }

    const speed = sprinting ? 4.45 : this.crouched ? 1.45 : 2.55;

    this.scratchFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.scratchRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.scratchMove.set(0, 0, 0).addScaledVector(this.scratchFwd, moveFwd).addScaledVector(this.scratchRight, moveStrafe);

    let moving = false;
    let mag = 0;
    if (this.scratchMove.lengthSq() > 0.002) {
      const len = this.scratchMove.length();
      mag = Math.min(1, len);
      if (len > 1) this.scratchMove.divideScalar(len);
      const nextX = this.playerPos.x + this.scratchMove.x * speed * dt;
      const nextZ = this.playerPos.z + this.scratchMove.z * speed * dt;
      const resolved = this.resolveCollisions(nextX, nextZ);
      const stepped = Math.hypot(resolved.x - this.playerPos.x, resolved.z - this.playerPos.z);
      this.playerPos.x = resolved.x;
      this.playerPos.z = resolved.z;

      if (stepped > 0.0005) {
        moving = true;
        const surface = this.resolveCurrentSurface();
        this.totalWalkedDist += stepped;
        this.walkBobPhase += dt * (sprinting ? 11.2 : this.crouched ? 5.8 : 7.8) * (0.45 + 0.55 * mag);
        const cycle = Math.floor((this.walkBobPhase + 1.2) / Math.PI);
        if (cycle !== this.lastStepCycle) {
          this.lastStepCycle = cycle;
          const stepVol = sprinting ? 0.56 : this.crouched ? 0.25 : 0.45;
          this.audio.playFootstep(stepVol, surface, sprinting);
        }
      }
    }

    const targetEye = this.crouched ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 11, dt);
    this.playerPos.y = this.currentEyeHeight;

    this.bobWeight = THREE.MathUtils.damp(this.bobWeight, moving ? mag : 0, moving ? 10 : 7.5, dt);
    this.sprintWeight = THREE.MathUtils.damp(this.sprintWeight, moving && sprinting ? 1 : 0, 7, dt);

    this.syncCameraAndFlashlight(dt);
  }

  private syncCameraAndFlashlight(dt: number): void {
    const bobAmp = this.bobWeight * (1 + this.sprintWeight * 0.35);
    const idleAmp = 1 - this.bobWeight * 0.7;
    const bobY = -Math.cos(this.walkBobPhase * 2) * 0.032 * bobAmp;
    const breathY = Math.sin(this.elapsed * 1.45) * 0.0045 * idleAmp;
    const bobX = Math.sin(this.walkBobPhase) * 0.018 * bobAmp;
    const roll = -Math.sin(this.walkBobPhase) * 0.0085 * bobAmp;
    const pitchBob = -Math.cos(this.walkBobPhase * 2) * 0.0055 * bobAmp + Math.sin(this.elapsed * 1.45) * 0.0014 * idleAmp;

    if (this.pistolCooldown > 0) this.pistolCooldown = Math.max(0, this.pistolCooldown - dt);
    if (this.pistolReloadTimer > 0) {
      this.pistolReloadTimer = Math.max(0, this.pistolReloadTimer - dt);
      if (this.pistolReloadTimer === 0) {
        const needed = this.pistolMagSize - this.pistolAmmo;
        const loaded = Math.min(needed, this.pistolReserve);
        this.pistolAmmo += loaded;
        this.pistolReserve -= loaded;
        this.syncAmmoInventoryAndHud();
      }
    }
    this.pistolRecoil = THREE.MathUtils.damp(this.pistolRecoil, 0, 14, dt);
    this.pistolSlide = THREE.MathUtils.damp(this.pistolSlide, 0, 22, dt);
    this.pistolFlash = Math.max(0, this.pistolFlash - dt * 16.5);
    this.pistolKickPitch = THREE.MathUtils.damp(this.pistolKickPitch, 0, 12, dt);

    for (const sp of this.impactSparks) {
      if (sp.life > 0) {
        sp.life = Math.max(0, sp.life - dt);
        const f = sp.life / 0.18;
        sp.mesh.scale.setScalar(1 + (1 - f) * 1.8);
        sp.mat.opacity = f * 0.92;
        if (sp.life === 0) sp.mesh.visible = false;
      }
    }

    this.scratchRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.set(
      this.playerPos.x + this.scratchRight.x * bobX,
      this.playerPos.y + bobY + breathY,
      this.playerPos.z + this.scratchRight.z * bobX,
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = THREE.MathUtils.clamp(this.pitch + pitchBob + this.pistolKickPitch, -1.28, 1.28);
    this.camera.rotation.z = roll;

    this.flashYaw = THREE.MathUtils.damp(this.flashYaw, this.yaw, 16, dt);
    this.flashPitch = THREE.MathUtils.damp(this.flashPitch, this.pitch, 16, dt);

    const cp = Math.cos(this.flashPitch);
    this.scratchBeamDir.set(-Math.sin(this.flashYaw) * cp, Math.sin(this.flashPitch), -Math.cos(this.flashYaw) * cp);
    this.scratchBeamRight.set(Math.cos(this.flashYaw), 0, -Math.sin(this.flashYaw));
    this.scratchBeamUp.crossVectors(this.scratchBeamRight, this.scratchBeamDir).normalize();

    let hitDist = this.cachedFlashDist;
    if (this.flashlightOn && (this.raycastFrame++ % 2 === 0)) {
      this.ndcCenter.set(0, 0);
      this.raycaster.setFromCamera(this.ndcCenter, this.camera);
      this.raycaster.near = 0.05;
      this.raycaster.far = 42;
      this.raycaster.layers.set(0);
      this.raycaster.layers.enable(1);
      const hits = this.raycaster.intersectObjects(this.scene.children, true);
      hitDist = 42;
      for (const hit of hits) {
        if (hit.object.userData.isViewmodel || hit.object instanceof THREE.Points || hit.object instanceof THREE.LineSegments) {
          continue;
        }
        hitDist = hit.distance;
        break;
      }
      this.cachedFlashDist = hitDist;
    }

    let pullback = 0;
    let bounceGain = 0;
    if (hitDist < 42) {
      if (hitDist < 0.68) pullback = THREE.MathUtils.clamp((0.68 - hitDist) * 0.48, 0, 0.2);
      this.scratchBounceTarget.copy(this.camera.position).addScaledVector(this.scratchBeamDir, Math.max(0.32, hitDist - 0.42));
      const f = THREE.MathUtils.clamp(1 - hitDist / 22.0, 0, 1);
      bounceGain = this.flashlightOn ? 0.95 + f * f * 5.2 : 0;
    } else {
      this.scratchBounceTarget.copy(this.camera.position).addScaledVector(this.scratchBeamDir, 9.0);
      bounceGain = this.flashlightOn ? 0.85 : 0;
    }

    this.flashlightRaise = THREE.MathUtils.damp(this.flashlightRaise, this.flashlightOn ? 1 : 0, 11, dt);
    this.wallPullback = THREE.MathUtils.damp(this.wallPullback, pullback, 14, dt);
    const swayX = Math.sin(this.walkBobPhase - 0.35) * 0.014 * bobAmp + Math.sin(this.elapsed * 1.4) * 0.002;
    const swayY = -Math.cos(this.walkBobPhase * 2 - 0.35) * 0.011 * bobAmp + Math.cos(this.elapsed * 1.1) * 0.002;

    const restDrop = (1 - this.flashlightRaise) * 0.052;
    const restPitch = (1 - this.flashlightRaise) * -0.24;

    this.flashlightModel.group.position
      .copy(this.camera.position)
      .addScaledVector(this.scratchBeamRight, -0.205 + swayX - (1 - this.flashlightRaise) * 0.018)
      .addScaledVector(this.scratchBeamUp, -0.165 - restDrop + swayY + this.wallPullback * 0.16)
      .addScaledVector(this.scratchBeamDir, 0.31 - this.wallPullback - (1 - this.flashlightRaise) * 0.02);

    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(this.scratchBeamDir, 12);
    this.scratchMat4.lookAt(this.flashlightModel.group.position, this.flashlightTarget.position, this.scratchBeamUp);
    this.scratchQuat.setFromRotationMatrix(this.scratchMat4);
    this.flashlightModel.group.quaternion.copy(this.scratchQuat);
    this.flashlightModel.group.rotateX(this.wallPullback * 1.05 + restPitch);

    this.flashlightCore.position
      .copy(this.flashlightModel.group.position)
      .addScaledVector(this.scratchBeamDir, 0.14);
    this.flashlightSpill.position.copy(this.flashlightCore.position);

    this.pistolRaise = THREE.MathUtils.damp(this.pistolRaise, this.pistolEquipped ? 1 : 0, 11, dt);
    this.pistolModel.group.visible = this.pistolRaise > 0.02;
    if (this.pistolModel.group.visible) {
      const holsterDrop = (1 - this.pistolRaise) * 0.16;
      const holsterPitch = (1 - this.pistolRaise) * -0.58;
      this.pistolModel.group.position
        .copy(this.camera.position)
        .addScaledVector(this.scratchBeamRight, 0.195 - swayX * 0.85)
        .addScaledVector(this.scratchBeamUp, -0.158 - holsterDrop - swayY * 0.85 + this.wallPullback * 0.12)
        .addScaledVector(this.scratchBeamDir, 0.32 - this.wallPullback * 0.85);
      this.scratchMat4.lookAt(this.pistolModel.group.position, this.flashlightTarget.position, this.scratchBeamUp);
      this.scratchQuat.setFromRotationMatrix(this.scratchMat4);
      this.pistolModel.group.quaternion.copy(this.scratchQuat);
      this.pistolModel.group.rotateX(this.wallPullback * 0.8 + holsterPitch);
      this.pistolModel.group.updateMatrixWorld(true);

      const reloadProg =
        this.pistolReloadTimer > 0 ? 1 - this.pistolReloadTimer / this.pistolReloadDuration : 0;
      this.pistolModel.updateState(
        this.pistolRecoil,
        this.pistolSlide,
        reloadProg,
        this.pistolFlash,
        this.pistolFlashRoll,
      );

      if (this.pistolFlash > 0.02) {
        this.pistolModel.getMuzzleWorldPos(this.scratchMuzzlePos);
        this.muzzleLight.position.copy(this.scratchMuzzlePos);
        this.muzzleLight.intensity = 16.5 * this.pistolFlash;
        this.muzzleLight.visible = true;
      } else {
        this.muzzleLight.visible = false;
        this.muzzleLight.intensity = 0;
      }
    } else {
      this.muzzleLight.visible = false;
    }

    if (!this.bounceInitialized) {
      this.bouncePos.copy(this.scratchBounceTarget);
      this.bounceIntensity = bounceGain;
      this.bounceInitialized = true;
    } else {
      this.bouncePos.x = THREE.MathUtils.damp(this.bouncePos.x, this.scratchBounceTarget.x, 12, dt);
      this.bouncePos.y = THREE.MathUtils.damp(this.bouncePos.y, this.scratchBounceTarget.y, 12, dt);
      this.bouncePos.z = THREE.MathUtils.damp(this.bouncePos.z, this.scratchBounceTarget.z, 12, dt);
      this.bounceIntensity = THREE.MathUtils.damp(this.bounceIntensity, bounceGain, 10, dt);
    }
    this.flashlightBounce.position.copy(this.bouncePos);

    this.flashFlicker = Math.max(0, this.flashFlicker - dt * 1.35);
    const batteryScale = 0.72 + 0.28 * (this.battery / 100);
    const flickerDip =
      this.flashFlicker > 0 ? (Math.sin(this.elapsed * 46) > 0.12 ? 0.42 : 1.0) : 1.0;
    const pulse =
      (0.985 + 0.01 * Math.sin(this.elapsed * 7.3) + 0.005 * Math.cos(this.elapsed * 19.1)) *
      flickerDip *
      batteryScale;
    this.flashlightCore.intensity = 155 * pulse;
    this.flashlightSpill.intensity = 18.0 * pulse;
    this.flashlightBounce.intensity = this.bounceIntensity * pulse;

    const beamMask = hitDist < 1.3 ? THREE.MathUtils.clamp(hitDist / 1.3, 0.28, 1) : 1;
    this.flashlightModel.setBeamIntensity(beamMask * (1 - this.wallPullback * 1.8) * pulse);
    const coneLen = THREE.MathUtils.clamp(hitDist * 0.96, 0.5, 24.0);
    const beamOp = this.flashlightOn ? 0.044 * flickerDip * batteryScale : 0;
    this.coreBeam.update(this.flashlightCore.position, this.scratchBeamDir, coneLen, this.elapsed, beamOp, 0.18);
    this.wideBeam.update(this.flashlightCore.position, this.scratchBeamDir, coneLen * 0.94, this.elapsed, beamOp * 0.38, 0.28);
  }

  private updateDoorsAndProps(dt: number): void {
    for (const d of this.doors) {
      if (d.animating) {
        d.shudderTime = 0;
        d.pivot.position.z = 0;
        d.animElapsed += dt;
        const frac = Math.min(1, d.animElapsed / Math.max(0.001, d.animDuration));
        const eased = d.animMode === 'open' ? frac * frac * (3 - 2 * frac) : frac * frac * (1.45 - 0.45 * frac);
        d.currentAngle = THREE.MathUtils.lerp(d.animStartAngle, d.animTargetAngle, eased);
        d.pivot.rotation.y = d.currentAngle;
        if (frac >= 1) {
          d.currentAngle = d.animTargetAngle;
          d.pivot.rotation.y = d.currentAngle;
          d.animating = false;
          if (d.animMode === 'close') {
            const sp = this.getDoorSpatial(d);
            this.audio.playDoorCloseImpact(d.id, d.animFrac, sp.pan, sp.dist > 1.8 ? sp.dist : 0);
          } else {
            this.audio.stopDoorSound(d.id, 0.1);
          }
        }
      } else if (d.shudderTime > 0) {
        d.shudderTime = Math.max(0, d.shudderTime - dt);
        const w = d.shudderTime / 0.45;
        d.pivot.rotation.y = d.currentAngle + Math.sin(this.elapsed * 52) * (d.locked ? 0.016 : 0.01) * w;
        d.pivot.position.z = d.locked ? Math.cos(this.elapsed * 44) * 0.008 * w : 0;
        if (d.shudderTime === 0) {
          d.pivot.rotation.y = d.currentAngle;
          d.pivot.position.z = 0;
        }
      }
    }

    for (const p of this.nudgeProps) {
      if (p.impulse > 0.001) {
        p.phase += dt * 18;
        p.impulse = THREE.MathUtils.damp(p.impulse, 0, 5.2, dt);
        if (p.impulse <= 0.001) {
          p.impulse = 0;
          p.group.position.copy(p.basePos);
          p.group.rotation.z = p.baseRot.z;
        } else {
          const offset = Math.sin(p.phase) * 0.032 * p.impulse;
          p.group.position.set(p.basePos.x + p.impulseDirX * offset, p.basePos.y, p.basePos.z + p.impulseDirZ * offset);
          p.group.rotation.z = p.baseRot.z + Math.sin(p.phase * 1.3) * 0.035 * p.impulse;
        }
      }
    }

    for (const dr of this.drawers) {
      const targetFrac = dr.isOpen ? 1 : 0;
      if (Math.abs(dr.openFrac - targetFrac) > 0.001) {
        dr.openFrac = THREE.MathUtils.damp(dr.openFrac, targetFrac, 11, dt);
        dr.slideGroup.position.z = dr.openFrac * dr.slideDist;
        if (dr.pickupGroup && !dr.pickupCollected) {
          const canLoot = dr.openFrac > 0.45;
          dr.pickupGroup.traverse((child) => {
            if (canLoot) child.layers.enable(1);
            else child.layers.disable(1);
          });
        }
      }
    }

    for (const cab of this.hideCabinets) {
      if (Math.abs(cab.doorAngle - cab.targetDoorAngle) > 0.001) {
        cab.doorAngle = THREE.MathUtils.damp(cab.doorAngle, cab.targetDoorAngle, 9.5, dt);
        cab.doorPivot.rotation.y = cab.doorAngle;
      }
    }
  }

  private updateNightParticles(): void {
    const attr = this.townEnv.nightParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const base = this.townEnv.nightParticleBase;
    const t = this.elapsed;
    for (let i = 0; i < attr.count; i++) {
      const idx = i * 3;
      arr[idx] = base[idx] + Math.sin(t * 0.25 + i * 0.6) * 0.45;
      arr[idx + 1] = 0.2 + ((base[idx + 1] - t * 0.18 + 6.5) % 6.5);
      arr[idx + 2] = base[idx + 2] + Math.cos(t * 0.22 + i * 0.4) * 0.45;
    }
    attr.needsUpdate = true;
    this.townEnv.nightParticleMat.opacity = this.isInside ? 0.04 : 0.19;
  }

  private updateDynamicTownLights(): void {
    const lights = this.townEnv.dynamicLights;
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const dx = l.position.x - px;
      const dz = l.position.z - pz;
      this.lightDistPairs[i].idx = i;
      this.lightDistPairs[i].distSq = dx * dx + dz * dz;
    }
    this.lightDistPairs.sort((a, b) => a.distSq - b.distSq);

    const maxActive = this.isSoftwareGl ? 6 : 10;
    const maxDistSq = 48 * 48;
    for (let rank = 0; rank < this.lightDistPairs.length; rank++) {
      const pair = this.lightDistPairs[rank];
      const light = lights[pair.idx];
      const active = rank < maxActive && pair.distSq <= maxDistSq;
      light.visible = active;
      if (!active) continue;

      const base = (light.userData.baseIntensity as number) ?? 12.0;
      const seed = (light.userData.flickerSeed as number) || 0;
      const mode = (light.userData.flickerMode as string) || 'steady';
      const t = this.elapsed;

      let factor = 1.0;
      if (mode === 'steady') {
        factor = 0.96 + 0.04 * Math.sin(t * 2.0 + seed);
      } else {
        const period = mode === 'faulty' ? 5.4 + (seed % 3.1) : 9.2 + (seed % 4.5);
        const burst = mode === 'faulty' ? 0.95 : 0.55;
        const phase = (t + seed * 1.21) % period;
        if (phase < burst) {
          const stutter = Math.sin(t * 34 + seed) * 0.5 + Math.cos(t * 53 + seed * 1.8) * 0.5;
          factor = stutter > 0.2 ? 0.95 : stutter > -0.2 ? 0.35 : 0.12;
        } else {
          factor = 0.94 + 0.06 * Math.sin(t * 2.5 + seed);
        }
      }
      light.intensity = base * factor;
      const bulbMat = light.userData.bulbMat as THREE.MeshLambertMaterial | undefined;
      if (bulbMat) {
        const baseEmissive = (light.userData.bulbBaseEmissive as number) ?? 1.2;
        bulbMat.emissiveIntensity = baseEmissive * THREE.MathUtils.clamp(factor, 0.12, 1.15);
      }
    }
  }

  private updateEnvironmentAtmosphere(dt: number): void {
    this.isInside = this.isInsideBuilding(this.playerPos.x, this.playerPos.z);
    const targetIndoor = this.isInside ? 1 : 0;
    this.indoorBlend = THREE.MathUtils.damp(this.indoorBlend, targetIndoor, 5.5, dt);

    const nextZone = this.resolveCurrentZone();
    if (nextZone !== this.zone) {
      this.zone = nextZone;
      this.callbacks.onZoneChange?.(nextZone);
    }

    const nextDistrict = this.resolveNearestDistrict();
    if (nextDistrict !== this.currentFloor) {
      this.currentFloor = nextDistrict;
      this.callbacks.onFloorChange?.(nextDistrict);
    }

    if (this.calmTimer > 0) {
      this.calmTimer = Math.max(0, this.calmTimer - dt);
    }
    if (this.flashlightOn && !this.hidingCabinet && !this.inventoryModalOpen && !this.documentModalOpen) {
      this.battery = Math.max(15, this.battery - dt * 0.16);
    }

    // Dynamic town survival tension (night edges, closed alleys, darkened buildings)
    let targetTension = 0.08;
    if (this.isInside) targetTension = 0.24;
    if (this.playerPos.z < -30 || Math.abs(this.playerPos.x) > 30) targetTension += 0.18;
    if (!this.flashlightOn && !this.hidingCabinet) targetTension += 0.16;
    if (this.hidingCabinet) targetTension *= 0.45;
    if (this.calmTimer > 0) targetTension *= 0.25;
    this.tension = THREE.MathUtils.damp(this.tension, Math.min(1, targetTension), 0.75, dt);

    const currentCompass = this.computeCompassDir();
    this.statusEmitTimer += dt;
    if (this.statusEmitTimer >= 0.35 || currentCompass !== this.lastCompass) {
      this.statusEmitTimer = 0;
      this.emitPlayerStatus();
    }

    if (this.tension > 0.5 && this.elapsed >= this.nextHeartbeat) {
      this.audio.playHeartbeatPulse(this.tension);
      this.nextHeartbeat = this.elapsed + THREE.MathUtils.lerp(1.55, 0.78, (this.tension - 0.5) / 0.5);
    }
    if (this.elapsed >= this.nextBuzz) {
      this.audio.playLampBuzz((Math.random() - 0.5) * 1.1);
      this.nextBuzz = this.elapsed + 8.0 + Math.random() * 10.0;
    }

    // Follow player cleanly with moonlight directional shadow box
    this.stormTarget.position.set(this.playerPos.x, 0, this.playerPos.z);
    this.stormDirLight.position.set(this.playerPos.x - 18, 34, this.playerPos.z + 24);

    // Fog & Sky & Hemi lighting blend
    this.scratchColorA.copy(OUTDOOR_FOG_COLOR).lerp(INDOOR_FOG_COLOR, this.indoorBlend);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.scratchColorA);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.scratchColorA);
      const baseDensity = this.settings.fogDensity;
      this.scene.fog.density = THREE.MathUtils.lerp(baseDensity * 0.68, baseDensity * 0.48, this.indoorBlend);
    }

    this.hemiLight.color.copy(OUTDOOR_HEMI_SKY).lerp(INDOOR_HEMI_SKY, this.indoorBlend);
    this.hemiLight.groundColor.copy(OUTDOOR_HEMI_GROUND).lerp(INDOOR_HEMI_GROUND, this.indoorBlend);

    const irBoost = this.settings.visionMode === 'ir-camcorder' ? 0.28 : 0;
    this.hemiLight.intensity = THREE.MathUtils.lerp(1.55, 0.58, this.indoorBlend) + irBoost;
    this.stormDirLight.intensity = THREE.MathUtils.lerp(1.55, 0.35, this.indoorBlend);
    if (!this.isSoftwareGl) {
      this.stormDirLight.shadow.autoUpdate = this.indoorBlend < 0.92;
    }

    this.updateDynamicTownLights();
    this.townEnv.updateSky(this.elapsed);
    this.pipeline.setMood(this.elapsed, 0);
    this.audio.setEnvironmentBlend(this.indoorBlend * 0.7, this.tension);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      if (sync && gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 70);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsed += dt;

    const doorStep = this.doorLoader.update(dt, this.audio, this.camera.aspect);
    if (doorStep.active) {
      const hudKey = doorStep.hud
        ? `${doorStep.hud.label}|${doorStep.hud.sublabel}|${doorStep.hud.skippable ? 1 : 0}`
        : '';
      if (hudKey !== this.lastDoorHudKey) {
        this.lastDoorHudKey = hudKey;
        this.callbacks.onDoorLoadingChange?.(doorStep.hud);
      }
      this.pipeline.setMood(this.elapsed, 0);
      this.pipeline.setFade(doorStep.fadeAlpha);
      if (doorStep.renderingDoorScene) {
        this.pipeline.renderScene(this.doorLoader.scene, this.doorLoader.camera);
      } else {
        this.updateEnvironmentAtmosphere(dt);
        this.syncCameraAndFlashlight(dt);
        this.pipeline.render();
      }
    } else {
      this.pipeline.setFade(0);
      this.updatePlayer(dt);
      this.updateDoorsAndProps(dt);
      if ((this.dustFrame = (this.dustFrame + 1) % 3) === 0) {
        this.updateNightParticles();
      }
      if ((this.raycastFrame % 5) === 0) {
        this.updateHoverPrompt();
      }
      this.updateEnvironmentAtmosphere(dt);
      this.pipeline.render();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  dispose(): void {
    this.disposed = true;
    this.doorLoader.dispose();

    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();
    this.audio.dispose();

    const allGeos = new Set<THREE.BufferGeometry>(this.townEnv.geometries);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.LineSegments) {
        allGeos.add(obj.geometry);
      }
    });
    for (const g of allGeos) g.dispose();
    for (const m of this.townEnv.materials) m.dispose();

    this.flashlightModel.dispose();
    this.pistolModel.dispose();
    this.impactSparkGeo.dispose();
    for (const sp of this.impactSparks) sp.mat.dispose();
    this.coreBeam.dispose();
    this.wideBeam.dispose();
    this.pipeline.dispose();
    this.propMats.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
