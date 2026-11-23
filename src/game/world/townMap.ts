import * as THREE from 'three';
import { createPs2Lambert, PropMaterialBank } from '../materials';
import {
  createChair,
  createDrawerChest,
  createHideCabinet,
  createInspectableDocProp,
  createKeyPickupProp,
  createMedicalCart,
  createSingleDoor,
} from '../props';
import { BlackwoodTextureBank } from '../textures';
import {
  AABBCollider,
  CapsuleCollider,
  DoorState,
  DrawerState,
  HideCabinetState,
  NudgeProp,
} from '../types';
import {
  buildTownBuilding,
  createBurnBarrel,
  createDebrisCluster,
  createFurnitureCounter,
  createGasPump,
  createJerseyBarrier,
  createNoticeBoard,
  createParkBench,
  createParkedVehicle,
  createServiceBellProp,
  createStreetLamp,
  createTownFountain,
  createUtilityPole,
} from './townStructures';

export interface TownMapBuildResult {
  group: THREE.Group;
  doors: DoorState[];
  drawers: DrawerState[];
  hideCabinets: HideCabinetState[];
  nudgeProps: NudgeProp[];
  colliders: AABBCollider[];
  capsuleColliders: CapsuleCollider[];
  keyPickups: Record<string, THREE.Group>;
  dynamicLights: THREE.PointLight[];
  nightParticles: THREE.Points;
  nightParticleMat: THREE.PointsMaterial;
  nightParticleBase: Float32Array;
  ringBell: () => void;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  updateSky: (elapsed: number) => void;
}

