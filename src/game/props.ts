import * as THREE from 'three';
import { PropMaterialBank } from './materials';
import { BlackwoodTextureBank } from './textures';
import { AABBCollider, DoorState, DrawerState, HideCabinetState, NudgeProp } from './types';

export function tagInteractable(obj: THREE.Object3D, interactionId: string): void {
  obj.traverse((child) => {
    child.layers.enable(1);
    child.userData.interactionId = interactionId;
  });
}

const HAND_UP_AXIS = new THREE.Vector3(0, 1, 0);

function buildFingerChain(
  parent: THREE.Object3D,
  points: THREE.Vector3[],
  radii: number[],
  segMat: THREE.Material,
  jointMat: THREE.Material,
  nailMat: THREE.Material | null,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  nailNormal?: THREE.Vector3,
): void {
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  for (let i = 0; i < points.length; i++) {
    const jSphere = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(radii[i] * 1.03, 7, 6)), i === 0 ? jointMat : segMat);
    jSphere.position.copy(points[i]);
    parent.add(jSphere);

    if (i < points.length - 1) {
      const p0 = points[i];
      const p1 = points[i + 1];
      dir.subVectors(p1, p0);
      const len = dir.length();
      if (len > 1e-4) {
        dir.divideScalar(len);
        mid.addVectors(p0, p1).multiplyScalar(0.5);
        quat.setFromUnitVectors(HAND_UP_AXIS, dir);

        const seg = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(radii[i + 1], radii[i], len, 8)),
          i === 1 ? jointMat : segMat,
        );
        seg.position.copy(mid);
        seg.quaternion.copy(quat);
        parent.add(seg);

        if (i === points.length - 2 && nailMat) {
          const rTip = radii[i + 1];
          const nail = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(rTip * 1.18, len * 0.44, rTip * 0.42)),
            nailMat,
          );
          const nDir = nailNormal ? nailNormal.clone().normalize() : new THREE.Vector3(0, 0, 1);
          // Construct orthonormal basis where Y aligns with finger bone dir and Z aligns with dorsal nail normal
          const tangent = dir.clone();
          const right = new THREE.Vector3().crossVectors(tangent, nDir);
          if (right.lengthSq() < 1e-4) {
            right.set(1, 0, 0);
          } else {
            right.normalize();
          }
          const orthoNormal = new THREE.Vector3().crossVectors(right, tangent).normalize();
          const basis = new THREE.Matrix4().makeBasis(right, tangent, orthoNormal);
          nail.quaternion.setFromRotationMatrix(basis);
          nail.position
            .copy(p0)
            .lerp(p1, 0.72)
            .addScaledVector(orthoNormal, rTip * 0.88);
          parent.add(nail);
        }
      }
    }
  }
}

export interface FlashlightViewmodel {
  group: THREE.Group;
  lensMaterial: THREE.MeshLambertMaterial;
  beamMesh: THREE.Mesh;
  setPowered: (on: boolean) => void;
  setBeamIntensity: (val: number) => void;
  dispose: () => void;
}

