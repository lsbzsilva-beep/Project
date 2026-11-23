import * as THREE from 'three';
import { BlackwoodAudio } from './audio';
import { PropMaterialBank } from './materials';
import { DoorLoadingHudState, DoorVariant } from './types';

export interface DoorLoadingStartOptions {
  variant: DoorVariant;
  label: string;
  sublabel: string;
  fastMode: boolean;
  onSwap: () => void;
  onComplete: () => void;
}

export interface DoorLoadingStepResult {
  active: boolean;
  renderingDoorScene: boolean;
  fadeAlpha: number;
  hud: DoorLoadingHudState | null;
}

interface DoorRig {
  group: THREE.Group;
  pivots: { pivot: THREE.Group; targetAngle: number }[];
  handles: THREE.Group[];
}

export class DoorLoadingController {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private spotLight: THREE.SpotLight;
  private rimLight: THREE.PointLight;
  private geometries: THREE.BufferGeometry[] = [];
  private rigs: Record<DoorVariant, DoorRig>;

  private active = false;
  private fastMode = false;
  private variant: DoorVariant = 'stairwell';
  private label = '';
  private sublabel = '';
  private elapsed = 0;
  private duration = 1.65;
  private swapped = false;
  private latchPlayed = false;
  private creakPlayed = false;
  private step1Played = false;
  private step2Played = false;
  private onSwapCb: (() => void) | null = null;
  private onCompleteCb: (() => void) | null = null;