function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 1831565813;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTownMap(
  mats: PropMaterialBank,
  textures: BlackwoodTextureBank,
): TownMapBuildResult {
  const group = new THREE.Group();
  const doors: DoorState[] = [];
  const drawers: DrawerState[] = [];
  const hideCabinets: HideCabinetState[] = [];
  const nudgeProps: NudgeProp[] = [];
  const colliders: AABBCollider[] = [];
  const capsuleColliders: CapsuleCollider[] = [];
  const keyPickups: Record<string, THREE.Group> = {};
  const dynamicLights: THREE.PointLight[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // ==================== 1. UNDULATING VALLEY TERRAIN & SKY ====================
  const groundMat = createPs2Lambert({ map: textures.dampGround, color: 0x7e8c77 }, materials);
  const terrainGeo = trackGeo(new THREE.PlaneGeometry(260, 260, 72, 72));
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const dx = Math.max(0, Math.abs(vx) - 56);
    const dz = Math.max(0, Math.abs(vz) - 62);
    const edgeDist = Math.hypot(dx, dz);
    if (edgeDist > 0.1) {
      const hill =
        Math.min(18, Math.pow(edgeDist / 26, 1.45) * 7.2) +
        Math.sin(vx * 0.09) * Math.cos(vz * 0.08) * Math.min(2.6, edgeDist * 0.07);
      posAttr.setY(i, hill - 0.025);
    } else {
      posAttr.setY(i, -0.025);
    }
  }
  terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeo, groundMat);
  terrain.receiveShadow = true;
  group.add(terrain);

  // Post-apocalyptic dusk/ash-moonlit sky dome
  const skyMat = trackMat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x131e28) },
        uHorizon: { value: new THREE.Color(0x2d3c42) },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform float uTime;
        void main() {
          float h = clamp(vDir.y * 0.9 + 0.08, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.72, h));
          float cloud = sin(vDir.x * 5.2 + uTime * 0.02) * cos(vDir.z * 4.4 - uTime * 0.015);
          col *= 0.86 + 0.14 * cloud;
          float starCell = fract(sin(dot(floor(vDir * 140.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float star = step(0.994, starCell) * smoothstep(0.18, 0.55, vDir.y);
          col += vec3(0.55, 0.65, 0.78) * star * 0.65;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  const skyDome = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(148, 24, 16)), skyMat);
  skyDome.frustumCulled = false;
  skyDome.raycast = () => {};
  group.add(skyDome);

  // Night drizzle / floating fog motes over town
  const particleCount = 620;
  const particlePositions = new Float32Array(particleCount * 3);
  const nightParticleBase = new Float32Array(particleCount * 3);
  const rng = createSeededRng(202611);
  for (let i = 0; i < particleCount; i++) {
    const px = (rng() - 0.5) * 116;
    const py = 0.4 + rng() * 6.5;
    const pz = (rng() - 0.5) * 124;
    particlePositions[i * 3] = px;
    particlePositions[i * 3 + 1] = py;
    particlePositions[i * 3 + 2] = pz;
    nightParticleBase[i * 3] = px;
    nightParticleBase[i * 3 + 1] = py;
    nightParticleBase[i * 3 + 2] = pz;
  }
  const particleGeo = trackGeo(new THREE.BufferGeometry());
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const nightParticleMat = trackMat(
    new THREE.PointsMaterial({
      map: textures.dustSprite,
      color: 0xc2d0d4,
      size: 0.14,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const nightParticles = new THREE.Points(particleGeo, nightParticleMat);
  nightParticles.raycast = () => {};
  group.add(nightParticles);

  // ==================== 2. ROAD NETWORK & SIDEWALKS ====================
  // Avenida Central (N-S, x in [-4.5, 4.5], z in [-62, 58])
  const mainAve = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(9.0, 120)), mats.townRoad);
  mainAve.rotation.x = -Math.PI / 2;
  mainAve.position.set(0, 0.008, -2);
  mainAve.receiveShadow = true;
  group.add(mainAve);

  // Rua do Comércio (E-W, z in [-4.5, 4.5], x in [-56, 56])
  const comSt = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(9.0, 112)), mats.townRoad);
  comSt.rotation.x = -Math.PI / 2;
  comSt.rotation.z = Math.PI / 2;
  comSt.position.set(0, 0.011, 0);
  comSt.receiveShadow = true;
  group.add(comSt);

  // Rua da Colina (E-W upper road, z in [-40.5, -32.5], x in [-50, 50])
  const hillSt = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(8.0, 100)), mats.townRoad);
  hillSt.rotation.x = -Math.PI / 2;
  hillSt.rotation.z = Math.PI / 2;
  hillSt.position.set(0, 0.011, -36.5);
  hillSt.receiveShadow = true;
  group.add(hillSt);

  // Raised concrete sidewalks
  const addSidewalk = (cx: number, cz: number, w: number, d: number) => {
    const m = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.055, d)), mats.townSidewalk);
    m.position.set(cx, 0.018, cz);
    m.receiveShadow = true;
    group.add(m);
  };
  // Avenida Central sidewalks broken cleanly at intersections
  for (const sx of [-5.65, 5.65]) {
    addSidewalk(sx, 27.5, 2.3, 41.0); // z: 7 -> 48
    addSidewalk(sx, -19.0, 2.3, 24.4); // z: -31.2 -> -6.8
    addSidewalk(sx, -50.5, 2.3, 18.0); // z: -59.5 -> -41.5
  }
  // Rua do Comércio sidewalks
  for (const sz of [-5.65, 5.65]) {
    addSidewalk(-31.0, sz, 48.0, 2.3);
    addSidewalk(31.0, sz, 48.0, 2.3);
  }
  // Rua da Colina sidewalks
  for (const sz of [-41.6, -31.4]) {
    addSidewalk(-27.5, sz, 41.0, 2.2);
    addSidewalk(27.5, sz, 41.0, 2.2);
  }

  // Crosswalk stripes at main intersection
  const stripeGeo = trackGeo(new THREE.PlaneGeometry(0.55, 2.2));
  for (let i = -3; i <= 3; i++) {
    for (const sz of [-5.0, 5.0]) {
      const s = new THREE.Mesh(stripeGeo, mats.townSidewalk);
      s.rotation.x = -Math.PI / 2;
      s.position.set(i * 1.15, 0.016, sz);
      group.add(s);
    }
    for (const sx of [-5.0, 5.0]) {
      const s = new THREE.Mesh(stripeGeo, mats.townSidewalk);
      s.rotation.x = -Math.PI / 2;
      s.rotation.z = Math.PI / 2;
      s.position.set(sx, 0.016, i * 1.15);
      group.add(s);
    }
  }

  // Town Welcome Monument near South Highway Approach (-6.4, 0, 44.5)
  const welcomeMat = createPs2Lambert({ map: textures.townWelcomeSign }, materials);
  const welcomeGrp = new THREE.Group();
  welcomeGrp.position.set(-6.6, 0, 44.5);
  welcomeGrp.rotation.y = 0.28;
  for (const px of [-1.45, 1.45]) {
    const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 2.7, 0.24)), mats.weatheredWood);
    post.position.set(px, 1.35, 0);
    post.castShadow = true;
    welcomeGrp.add(post);
  }
  const boardBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 1.56, 0.14)), mats.darkTrim);
  boardBack.position.set(0, 1.78, 0);
  welcomeGrp.add(boardBack);
  const boardFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.96, 1.38)), welcomeMat);
  boardFace.position.set(0, 1.78, 0.08);
  welcomeGrp.add(boardFace);
  group.add(welcomeGrp);
  colliders.push({ minX: -8.3, maxX: -4.9, minZ: 43.9, maxZ: 45.1 });

  // Road Exit Barricades (North & South highway washouts, East & West forest barricades)
  const makeRoadBarricade = (x: number, z: number, rotY: number) => {
    const bGrp = new THREE.Group();
    bGrp.position.set(x, 0, z);
    bGrp.rotation.y = rotY;
    for (const bx of [-3.4, 0, 3.4]) {
      for (const legX of [-1.2, 1.2]) {
        const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 1.1, 0.14)), mats.weatheredWood);
        leg.position.set(bx + legX, 0.55, 0);
        leg.castShadow = true;
        bGrp.add(leg);
      }
      const rail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.1, 0.24, 0.09)), mats.carRust);
      rail.position.set(bx, 0.88, 0);
      bGrp.add(rail);
    }
    group.add(bGrp);
  };
  makeRoadBarricade(0, 56.5, 0);
  makeRoadBarricade(0, -61.8, 0);
  makeRoadBarricade(-54.5, 0, Math.PI / 2);
  makeRoadBarricade(54.5, 0, Math.PI / 2);

  // ==================== 3. PRAÇA CENTRAL (SE CORNER) ====================
  const plazaDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.0, 0.06, 18.0)), mats.townSidewalk);
  plazaDeck.position.set(17.5, 0.018, 17.5);
  plazaDeck.receiveShadow = true;
  group.add(plazaDeck);

  const fountain = createTownFountain(mats, new THREE.Vector3(17.5, 0.045, 17.5), trackGeo);
  group.add(fountain.group);
  capsuleColliders.push(fountain.collider);

  const benchSpecs: [number, number, number][] = [
    [17.5, 13.4, 0],
    [17.5, 21.6, Math.PI],
    [13.4, 17.5, Math.PI / 2],
    [21.6, 17.5, -Math.PI / 2],
  ];
  for (const [bx, bz, br] of benchSpecs) {
    const bench = createParkBench(mats, new THREE.Vector3(bx, 0.045, bz), br, trackGeo);
    group.add(bench.group);
    colliders.push(bench.collider);
  }

  // Municipal Notice Board with Evacuation Document
  const noticeBoard = createNoticeBoard('doc-town-evacuation', mats, new THREE.Vector3(10.4, 0.045, 10.6), 0.78, trackGeo);
  group.add(noticeBoard.group);
  colliders.push(noticeBoard.collider);

  // ==================== 4. EIGHT ENTERABLE BUILDINGS ====================
  const registerBuilding = (built: { group: THREE.Group; doors: DoorState[]; colliders: AABBCollider[] }) => {
    group.add(built.group);
    doors.push(...built.doors);
    colliders.push(...built.colliders);
  };

  const addInteriorLamp = (x: number, y: number, z: number, colorHex: number, intensity = 11.5, flickers = false) => {
    const bulbMat = createPs2Lambert(
      { color: 0xffe4bd, emissive: colorHex, emissiveIntensity: 1.45 },
      materials,
    );
    const fixture = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 0.08, 8)), bulbMat);
    fixture.position.set(x, y, z);
    group.add(fixture);

    const pt = new THREE.PointLight(colorHex, intensity, 20, 1.05);
    pt.position.set(x, y - 0.22, z);
    pt.userData = {
      baseIntensity: intensity,
      flickerSeed: Math.abs(x * 2.1 + z * 1.4),
      flickerMode: flickers ? 'occasional' : 'steady',
      bulbMat,
      bulbBaseEmissive: 1.45,
    };
    group.add(pt);
    dynamicLights.push(pt);
  };

  // --- 4A. POSTO VALE & OFICINA (SW) ---
  const signPostoMat = createPs2Lambert({ map: textures.signPosto }, materials);
  registerBuilding(
    buildTownBuilding({
      x: -18.5,
      z: 23.5,
      width: 11.0,
      depth: 11.0,
      wallHeight: 3.8,
      wallMat: mats.townBrick,
      floorMat: mats.townSidewalk,
      ceilingMat: mats.plasterWall,
      roofMat: mats.townCorrugated,
      roofStyle: 'flat',
      trimMat: mats.darkTrim,
      windowMat: mats.warmWindowGlow,
      signMat: signPostoMat,
      signWall: 'east',
      doors: [{ id: 'door-posto', wall: 'east', offset: 0, swingSign: 1 }],
      windows: [
        { wall: 'east', offset: -2.8, w: 1.7, h: 1.45 },
        { wall: 'east', offset: 2.8, w: 1.7, h: 1.45, boarded: true },
        { wall: 'north', offset: -1.8, w: 1.6, h: 1.3, boarded: true },
      ],
      mats,
      trackGeo,
    }),
  );
  // Fuel island apron + canopy extending east toward Avenida Central
  const postoApron = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.2, 0.05, 11.4)), mats.townSidewalk);
  postoApron.position.set(-10.0, 0.015, 23.5);
  postoApron.receiveShadow = true;
  group.add(postoApron);

  const canopyRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.6, 0.26, 9.6)), mats.townCorrugated);
  canopyRoof.position.set(-10.2, 3.58, 23.5);
  canopyRoof.castShadow = true;
  group.add(canopyRoof);

  for (const pz of [19.4, 27.6]) {
    const pillar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 3.55, 0.28)), mats.rustedMetal);
    pillar.position.set(-8.0, 1.775, pz);
    pillar.castShadow = true;
    group.add(pillar);
    colliders.push({ minX: -8.22, maxX: -7.78, minZ: pz - 0.22, maxZ: pz + 0.22 });
  }
  for (const gz of [21.6, 25.4]) {
    const pump = createGasPump(mats, new THREE.Vector3(-9.4, 0.04, gz), Math.PI / 2, trackGeo);
    group.add(pump.group);
    colliders.push(pump.collider);
  }
  addInteriorLamp(-18.2, 3.66, 23.5, 0xffd295, 11.5, true);
  addInteriorLamp(-9.6, 3.38, 23.5, 0xffd8a0, 14.0, true);

  const postoCounter = createFurnitureCounter(mats, new THREE.Vector3(-21.8, 0.04, 23.5), 1.2, 3.8, 0.96, trackGeo);
  group.add(postoCounter.group);
  colliders.push(postoCounter.collider);

  const docGas = createInspectableDocProp('doc-gas-station', mats, new THREE.Vector3(-21.6, 1.0, 22.8), 0.22);
  group.add(docGas);

  const keyMercado = createKeyPickupProp('key-mercado', mats, new THREE.Vector3(-21.6, 1.0, 24.3), -0.3, 'brass');
  group.add(keyMercado);
  keyPickups['key-mercado'] = keyMercado;

  const chestPosto = createDrawerChest({
    id: 'chest-posto',
    mats,
    pos: new THREE.Vector3(-16.5, 0.04, 18.6),
    rotY: 0,
    drawersSpec: [{ itemId: 'item-battery' }, { itemId: 'item-ammo-32' }, { itemId: 'item-bandage' }],
  });
  group.add(chestPosto.group);
  drawers.push(...chestPosto.drawers);
  colliders.push(chestPosto.collider);

  const cabPosto = createHideCabinet({
    id: 'cab-posto',
    label: 'Armário do Posto',
    mats,
    pos: new THREE.Vector3(-23.0, 0.04, 27.6),
    rotY: Math.PI / 2,
    metallic: true,
  });
  group.add(cabPosto.cabinet.group);
  hideCabinets.push(cabPosto.cabinet);
  colliders.push(cabPosto.collider);

  // --- 4B. LANCHONETE ESTRELA DA ESTRADA (SE) ---
  const signDinerMat = createPs2Lambert({ map: textures.signDiner }, materials);
  registerBuilding(
    buildTownBuilding({
      x: 16.0,
      z: 37.5,
      width: 12.0,
      depth: 11.0,
      wallHeight: 3.7,
      wallMat: mats.townClapboardRust,
      floorMat: mats.wardTileFloor,
      ceilingMat: mats.plasterWall,
      roofMat: mats.slateRoof,
      roofStyle: 'flat',
      trimMat: mats.darkTrim,
      windowMat: mats.warmWindowGlow,
      signMat: signDinerMat,
      signWall: 'west',
      doors: [{ id: 'door-diner', wall: 'west', offset: 0, swingSign: 1 }],
      windows: [
        { wall: 'west', offset: -2.8, w: 1.9, h: 1.45, boarded: true },
        { wall: 'west', offset: 2.8, w: 1.9, h: 1.45 },
        { wall: 'north', offset: -2.0, w: 1.7, h: 1.35 },
      ],
      mats,
      trackGeo,
    }),
  );
  addInteriorLamp(15.5, 3.55, 37.5, 0xffcf88, 12.0, true);

  const dinerCounter = createFurnitureCounter(mats, new THREE.Vector3(18.6, 0.04, 37.5), 1.1, 5.2, 0.96, trackGeo);
  group.add(dinerCounter.group);
  colliders.push(dinerCounter.collider);

  const serviceBell = createServiceBellProp(mats, new THREE.Vector3(18.25, 1.0, 36.4), trackGeo);
  group.add(serviceBell.group);

  const docDiner = createInspectableDocProp('doc-diner-log', mats, new THREE.Vector3(18.3, 1.0, 38.2), -0.18);
  group.add(docDiner);

  for (const tz of [35.2, 39.8]) {
    const tbl = createFurnitureCounter(mats, new THREE.Vector3(14.0, 0.04, tz), 1.3, 1.1, 0.8, trackGeo);
    group.add(tbl.group);
    colliders.push(tbl.collider);
  }
  const c1 = createChair('chair-diner-1', mats, new THREE.Vector3(12.9, 0.04, 35.2), Math.PI / 2, 'upright');
  const c2 = createChair('chair-diner-2', mats, new THREE.Vector3(15.1, 0.04, 35.2), -Math.PI / 2, 'side');
  const c3 = createChair('chair-diner-3', mats, new THREE.Vector3(12.9, 0.04, 39.8), Math.PI / 2, 'upright');
  const c4 = createChair('chair-diner-4', mats, new THREE.Vector3(15.1, 0.04, 39.8), -Math.PI / 2, 'back');
  group.add(c1.group, c2.group, c3.group, c4.group);
  nudgeProps.push(c1, c2, c3, c4);

  const chestDiner = createDrawerChest({
    id: 'chest-diner',
    mats,
    pos: new THREE.Vector3(20.6, 0.04, 32.7),
    rotY: 0,
    drawersSpec: [{ itemId: 'item-bandage' }, { itemId: 'item-laudanum' }, { itemId: 'item-ammo-32' }],
  });
  group.add(chestDiner.group);
  drawers.push(...chestDiner.drawers);
  colliders.push(chestDiner.collider);

  const cabDiner = createHideCabinet({
    id: 'cab-diner',
    label: 'Armário da Cozinha',
    mats,
    pos: new THREE.Vector3(21.1, 0.04, 41.8),
    rotY: -Math.PI / 2,
    metallic: false,
  });
  group.add(cabDiner.cabinet.group);
  hideCabinets.push(cabDiner.cabinet);
  colliders.push(cabDiner.collider);

  // --- 4C. DELEGACIA MUNICIPAL (NW) ---
  const signDelegaciaMat = createPs2Lambert({ map: textures.signDelegacia }, materials);
  registerBuilding(
    buildTownBuilding({
      x: -18.0,
      z: -17.5,
      width: 16.0,
      depth: 15.0,
      wallHeight: 4.0,
      wallMat: mats.townBrick,
      floorMat: mats.townSidewalk,
      ceilingMat: mats.plasterWall,
      roofMat: mats.slateRoof,
      roofStyle: 'flat',
      trimMat: mats.darkTrim,
      windowMat: mats.warmWindowGlow,
      signMat: signDelegaciaMat,
      signWall: 'south',
      doors: [{ id: 'door-delegacia', wall: 'south', offset: 3.0, swingSign: 1 }],
      windows: [
        { wall: 'south', offset: -3.2, w: 1.7, h: 1.45 },
        { wall: 'south', offset: 5.5, w: 1.5, h: 1.45 },
        { wall: 'east', offset: -2.6, w: 1.6, h: 1.45 },
        { wall: 'east', offset: 2.6, w: 1.6, h: 1.45 },
      ],
      mats,
      trackGeo,
    }),
  );
  // Partition wall dividing Reception & Armory at x = -19.0
  const partWallN = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 4.0, 6.9)), mats.plasterWall);
  partWallN.position.set(-19.0, 2.0, -21.55);
  partWallN.castShadow = true;
  group.add(partWallN);
  colliders.push({ minX: -19.14, maxX: -18.86, minZ: -25.0, maxZ: -18.02 });

  const partWallS = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 4.0, 6.9)), mats.plasterWall);
  partWallS.position.set(-19.0, 2.0, -13.45);
  partWallS.castShadow = true;
  group.add(partWallS);
  colliders.push({ minX: -19.14, maxX: -18.86, minZ: -16.98, maxZ: -10.0 });

  const partLintel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 1.34, 1.08)), mats.plasterWall);
  partLintel.position.set(-19.0, 3.33, -17.5);
  group.add(partLintel);

  const armoryDoor = createSingleDoor(
    'door-delegacia-armory',
    mats,
    0,
    1,
    new THREE.Vector3(-19.0, 0, -17.5),
    Math.PI / 2,
  );
  armoryDoor.locked = true;
  armoryDoor.requiredKeyId = 'key-delegacia';
  armoryDoor.requiredKeyName = 'Chave do Arsenal da Delegacia';
  group.add(armoryDoor.group);
  doors.push(armoryDoor);

  addInteriorLamp(-14.5, 3.85, -16.5, 0xcfdff2, 12.5, false);
  addInteriorLamp(-22.5, 3.85, -17.5, 0xffd59c, 11.0, true);

  const sheriffDesk = createFurnitureCounter(mats, new THREE.Vector3(-13.2, 0.04, -14.8), 1.4, 2.6, 0.86, trackGeo);
  group.add(sheriffDesk.group);
  colliders.push(sheriffDesk.collider);
  group.add(createInspectableDocProp('doc-sheriff-report', mats, new THREE.Vector3(-13.2, 0.9, -14.8), 0.14));

  // Holding cell bar partition at z = -20.5 inside Lobby
  for (let bx = -18.4; bx <= -14.0; bx += 0.28) {
    const bar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 3.8, 6)), mats.gunmetal);
    bar.position.set(bx, 1.9, -20.5);
    group.add(bar);
  }
  colliders.push({ minX: -18.7, maxX: -13.8, minZ: -20.66, maxZ: -20.34 });

  const chestDelA = createDrawerChest({
    id: 'chest-delegacia-a',
    mats,
    pos: new THREE.Vector3(-15.5, 0.04, -24.2),
    rotY: 0,
    drawersSpec: [{ itemId: 'item-ammo-32' }, {}, { itemId: 'item-battery' }],
  });
  group.add(chestDelA.group);
  drawers.push(...chestDelA.drawers);
  colliders.push(chestDelA.collider);

  const cabDelegacia = createHideCabinet({
    id: 'cab-delegacia',
    label: 'Armário da Delegacia',
    mats,
    pos: new THREE.Vector3(-10.8, 0.04, -23.6),
    rotY: -Math.PI / 2,
    metallic: true,
  });
  group.add(cabDelegacia.cabinet.group);
  hideCabinets.push(cabDelegacia.cabinet);
  colliders.push(cabDelegacia.collider);

  // Inside Locked Arsenal
  const evidenceDesk = createFurnitureCounter(mats, new THREE.Vector3(-24.2, 0.04, -17.5), 1.2, 3.0, 0.86, trackGeo);
  group.add(evidenceDesk.group);
  colliders.push(evidenceDesk.collider);
  group.add(createInspectableDocProp('doc-sheriff-evidence', mats, new THREE.Vector3(-24.1, 0.9, -18.2), 0.3));
  const keyIgreja = createKeyPickupProp('key-igreja', mats, new THREE.Vector3(-24.1, 0.9, -16.8), 0.25, 'iron');
  group.add(keyIgreja);
  keyPickups['key-igreja'] = keyIgreja;

  const chestDelB = createDrawerChest({
    id: 'chest-delegacia-b',
    mats,
    pos: new THREE.Vector3(-22.5, 0.04, -24.1),
    rotY: 0,
    metallic: true,
    drawersSpec: [{ itemId: 'item-ammo-32' }, { itemId: 'item-relic-watch' }, { itemId: 'item-ammo-32' }],
  });
  group.add(chestDelB.group);
  drawers.push(...chestDelB.drawers);
  colliders.push(chestDelB.collider);

  // --- 4D. MERCADO & FARMÁCIA SÃO JORGE (NE) ---
  const signMercadoMat = createPs2Lambert({ map: textures.signMercado }, materials);
  registerBuilding(
    buildTownBuilding({
      x: 18.0,
      z: -17.5,
      width: 16.0,
      depth: 15.0,
      wallHeight: 4.0,
      wallMat: mats.townClapboardCream,
      floorMat: mats.wardTileFloor,
      ceilingMat: mats.plasterWall,
      roofMat: mats.slateRoof,
      roofStyle: 'flat',
      trimMat: mats.darkTrim,
      windowMat: mats.warmWindowGlow,
      signMat: signMercadoMat,
      signWall: 'south',
      doors: [
        {
          id: 'door-mercado',
          wall: 'south',
          offset: -2.0,
          swingSign: 1,
          locked: true,
          requiredKeyId: 'key-mercado',
          requiredKeyName: 'Chave do Mercado São Jorge',
        },
      ],
      windows: [
        { wall: 'south', offset: 2.8, w: 2.2, h: 1.55, boarded: true },
        { wall: 'west', offset: -2.4, w: 1.7, h: 1.45 },
        { wall: 'west', offset: 2.4, w: 1.7, h: 1.45, boarded: true },
      ],
      mats,
      trackGeo,
    }),
  );
  addInteriorLamp(18.0, 3.85, -17.5, 0xffe2ae, 12.5, true);

  // Market grocery aisles
  for (const ax of [13.5, 17.8]) {
    const shelf = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 2.05, 5.2)), mats.weatheredWood);
    shelf.position.set(ax, 1.05, -17.5);
    shelf.castShadow = true;
    group.add(shelf);
    colliders.push({ minX: ax - 0.58, maxX: ax + 0.58, minZ: -20.15, maxZ: -14.85 });
  }
  const pharmCounter = createFurnitureCounter(mats, new THREE.Vector3(23.0, 0.04, -20.5), 1.2, 4.4, 0.94, trackGeo);
  group.add(pharmCounter.group);
  colliders.push(pharmCounter.collider);
  group.add(createInspectableDocProp('doc-pharmacy-note', mats, new THREE.Vector3(22.8, 0.98, -19.5), -0.25));
  const keyDelegacia = createKeyPickupProp('key-delegacia', mats, new THREE.Vector3(22.8, 0.98, -21.2), 0.15, 'brass');
  group.add(keyDelegacia);
  keyPickups['key-delegacia'] = keyDelegacia;

  const pharmCart = createMedicalCart('cart-mercado', mats, new THREE.Vector3(21.2, 0.04, -14.2), 0.45);
  group.add(pharmCart.group);
  nudgeProps.push(pharmCart);

  const chestMercA = createDrawerChest({
    id: 'chest-mercado-a',
    mats,
    pos: new THREE.Vector3(24.9, 0.04, -13.0),
    rotY: -Math.PI / 2,
    drawersSpec: [{ itemId: 'item-bandage' }, { itemId: 'item-laudanum' }, { itemId: 'item-battery' }],
  });
  group.add(chestMercA.group);
  drawers.push(...chestMercA.drawers);
  colliders.push(chestMercA.collider);

  const chestMercB = createDrawerChest({
    id: 'chest-mercado-b',
    mats,
    pos: new THREE.Vector3(15.5, 0.04, -24.1),
    rotY: 0,
    drawersSpec: [{ itemId: 'item-ammo-32' }, { itemId: 'item-bandage' }, { itemId: 'item-laudanum' }],
  });
  group.add(chestMercB.group);
  drawers.push(...chestMercB.drawers);
  colliders.push(chestMercB.collider);

  const cabMercado = createHideCabinet({
    id: 'cab-mercado',
    label: 'Armário da Farmácia',
    mats,
    pos: new THREE.Vector3(11.0, 0.04, -24.0),
    rotY: 0,
    metallic: false,
  });
  group.add(cabMercado.cabinet.group);
  hideCabinets.push(cabMercado.cabinet);
  colliders.push(cabMercado.collider);

  // --- 4E. ARMAZÉM & SERRARIA OESTE (W) ---
  const signArmazemMat = createPs2Lambert({ map: textures.signArmazem }, materials);
  registerBuilding(
    buildTownBuilding({
      x: -40.5,
      z: 17.0,
      width: 15.0,
      depth: 14.0,
      wallHeight: 4.3,
      wallMat: mats.townCorrugated,
      floorMat: mats.townSidewalk,
      ceilingMat: mats.weatheredWood,
      roofMat: mats.townCorrugated,
      roofStyle: 'pitched-x',
      trimMat: mats.darkTrim,
      windowMat: mats.sealedGlass,
      signMat: signArmazemMat,
      signWall: 'north',
      doors: [{ id: 'door-armazem', wall: 'north', offset: 2.0, swingSign: 1 }],
      windows: [
        { wall: 'north', offset: -3.0, w: 1.8, h: 1.2, boarded: true },
        { wall: 'east', offset: 0, w: 1.8, h: 1.2, boarded: true },
      ],
      mats,
      trackGeo,
    }),
  );
  addInteriorLamp(-40.5, 4.1, 17.0, 0xffc682, 11.5, true);

  // Crates in warehouse
  const crateSpecs: [number, number, number][] = [
    [-35.8, 16.5, 1.5],
    [-35.8, 18.2, 1.4],
    [-44.5, 12.6, 1.6],
  ];
  for (const [cx, cz, s] of crateSpecs) {
    const crate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(s, s, s)), mats.weatheredWood);
    crate.position.set(cx, s * 0.5 + 0.04, cz);
    crate.castShadow = true;
    group.add(crate);
    colliders.push({ minX: cx - s * 0.52, maxX: cx + s * 0.52, minZ: cz - s * 0.52, maxZ: cz + s * 0.52 });
  }

  const radioBench = createFurnitureCounter(mats, new THREE.Vector3(-45.8, 0.04, 17.5), 1.4, 3.6, 0.9, trackGeo);
  group.add(radioBench.group);
  colliders.push(radioBench.collider);
  group.add(createInspectableDocProp('doc-radio-tower', mats, new THREE.Vector3(-45.6, 0.94, 17.5), 0.1));

  const chestArmazem = createDrawerChest({
    id: 'chest-armazem',
    mats,
    pos: new THREE.Vector3(-41.5, 0.04, 23.1),
    rotY: Math.PI,
    metallic: true,
    drawersSpec: [{ itemId: 'item-ammo-32' }, { itemId: 'item-battery' }, { itemId: 'item-bandage' }],
  });
  group.add(chestArmazem.group);
  drawers.push(...chestArmazem.drawers);
  colliders.push(chestArmazem.collider);

  const cabArmazem = createHideCabinet({
    id: 'cab-armazem',
    label: 'Armário do Armazém',
    mats,
    pos: new THREE.Vector3(-34.0, 0.04, 22.8),
    rotY: -Math.PI / 2,
    metallic: true,
  });
  group.add(cabArmazem.cabinet.group);
  hideCabinets.push(cabArmazem.cabinet);
  colliders.push(cabArmazem.collider);

  // --- 4F. IGREJA DA COLINA (NW HILL) ---
  const signIgrejaMat = createPs2Lambert({ map: textures.signIgreja }, materials);
  registerBuilding(
    buildTownBuilding({
      x: -19.0,
      z: -52.5,
      width: 14.0,
      depth: 15.0,
      wallHeight: 4.8,
      wallMat: mats.townClapboardCream,
      floorMat: mats.woodFloor,
      ceilingMat: mats.weatheredWood,
      roofMat: mats.slateRoof,
      roofStyle: 'pitched-z',
      trimMat: mats.darkTrim,
      windowMat: mats.chapelStainedGlass,
      signMat: signIgrejaMat,
      signWall: 'south',
      doors: [
        {
          id: 'door-igreja',
          wall: 'south',
          offset: 0,
          swingSign: 1,
          locked: true,
          requiredKeyId: 'key-igreja',
          requiredKeyName: 'Chave da Igreja da Colina',
        },
      ],
      windows: [
        { wall: 'east', offset: -3.2, y: 2.2, w: 1.2, h: 2.1 },
        { wall: 'east', offset: 3.2, y: 2.2, w: 1.2, h: 2.1 },
        { wall: 'west', offset: -3.2, y: 2.2, w: 1.2, h: 2.1 },
        { wall: 'west', offset: 3.2, y: 2.2, w: 1.2, h: 2.1 },
      ],
      mats,
      trackGeo,
    }),
  );
  // Church Steeple & Cross above South entrance
  const steepleBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 4.4, 3.2)), mats.townClapboardCream);
  steepleBase.position.set(-19.0, 8.2, -46.8);
  steepleBase.castShadow = true;
  group.add(steepleBase);
  const spire = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(2.35, 4.2, 4)), mats.slateRoof);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(-19.0, 12.5, -46.8);
  group.add(spire);
  const crossV = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 1.4, 0.14)), mats.tarnishedBrass);
  crossV.position.set(-19.0, 15.1, -46.8);
  const crossH = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.76, 0.14, 0.14)), mats.tarnishedBrass);
  crossH.position.set(-19.0, 15.35, -46.8);
  group.add(crossV, crossH);

  addInteriorLamp(-19.0, 4.65, -52.5, 0xffd088, 12.0, false);

  for (const pz of [-49.5, -52.8]) {
    for (const px of [-22.4, -15.6]) {
      const pew = createParkBench(mats, new THREE.Vector3(px, 0.04, pz), Math.PI, trackGeo);
      group.add(pew.group);
      colliders.push(pew.collider);
    }
  }
  const altar = createFurnitureCounter(mats, new THREE.Vector3(-19.0, 0.04, -57.6), 2.8, 1.2, 0.94, trackGeo);
  group.add(altar.group);
  colliders.push(altar.collider);
  group.add(createInspectableDocProp('doc-church-journal', mats, new THREE.Vector3(-19.5, 0.98, -57.5), 0.1));
  const keyAbrigo = createKeyPickupProp('key-abrigo', mats, new THREE.Vector3(-18.2, 0.98, -57.5), -0.2, 'brass');
  group.add(keyAbrigo);
  keyPickups['key-abrigo'] = keyAbrigo;

  const chestIgreja = createDrawerChest({
    id: 'chest-igreja',
    mats,
    pos: new THREE.Vector3(-13.2, 0.04, -58.8),
    rotY: 0,
    drawersSpec: [{ itemId: 'item-relic-medal' }, { itemId: 'item-laudanum' }, { itemId: 'item-battery' }],
  });
  group.add(chestIgreja.group);
  drawers.push(...chestIgreja.drawers);
  colliders.push(chestIgreja.collider);

  const cabIgreja = createHideCabinet({
    id: 'cab-igreja',
    label: 'Confessionário',
    mats,
    pos: new THREE.Vector3(-25.0, 0.04, -58.6),
    rotY: Math.PI / 2,
    metallic: false,
  });
  group.add(cabIgreja.cabinet.group);
  hideCabinets.push(cabIgreja.cabinet);
  colliders.push(cabIgreja.collider);

  // --- 4G. CASA DOS PINHEIROS (NE HILL) ---
  registerBuilding(
    buildTownBuilding({
      x: 17.0,
      z: -51.0,
      width: 12.0,
      depth: 12.0,
      wallHeight: 3.5,
      wallMat: mats.townClapboardSage,
      floorMat: mats.woodFloor,
      ceilingMat: mats.plasterWall,
      roofMat: mats.slateRoof,
      roofStyle: 'pitched-x',
      trimMat: mats.darkTrim,
      windowMat: mats.warmWindowGlow,
      doors: [{ id: 'door-casa1', wall: 'south', offset: 0, swingSign: 1 }],
      windows: [
        { wall: 'south', offset: -3.2, w: 1.5, h: 1.3, boarded: true },
        { wall: 'south', offset: 3.2, w: 1.5, h: 1.3 },
        { wall: 'west', offset: 0, w: 1.5, h: 1.3, boarded: true },
      ],
      mats,
      trackGeo,
    }),
  );
  addInteriorLamp(17.0, 3.36, -51.0, 0xffd79b, 10.5, true);

  const casa1Table = createFurnitureCounter(mats, new THREE.Vector3(15.4, 0.04, -51.0), 1.8, 1.1, 0.82, trackGeo);
  group.add(casa1Table.group);
  colliders.push(casa1Table.collider);
  group.add(createInspectableDocProp('doc-house-diary', mats, new THREE.Vector3(15.4, 0.86, -51.0), -0.25));

  const c5 = createChair('chair-casa1-a', mats, new THREE.Vector3(15.4, 0.04, -49.8), Math.PI, 'upright');
  const c6 = createChair('chair-casa1-b', mats, new THREE.Vector3(15.4, 0.04, -52.2), 0, 'side');
  group.add(c5.group, c6.group);
  nudgeProps.push(c5, c6);

  const chestCasa1 = createDrawerChest({
    id: 'chest-casa1',
    mats,
    pos: new THREE.Vector3(21.8, 0.04, -55.8),
    rotY: -Math.PI / 2,
    drawersSpec: [{ itemId: 'item-bandage' }, { itemId: 'item-ammo-32' }, { itemId: 'item-battery' }],
  });
  group.add(chestCasa1.group);
  drawers.push(...chestCasa1.drawers);
  colliders.push(chestCasa1.collider);

  const cabCasa1 = createHideCabinet({
    id: 'cab-casa1',
    label: 'Guarda-Roupa',
    mats,
    pos: new THREE.Vector3(12.0, 0.04, -55.8),
    rotY: Math.PI / 2,
    metallic: false,
  });
  group.add(cabCasa1.cabinet.group);
  hideCabinets.push(cabCasa1.cabinet);
  colliders.push(cabCasa1.collider);

  // --- 4H. CASA DO PREFEITO (EAST OF MERCADO) ---
  registerBuilding(
    buildTownBuilding({
      x: 37.0,
      z: -17.5,
      width: 14.0,
      depth: 13.0,
      wallHeight: 3.8,
      wallMat: mats.townClapboardCream,
      floorMat: mats.woodFloor,
      ceilingMat: mats.plasterWall,
      roofMat: mats.slateRoof,
      roofStyle: 'pitched-x',
      trimMat: mats.darkTrim,
      windowMat: mats.warmWindowGlow,
      doors: [
        {
          id: 'door-prefeito',
          wall: 'south',
          offset: 0,
          swingSign: 1,
          locked: true,
          requiredKeyId: 'key-abrigo',
          requiredKeyName: 'Chave da Casa do Prefeito',
        },
      ],
      windows: [
        { wall: 'south', offset: -3.4, w: 1.6, h: 1.4, boarded: true },
        { wall: 'south', offset: 3.4, w: 1.6, h: 1.4, boarded: true },
        { wall: 'east', offset: 0, w: 1.6, h: 1.4 },
      ],
      mats,
      trackGeo,
    }),
  );
  addInteriorLamp(37.0, 3.65, -17.5, 0xffe0ad, 11.5, true);

  const mayorDesk = createFurnitureCounter(mats, new THREE.Vector3(39.4, 0.04, -20.8), 2.2, 1.1, 0.86, trackGeo);
  group.add(mayorDesk.group);
  colliders.push(mayorDesk.collider);
  group.add(createInspectableDocProp('doc-mayor-note', mats, new THREE.Vector3(39.4, 0.9, -20.8), 0.18));

  const c7 = createChair('chair-prefeito-a', mats, new THREE.Vector3(39.4, 0.04, -22.0), 0, 'upright');
  const c8 = createChair('chair-prefeito-b', mats, new THREE.Vector3(34.5, 0.04, -15.2), 0.6, 'upright');
  group.add(c7.group, c8.group);
  nudgeProps.push(c7, c8);

  const chestCasa2 = createDrawerChest({
    id: 'chest-casa2',
    mats,
    pos: new THREE.Vector3(32.5, 0.04, -23.0),
    rotY: 0,
    drawersSpec: [{ itemId: 'item-ammo-32' }, { itemId: 'item-laudanum' }, { itemId: 'item-battery' }],
  });
  group.add(chestCasa2.group);
  drawers.push(...chestCasa2.drawers);
  colliders.push(chestCasa2.collider);

  const cabCasa2 = createHideCabinet({
    id: 'cab-casa2',
    label: 'Armário do Gabinete',
    mats,
    pos: new THREE.Vector3(42.9, 0.04, -14.5),
    rotY: -Math.PI / 2,
    metallic: false,
  });
  group.add(cabCasa2.cabinet.group);
  hideCabinets.push(cabCasa2.cabinet);
  colliders.push(cabCasa2.collider);

  // ==================== 5. ABANDONED VEHICLES, BARRICADES & BURN BARRELS ====================
  const vehicleSpecs: { mat: THREE.Material; pos: THREE.Vector3; rotY: number; pickup: boolean; wrecked: boolean }[] = [
    { mat: mats.carNavy, pos: new THREE.Vector3(-12.5, 0, -7.2), rotY: Math.PI / 2 - 0.18, pickup: false, wrecked: true },
    { mat: mats.carCream, pos: new THREE.Vector3(-10.5, 0, 29.8), rotY: 0.32, pickup: true, wrecked: true },
    { mat: mats.carRust, pos: new THREE.Vector3(-31.5, 0, 2.8), rotY: Math.PI / 2 + 0.16, pickup: true, wrecked: true },
    { mat: mats.carCream, pos: new THREE.Vector3(2.4, 0, 26.5), rotY: 0.38, pickup: false, wrecked: true },
    { mat: mats.carNavy, pos: new THREE.Vector3(26.5, 0, -7.2), rotY: Math.PI / 2 - 0.12, pickup: false, wrecked: false },
    { mat: mats.carRust, pos: new THREE.Vector3(-2.6, 0, -29.0), rotY: Math.PI - 0.24, pickup: false, wrecked: true },
  ];
  for (const v of vehicleSpecs) {
    const builtCar = createParkedVehicle(v.mat, mats, v.pos, v.rotY, v.pickup, trackGeo, v.wrecked);
    group.add(builtCar.group);
    colliders.push(builtCar.collider);
  }

  // Concrete Jersey Barriers & Quarantine Checkpoints
  const barrierSpecs: [number, number, number][] = [
    [-2.5, 40.5, 0.14],
    [2.8, 39.2, -0.22],
    [-2.6, 5.2, 0.08],
    [2.7, -5.8, -0.15],
    [-14.5, -2.6, Math.PI / 2 + 0.12],
    [13.5, 2.8, Math.PI / 2 - 0.16],
  ];
  for (const [bx, bz, br] of barrierSpecs) {
    const jb = createJerseyBarrier(mats, new THREE.Vector3(bx, 0, bz), br, trackGeo);
    group.add(jb.group);
    colliders.push(jb.collider);
  }

  // Survivor Burn Barrels (warm flickering light landmarks) & Rusted Drums
  const barrelSpecs: { x: number; z: number; lit: boolean }[] = [
    { x: -4.6, z: 41.2, lit: true }, // South entrance checkpoint
    { x: -12.6, z: 26.4, lit: true }, // Posto Vale forecourt
    { x: 9.2, z: 8.8, lit: true }, // Praça Central corner
    { x: -33.2, z: 9.4, lit: false }, // Armazém yard
    { x: 26.2, z: -26.0, lit: false }, // Mercado side alley
    { x: -12.4, z: -34.0, lit: false }, // Rua da Colina
  ];
  for (const b of barrelSpecs) {
    const bb = createBurnBarrel(mats, new THREE.Vector3(b.x, 0, b.z), b.lit, materials, trackGeo);
    group.add(bb.group);
    colliders.push(bb.collider);
    if (bb.light) {
      group.add(bb.light);
      dynamicLights.push(bb.light);
    }
  }

  // Abandoned Debris Clusters (pallets, crushed boxes, drums, spare tires)
  const debrisSpecs: [number, number, number][] = [
    [-11.8, 17.6, 0.3], // Posto corner
    [9.2, 34.4, 1.1], // Lanchonete entrance
    [21.6, 22.8, 0.7], // Praça east side
    [-27.5, -14.0, 2.0], // Delegacia alley
    [28.0, -14.2, 0.4], // Mercado-Mayor alley
    [-33.5, 11.2, 1.4], // Armazém yard
    [-11.5, -45.5, 0.9], // Igreja steps
    [10.8, -44.2, 2.4], // Casa dos Pinheiros porch
  ];
  for (const [dx, dz, dr] of debrisSpecs) {
    const deb = createDebrisCluster(mats, new THREE.Vector3(dx, 0, dz), dr, trackGeo);
    group.add(deb.group);
    colliders.push(deb.collider);
  }

  // ==================== 6. STREETLAMPS & UTILITY POLES ====================
  const lampSpecs: { x: number; z: number; rotY: number; mode: 'steady' | 'faulty' | 'broken' }[] = [
    { x: -4.8, z: 42.0, rotY: Math.PI / 2, mode: 'steady' },
    { x: 4.8, z: 30.0, rotY: -Math.PI / 2, mode: 'faulty' },
    { x: -4.8, z: 14.0, rotY: Math.PI / 2, mode: 'steady' },
    { x: 4.8, z: 7.5, rotY: -Math.PI / 2, mode: 'broken' },
    { x: 18.0, z: 10.2, rotY: 0, mode: 'steady' },
    { x: -16.0, z: -4.8, rotY: 0, mode: 'faulty' },
    { x: 16.0, z: 4.8, rotY: Math.PI, mode: 'steady' },
    { x: -34.0, z: 4.8, rotY: Math.PI, mode: 'broken' },
    { x: 34.0, z: -4.8, rotY: 0, mode: 'steady' },
    { x: -4.8, z: -18.0, rotY: Math.PI / 2, mode: 'faulty' },
    { x: -19.0, z: -31.8, rotY: Math.PI, mode: 'faulty' },
    { x: 17.0, z: -41.0, rotY: 0, mode: 'steady' },
  ];
  for (const ls of lampSpecs) {
    const lamp = createStreetLamp(mats, new THREE.Vector3(ls.x, 0, ls.z), ls.rotY, ls.mode, materials, trackGeo);
    group.add(lamp.group);
    if (lamp.light) {
      group.add(lamp.light);
      dynamicLights.push(lamp.light);
    }
    colliders.push(lamp.collider);
  }

  // Utility poles + sagging overhead power lines
  const avePoles: THREE.Vector3[] = [];
  for (const pz of [48, 30, 10, -8, -28, -48]) {
    const pole = createUtilityPole(mats, new THREE.Vector3(6.6, 0, pz), Math.PI / 2, trackGeo);
    group.add(pole.group);
    colliders.push(pole.collider);
    avePoles.push(pole.wireTopPos);
  }
  const comPoles: THREE.Vector3[] = [];
  for (const px of [-44, -26, -8, 12, 30, 48]) {
    const pole = createUtilityPole(mats, new THREE.Vector3(px, 0, 6.6), 0, trackGeo);
    group.add(pole.group);
    colliders.push(pole.collider);
    comPoles.push(pole.wireTopPos);
  }

  const wireVerts: number[] = [];
  const addSaggingSpan = (a: THREE.Vector3, b: THREE.Vector3) => {
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const sag0 = Math.sin(t0 * Math.PI) * 0.85;
      const sag1 = Math.sin(t1 * Math.PI) * 0.85;
      wireVerts.push(
        THREE.MathUtils.lerp(a.x, b.x, t0),
        THREE.MathUtils.lerp(a.y, b.y, t0) - sag0,
        THREE.MathUtils.lerp(a.z, b.z, t0),
        THREE.MathUtils.lerp(a.x, b.x, t1),
        THREE.MathUtils.lerp(a.y, b.y, t1) - sag1,
        THREE.MathUtils.lerp(a.z, b.z, t1),
      );
    }
  };
  for (let i = 0; i < avePoles.length - 1; i++) addSaggingSpan(avePoles[i], avePoles[i + 1]);
  for (let i = 0; i < comPoles.length - 1; i++) addSaggingSpan(comPoles[i], comPoles[i + 1]);

  const wireGeo = trackGeo(new THREE.BufferGeometry());
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wireVerts, 3));
  const wireMat = trackMat(new THREE.LineBasicMaterial({ color: 0x16191a }));
  const wires = new THREE.LineSegments(wireGeo, wireMat);
  wires.raycast = () => {};
  group.add(wires);

  // ==================== 7. INSTANCED PINE FOREST & VALLEY BOULDERS ====================
  // Check clear zones so trees never spawn inside roads or buildings
  const clearZones: AABBCollider[] = [
    { minX: -8.5, maxX: 8.5, minZ: -64, maxZ: 60 }, // Avenida Central
    { minX: -58, maxX: 58, minZ: -8.5, maxZ: 8.5 }, // Rua do Comércio
    { minX: -52, maxX: 52, minZ: -43.5, maxZ: -29.5 }, // Rua da Colina
    { minX: -27, maxX: -6, minZ: 16, maxZ: 32 }, // Posto
    { minX: 7, maxX: 28, minZ: 7, maxZ: 45 }, // Praça & Lanchonete
    { minX: -28, maxX: -8, minZ: -27, maxZ: -8 }, // Delegacia
    { minX: 8, maxX: 28, minZ: -27, maxZ: -8 }, // Mercado
    { minX: 28, maxX: 46, minZ: -27, maxZ: -8 }, // Casa Prefeito
    { minX: -50, maxX: -31, minZ: 8, maxZ: 26 }, // Armazém
    { minX: -28, maxX: -10, minZ: -62, maxZ: -43 }, // Igreja
    { minX: 9, maxX: 25, minZ: -59, maxZ: -43 }, // Casa Pinheiros
  ];
  const isClearSpot = (tx: number, tz: number) => {
    for (const cz of clearZones) {
      if (tx >= cz.minX && tx <= cz.maxX && tz >= cz.minZ && tz <= cz.maxZ) return false;
    }
    return true;
  };

  const treeCoords: { x: number; y: number; z: number; scale: number; rotY: number }[] = [];
  // Deterministic town-park & mountain-ring pines
  for (let i = 0; i < 420 && treeCoords.length < 220; i++) {
    let tx: number;
    let tz: number;
    if (i < 60) {
      tx = (rng() - 0.5) * 108;
      tz = (rng() - 0.5) * 114;
    } else {
      const ang = rng() * Math.PI * 2;
      const rad = 52 + rng() * 54;
      tx = Math.cos(ang) * rad;
      tz = Math.sin(ang) * rad;
    }
    if (!isClearSpot(tx, tz)) continue;
    const dx = Math.max(0, Math.abs(tx) - 56);
    const dz = Math.max(0, Math.abs(tz) - 62);
    const ed = Math.hypot(dx, dz);
    const ty =
      ed > 0.1
        ? Math.min(18, Math.pow(ed / 26, 1.45) * 7.2) +
          Math.sin(tx * 0.09) * Math.cos(tz * 0.08) * Math.min(2.6, ed * 0.07) -
          0.08
        : -0.02;
    treeCoords.push({
      x: tx,
      y: ty,
      z: tz,
      scale: 0.8 + rng() * 0.65,
      rotY: rng() * Math.PI * 2,
    });
  }

  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.28, 3.2, 7));
  const coneLowGeo = trackGeo(new THREE.ConeGeometry(1.75, 3.4, 7));
  const coneMidGeo = trackGeo(new THREE.ConeGeometry(1.38, 2.9, 7));
  const coneTopGeo = trackGeo(new THREE.ConeGeometry(0.92, 2.3, 7));

  const trunkInst = new THREE.InstancedMesh(trunkGeo, mats.pineBark, treeCoords.length);
  const coneLowInst = new THREE.InstancedMesh(coneLowGeo, mats.pineFoliage, treeCoords.length);
  const coneMidInst = new THREE.InstancedMesh(coneMidGeo, mats.pineFoliage, treeCoords.length);
  const coneTopInst = new THREE.InstancedMesh(coneTopGeo, mats.pineFoliage, treeCoords.length);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  treeCoords.forEach((tr, idx) => {
    const s = tr.scale;
    dummy.rotation.set(0, tr.rotY, 0);
    dummy.scale.set(s, s, s);

    dummy.position.set(tr.x, tr.y + 1.55 * s, tr.z);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tr.x, tr.y + 3.4 * s, tr.z);
    dummy.updateMatrix();
    coneLowInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tr.x, tr.y + 5.1 * s, tr.z);
    dummy.updateMatrix();
    coneMidInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tr.x, tr.y + 6.5 * s, tr.z);
    dummy.updateMatrix();
    coneTopInst.setMatrixAt(idx, dummy.matrix);

    const shade = 0.78 + rng() * 0.44;
    tint.setRGB(shade, shade * 1.05, shade);
    coneLowInst.setColorAt(idx, tint);
    coneMidInst.setColorAt(idx, tint);
    coneTopInst.setColorAt(idx, tint);

    if (Math.abs(tr.x) < 58 && Math.abs(tr.z) < 62) {
      colliders.push({
        minX: tr.x - 0.32 * s,
        maxX: tr.x + 0.32 * s,
        minZ: tr.z - 0.32 * s,
        maxZ: tr.z + 0.32 * s,
      });
    }
  });
  for (const inst of [trunkInst, coneLowInst, coneMidInst, coneTopInst]) {
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }

  // Instanced valley boulders around outskirts
  const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1.1, 0));
  const rockCount = 60;
  const rockInst = new THREE.InstancedMesh(rockGeo, mats.townSidewalk, rockCount);
  for (let i = 0; i < rockCount; i++) {
    const ang = (i / rockCount) * Math.PI * 2 + rng() * 0.2;
    const rad = 54 + rng() * 34;
    const rx = Math.cos(ang) * rad;
    const rz = Math.sin(ang) * rad;
    const sc = 0.65 + rng() * 1.4;
    dummy.position.set(rx, 0.35 * sc, rz);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    dummy.scale.set(sc * 1.25, sc * 0.78, sc);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);
    tint.setScalar(0.55 + rng() * 0.35);
    rockInst.setColorAt(i, tint);
  }
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  group.add(rockInst);

  // ==================== 8. OVERGROWN WEEDS & SCATTERED RUIN RUBBLE ====================
  const weedGeo = trackGeo(new THREE.ConeGeometry(0.28, 0.52, 5));
  const weedCount = 340;
  const weedInst = new THREE.InstancedMesh(weedGeo, mats.weedFoliage, weedCount);
  for (let i = 0; i < weedCount; i++) {
    // Cluster weeds along road edges, sidewalks, and abandoned yards
    let wx: number;
    let wz: number;
    if (i < 160) {
      wx = (rng() < 0.5 ? -5.0 : 5.0) + (rng() - 0.5) * 3.6;
      wz = (rng() - 0.5) * 108;
    } else if (i < 240) {
      wx = (rng() - 0.5) * 96;
      wz = (rng() < 0.5 ? -5.0 : 5.0) + (rng() - 0.5) * 3.6;
    } else {
      wx = (rng() - 0.5) * 92;
      wz = (rng() - 0.5) * 108;
    }
    const sc = 0.65 + rng() * 0.95;
    dummy.position.set(wx, 0.2 * sc, wz);
    dummy.rotation.set((rng() - 0.5) * 0.35, rng() * Math.PI * 2, (rng() - 0.5) * 0.35);
    dummy.scale.set(sc, sc * (0.7 + rng() * 0.7), sc);
    dummy.updateMatrix();
    weedInst.setMatrixAt(i, dummy.matrix);
    const wShade = 0.72 + rng() * 0.48;
    tint.setRGB(wShade * 1.04, wShade, wShade * 0.78);
    weedInst.setColorAt(i, tint);
  }
  weedInst.instanceMatrix.needsUpdate = true;
  if (weedInst.instanceColor) weedInst.instanceColor.needsUpdate = true;
  weedInst.computeBoundingSphere();
  group.add(weedInst);

  const rubbleGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.14, 0.26));
  const rubbleCount = 150;
  const rubbleInst = new THREE.InstancedMesh(rubbleGeo, mats.concreteBarrier, rubbleCount);
  for (let i = 0; i < rubbleCount; i++) {
    const rx = (rng() - 0.5) * 84;
    const rz = (rng() - 0.5) * 102;
    const sc = 0.6 + rng() * 1.1;
    dummy.position.set(rx, 0.05 * sc, rz);
    dummy.rotation.set(rng() * 0.3, rng() * Math.PI * 2, rng() * 0.3);
    dummy.scale.set(sc, sc * (0.6 + rng() * 0.8), sc * (0.8 + rng() * 0.6));
    dummy.updateMatrix();
    rubbleInst.setMatrixAt(i, dummy.matrix);
    tint.setScalar(0.65 + rng() * 0.35);
    rubbleInst.setColorAt(i, tint);
  }
  rubbleInst.instanceMatrix.needsUpdate = true;
  if (rubbleInst.instanceColor) rubbleInst.instanceColor.needsUpdate = true;
  rubbleInst.computeBoundingSphere();
  group.add(rubbleInst);

  return {
    group,
    doors,
    drawers,
    hideCabinets,
    nudgeProps,
    colliders,
    capsuleColliders,
    keyPickups,
    dynamicLights,
    nightParticles,
    nightParticleMat,
    nightParticleBase,
    ringBell: serviceBell.ringBell,
    geometries,
    materials,
    updateSky: (elapsed: number) => {
      skyMat.uniforms.uTime.value = elapsed;
    },
  };
}