export function createFlashlightModel(
  mats: PropMaterialBank,
  textures: BlackwoodTextureBank,
  side: 'left' | 'right' = 'left',
): FlashlightViewmodel {
  const s = side === 'left' ? -1 : 1;
  const group = new THREE.Group();
  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposablesGeo.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposablesMat.push(m);
    return m;
  };

  // Vintage Brass & Gunmetal Flashlight
  const body = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.023, 0.024, 0.21, 12)), mats.gunmetal);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, 0.02);
  group.add(body);

  const ringGeo = trackGeo(new THREE.CylinderGeometry(0.0245, 0.0245, 0.012, 12));
  for (const z of [-0.04, 0.02, 0.08]) {
    const ring = new THREE.Mesh(ringGeo, mats.tarnishedBrass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0, z);
    group.add(ring);
  }

  const tail = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.0255, 0.024, 0.024, 12)), mats.tarnishedBrass);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0, 0.13);
  group.add(tail);

  const lanyard = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.014, 0.0028, 6, 10)), mats.tarnishedBrass);
  lanyard.position.set(0, -0.008, 0.146);
  group.add(lanyard);

  const switchBtn = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.012, 0.008, 0.032)), mats.tarnishedBrass);
  switchBtn.position.set(0, 0.025, -0.028);
  group.add(switchBtn);

  const neck = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.041, 0.025, 0.044, 14)), mats.tarnishedBrass);
  neck.rotation.x = -Math.PI / 2;
  neck.position.set(0, 0, -0.105);
  group.add(neck);

  const head = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.043, 0.042, 0.022, 14)), mats.tarnishedBrass);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 0, -0.138);
  group.add(head);

  const lensMaterial = trackMat(
    new THREE.MeshLambertMaterial({
      color: 0x222629,
      emissive: 0xffd27a,
      emissiveIntensity: 0,
    }),
  );
  const lens = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.037, 14)), lensMaterial);
  lens.rotation.y = Math.PI;
  lens.position.set(0, 0, -0.147);
  group.add(lens);

  // Articulated First-Person Hand & Coat Forearm Gripping the Flashlight
  const skinMat = trackMat(new THREE.MeshLambertMaterial({ color: 0xb58b70, dithering: true }));
  const skinShadeMat = trackMat(new THREE.MeshLambertMaterial({ color: 0x997157, dithering: true }));
  const nailMat = trackMat(new THREE.MeshLambertMaterial({ color: 0xcab09c, dithering: true }));
  const cuffMat = trackMat(new THREE.MeshLambertMaterial({ color: 0x968e7e, dithering: true }));
  const sleeveMat = trackMat(new THREE.MeshLambertMaterial({ color: 0x242724, dithering: true }));

  const handGroup = new THREE.Group();

  // Contoured palm wrapping the outer-bottom side of the barrel (barrel radius = 0.024)
  const palmCore = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.026, 0.048, 0.088)), skinMat);
  palmCore.position.set(0.029 * s, -0.008, 0.024);
  palmCore.rotation.set(0.06, -0.06 * s, -0.22 * s);
  handGroup.add(palmCore);

  const palmBridge = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.022, 8, 6)), skinMat);
  palmBridge.scale.set(0.75, 0.9, 1.85);
  palmBridge.position.set(0.025 * s, 0.002, 0.024);
  handGroup.add(palmBridge);

  const palmHeel = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.025, 8, 6)), skinShadeMat);
  palmHeel.scale.set(0.84, 0.94, 1.35);
  palmHeel.position.set(0.03 * s, -0.016, 0.072);
  handGroup.add(palmHeel);

  // Thenar muscle pad + articulated thumb arching smoothly over barrel to rest on the brass switch
  const thenar = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.018, 8, 6)), skinMat);
  thenar.scale.set(0.85, 0.8, 1.35);
  thenar.position.set(0.024 * s, 0.012, 0.045);
  handGroup.add(thenar);

  const thumbPivot = new THREE.Group();
  buildFingerChain(
    thumbPivot,
    [
      new THREE.Vector3(0.025 * s, 0.004, 0.048),
      new THREE.Vector3(0.017 * s, 0.026, 0.023),
      new THREE.Vector3(0.005 * s, 0.0325, -0.003),
      new THREE.Vector3(0.0, 0.0315, -0.026),
    ],
    [0.0108, 0.0096, 0.0086, 0.0078],
    skinMat,
    skinShadeMat,
    nailMat,
    trackGeo,
    new THREE.Vector3(0, 1, 0),
  );
  handGroup.add(thumbPivot);

  // Four continuous anatomical fingers wrapping cleanly around bottom & inner side of barrel
  const fingerDefs = [
    { z: -0.016, tipY: 0.005, r: 0.008, zCurl: 0.001 },
    { z: 0.007, tipY: 0.002, r: 0.0082, zCurl: 0.0 },
    { z: 0.029, tipY: -0.001, r: 0.0078, zCurl: -0.001 },
    { z: 0.05, tipY: -0.005, r: 0.007, zCurl: -0.002 },
  ];

  for (const f of fingerDefs) {
    const r = f.r;
    buildFingerChain(
      handGroup,
      [
        new THREE.Vector3(0.025 * s, -0.018, f.z),
        new THREE.Vector3(0.003 * s, -0.033, f.z - 0.001 + f.zCurl),
        new THREE.Vector3(-0.024 * s, -0.021, f.z - 0.002 + f.zCurl),
        new THREE.Vector3(-0.0312 * s, f.tipY, f.z - 0.003 + f.zCurl),
      ],
      [r * 1.05, r * 0.96, r * 0.88, r * 0.8],
      skinMat,
      skinShadeMat,
      nailMat,
      trackGeo,
      new THREE.Vector3(-s, 0.25, 0),
    );
  }

  // Wrist, stained shirt cuff & 1924 dark overcoat sleeve extending past the bottom corner
  const wrist = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.027, 0.031, 0.11, 10)), skinShadeMat);
  wrist.position.set(0.043 * s, -0.028, 0.116);
  wrist.rotation.set(Math.PI / 2 + 0.28, -0.18 * s, 0);
  handGroup.add(wrist);

  const cuff = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.033, 0.036, 0.036, 10)), cuffMat);
  cuff.position.set(0.057 * s, -0.044, 0.156);
  cuff.rotation.set(Math.PI / 2 + 0.28, -0.18 * s, 0);
  handGroup.add(cuff);

  const sleeve = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.042, 0.054, 0.34, 10)), sleeveMat);
  sleeve.position.set(0.096 * s, -0.092, 0.306);
  sleeve.rotation.set(Math.PI / 2 + 0.28, -0.18 * s, 0);
  handGroup.add(sleeve);

  group.add(handGroup);

  const beamGeo = trackGeo(new THREE.ConeGeometry(0.2, 1.1, 14, 1, true));
  beamGeo.translate(0, -0.55, 0);
  beamGeo.rotateX(-Math.PI / 2);

  const beamMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.beamCone,
      color: 0xffeba8,
      transparent: true,
      opacity: 0.03,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.position.set(0, 0, -0.146);
  beamMesh.renderOrder = 3;
  beamMesh.visible = false;
  group.add(beamMesh);

  group.traverse((child) => {
    child.userData.isViewmodel = true;
    child.castShadow = false;
    child.receiveShadow = false;
    child.raycast = () => {};
  });

  let powered = false;

  return {
    group,
    lensMaterial,
    beamMesh,
    setPowered: (on: boolean) => {
      powered = on;
      lensMaterial.emissiveIntensity = on ? 1.85 : 0;
      lensMaterial.color.setHex(on ? 0xffe49e : 0x222629);
      switchBtn.position.z = on ? -0.031 : -0.023;
      thumbPivot.position.z = on ? -0.003 : 0.003;
      beamMesh.visible = on;
    },
    setBeamIntensity: (val: number) => {
      const clamped = powered ? THREE.MathUtils.clamp(val, 0, 1.25) : 0;
      beamMat.opacity = 0.038 * clamped;
      beamMesh.visible = powered && clamped > 0.01;
    },
    dispose: () => {
      for (const g of disposablesGeo) g.dispose();
      for (const m of disposablesMat) m.dispose();
    },
  };
}

export interface PistolViewmodel {
  group: THREE.Group;
  getMuzzleWorldPos: (out: THREE.Vector3) => THREE.Vector3;
  updateState: (recoil: number, slideKick: number, reloadProg: number, flashAlpha: number, flashRoll: number) => void;
  dispose: () => void;
}