  constructor(mats: PropMaterialBank) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020303);
    this.scene.fog = new THREE.FogExp2(0x020303, 0.23);

    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.08, 18);
    this.camera.position.set(0, 1.46, 2.48);
    this.camera.lookAt(0, 1.3, 0);

    const hemi = new THREE.HemisphereLight(0x2a3430, 0x050606, 0.34);
    this.scene.add(hemi);

    this.spotLight = new THREE.SpotLight(0xffe1ae, 26, 9.5, Math.PI / 4.2, 0.68, 1.35);
    this.spotLight.position.set(0.18, 2.25, 2.65);
    this.spotLight.target.position.set(0, 1.25, 0);
    this.scene.add(this.spotLight, this.spotLight.target);

    this.rimLight = new THREE.PointLight(0x527368, 0.55, 5.5, 1.6);
    this.rimLight.position.set(0, 2.0, -0.75);
    this.scene.add(this.rimLight);

    // Subtle dark threshold floor strip so ground grounding reads under the door
    const floorGeo = this.trackGeo(new THREE.PlaneGeometry(3.2, 4.2));
    const floorMat = mats.darkTrim;
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0.9);
    this.scene.add(floor);

    this.rigs = {
      entrance: this.buildEntranceRig(mats),
      stairwell: this.buildStairwellRig(mats),
      ward: this.buildWardRig(mats),
    };

    this.scene.add(this.rigs.entrance.group);
    this.scene.add(this.rigs.stairwell.group);
    this.scene.add(this.rigs.ward.group);
    this.hideAllRigs();
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private hideAllRigs(): void {
    this.rigs.entrance.group.visible = false;
    this.rigs.stairwell.group.visible = false;
    this.rigs.ward.group.visible = false;
  }

  private buildEntranceRig(mats: PropMaterialBank): DoorRig {
    const group = new THREE.Group();

    const jambGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 2.86, 0.3));
    for (const sx of [-1, 1]) {
      const jamb = new THREE.Mesh(jambGeo, mats.darkTrim);
      jamb.position.set(sx * 1.0, 1.43, 0);
      group.add(jamb);
    }

    const header = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.24, 0.16, 0.32)), mats.darkTrim);
    header.position.set(0, 2.82, 0);
    group.add(header);

    const midBar = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.04, 0.09, 0.28)), mats.darkTrim);
    midBar.position.set(0, 2.38, 0);
    group.add(midBar);

    const transom = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(1.86, 0.36)), mats.transomGlass);
    transom.position.set(0, 2.58, 0);
    group.add(transom);

    const leafW = 0.92;
    const leafGeo = this.trackGeo(new THREE.BoxGeometry(leafW, 2.34, 0.07));
    const railGeo = this.trackGeo(new THREE.BoxGeometry(leafW * 0.72, 0.08, 0.085));
    const strapGeo = this.trackGeo(new THREE.BoxGeometry(0.46, 0.055, 0.088));
    const plateGeo = this.trackGeo(new THREE.BoxGeometry(0.08, 0.32, 0.09));
    const stemGeo = this.trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8));
    const barGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 0.024, 0.024));

    const pivots: { pivot: THREE.Group; targetAngle: number }[] = [];
    const handles: THREE.Group[] = [];

    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.93, 0, 0);
      group.add(pivot);

      const dir = -side;
      const leaf = new THREE.Mesh(leafGeo, mats.doorWood);
      leaf.position.set(dir * (leafW * 0.5), 1.17, 0);
      pivot.add(leaf);

      for (const y of [0.24, 1.24, 2.12]) {
        const rail = new THREE.Mesh(railGeo, mats.darkTrim);
        rail.position.set(dir * (leafW * 0.5), y, 0);
        pivot.add(rail);
      }

      for (const y of [0.42, 1.88]) {
        const strap = new THREE.Mesh(strapGeo, mats.rustedMetal);
        strap.position.set(dir * 0.24, y, 0);
        pivot.add(strap);
      }

      const plate = new THREE.Mesh(plateGeo, mats.tarnishedBrass);
      plate.position.set(dir * (leafW - 0.11), 1.06, 0);
      pivot.add(plate);

      const handlePivot = new THREE.Group();
      handlePivot.position.set(dir * (leafW - 0.11), 1.09, 0.055);
      const stem = new THREE.Mesh(stemGeo, mats.tarnishedBrass);
      stem.rotation.x = Math.PI / 2;
      handlePivot.add(stem);
      const bar = new THREE.Mesh(barGeo, mats.tarnishedBrass);
      bar.position.set(-dir * 0.055, 0, 0.032);
      handlePivot.add(bar);
      pivot.add(handlePivot);

      handles.push(handlePivot);
      pivots.push({ pivot, targetAngle: side < 0 ? 1.12 : -1.12 });
    }

    return { group, pivots, handles };
  }

  private buildStairwellRig(mats: PropMaterialBank): DoorRig {
    const group = new THREE.Group();

    const jambGeo = this.trackGeo(new THREE.BoxGeometry(0.11, 2.66, 0.28));
    for (const sx of [-1, 1]) {
      const jamb = new THREE.Mesh(jambGeo, mats.rustedMetal);
      jamb.position.set(sx * 0.62, 1.33, 0);
      group.add(jamb);
    }

    const header = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.36, 0.14, 0.28)), mats.rustedMetal);
    header.position.set(0, 2.62, 0);
    group.add(header);

    const pivot = new THREE.Group();
    pivot.position.set(-0.56, 0, 0);
    group.add(pivot);

    const leafW = 1.12;
    const leaf = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(leafW, 2.48, 0.068)), mats.doorWood);
    leaf.position.set(leafW * 0.5, 1.24, 0);
    pivot.add(leaf);

    // Kick plate + riveted cross bands
    const kick = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(leafW * 0.96, 0.42, 0.082)), mats.rustedMetal);
    kick.position.set(leafW * 0.5, 0.22, 0);
    pivot.add(kick);

    const brace = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(leafW * 0.96, 0.09, 0.084)), mats.rustedMetal);
    brace.position.set(leafW * 0.5, 1.34, 0);
    pivot.add(brace);

    // Upper vision slit
    const slitFrame = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.36, 0.46, 0.088)), mats.rustedMetal);
    slitFrame.position.set(leafW * 0.5, 1.88, 0);
    pivot.add(slitFrame);

    const slitGlass = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(0.28, 0.38)), mats.transomGlass);
    slitGlass.position.set(leafW * 0.5, 1.88, 0.046);
    pivot.add(slitGlass);

    // Brass lockset & handle
    const esc = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.06, 0.24, 0.08)), mats.tarnishedBrass);
    esc.position.set(leafW - 0.11, 1.04, 0);
    pivot.add(esc);

    const handlePivot = new THREE.Group();
    handlePivot.position.set(leafW - 0.11, 1.08, 0.048);
    const stem = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.013, 0.013, 0.055, 8)), mats.tarnishedBrass);
    stem.rotation.x = Math.PI / 2;
    handlePivot.add(stem);
    const lever = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.13, 0.022, 0.022)), mats.tarnishedBrass);
    lever.position.set(-0.052, 0, 0.028);
    handlePivot.add(lever);
    pivot.add(handlePivot);

    return {
      group,
      pivots: [{ pivot, targetAngle: 1.24 }],
      handles: [handlePivot],
    };
  }

  private buildWardRig(mats: PropMaterialBank): DoorRig {
    const group = new THREE.Group();

    const jambGeo = this.trackGeo(new THREE.BoxGeometry(0.08, 2.66, 0.26));
    for (const sx of [-1, 1]) {
      const jamb = new THREE.Mesh(jambGeo, mats.darkTrim);
      jamb.position.set(sx * 0.52, 1.33, 0);
      group.add(jamb);
    }

    const header = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.12, 0.09, 0.26)), mats.darkTrim);
    header.position.set(0, 2.62, 0);
    group.add(header);

    const mid = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(1.08, 0.08, 0.24)), mats.darkTrim);
    mid.position.set(0, 2.2, 0);
    group.add(mid);

    const transom = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(0.94, 0.34)), mats.transomGlass);
    transom.position.set(0, 2.4, 0);
    group.add(transom);

    const pivot = new THREE.Group();
    pivot.position.set(-0.48, 0, 0);
    group.add(pivot);

    const leafW = 0.96;
    const leaf = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(leafW, 2.16, 0.052)), mats.doorWood);
    leaf.position.set(leafW * 0.5, 1.08, 0);
    pivot.add(leaf);

    const railGeo = this.trackGeo(new THREE.BoxGeometry(leafW * 0.74, 0.06, 0.068));
    for (const y of [0.22, 1.22, 1.96]) {
      const rail = new THREE.Mesh(railGeo, mats.darkTrim);
      rail.position.set(leafW * 0.5, y, 0);
      pivot.add(rail);
    }

    const hingeGeo = this.trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8));
    for (const y of [0.35, 1.12, 1.88]) {
      const hinge = new THREE.Mesh(hingeGeo, mats.rustedMetal);
      hinge.position.set(0.01, y, 0.032);
      pivot.add(hinge);
    }

    const esc = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.052, 0.2, 0.07)), mats.tarnishedBrass);
    esc.position.set(leafW - 0.1, 0.98, 0);
    pivot.add(esc);

    const handlePivot = new THREE.Group();
    handlePivot.position.set(leafW - 0.1, 1.01, 0.044);
    const stem = new THREE.Mesh(this.trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8)), mats.tarnishedBrass);
    stem.rotation.x = Math.PI / 2;
    handlePivot.add(stem);
    const lever = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.12, 0.02, 0.02)), mats.tarnishedBrass);
    lever.position.set(-0.048, 0, 0.026);
    handlePivot.add(lever);
    pivot.add(handlePivot);

    return {
      group,
      pivots: [{ pivot, targetAngle: 1.28 }],
      handles: [handlePivot],
    };
  }

  isActive(): boolean {
    return this.active;
  }

  start(opts: DoorLoadingStartOptions): void {
    this.active = true;
    this.fastMode = opts.fastMode;
    this.variant = opts.variant;
    this.label = opts.label;
    this.sublabel = opts.sublabel;
    this.elapsed = 0;
    this.duration = opts.fastMode ? 0.44 : opts.variant === 'ward' ? 1.28 : 1.65;
    this.swapped = false;
    this.latchPlayed = false;
    this.creakPlayed = false;
    this.step1Played = false;
    this.step2Played = false;
    this.onSwapCb = opts.onSwap;
    this.onCompleteCb = opts.onComplete;

    this.hideAllRigs();
    const rig = this.rigs[this.variant];
    rig.group.visible = true;
    for (const p of rig.pivots) p.pivot.rotation.y = 0;
    for (const h of rig.handles) h.rotation.z = 0;

    this.camera.position.set(0, 1.46, 2.5);
    this.camera.lookAt(0, 1.32, 0);
  }

  skip(): void {
    if (!this.active || this.fastMode) return;
    const t = this.elapsed / this.duration;
    if (t > 0.18 && t < 0.72) {
      this.elapsed = 0.72 * this.duration;
    }
  }

  update(dt: number, audio: BlackwoodAudio, aspect: number): DoorLoadingStepResult {
    if (!this.active) {
      return { active: false, renderingDoorScene: false, fadeAlpha: 0, hud: null };
    }

    if (Math.abs(this.camera.aspect - aspect) > 0.005) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }

    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration);

    if (this.fastMode) {
      let fadeAlpha = 0;
      if (t < 0.46) {
        fadeAlpha = THREE.MathUtils.smoothstep(t, 0, 0.46);
      } else {
        if (!this.swapped) {
          this.swapped = true;
          this.onSwapCb?.();
        }
        fadeAlpha = 1 - THREE.MathUtils.smoothstep(t, 0.54, 1);
      }

      if (t >= 1) {
        this.finish();
        return { active: false, renderingDoorScene: false, fadeAlpha: 0, hud: null };
      }

      return {
        active: true,
        renderingDoorScene: false,
        fadeAlpha,
        hud: {
          label: this.label,
          sublabel: this.sublabel,
          variant: this.variant,
          fadeAlpha,
          skippable: false,
        },
      };
    }

    // Full PS1/PS2 3D Door Void Sequence
    let renderingDoorScene = false;
    let fadeAlpha = 0;

    if (t < 0.14) {
      // Fade out from current world
      renderingDoorScene = false;
      fadeAlpha = THREE.MathUtils.smoothstep(t, 0, 0.13);
    } else if (t < 0.84) {
      // Render isolated 3D door in pitch darkness
      renderingDoorScene = true;
      if (t < 0.25) {
        fadeAlpha = 1 - THREE.MathUtils.smoothstep(t, 0.14, 0.25);
      } else if (t > 0.7) {
        fadeAlpha = THREE.MathUtils.smoothstep(t, 0.7, 0.83);
      } else {
        fadeAlpha = 0;
      }

      const rig = this.rigs[this.variant];

      // Handle rotation (latch click)
      if (t >= 0.18 && !this.latchPlayed) {
        this.latchPlayed = true;
        audio.playDoorUnlock();
      }
      const handleFrac = t < 0.18 ? 0 : t < 0.34 ? Math.sin(((t - 0.18) / 0.16) * Math.PI) : 0;
      for (const h of rig.handles) {
        h.rotation.z = handleFrac * 0.42;
      }

      // Door swing creak
      if (t >= 0.27 && !this.creakPlayed) {
        this.creakPlayed = true;
        audio.playDoorAction(`door-load-${this.variant}`, true, 0.9, this.duration * 0.46, 0, 0.4);
      }
      const openFrac = THREE.MathUtils.smoothstep(t, 0.27, 0.72);
      for (const p of rig.pivots) {
        p.pivot.rotation.y = p.targetAngle * openFrac;
      }

      // Camera approach + gentle horror step bob
      const walkFrac = THREE.MathUtils.smoothstep(t, 0.16, 0.82);
      const bob = Math.sin(walkFrac * Math.PI * 3.5) * 0.016 * (t > 0.28 ? 1 : 0.2);
      const swayX = Math.sin(walkFrac * Math.PI * 2.0) * 0.012;
      this.camera.position.set(swayX, 1.46 + bob, THREE.MathUtils.lerp(2.48, 0.56, walkFrac));
      this.camera.lookAt(0, 1.32 + bob * 0.4, -0.8);

      // Subtle lantern flicker on the spotlight
      const flick = 0.95 + 0.05 * Math.sin(this.elapsed * 29.0);
      this.spotLight.intensity = 26 * flick;
      this.spotLight.position.set(0.18 + swayX, 2.25, this.camera.position.z + 0.15);

      if (t >= 0.44 && !this.step1Played) {
        this.step1Played = true;
        audio.playFootstep(0.32, 'wood', false);
      }
      if (t >= 0.64 && !this.step2Played) {
        this.step2Played = true;
        audio.playFootstep(0.36, 'wood', false);
      }

      if (t >= 0.83 && !this.swapped) {
        this.swapped = true;
        this.onSwapCb?.();
      }
    } else {
      // Fade into the newly loaded sector/room
      if (!this.swapped) {
        this.swapped = true;
        this.onSwapCb?.();
      }
      renderingDoorScene = false;
      fadeAlpha = 1 - THREE.MathUtils.smoothstep(t, 0.84, 1);
    }

    if (t >= 1) {
      this.finish();
      return { active: false, renderingDoorScene: false, fadeAlpha: 0, hud: null };
    }

    return {
      active: true,
      renderingDoorScene,
      fadeAlpha,
      hud: {
        label: this.label,
        sublabel: this.sublabel,
        variant: this.variant,
        fadeAlpha,
        skippable: t > 0.2 && t < 0.72,
      },
    };
  }

  private finish(): void {
    this.active = false;
    this.hideAllRigs();
    const cb = this.onCompleteCb;
    this.onSwapCb = null;
    this.onCompleteCb = null;
    cb?.();
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.geometries = [];
  }
}
