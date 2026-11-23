import * as THREE from 'three';

export type Ps2PresetId = 'silent-fog' | 'camcorder-480i' | 'vhs-cursed' | 'native-hd';

export type Ps2ResolutionId = '320x240' | '512x448' | '640x448' | 'native';

export type VisionMode = 'flashlight' | 'ir-camcorder';

export type DoorLoadingMode = 'sectors' | 'classic' | 'fast';

export type DoorVariant = 'entrance' | 'stairwell' | 'ward';

export interface DoorLoadingHudState {
  label: string;
  sublabel: string;
  variant: DoorVariant;
  fadeAlpha: number;
  skippable: boolean;
}

export interface Ps2Settings {
  preset: Ps2PresetId;
  resolution: Ps2ResolutionId;
  dithering: boolean;
  scanlines: boolean;
  pixelTextures: boolean;
  vertexSnap: boolean;
  colorBits: 15 | 24;
  fogDensity: number;
  crtCurvature: number;
  visionMode: VisionMode;
  doorLoading: DoorLoadingMode;
}

export const PS2_PRESETS: Record<Ps2PresetId, Omit<Ps2Settings, 'visionMode'>> = {
  'silent-fog': {
    preset: 'silent-fog',
    resolution: '640x448',
    dithering: true,
    scanlines: true,
    pixelTextures: true,
    vertexSnap: false,
    colorBits: 15,
    fogDensity: 0.025,
    crtCurvature: 0.04,
    doorLoading: 'sectors',
  },
  'camcorder-480i': {
    preset: 'camcorder-480i',
    resolution: '640x448',
    dithering: true,
    scanlines: true,
    pixelTextures: true,
    vertexSnap: false,
    colorBits: 15,
    fogDensity: 0.022,
    crtCurvature: 0.025,
    doorLoading: 'sectors',
  },
  'vhs-cursed': {
    preset: 'vhs-cursed',
    resolution: '320x240',
    dithering: true,
    scanlines: true,
    pixelTextures: true,
    vertexSnap: true,
    colorBits: 15,
    fogDensity: 0.032,
    crtCurvature: 0.08,
    doorLoading: 'classic',
  },
  'native-hd': {
    preset: 'native-hd',
    resolution: 'native',
    dithering: false,
    scanlines: false,
    pixelTextures: false,
    vertexSnap: false,
    colorBits: 24,
    fogDensity: 0.018,
    crtCurvature: 0,
    doorLoading: 'sectors',
  },
};

export interface AABBCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CapsuleCollider {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  radius: number;
}

export interface DoorState {
  id: string;
  group: THREE.Group;
  pivot: THREE.Group;
  isOpen: boolean;
  openAngle: number;
  closedAngle: number;
  currentAngle: number;
  targetAngle: number;
  animating: boolean;
  animStartAngle: number;
  animTargetAngle: number;
  animElapsed: number;
  animDuration: number;
  animFrac: number;
  animMode: 'open' | 'close';
  locked: boolean;
  requiredKeyId?: string;
  requiredKeyName?: string;
  oneWayUnlockSide?: 'east' | 'west' | 'north' | 'south';
  oneWayHint?: string;
  linkedDoorId?: string;
  shudderTime: number;
  hingeWorldX: number;
  hingeWorldZ: number;
  leafWidth: number;
  baseRotationY: number;
}

export interface NudgeProp {
  group: THREE.Group;
  kind: 'cart' | 'chair';
  basePos: THREE.Vector3;
  baseRot: THREE.Euler;
  impulse: number;
  impulseDirX: number;
  impulseDirZ: number;
  phase: number;
}

export type FloorKey = 'entrada' | 'praca' | 'posto' | 'delegacia' | 'mercado' | 'igreja';

export type SurfaceType = 'exterior' | 'stone' | 'wood' | 'tile' | 'concrete';

export interface KeyItem {
  id: string;
  name: string;
  shortName: string;
  location: string;
}

export interface InspectableDocument {
  id: string;
  code: string;
  title: string;
  location: string;
  date: string;
  author: string;
  stamp?: string;
  paragraphs: string[];
}

export interface DrawerState {
  id: string;
  group: THREE.Group;
  slideGroup: THREE.Group;
  isOpen: boolean;
  openFrac: number;
  slideDist: number;
  metallic: boolean;
  pickupId?: string;
  pickupItemId?: string;
  pickupGroup?: THREE.Group;
  pickupCollected: boolean;
}

export interface HideCabinetState {
  id: string;
  label: string;
  group: THREE.Group;
  doorPivot: THREE.Group;
  doorAngle: number;
  targetDoorAngle: number;
  insidePos: THREE.Vector3;
  exitPos: THREE.Vector3;
  outwardYaw: number;
  metallic: boolean;
}

export type InventoryCategory = 'tool' | 'weapon' | 'ammo' | 'medical' | 'key' | 'relic';

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  description: string;
  quantity: number;
  maxStack: number;
  usable: boolean;
  useLabel?: string;
  detailHint?: string;
}

export interface PlayerStatusHudState {
  crouched: boolean;
  hiding: boolean;
  hidingLabel?: string;
  tension: number;
  battery: number;
  compass: string;
}

export interface PistolHudState {
  equipped: boolean;
  ammo: number;
  magSize: number;
  reserve: number;
  reloading: boolean;
}

export interface GameCallbacks {
  onFlashlightChange?: (on: boolean) => void;
  onPistolChange?: (state: PistolHudState) => void;
  onPlayerStatusChange?: (status: PlayerStatusHudState) => void;
  onInventoryChange?: (items: InventoryItem[]) => void;
  onZoneChange?: (zone: string) => void;
  onFloorChange?: (floor: FloorKey) => void;
  onInteractPrompt?: (prompt: string | null) => void;
  onAudioMuteChange?: (muted: boolean) => void;
  onSettingsChange?: (settings: Ps2Settings) => void;
  onOpenDocument?: (doc: InspectableDocument, collectedDocs: InspectableDocument[]) => void;
  onKeysChange?: (keys: KeyItem[]) => void;
  onStatusToast?: (message: string) => void;
  onDoorLoadingChange?: (state: DoorLoadingHudState | null) => void;
}