export function createPistolModel(mats: PropMaterialBank): PistolViewmodel {
  const group = new THREE.Group();
  const disposablesGeo: THREE.BufferGeometry[] = [];
  const disposablesMat: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposablesGeo.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposablesMat.push(m);
    return m;
  };

  const bluedSteelMat = trackMat(
    new THREE.MeshPhongMaterial({
      color: 0x292d31,
      shininess: 38,
      specular: 0x5c646b,
      dithering: true,
    }),
  );
  const darkBoreMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x060708 }));
  const walnutGripMat = trackMat(
    new THREE.MeshLambertMaterial({
      color: 0x4b2a19,
      dithering: true,
    }),
  );
  const sightDotMat = trackMat(
    new THREE.MeshLambertMaterial({
      color: 0xe6d6ad,
      emissive: 0x594b2d,
      emissiveIntensity: 0.45,
    }),
  );

  // Pistol frame assembly (points toward -Z)
  const weaponGroup = new THREE.Group();
  group.add(weaponGroup);

  // Lower frame + dust cover
  const lowerFrame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.024, 0.02, 0.168)), bluedSteelMat);
  lowerFrame.position.set(0, -0.001, -0.004);
  weaponGroup.add(lowerFrame);

  // Beaver-tail tang
  const tang = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.02, 0.012, 0.028)), bluedSteelMat);
  tang.position.set(0, 0.005, 0.088);
  weaponGroup.add(tang);

  // Exposed barrel inside slide + muzzle crown
  const barrel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.0072, 0.0072, 0.14, 10)), mats.rustedMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.014, -0.042);
  weaponGroup.add(barrel);

  const bore = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.0048, 8)), darkBoreMat);
  bore.rotation.y = Math.PI;
  bore.position.set(0, 0.014, -0.113);
  weaponGroup.add(bore);

  // Recoil spring plug beneath muzzle
  const recoilPlug = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.0055, 0.0055, 0.085, 8)), bluedSteelMat);
  recoilPlug.rotation.x = Math.PI / 2;
  recoilPlug.position.set(0, 0.001, -0.062);
  weaponGroup.add(recoilPlug);

  // Trigger guard loop
  const guardBottom = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.01, 0.005, 0.044)), bluedSteelMat);
  guardBottom.position.set(0, -0.036, 0.005);
  weaponGroup.add(guardBottom);

  const guardFront = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.01, 0.03, 0.005)), bluedSteelMat);
  guardFront.position.set(0, -0.022, -0.016);
  guardFront.rotation.x = 0.18;
  weaponGroup.add(guardFront);

  const trigger = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.005, 0.019, 0.007)), mats.tarnishedBrass);
  trigger.position.set(0, -0.019, 0.009);
  trigger.rotation.x = 0.22;
  weaponGroup.add(trigger);

  // Angled Grip & Walnut Panels (natural backward slant toward +Z at bottom)
  const gripGroup = new THREE.Group();
  gripGroup.position.set(0, -0.056, 0.062);
  gripGroup.rotation.x = -0.26;
  weaponGroup.add(gripGroup);

  const gripCore = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.022, 0.098, 0.038)), bluedSteelMat);
  gripGroup.add(gripCore);

  const panelGeo = trackGeo(new THREE.BoxGeometry(0.027, 0.082, 0.031));
  const gripPanels = new THREE.Mesh(panelGeo, walnutGripMat);
  gripGroup.add(gripPanels);

  const screwGeo = trackGeo(new THREE.CylinderGeometry(0.0024, 0.0024, 0.029, 6));
  for (const sy of [-0.025, 0.025]) {
    const screw = new THREE.Mesh(screwGeo, mats.tarnishedBrass);
    screw.rotation.z = Math.PI / 2;
    screw.position.set(0, sy, 0);
    gripGroup.add(screw);
  }

  const magFloorplate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.025, 0.01, 0.042)), mats.rustedMetal);
  magFloorplate.position.set(0, -0.053, 0.001);
  gripGroup.add(magFloorplate);

  // Exposed Hammer
  const hammerPivot = new THREE.Group();
  hammerPivot.position.set(0, 0.011, 0.084);
  const hammerSpur = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.007, 0.015, 0.011)), mats.rustedMetal);
  hammerSpur.position.set(0, 0.007, 0.006);
  hammerSpur.rotation.x = -0.35;
  hammerPivot.add(hammerSpur);
  weaponGroup.add(hammerPivot);

  // Reciprocating Slide Assembly
  const slideGroup = new THREE.Group();
  weaponGroup.add(slideGroup);

  const slideMain = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.026, 0.024, 0.194)), bluedSteelMat);
  slideMain.position.set(0, 0.017, -0.012);
  slideGroup.add(slideMain);

  const slideTopBevel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.02, 0.006, 0.192)), bluedSteelMat);
  slideTopBevel.position.set(0, 0.03, -0.012);
  slideGroup.add(slideTopBevel);

  // Ejection port recess on right side
  const ejectionPort = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.008, 0.012, 0.036)), mats.rustedMetal);
  ejectionPort.position.set(0.011, 0.021, -0.008);
  slideGroup.add(ejectionPort);

  // Slide cocking serrations (5 fine ridges near rear)
  const serrationGeo = trackGeo(new THREE.BoxGeometry(0.0275, 0.018, 0.0022));
  for (let i = 0; i < 5; i++) {
    const ser = new THREE.Mesh(serrationGeo, mats.darkTrim);
    ser.position.set(0, 0.017, 0.048 + i * 0.0062);
    slideGroup.add(ser);
  }

  // Front & Rear Iron Sights
  const frontBlade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.0034, 0.008, 0.01)), bluedSteelMat);
  frontBlade.position.set(0, 0.036, -0.098);
  slideGroup.add(frontBlade);

  const frontBead = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.0028, 0.0028, 0.003)), sightDotMat);
  frontBead.position.set(0, 0.038, -0.094);
  slideGroup.add(frontBead);

  for (const sx of [-0.005, 0.005]) {
    const rearPost = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.005, 0.007, 0.01)), bluedSteelMat);
    rearPost.position.set(sx, 0.0355, 0.072);
    slideGroup.add(rearPost);
  }

  // Muzzle Flash Star (additive starburst + core glow)
  const muzzleFlashGroup = new THREE.Group();
  muzzleFlashGroup.position.set(0, 0.014, -0.125);
  muzzleFlashGroup.visible = false;
  weaponGroup.add(muzzleFlashGroup);

  const flashCoreMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffdf8e,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const flashWingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xff8b2e,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  const flashCrossGeo = trackGeo(new THREE.PlaneGeometry(0.14, 0.042));
  for (let i = 0; i < 3; i++) {
    const wing = new THREE.Mesh(flashCrossGeo, flashWingMat);
    wing.rotation.z = (i * Math.PI) / 3;
    muzzleFlashGroup.add(wing);
  }
  const flashCore = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.022, 6, 6)), flashCoreMat);
  flashCore.scale.set(0.9, 0.9, 1.8);
  muzzleFlashGroup.add(flashCore);

  // Articulated Right Hand & 1924 Coat Forearm Gripping the Pistol
  const skinMat = trackMat(new THREE.MeshLambertMaterial({ color: 0xb58b70, dithering: true }));
  const skinShadeMat = trackMat(new THREE.MeshLambertMaterial({ color: 0x997157, dithering: true }));
  const nailMat = trackMat(new THREE.MeshLambertMaterial({ color: 0xcab09c, dithering: true }));
  const cuffMat = trackMat(new THREE.MeshLambertMaterial({ color: 0x968e7e, dithering: true }));
  const sleeveMat = trackMat(new THREE.MeshLambertMaterial({ color: 0x242724, dithering: true }));

  const handGroup = new THREE.Group();
  weaponGroup.add(handGroup);

  // Palm & backstrap web wrapping right & rear of grip cleanly along its exact -0.26 rad slant
  const palm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.023, 0.064, 0.056)), skinMat);
  palm.position.set(0.019, -0.044, 0.072);
  palm.rotation.set(-0.26, -0.1, -0.12);
  handGroup.add(palm);

  const webThumb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.0155, 8, 6)), skinShadeMat);
  webThumb.scale.set(1.05, 0.85, 1.3);
  webThumb.position.set(0.002, -0.016, 0.084);
  handGroup.add(webThumb);

  const heelPalm = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.022, 8, 6)), skinShadeMat);
  heelPalm.scale.set(0.85, 0.92, 1.35);
  heelPalm.position.set(0.021, -0.062, 0.088);
  handGroup.add(heelPalm);

  // Right thumb curving cleanly around rear web to rest forward along left frame (-X side, zero tang clipping)
  buildFingerChain(
    handGroup,
    [
      new THREE.Vector3(-0.014, -0.012, 0.084),
      new THREE.Vector3(-0.019, -0.004, 0.059),
      new THREE.Vector3(-0.02, -0.002, 0.035),
      new THREE.Vector3(-0.0195, -0.001, 0.014),
    ],
    [0.01, 0.0088, 0.008, 0.0072],
    skinMat,
    skinShadeMat,
    nailMat,
    trackGeo,
    new THREE.Vector3(-1, 0.35, 0),
  );

  // Index finger reaching forward along right side of frame and curving cleanly onto the brass trigger
  buildFingerChain(
    handGroup,
    [
      new THREE.Vector3(0.021, -0.017, 0.048),
      new THREE.Vector3(0.02, -0.018, 0.022),
      new THREE.Vector3(0.011, -0.019, 0.007),
      new THREE.Vector3(0.002, -0.019, 0.0075),
    ],
    [0.0078, 0.0072, 0.0066, 0.006],
    skinMat,
    skinShadeMat,
    null,
    trackGeo,
  );

  // Middle, ring, and pinky fingers generated in gripGroup's exact slant frame (-0.26 rad) so they hug the front strap seamlessly
  const gripAngle = -0.26;
  const gripSin = Math.sin(gripAngle);
  const gripCos = Math.cos(gripAngle);
  const toGripFrame = (lx: number, ly: number, lz: number) =>
    new THREE.Vector3(
      lx,
      -0.056 + ly * gripCos - lz * gripSin,
      0.062 + ly * gripSin + lz * gripCos,
    );

  const gripFingerSpecs = [
    { ly: 0.021, r: 0.0078 },
    { ly: 0.002, r: 0.0074 },
    { ly: -0.017, r: 0.0068 },
  ];
  for (const gf of gripFingerSpecs) {
    const r = gf.r;
    buildFingerChain(
      handGroup,
      [
        toGripFrame(0.02, gf.ly, -0.004),
        toGripFrame(0.017, gf.ly, -0.024),
        toGripFrame(-0.017, gf.ly, -0.024),
        toGripFrame(-0.0195, gf.ly, -0.007),
      ],
      [r * 1.04, r * 0.96, r * 0.88, r * 0.82],
      skinMat,
      skinShadeMat,
      nailMat,
      trackGeo,
      new THREE.Vector3(-1, 0, 0.25),
    );
  }

  // Wrist, shirt cuff & dark 1924 coat sleeve extending toward bottom-right
  const wrist = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.026, 0.03, 0.11, 10)), skinShadeMat);
  wrist.position.set(0.034, -0.072, 0.138);
  wrist.rotation.set(Math.PI / 2 + 0.3, -0.16, 0);
  handGroup.add(wrist);

  const cuff = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.035, 0.036, 10)), cuffMat);
  cuff.position.set(0.047, -0.092, 0.178);
  cuff.rotation.set(Math.PI / 2 + 0.3, -0.16, 0);
  handGroup.add(cuff);

  const sleeve = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.041, 0.054, 0.34, 10)), sleeveMat);
  sleeve.position.set(0.086, -0.148, 0.328);
  sleeve.rotation.set(Math.PI / 2 + 0.3, -0.16, 0);
  handGroup.add(sleeve);

  group.traverse((child) => {
    child.userData.isViewmodel = true;
    child.castShadow = false;
    child.receiveShadow = false;
    child.raycast = () => {};
  });

  const muzzleLocal = new THREE.Vector3(0, 0.014, -0.125);

  return {
    group,
    getMuzzleWorldPos: (out: THREE.Vector3) => {
      out.copy(muzzleLocal);
      return weaponGroup.localToWorld(out);
    },
    updateState: (recoil: number, slideKick: number, reloadProg: number, flashAlpha: number, flashRoll: number) => {
      // Slide blowback & hammer cocking
      slideGroup.position.z = slideKick * 0.038;
      hammerPivot.rotation.x = slideKick > 0.05 ? -0.45 * slideKick : 0;
      trigger.rotation.x = 0.22 - recoil * 0.24;

      // Weapon recoil kick + reload tilt-and-dip motion
      const reloadSin = reloadProg > 0 ? Math.sin(reloadProg * Math.PI) : 0;
      weaponGroup.position.set(0, -reloadSin * 0.095 + recoil * 0.018, recoil * 0.048);
      weaponGroup.rotation.set(recoil * 0.26 - reloadSin * 0.42, reloadSin * 0.28, -reloadSin * 0.36);

      // Muzzle flash
      if (flashAlpha > 0.02) {
        muzzleFlashGroup.visible = true;
        muzzleFlashGroup.rotation.z = flashRoll;
        const sc = 0.65 + flashAlpha * 0.75;
        muzzleFlashGroup.scale.set(sc, sc, sc);
        flashCoreMat.opacity = Math.min(1, flashAlpha * 1.15);
        flashWingMat.opacity = Math.min(0.95, flashAlpha * 0.95);
      } else {
        muzzleFlashGroup.visible = false;
      }
    },
    dispose: () => {
      for (const g of disposablesGeo) g.dispose();
      for (const m of disposablesMat) m.dispose();
    },
  };
}

export interface VolumetricBeam {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  update: (
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    length: number,
    elapsed: number,
    intensity: number,
    radiusFactor: number,
  ) => void;
  dispose: () => void;
}

export function createVolumetricBeam(colorHex: number): VolumetricBeam {
  const geo = new THREE.ConeGeometry(1, 1, 16, 1, true);
  geo.translate(0, -0.5, 0);
  geo.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0.06 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDist;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vDist = -position.z;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vDist;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        float distFade = smoothstep(1.0, 0.08, vDist) * smoothstep(0.04, 0.24, vDist);
        float edgeDot = abs(dot(normalize(vNormalView), normalize(vViewPos)));
        float fresnel = pow(clamp(edgeDot, 0.0, 1.0), 1.9);
        gl_FragColor = vec4(uColor, distFade * fresnel * uOpacity);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  const targetPos = new THREE.Vector3();

  return {
    mesh,
    material,
    update: (origin, dir, length, _elapsed, intensity, radiusFactor) => {
      mesh.position.copy(origin);
      targetPos.copy(origin).add(dir);
      mesh.lookAt(targetPos);
      const r = Math.max(0.25, length * radiusFactor);
      mesh.scale.set(r, r, Math.max(0.4, length));
      material.uniforms.uOpacity.value = intensity;
    },
    dispose: () => {
      geo.dispose();
      material.dispose();
    },
  };
}

export function createSingleDoor(
  id: string,
  mats: PropMaterialBank,
  initAngle: number,
  swingSign: number,
  pos: THREE.Vector3,
  rotY: number,
): DoorState {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const jambW = 0.06;
  const jambD = 0.24;
  const jambGeo = new THREE.BoxGeometry(jambW, 2.656, jambD);

  const leftJamb = new THREE.Mesh(jambGeo, mats.darkTrim);
  leftJamb.position.set(-0.5, 1.328, 0);
  leftJamb.castShadow = true;
  leftJamb.receiveShadow = true;
  group.add(leftJamb);

  const rightJamb = new THREE.Mesh(jambGeo, mats.darkTrim);
  rightJamb.position.set(0.5, 1.328, 0);
  rightJamb.castShadow = true;
  rightJamb.receiveShadow = true;
  group.add(rightJamb);

  const headerGeo = new THREE.BoxGeometry(1.058, 0.076, jambD);
  const topHeader = new THREE.Mesh(headerGeo, mats.darkTrim);
  topHeader.position.set(0, 2.618, 0);
  group.add(topHeader);

  const midHeader = new THREE.Mesh(headerGeo, mats.darkTrim);
  midHeader.position.set(0, 2.2, 0);
  group.add(midHeader);

  const transom = new THREE.Mesh(new THREE.PlaneGeometry(0.93, 0.34), mats.transomGlass);
  transom.position.set(0, 2.4, 0);
  transom.renderOrder = 1;
  group.add(transom);

  const pivot = new THREE.Group();
  pivot.position.set(-0.468, 0, 0);
  group.add(pivot);

  const leafW = 0.932;
  const leafD = 0.048;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, 2.16, leafD), mats.doorWood);
  leaf.position.set(leafW / 2, 1.084, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  pivot.add(leaf);

  const railGeo = new THREE.BoxGeometry(leafW * 0.74, 0.055, 0.062);
  for (const y of [0.22, 1.24, 1.98]) {
    const rail = new THREE.Mesh(railGeo, mats.doorWood);
    rail.position.set(leafW / 2, y, 0);
    pivot.add(rail);
  }

  const hingeGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8);
  for (const y of [0.35, 1.12, 1.88]) {
    const hinge = new THREE.Mesh(hingeGeo, mats.rustedMetal);
    hinge.position.set(0.008, y, leafD * 0.56);
    pivot.add(hinge);
  }

  const escutcheon = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.19, 0.064), mats.tarnishedBrass);
  escutcheon.position.set(0.858, 0.96, 0);
  pivot.add(escutcheon);

  for (const s of [-1, 1]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.045, 8), mats.tarnishedBrass);
    stem.rotation.x = Math.PI / 2;
    stem.position.set(0.858, 0.99, s * 0.044);
    pivot.add(stem);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.018), mats.tarnishedBrass);
    handle.position.set(0.818, 0.99, s * 0.064);
    pivot.add(handle);
  }

  const openAngle = swingSign * 1.32;
  pivot.rotation.y = initAngle;
  tagInteractable(pivot, id);

  const hingeWorld = new THREE.Vector3(-0.468, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(pos);

  return {
    id,
    group,
    pivot,
    isOpen: Math.abs(initAngle) > 0.1,
    openAngle,
    closedAngle: 0,
    currentAngle: initAngle,
    targetAngle: initAngle,
    animating: false,
    animStartAngle: initAngle,
    animTargetAngle: initAngle,
    animElapsed: 0,
    animDuration: 0,
    animFrac: 1,
    animMode: 'close',
    locked: false,
    shudderTime: 0,
    hingeWorldX: hingeWorld.x,
    hingeWorldZ: hingeWorld.z,
    leafWidth: leafW,
    baseRotationY: rotY,
  };
}

export function createInspectableDocProp(
  id: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY = 0,
): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const folder = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.014, 0.24), mats.leatherStrap);
  folder.position.y = 0.007;
  group.add(folder);

  const pageA = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.008, 0.21), mats.chartPaper);
  pageA.position.set(0, 0.018, 0);
  pageA.rotation.y = 0.06;
  group.add(pageA);

  const pageB = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.006, 0.19), mats.chartPaper);
  pageB.position.set(0.014, 0.025, -0.008);
  pageB.rotation.y = -0.14;
  group.add(pageB);

  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.02), mats.tarnishedBrass);
  clasp.position.set(-0.09, 0.029, 0.06);
  group.add(clasp);

  tagInteractable(group, id);
  return group;
}

export function createKeyPickupProp(
  id: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY = 0,
  metalType: 'brass' | 'iron' = 'brass',
): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const metalMat = metalType === 'brass' ? mats.tarnishedBrass : mats.gunmetal;

  // Small identification paper tag underneath key so it stands out against dark desks
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.008, 0.1), mats.chartPaper);
  tag.position.set(0.02, 0.004, 0.02);
  tag.rotation.y = -0.25;
  group.add(tag);

  // Brass eyelet ring on tag
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 12), metalMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(-0.045, 0.016, -0.01);
  group.add(ring);

  // Key shaft & teeth
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 6), metalMat);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(0.025, 0.016, -0.01);
  group.add(shaft);

  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.024), metalMat);
  bit.position.set(0.068, 0.016, 0.004);
  group.add(bit);

  tagInteractable(group, id);
  return group;
}

export function createMedicalCart(
  id: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
): NudgeProp {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const w = 0.74;
  const d = 0.44;
  const wheelGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.024, 8);
  const postGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.81, 6);

  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
    for (const z of [-0.19, d / 2 - 0.03]) {
      const wheel = new THREE.Mesh(wheelGeo, mats.rustedMetal);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.036, z);
      group.add(wheel);

      const post = new THREE.Mesh(postGeo, mats.rustedMetal);
      post.position.set(x, 0.45, z);
      post.castShadow = true;
      group.add(post);
    }
  }

  for (const y of [0.24, 0.8]) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(w, 0.028, d), mats.rustedMetal);
    tray.position.set(0, y, 0);
    tray.castShadow = true;
    group.add(tray);
  }

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, d, 6), mats.rustedMetal);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(-w / 2 - 0.04, 0.9, 0);
  group.add(handle);

  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.026, 0.19), mats.stainedCanvas);
  cloth.position.set(0.11, 0.828, 0.04);
  cloth.rotation.y = 0.18;
  group.add(cloth);

  const bottle1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.13, 8), mats.amberBottle);
  bottle1.position.set(-0.14, 0.879, -0.06);
  group.add(bottle1);

  const bottle2 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.1, 8), mats.amberBottle);
  bottle2.position.set(-0.07, 0.84, 0.09);
  bottle2.rotation.z = Math.PI / 2;
  bottle2.rotation.y = 0.65;
  group.add(bottle2);

  const bottle3 = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.11, 8), mats.amberBottle);
  bottle3.position.set(-0.18, 0.312, 0.05);
  group.add(bottle3);

  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.31), mats.chartPaper);
  paper.rotation.x = -Math.PI / 2;
  paper.rotation.z = 0.32;
  paper.position.set(0.08, 0.258, -0.02);
  group.add(paper);

  tagInteractable(group, id);

  return {
    group,
    kind: 'cart',
    basePos: pos.clone(),
    baseRot: new THREE.Euler(0, rotY, 0),
    impulse: 0,
    impulseDirX: 0,
    impulseDirZ: 0,
    phase: 0,
  };
}

export function createChair(
  id: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  pose: 'upright' | 'side' | 'back' = 'upright',
): NudgeProp {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const chairBody = new THREE.Group();
  const s = 0.42;
  const c = 0.41;
  const seatH = 0.45;

  const seat = new THREE.Mesh(new THREE.BoxGeometry(s, 0.032, c), mats.weatheredWood);
  seat.position.set(0, seatH, 0);
  seat.castShadow = true;
  chairBody.add(seat);

  const legGeo = new THREE.CylinderGeometry(0.018, 0.014, 0.434, 6);
  for (const x of [-s / 2 + 0.04, s / 2 - 0.04]) {
    for (const z of [-c / 2 + 0.04, c / 2 - 0.04]) {
      const leg = new THREE.Mesh(legGeo, mats.weatheredWood);
      leg.position.set(x, 0.217, z);
      leg.castShadow = true;
      chairBody.add(leg);
    }
  }

  const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.32, 6), mats.weatheredWood);
  rung.rotation.z = Math.PI / 2;
  rung.position.set(0, 0.16, 0);
  chairBody.add(rung);

  const backPostGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.46, 6);
  for (const x of [-s / 2 + 0.04, s / 2 - 0.04]) {
    const post = new THREE.Mesh(backPostGeo, mats.weatheredWood);
    post.position.set(x, 0.695, -0.175);
    post.rotation.x = -0.07;
    chairBody.add(post);
  }

  const crest = new THREE.Mesh(new THREE.BoxGeometry(s, 0.055, 0.028), mats.weatheredWood);
  crest.position.set(0, 0.93, -0.19);
  chairBody.add(crest);

  const spindleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.42, 6);
  for (const x of [-0.08, 0, 0.08]) {
    const sp = new THREE.Mesh(spindleGeo, mats.weatheredWood);
    sp.position.set(x, 0.695, -0.175);
    sp.rotation.x = -0.07;
    chairBody.add(sp);
  }

  if (pose === 'side') {
    chairBody.rotation.z = Math.PI / 2;
    chairBody.position.set(seatH, 0.216, 0);
  } else if (pose === 'back') {
    chairBody.rotation.x = -Math.PI / 2 + 0.08;
    chairBody.position.set(0, 0.229, 0);
  }

  group.add(chairBody);
  tagInteractable(group, id);

  return {
    group,
    kind: 'chair',
    basePos: pos.clone(),
    baseRot: new THREE.Euler(0, rotY, 0),
    impulse: 0,
    impulseDirX: 0,
    impulseDirZ: 0,
    phase: 0,
  };
}

export interface DrawerSpec {
  itemId?: string;
}

function createDrawerLootProp(
  pickupId: string,
  itemId: string,
  mats: PropMaterialBank,
): THREE.Group {
  const group = new THREE.Group();

  if (itemId === 'item-ammo-32') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.044, 0.072), mats.leatherStrap);
    box.position.y = 0.022;
    group.add(box);

    const label = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.004, 0.052), mats.chartPaper);
    label.position.set(0, 0.045, 0);
    group.add(label);

    const brassStrip = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.012, 0.014), mats.tarnishedBrass);
    brassStrip.position.set(0, 0.028, 0.032);
    group.add(brassStrip);
  } else if (itemId === 'item-bandage') {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.115, 10), mats.stainedCanvas);
    roll.rotation.z = Math.PI / 2;
    roll.position.y = 0.036;
    group.add(roll);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.036, 10), mats.chartPaper);
    band.rotation.z = Math.PI / 2;
    band.position.y = 0.036;
    group.add(band);

    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.008, 0.024), mats.leatherStrap);
    cross.position.set(0, 0.072, 0);
    group.add(cross);
  } else if (itemId === 'item-laudanum') {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.11, 10), mats.amberBottle);
    bottle.rotation.x = Math.PI / 2;
    bottle.rotation.z = 0.28;
    bottle.position.set(0, 0.032, 0);
    group.add(bottle);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.032, 8), mats.amberBottle);
    neck.rotation.x = Math.PI / 2;
    neck.rotation.z = 0.28;
    neck.position.set(-0.018, 0.032, 0.062);
    group.add(neck);

    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.011, 0.018, 8), mats.weatheredWood);
    cork.rotation.x = Math.PI / 2;
    cork.rotation.z = 0.28;
    cork.position.set(-0.023, 0.032, 0.082);
    group.add(cork);

    const label = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.005, 0.056), mats.chartPaper);
    label.rotation.y = -0.28;
    label.position.set(0.004, 0.06, -0.005);
    group.add(label);
  } else if (itemId === 'item-battery') {
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.11, 10), mats.gunmetal);
    cell.rotation.z = Math.PI / 2;
    cell.position.y = 0.027;
    group.add(cell);

    for (const sx of [-0.055, 0.055]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.016, 10), mats.tarnishedBrass);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(sx, 0.027, 0);
      group.add(cap);
    }

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.018, 8), mats.tarnishedBrass);
    post.rotation.z = Math.PI / 2;
    post.position.set(0.07, 0.027, 0);
    group.add(post);
  } else if (itemId === 'item-relic-watch') {
    const caseBody = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.016, 12), mats.gunmetal);
    caseBody.position.y = 0.008;
    group.add(caseBody);

    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.004, 12), mats.chartPaper);
    face.position.y = 0.016;
    group.add(face);

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.018, 8), mats.tarnishedBrass);
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, 0.01, -0.044);
    group.add(crown);

    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0035, 6, 12), mats.tarnishedBrass);
    chain.rotation.x = Math.PI / 2;
    chain.position.set(0.032, 0.006, -0.055);
    group.add(chain);
  } else {
    // Saint Clara Medal or generic relic
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.008, 12), mats.tarnishedBrass);
    disc.position.y = 0.006;
    group.add(disc);

    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.004, 0.11), mats.leatherStrap);
    ribbon.position.set(0, 0.003, -0.04);
    ribbon.rotation.y = 0.25;
    group.add(ribbon);
  }

  // Keep layer 1 DISABLED until drawer opens (prevents raycasting through closed drawers)
  group.traverse((child) => {
    child.layers.disable(1);
    child.userData.interactionId = pickupId;
  });

  return group;
}

export function createDrawerChest(opts: {
  id: string;
  mats: PropMaterialBank;
  pos: THREE.Vector3;
  rotY: number;
  metallic?: boolean;
  drawersSpec: [DrawerSpec, DrawerSpec, DrawerSpec];
}): { group: THREE.Group; drawers: DrawerState[]; collider: AABBCollider } {
  const { id, mats, pos, rotY, metallic = false, drawersSpec } = opts;
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const w = 0.78;
  const h = 0.96;
  const d = 0.54;

  const bodyMat = metallic ? mats.gunmetal : mats.weatheredWood;
  const trimMat = metallic ? mats.rustedMetal : mats.darkTrim;
  const drawerFrontMat = metallic ? mats.morgueSteelDrawers : mats.doorWood;

  // Carcass top, base, sides, back
  const topSlab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.045, d + 0.04), trimMat);
  topSlab.position.set(0, h - 0.022, 0.01);
  topSlab.castShadow = true;
  topSlab.receiveShadow = true;
  group.add(topSlab);

  const bottomSlab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.075, d), trimMat);
  bottomSlab.position.set(0, 0.038, 0);
  bottomSlab.receiveShadow = true;
  group.add(bottomSlab);

  const sideGeo = new THREE.BoxGeometry(0.04, h - 0.08, d);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(sideGeo, bodyMat);
    side.position.set(sx * (w * 0.5 - 0.02), h * 0.5 - 0.01, 0);
    side.castShadow = true;
    side.receiveShadow = true;
    group.add(side);
  }

  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, h - 0.08, 0.035), bodyMat);
  backPanel.position.set(0, h * 0.5 - 0.01, -d * 0.5 + 0.018);
  backPanel.receiveShadow = true;
  group.add(backPanel);

  // Horizontal bay dividers
  const dividerGeo = new THREE.BoxGeometry(w - 0.07, 0.024, d - 0.05);
  for (const dy of [0.34, 0.63]) {
    const div = new THREE.Mesh(dividerGeo, trimMat);
    div.position.set(0, dy, 0);
    group.add(div);
  }

  const drawerCentersY = [0.21, 0.485, 0.775];
  const drawers: DrawerState[] = [];

  for (let i = 0; i < 3; i++) {
    const drawerId = `${id}-d${i}`;
    const slideGroup = new THREE.Group();
    slideGroup.position.set(0, drawerCentersY[i], 0);
    group.add(slideGroup);

    const dw = w - 0.1;
    const dh = 0.22;
    const dd = d - 0.08;

    // Front face (+Z side)
    const front = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.032), drawerFrontMat);
    front.position.set(0, 0, d * 0.5 - 0.012);
    front.castShadow = true;
    front.receiveShadow = true;
    slideGroup.add(front);

    // Brass cup/bar handle on front
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.034, 0.012), mats.tarnishedBrass);
    plate.position.set(0, 0.008, d * 0.5 + 0.008);
    slideGroup.add(plate);

    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.024), mats.tarnishedBrass);
    pull.position.set(0, 0.008, d * 0.5 + 0.02);
    slideGroup.add(pull);

    // Drawer cavity box (bottom, left, right, back) so opening reveals an interior tray
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.02, 0.018, dd), bodyMat);
    bottom.position.set(0, -dh * 0.5 + 0.014, 0.01);
    slideGroup.add(bottom);

    const sideWallGeo = new THREE.BoxGeometry(0.018, dh - 0.04, dd);
    for (const sx of [-1, 1]) {
      const sw = new THREE.Mesh(sideWallGeo, bodyMat);
      sw.position.set(sx * (dw * 0.5 - 0.018), -0.012, 0.01);
      slideGroup.add(sw);
    }

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.04, dh - 0.04, 0.018), bodyMat);
    backWall.position.set(0, -0.012, -dd * 0.5 + 0.018);
    slideGroup.add(backWall);

    tagInteractable(slideGroup, `drawer:${drawerId}`);

    const spec = drawersSpec[i];
    let pickupGroup: THREE.Group | undefined;
    let pickupId: string | undefined;

    if (spec?.itemId) {
      pickupId = `pickup:${drawerId}`;
      pickupGroup = createDrawerLootProp(pickupId, spec.itemId, mats);
      pickupGroup.position.set((i % 2 === 0 ? 1 : -1) * 0.06, -dh * 0.5 + 0.024, 0.06);
      pickupGroup.rotation.y = (i - 1) * 0.35;
      slideGroup.add(pickupGroup);
    }

    drawers.push({
      id: drawerId,
      group,
      slideGroup,
      isOpen: false,
      openFrac: 0,
      slideDist: 0.34,
      metallic,
      pickupId,
      pickupItemId: spec?.itemId,
      pickupGroup,
      pickupCollected: !spec?.itemId,
    });
  }

  // Exact world AABB from rotated footprint
  const cos = Math.abs(Math.cos(rotY));
  const sin = Math.abs(Math.sin(rotY));
  const halfX = (w * 0.5) * cos + (d * 0.5) * sin + 0.04;
  const halfZ = (w * 0.5) * sin + (d * 0.5) * cos + 0.04;

  return {
    group,
    drawers,
    collider: {
      minX: pos.x - halfX,
      maxX: pos.x + halfX,
      minZ: pos.z - halfZ,
      maxZ: pos.z + halfZ,
    },
  };
}

export function createHideCabinet(opts: {
  id: string;
  label: string;
  mats: PropMaterialBank;
  pos: THREE.Vector3;
  rotY: number;
  metallic?: boolean;
}): { cabinet: HideCabinetState; collider: AABBCollider } {
  const { id, label, mats, pos, rotY, metallic = false } = opts;
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const w = 0.98;
  const h = 2.18;
  const d = 0.74;
  const wallT = 0.045;

  const shellMat = metallic ? mats.gunmetal : mats.doorWood;
  const trimMat = metallic ? mats.rustedMetal : mats.darkTrim;
  const interiorMat = metallic ? mats.sealedBacking : mats.darkTrim;

  // Hollow enclosure walls (DoubleSide / visible from inside & outside)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallT), shellMat);
  backWall.position.set(0, h * 0.5, -d * 0.5 + wallT * 0.5);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  for (const sx of [-1, 1]) {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, d), shellMat);
    sideWall.position.set(sx * (w * 0.5 - wallT * 0.5), h * 0.5, 0);
    sideWall.castShadow = true;
    sideWall.receiveShadow = true;
    group.add(sideWall);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.07, d + 0.04), trimMat);
  roof.position.set(0, h - 0.035, 0.01);
  roof.castShadow = true;
  group.add(roof);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, 0.06, d - 0.02), interiorMat);
  floor.position.set(0, 0.03, 0);
  floor.receiveShadow = true;
  group.add(floor);

  // Interior coat rod & hook rail near top
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, w - 0.14, 8), mats.rustedMetal);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, 1.94, -0.08);
  group.add(rod);

  // Hinged front door with ventilation slats at eye height (y = 1.44..1.72)
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-w * 0.5 + wallT, 0.06, d * 0.5 - 0.022);
  group.add(doorPivot);

  const doorW = w - wallT * 2;
  const doorH = h - 0.13;
  const doorD = 0.042;
  const cx = doorW * 0.5;

  // Lower solid door leaf (y: 0 -> 1.36)
  const lowerPanel = new THREE.Mesh(new THREE.BoxGeometry(doorW, 1.36, doorD), shellMat);
  lowerPanel.position.set(cx, 0.68, 0);
  lowerPanel.castShadow = true;
  lowerPanel.receiveShadow = true;
  doorPivot.add(lowerPanel);

  // Upper solid header (y: 1.66 -> doorH)
  const upperH = doorH - 1.66;
  const upperPanel = new THREE.Mesh(new THREE.BoxGeometry(doorW, upperH, doorD), shellMat);
  upperPanel.position.set(cx, 1.66 + upperH * 0.5, 0);
  upperPanel.castShadow = true;
  doorPivot.add(upperPanel);

  // Left & right vertical stiles flanking the louver window (y: 1.36 -> 1.66)
  for (const sx of [0.06, doorW - 0.06]) {
    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, doorD), trimMat);
    stile.position.set(sx, 1.51, 0);
    doorPivot.add(stile);
  }

  // Horizontal louvered ventilation slats inside the window (real gaps to peer out!)
  const slatW = doorW - 0.24;
  for (let i = 0; i < 4; i++) {
    const sy = 1.39 + i * 0.068;
    const slat = new THREE.Mesh(new THREE.BoxGeometry(slatW, 0.016, 0.044), trimMat);
    slat.position.set(cx, sy, 0);
    slat.rotation.x = 0.28;
    doorPivot.add(slat);
  }

  // Brass hinges & latch handle (both outside and inside handle)
  for (const hy of [0.28, 1.02, 1.78]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.08, 6), mats.rustedMetal);
    hinge.position.set(0.008, hy, doorD * 0.55);
    doorPivot.add(hinge);
  }

  for (const fz of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.14, 0.028), mats.tarnishedBrass);
    handle.position.set(doorW - 0.09, 0.96, fz * (doorD * 0.5 + 0.016));
    doorPivot.add(handle);
  }

  tagInteractable(group, `cabinet:${id}`);

  const rotAxis = new THREE.Vector3(0, 1, 0);
  const insidePos = new THREE.Vector3(0, 0, -0.05).applyAxisAngle(rotAxis, rotY).add(pos);
  const exitPos = new THREE.Vector3(0, 0, d * 0.5 + 0.62).applyAxisAngle(rotAxis, rotY).add(pos);
  const outwardYaw = rotY + Math.PI;

  const cos = Math.abs(Math.cos(rotY));
  const sin = Math.abs(Math.sin(rotY));
  const halfX = (w * 0.5) * cos + (d * 0.5) * sin + 0.04;
  const halfZ = (w * 0.5) * sin + (d * 0.5) * cos + 0.04;

  return {
    cabinet: {
      id,
      label,
      group,
      doorPivot,
      doorAngle: 0,
      targetDoorAngle: 0,
      insidePos,
      exitPos,
      outwardYaw,
      metallic,
    },
    collider: {
      minX: pos.x - halfX,
      maxX: pos.x + halfX,
      minZ: pos.z - halfZ,
      maxZ: pos.z + halfZ,
    },
  };
}
