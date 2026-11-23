import * as THREE from 'three';
import { createPs2Lambert, PropMaterialBank } from '../materials';
import {
  createInspectableDocProp,
  createSingleDoor,
  tagInteractable,
} from '../props';
import { AABBCollider, CapsuleCollider, DoorState } from '../types';

export interface DoorOpeningSpec {
  id: string;
  wall: 'south' | 'north' | 'east' | 'west';
  offset: number;
  swingSign?: number;
  locked?: boolean;
  requiredKeyId?: string;
  requiredKeyName?: string;
}

export interface BuildingOptions {
  x: number;
  z: number;
  width: number;
  depth: number;
  wallHeight: number;
  wallMat: THREE.Material;
  interiorWallMat?: THREE.Material;
  floorMat: THREE.Material;
  ceilingMat?: THREE.Material;
  roofMat: THREE.Material;
  roofStyle?: 'pitched-x' | 'pitched-z' | 'flat';
  trimMat: THREE.Material;
  windowMat: THREE.Material;
  signMat?: THREE.Material;
  signWall?: 'south' | 'north' | 'east' | 'west';
  signWidth?: number;
  signHeight?: number;
  doors: DoorOpeningSpec[];
  windows?: {
    wall: 'south' | 'north' | 'east' | 'west';
    offset: number;
    y?: number;
    w?: number;
    h?: number;
    boarded?: boolean;
  }[];
  mats: PropMaterialBank;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
}

export interface BuiltBuilding {
  group: THREE.Group;
  doors: DoorState[];
  colliders: AABBCollider[];
}

function addWallWithOpenings(opts: {
  group: THREE.Group;
  colliders: AABBCollider[];
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  wallMat: THREE.Material;
  start: number;
  end: number;
  fixedCoord: number;
  axis: 'x' | 'z';
  wallHeight: number;
  thickness: number;
  doorOffsets: number[];
}): void {
  const { group, colliders, trackGeo, wallMat, start, end, fixedCoord, axis, wallHeight, thickness, doorOffsets } = opts;
  const sortedDoors = [...doorOffsets].sort((a, b) => a - b);
  const doorHalf = 0.52;
  const doorTopY = 2.66;

  let cursor = start;
  const addSolidSpan = (s0: number, s1: number, y0: number, y1: number, addCollider: boolean) => {
    const len = s1 - s0;
    const h = y1 - y0;
    if (len < 0.04 || h < 0.04) return;
    const center = (s0 + s1) * 0.5;
    const cy = (y0 + y1) * 0.5;
    const geo = trackGeo(
      axis === 'x' ? new THREE.BoxGeometry(len, h, thickness) : new THREE.BoxGeometry(thickness, h, len),
    );
    const mesh = new THREE.Mesh(geo, wallMat);
    if (axis === 'x') {
      mesh.position.set(center, cy, fixedCoord);
    } else {
      mesh.position.set(fixedCoord, cy, center);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (addCollider) {
      const halfT = thickness * 0.5;
      if (axis === 'x') {
        colliders.push({ minX: s0, maxX: s1, minZ: fixedCoord - halfT, maxZ: fixedCoord + halfT });
      } else {
        colliders.push({ minX: fixedCoord - halfT, maxX: fixedCoord + halfT, minZ: s0, maxZ: s1 });
      }
    }
  };

  for (const dCoord of sortedDoors) {
    const gapStart = Math.max(cursor, dCoord - doorHalf);
    const gapEnd = Math.min(end, dCoord + doorHalf);
    if (gapStart > cursor + 0.04) {
      addSolidSpan(cursor, gapStart, 0, wallHeight, true);
    }
    addSolidSpan(gapStart, gapEnd, doorTopY, wallHeight, false);
    cursor = Math.max(cursor, gapEnd);
  }
  if (end > cursor + 0.04) {
    addSolidSpan(cursor, end, 0, wallHeight, true);
  }
}

export function buildTownBuilding(opts: BuildingOptions): BuiltBuilding {
  const {
    x,
    z,
    width,
    depth,
    wallHeight,
    wallMat,
    floorMat,
    ceilingMat,
    roofMat,
    roofStyle = 'pitched-x',
    trimMat,
    windowMat,
    signMat,
    signWall = 'south',
    signWidth = 3.4,
    signHeight = 0.96,
    doors: doorSpecs,
    windows = [],
    mats,
    trackGeo,
  } = opts;

  const group = new THREE.Group();
  const doors: DoorState[] = [];
  const colliders: AABBCollider[] = [];
  const wallT = 0.24;

  const minX = x - width * 0.5;
  const maxX = x + width * 0.5;
  const minZ = z - depth * 0.5;
  const maxZ = z + depth * 0.5;

  // Floor & interior ceiling slabs
  const floorMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(width - 0.1, 0.08, depth - 0.1)), floorMat);
  floorMesh.position.set(x, 0.0, z);
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  const ceilingMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(width - 0.1, 0.08, depth - 0.1)),
    ceilingMat ?? mats.plasterWall,
  );
  ceilingMesh.position.set(x, wallHeight - 0.04, z);
  ceilingMesh.receiveShadow = true;
  group.add(ceilingMesh);

  // Build 4 exterior walls with exact doorway cutouts
  const wallDoors = {
    south: doorSpecs.filter((d) => d.wall === 'south').map((d) => x + d.offset),
    north: doorSpecs.filter((d) => d.wall === 'north').map((d) => x + d.offset),
    east: doorSpecs.filter((d) => d.wall === 'east').map((d) => z + d.offset),
    west: doorSpecs.filter((d) => d.wall === 'west').map((d) => z + d.offset),
  };

  addWallWithOpenings({
    group,
    colliders,
    trackGeo,
    wallMat,
    start: minX - wallT * 0.5,
    end: maxX + wallT * 0.5,
    fixedCoord: maxZ,
    axis: 'x',
    wallHeight,
    thickness: wallT,
    doorOffsets: wallDoors.south,
  });

  addWallWithOpenings({
    group,
    colliders,
    trackGeo,
    wallMat,
    start: minX - wallT * 0.5,
    end: maxX + wallT * 0.5,
    fixedCoord: minZ,
    axis: 'x',
    wallHeight,
    thickness: wallT,
    doorOffsets: wallDoors.north,
  });

  addWallWithOpenings({
    group,
    colliders,
    trackGeo,
    wallMat,
    start: minZ + wallT * 0.5,
    end: maxZ - wallT * 0.5,
    fixedCoord: maxX,
    axis: 'z',
    wallHeight,
    thickness: wallT,
    doorOffsets: wallDoors.east,
  });

  addWallWithOpenings({
    group,
    colliders,
    trackGeo,
    wallMat,
    start: minZ + wallT * 0.5,
    end: maxZ - wallT * 0.5,
    fixedCoord: minX,
    axis: 'z',
    wallHeight,
    thickness: wallT,
    doorOffsets: wallDoors.west,
  });

  // Corner pilasters
  const postGeo = trackGeo(new THREE.BoxGeometry(0.28, wallHeight + 0.08, 0.28));
  for (const cx of [minX, maxX]) {
    for (const cz of [minZ, maxZ]) {
      const post = new THREE.Mesh(postGeo, trimMat);
      post.position.set(cx, wallHeight * 0.5, cz);
      post.castShadow = true;
      group.add(post);
    }
  }

  // Roof assembly
  if (roofStyle === 'flat') {
    const fascia = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(width + 0.56, 0.34, depth + 0.56)),
      trimMat,
    );
    fascia.position.set(x, wallHeight + 0.17, z);
    fascia.castShadow = true;
    group.add(fascia);

    const roofCap = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(width + 0.42, 0.14, depth + 0.42)),
      roofMat,
    );
    roofCap.position.set(x, wallHeight + 0.36, z);
    group.add(roofCap);
  } else if (roofStyle === 'pitched-x') {
    const ridgeH = Math.min(2.1, depth * 0.24);
    const slopeLen = Math.hypot(depth * 0.5 + 0.45, ridgeH);
    const angle = Math.atan2(ridgeH, depth * 0.5 + 0.45);
    const slopeGeo = trackGeo(new THREE.BoxGeometry(width + 0.6, 0.16, slopeLen));

    const southSlope = new THREE.Mesh(slopeGeo, roofMat);
    southSlope.position.set(x, wallHeight + ridgeH * 0.5 - 0.04, z + depth * 0.25 + 0.1);
    southSlope.rotation.x = angle;
    southSlope.castShadow = true;
    group.add(southSlope);

    const northSlope = new THREE.Mesh(slopeGeo, roofMat);
    northSlope.position.set(x, wallHeight + ridgeH * 0.5 - 0.04, z - depth * 0.25 - 0.1);
    northSlope.rotation.x = -angle;
    northSlope.castShadow = true;
    group.add(northSlope);

    // Gable triangles on East & West
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-depth * 0.5, 0);
    gableShape.lineTo(depth * 0.5, 0);
    gableShape.lineTo(0, ridgeH);
    gableShape.closePath();
    const gableGeo = trackGeo(new THREE.ExtrudeGeometry(gableShape, { depth: 0.24, bevelEnabled: false }));
    for (const gx of [minX - 0.12, maxX - 0.12]) {
      const gMesh = new THREE.Mesh(gableGeo, wallMat);
      gMesh.rotation.y = Math.PI / 2;
      gMesh.position.set(gx, wallHeight, z);
      group.add(gMesh);
    }
  } else {
    const ridgeH = Math.min(2.1, width * 0.24);
    const slopeLen = Math.hypot(width * 0.5 + 0.45, ridgeH);
    const angle = Math.atan2(ridgeH, width * 0.5 + 0.45);
    const slopeGeo = trackGeo(new THREE.BoxGeometry(slopeLen, 0.16, depth + 0.6));

    const eastSlope = new THREE.Mesh(slopeGeo, roofMat);
    eastSlope.position.set(x + width * 0.25 + 0.1, wallHeight + ridgeH * 0.5 - 0.04, z);
    eastSlope.rotation.z = -angle;
    eastSlope.castShadow = true;
    group.add(eastSlope);

    const westSlope = new THREE.Mesh(slopeGeo, roofMat);
    westSlope.position.set(x - width * 0.25 - 0.1, wallHeight + ridgeH * 0.5 - 0.04, z);
    westSlope.rotation.z = angle;
    westSlope.castShadow = true;
    group.add(westSlope);

    const gableShape = new THREE.Shape();
    gableShape.moveTo(-width * 0.5, 0);
    gableShape.lineTo(width * 0.5, 0);
    gableShape.lineTo(0, ridgeH);
    gableShape.closePath();
    const gableGeo = trackGeo(new THREE.ExtrudeGeometry(gableShape, { depth: 0.24, bevelEnabled: false }));
    for (const gz of [minZ - 0.12, maxZ - 0.12]) {
      const gMesh = new THREE.Mesh(gableGeo, wallMat);
      gMesh.position.set(x, wallHeight, gz);
      group.add(gMesh);
    }
  }

  // Hinged Single Doors
  for (const spec of doorSpecs) {
    let dx = x;
    let dz = z;
    let rotY = 0;
    if (spec.wall === 'south') {
      dx = x + spec.offset;
      dz = maxZ;
      rotY = 0;
    } else if (spec.wall === 'north') {
      dx = x + spec.offset;
      dz = minZ;
      rotY = Math.PI;
    } else if (spec.wall === 'east') {
      dx = maxX;
      dz = z + spec.offset;
      rotY = Math.PI / 2;
    } else {
      dx = minX;
      dz = z + spec.offset;
      rotY = -Math.PI / 2;
    }

    const door = createSingleDoor(spec.id, mats, 0, spec.swingSign ?? 1, new THREE.Vector3(dx, 0, dz), rotY);
    door.locked = Boolean(spec.locked);
    door.requiredKeyId = spec.requiredKeyId;
    door.requiredKeyName = spec.requiredKeyName;
    group.add(door.group);
    doors.push(door);
  }

  // Exterior + Interior Windows (optionally boarded up with nailed planks)
  for (const wSpec of windows) {
    const ww = wSpec.w ?? 1.5;
    const wh = wSpec.h ?? 1.4;
    const wy = wSpec.y ?? 1.65;
    const winGrp = new THREE.Group();

    const frame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(ww + 0.14, wh + 0.14, 0.28)), trimMat);
    winGrp.add(frame);
    const pane = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(ww - 0.04, wh - 0.04, 0.3)),
      wSpec.boarded ? mats.sealedGlass : windowMat,
    );
    winGrp.add(pane);
    const crossH = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(ww, 0.04, 0.32)), trimMat);
    winGrp.add(crossH);
    const crossV = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.04, wh, 0.32)), trimMat);
    winGrp.add(crossV);

    if (wSpec.boarded) {
      const plankGeo = trackGeo(new THREE.BoxGeometry(ww + 0.32, 0.14, 0.04));
      for (const [py, rotZ] of [
        [wh * 0.26, 0.14],
        [-0.02, -0.18],
        [-wh * 0.28, 0.08],
      ] as [number, number][]) {
        const pOut = new THREE.Mesh(plankGeo, mats.weatheredWood);
        pOut.position.set(0, py, 0.165);
        pOut.rotation.z = rotZ;
        pOut.castShadow = true;
        winGrp.add(pOut);

        const pIn = new THREE.Mesh(plankGeo, mats.weatheredWood);
        pIn.position.set(0, py, -0.165);
        pIn.rotation.z = rotZ;
        winGrp.add(pIn);
      }
    }

    if (wSpec.wall === 'south') {
      winGrp.position.set(x + wSpec.offset, wy, maxZ);
    } else if (wSpec.wall === 'north') {
      winGrp.position.set(x + wSpec.offset, wy, minZ);
      winGrp.rotation.y = Math.PI;
    } else if (wSpec.wall === 'east') {
      winGrp.position.set(maxX, wy, z + wSpec.offset);
      winGrp.rotation.y = Math.PI / 2;
    } else {
      winGrp.position.set(minX, wy, z + wSpec.offset);
      winGrp.rotation.y = -Math.PI / 2;
    }
    group.add(winGrp);
  }

  // Storefront Signboard
  if (signMat) {
    const signGrp = new THREE.Group();
    const board = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(signWidth + 0.14, signHeight + 0.14, 0.12)),
      trimMat,
    );
    signGrp.add(board);
    const face = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(signWidth, signHeight)), signMat);
    face.position.z = 0.07;
    signGrp.add(face);

    const sy = Math.min(wallHeight - 0.18, 3.35);
    if (signWall === 'south') {
      signGrp.position.set(x, sy, maxZ + 0.18);
    } else if (signWall === 'north') {
      signGrp.position.set(x, sy, minZ - 0.18);
      signGrp.rotation.y = Math.PI;
    } else if (signWall === 'east') {
      signGrp.position.set(maxX + 0.18, sy, z);
      signGrp.rotation.y = Math.PI / 2;
    } else {
      signGrp.position.set(minX - 0.18, sy, z);
      signGrp.rotation.y = -Math.PI / 2;
    }
    group.add(signGrp);
  }

  return { group, doors, colliders };
}

export function createParkedVehicle(
  bodyMat: THREE.Material,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  isPickup = false,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  wrecked = true,
): { group: THREE.Group; collider: AABBCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;
  if (wrecked) {
    group.rotation.z = (rotY % 2 > 1 ? 1 : -1) * 0.065;
  }

  const chassisLen = 4.2;
  const chassisWid = 1.72;

  // Lower body tub
  const lower = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(chassisWid, 0.62, chassisLen)), bodyMat);
  lower.position.set(0, 0.52, 0);
  lower.castShadow = true;
  lower.receiveShadow = true;
  group.add(lower);

  // Cabin / roof
  if (isPickup) {
    const cab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(chassisWid - 0.08, 0.66, 1.38)), bodyMat);
    cab.position.set(0, 1.14, -0.32);
    cab.castShadow = true;
    group.add(cab);

    const bedFloor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(chassisWid - 0.18, 0.08, 1.55)), mats.rustedMetal);
    bedFloor.position.set(0, 0.81, 1.2);
    group.add(bedFloor);

    if (wrecked) {
      const cargoCrate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.75, 0.45, 0.8)), mats.weatheredWood);
      cargoCrate.position.set(-0.22, 1.05, 1.22);
      cargoCrate.rotation.y = 0.24;
      group.add(cargoCrate);
    }
  } else {
    const cab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(chassisWid - 0.1, 0.62, 2.0)), bodyMat);
    cab.position.set(0, 1.11, 0.14);
    cab.castShadow = true;
    group.add(cab);
  }

  // Cracked/darkened abandoned glass
  const glass = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(chassisWid - 0.18, 0.44, isPickup ? 1.41 : 2.03)),
    mats.sealedGlass,
  );
  glass.position.set(0, 1.12, isPickup ? -0.32 : 0.14);
  group.add(glass);

  // Propped open rusted hood on wrecked cars
  if (wrecked) {
    const hood = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(chassisWid - 0.16, 0.07, 1.1)), mats.rustedMetal);
    hood.position.set(0, 1.12, -1.25);
    hood.rotation.x = 0.58;
    hood.castShadow = true;
    group.add(hood);
  }

  // Front & rear rusted bumpers
  for (const bz of [-chassisLen * 0.5 - 0.06, chassisLen * 0.5 + 0.06]) {
    const bumper = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(chassisWid + 0.08, 0.14, 0.12)), mats.rustedMetal);
    bumper.position.set(0, 0.34, bz);
    if (wrecked && bz < 0) bumper.rotation.z = -0.09;
    group.add(bumper);
  }

  // Dead/shattered headlight bezels
  for (const hx of [-0.58, 0.58]) {
    const lamp = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10)), mats.sealedGlass);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(hx, 0.6, -chassisLen * 0.5 - 0.02);
    group.add(lamp);
  }

  // Tires + missing wheel propped on cinderblock when wrecked
  const tireGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12));
  const rimGeo = trackGeo(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 8));
  for (const wx of [-chassisWid * 0.48, chassisWid * 0.48]) {
    for (const wz of [-1.32, 1.32]) {
      if (wrecked && wx < 0 && wz < 0) {
        const block = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.34, 0.36, 0.46)), mats.concreteBarrier);
        block.position.set(wx * 0.85, 0.18, wz);
        group.add(block);
        continue;
      }
      const tire = new THREE.Mesh(tireGeo, mats.darkTrim);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(wx, 0.3, wz);
      tire.castShadow = true;
      group.add(tire);

      const rim = new THREE.Mesh(rimGeo, mats.rustedMetal);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(wx, 0.3, wz);
      group.add(rim);
    }
  }

  const cos = Math.abs(Math.cos(rotY));
  const sin = Math.abs(Math.sin(rotY));
  const halfX = (chassisWid * 0.5) * cos + (chassisLen * 0.5) * sin + 0.08;
  const halfZ = (chassisWid * 0.5) * sin + (chassisLen * 0.5) * cos + 0.08;

  return {
    group,
    collider: {
      minX: pos.x - halfX,
      maxX: pos.x + halfX,
      minZ: pos.z - halfZ,
      maxZ: pos.z + halfZ,
    },
  };
}

export function createGasPump(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; collider: AABBCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.16, 0.72)), mats.townSidewalk);
  plinth.position.y = 0.08;
  group.add(plinth);

  const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.56, 1.56, 0.42)), mats.carRust);
  body.position.y = 0.94;
  body.castShadow = true;
  group.add(body);

  const dial = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.32, 0.45)), mats.sealedGlass);
  dial.position.y = 1.38;
  group.add(dial);

  const cap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.12, 0.48)), mats.rustedMetal);
  cap.position.y = 1.76;
  group.add(cap);

  const hose = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6)), mats.darkTrim);
  hose.position.set(0.32, 0.95, 0);
  hose.rotation.z = 0.15;
  group.add(hose);

  return {
    group,
    collider: {
      minX: pos.x - 0.55,
      maxX: pos.x + 0.55,
      minZ: pos.z - 0.45,
      maxZ: pos.z + 0.45,
    },
  };
}

export function createStreetLamp(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  mode: 'steady' | 'faulty' | 'broken',
  materialsRegistry: THREE.Material[],
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; light: THREE.PointLight | null; collider: AABBCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;
  if (mode === 'broken') {
    group.rotation.z = 0.14;
    group.rotation.x = 0.06;
  }

  const base = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.22, 0.45, 8)), mats.gunmetal);
  base.position.y = 0.225;
  base.castShadow = true;
  group.add(base);

  const pole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.065, 0.095, 4.6, 8)), mats.gunmetal);
  pole.position.y = 2.65;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.08, 1.05)), mats.gunmetal);
  arm.position.set(0, 4.86, 0.48);
  group.add(arm);

  const hood = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.26, 0.16, 8)), mats.gunmetal);
  hood.position.set(0, 4.78, 0.96);
  group.add(hood);

  const bulbMat = createPs2Lambert(
    mode === 'broken'
      ? { color: 0x3b403e, emissive: 0x000000, emissiveIntensity: 0 }
      : { color: 0xffe4ad, emissive: 0xffb85c, emissiveIntensity: 1.85 },
    materialsRegistry,
  );
  const bulb = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.11, 8, 6)), bulbMat);
  bulb.position.set(0, 4.68, 0.96);
  group.add(bulb);

  let light: THREE.PointLight | null = null;
  if (mode !== 'broken') {
    const localBulbOffset = new THREE.Vector3(0, 4.45, 0.96).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    light = new THREE.PointLight(0xffcf84, 18.5, 28, 1.05);
    light.position.set(pos.x + localBulbOffset.x, pos.y + 4.45, pos.z + localBulbOffset.z);
    light.userData = {
      baseIntensity: 18.5,
      flickerSeed: Math.abs(pos.x * 1.7 + pos.z * 2.3),
      flickerMode: mode,
      bulbMat,
      bulbBaseEmissive: 1.85,
    };
  }

  return {
    group,
    light,
    collider: {
      minX: pos.x - 0.22,
      maxX: pos.x + 0.22,
      minZ: pos.z - 0.22,
      maxZ: pos.z + 0.22,
    },
  };
}

export function createUtilityPole(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; wireTopPos: THREE.Vector3; collider: AABBCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const pole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.15, 6.6, 8)), mats.weatheredWood);
  pole.position.y = 3.3;
  pole.castShadow = true;
  group.add(pole);

  const crossArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.55, 0.11, 0.11)), mats.weatheredWood);
  crossArm.position.y = 6.1;
  group.add(crossArm);

  const insGeo = trackGeo(new THREE.CylinderGeometry(0.035, 0.04, 0.1, 6));
  for (const ix of [-0.62, 0, 0.62]) {
    const ins = new THREE.Mesh(insGeo, mats.frostedGlass);
    ins.position.set(ix, 6.2, 0);
    group.add(ins);
  }

  return {
    group,
    wireTopPos: new THREE.Vector3(pos.x, 6.24, pos.z),
    collider: {
      minX: pos.x - 0.18,
      maxX: pos.x + 0.18,
      minZ: pos.z - 0.18,
      maxZ: pos.z + 0.18,
    },
  };
}

export function createParkBench(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; collider: AABBCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const w = 1.65;
  const d = 0.56;
  const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.06, 0.44)), mats.weatheredWood);
  seat.position.set(0, 0.46, 0.04);
  seat.castShadow = true;
  group.add(seat);

  const back = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, 0.42, 0.05)), mats.weatheredWood);
  back.position.set(0, 0.78, -0.2);
  back.rotation.x = -0.14;
  back.castShadow = true;
  group.add(back);

  const legGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.46, d));
  for (const sx of [-w * 0.42, w * 0.42]) {
    const leg = new THREE.Mesh(legGeo, mats.gunmetal);
    leg.position.set(sx, 0.23, 0);
    group.add(leg);
  }

  const cos = Math.abs(Math.cos(rotY));
  const sin = Math.abs(Math.sin(rotY));
  const halfX = (w * 0.5) * cos + (d * 0.5) * sin + 0.05;
  const halfZ = (w * 0.5) * sin + (d * 0.5) * cos + 0.05;

  return {
    group,
    collider: {
      minX: pos.x - halfX,
      maxX: pos.x + halfX,
      minZ: pos.z - halfZ,
      maxZ: pos.z + halfZ,
    },
  };
}

export function createTownFountain(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; collider: CapsuleCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);

  const outerRim = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.3, 2.45, 0.56, 12)), mats.townSidewalk);
  outerRim.position.y = 0.28;
  outerRim.castShadow = true;
  outerRim.receiveShadow = true;
  group.add(outerRim);

  const waterDisk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.98, 1.98, 0.44, 12)), mats.sealedGlass);
  waterDisk.position.y = 0.26;
  group.add(waterDisk);

  const pedestal = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.36, 0.48, 1.35, 10)), mats.townSidewalk);
  pedestal.position.y = 0.92;
  pedestal.castShadow = true;
  group.add(pedestal);

  const upperBowl = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.05, 0.52, 0.34, 10)), mats.townSidewalk);
  upperBowl.position.y = 1.56;
  group.add(upperBowl);

  const finial = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.24, 0.62, 8)), mats.townSidewalk);
  finial.position.y = 1.95;
  group.add(finial);

  return {
    group,
    collider: { x1: pos.x, z1: pos.z, x2: pos.x, z2: pos.z, radius: 2.38 },
  };
}

export function createNoticeBoard(
  docId: string,
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; collider: AABBCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const postGeo = trackGeo(new THREE.BoxGeometry(0.11, 2.05, 0.11));
  for (const px of [-0.72, 0.72]) {
    const post = new THREE.Mesh(postGeo, mats.weatheredWood);
    post.position.set(px, 1.025, 0);
    post.castShadow = true;
    group.add(post);
  }

  const backing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.52, 0.96, 0.08)), mats.darkTrim);
  backing.position.set(0, 1.52, 0);
  group.add(backing);

  const cork = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.38, 0.82, 0.095)), mats.weatheredWood);
  cork.position.set(0, 1.52, 0);
  group.add(cork);

  const roof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.68, 0.09, 0.36)), mats.slateRoof);
  roof.position.set(0, 2.04, 0);
  group.add(roof);

  const flyer = createInspectableDocProp(docId, mats, new THREE.Vector3(0, 1.48, 0.065), 0);
  flyer.rotation.x = Math.PI / 2;
  group.add(flyer);

  return {
    group,
    collider: {
      minX: pos.x - 0.82,
      maxX: pos.x + 0.82,
      minZ: pos.z - 0.25,
      maxZ: pos.z + 0.25,
    },
  };
}

export function createFurnitureCounter(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  w: number,
  d: number,
  h: number,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; collider: AABBCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);

  const base = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h - 0.08, d)), mats.doorWood);
  base.position.y = (h - 0.08) * 0.5;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const top = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w + 0.08, 0.08, d + 0.08)), mats.weatheredWood);
  top.position.y = h - 0.04;
  top.castShadow = true;
  group.add(top);

  return {
    group,
    collider: {
      minX: pos.x - w * 0.5,
      maxX: pos.x + w * 0.5,
      minZ: pos.z - d * 0.5,
      maxZ: pos.z + d * 0.5,
    },
  };
}

export function createServiceBellProp(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; ringBell: () => void } {
  const group = new THREE.Group();
  group.position.copy(pos);

  const base = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.065, 0.075, 0.025, 10)), mats.darkTrim);
  base.position.y = 0.012;
  group.add(base);

  const dome = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.055, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5)),
    mats.tarnishedBrass,
  );
  dome.position.y = 0.024;
  group.add(dome);

  const plunger = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.01, 0.01, 0.025, 8)), mats.tarnishedBrass);
  plunger.position.y = 0.085;
  group.add(plunger);

  tagInteractable(group, 'reception-bell');

  return {
    group,
    ringBell: () => {
      plunger.position.y = 0.074;
      window.setTimeout(() => {
        plunger.position.y = 0.085;
      }, 110);
    },
  };
}

export function createBurnBarrel(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  lit: boolean,
  materialsRegistry: THREE.Material[],
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; light: THREE.PointLight | null; collider: AABBCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);

  const drum = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.34, 0.35, 0.96, 12)), mats.rustedBarrel);
  drum.position.y = 0.48;
  drum.castShadow = true;
  drum.receiveShadow = true;
  group.add(drum);

  for (const ry of [0.28, 0.66]) {
    const rib = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 12)), mats.rustedMetal);
    rib.position.y = ry;
    group.add(rib);
  }

  let light: THREE.PointLight | null = null;
  if (lit) {
    const emberMat = createPs2Lambert(
      { color: 0xff9b3d, emissive: 0xff6a1a, emissiveIntensity: 2.2 },
      materialsRegistry,
    );
    const emberPile = new THREE.Mesh(trackGeo(new THREE.DodecahedronGeometry(0.24, 0)), emberMat);
    emberPile.position.y = 0.92;
    emberPile.scale.set(1.0, 0.55, 1.0);
    group.add(emberPile);

    const log1 = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.045, 0.05, 0.45, 6)), mats.darkTrim);
    log1.position.set(0.05, 1.02, 0);
    log1.rotation.z = 0.45;
    group.add(log1);

    light = new THREE.PointLight(0xff8432, 16.0, 22, 1.05);
    light.position.set(pos.x, pos.y + 1.25, pos.z);
    light.userData = {
      baseIntensity: 16.0,
      flickerSeed: Math.abs(pos.x * 3.1 + pos.z * 1.9),
      flickerMode: 'faulty',
      bulbMat: emberMat,
      bulbBaseEmissive: 2.2,
    };
  }

  return {
    group,
    light,
    collider: {
      minX: pos.x - 0.38,
      maxX: pos.x + 0.38,
      minZ: pos.z - 0.38,
      maxZ: pos.z + 0.38,
    },
  };
}

export function createJerseyBarrier(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; collider: AABBCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  const len = 2.4;
  const foot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(len, 0.28, 0.62)), mats.concreteBarrier);
  foot.position.y = 0.14;
  foot.castShadow = true;
  foot.receiveShadow = true;
  group.add(foot);

  const wall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(len, 0.64, 0.34)), mats.concreteBarrier);
  wall.position.y = 0.58;
  wall.castShadow = true;
  group.add(wall);

  const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(len * 0.72, 0.12, 0.36)), mats.hazardYellow);
  stripe.position.y = 0.72;
  group.add(stripe);

  const cos = Math.abs(Math.cos(rotY));
  const sin = Math.abs(Math.sin(rotY));
  const halfX = (len * 0.5) * cos + 0.34 * sin + 0.04;
  const halfZ = (len * 0.5) * sin + 0.34 * cos + 0.04;

  return {
    group,
    collider: {
      minX: pos.x - halfX,
      maxX: pos.x + halfX,
      minZ: pos.z - halfZ,
      maxZ: pos.z + halfZ,
    },
  };
}

export function createDebrisCluster(
  mats: PropMaterialBank,
  pos: THREE.Vector3,
  rotY: number,
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): { group: THREE.Group; collider: AABBCollider } {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = rotY;

  // Leaning wooden pallet
  const pallet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 0.1, 0.9)), mats.weatheredWood);
  pallet.position.set(-0.2, 0.05, 0);
  pallet.receiveShadow = true;
  group.add(pallet);

  // Abandoned cardboard/supply box
  const boxA = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.54, 0.44, 0.5)), mats.cardboard);
  boxA.position.set(-0.24, 0.32, 0.05);
  boxA.rotation.y = 0.25;
  boxA.castShadow = true;
  group.add(boxA);

  // Rusted drum lying or standing
  const drum = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.78, 10)), mats.rustedBarrel);
  drum.position.set(0.42, 0.39, -0.1);
  drum.castShadow = true;
  group.add(drum);

  // Discarded spare tire
  const tire = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.25, 0.09, 6, 12)), mats.darkTrim);
  tire.rotation.x = Math.PI / 2 - 0.18;
  tire.position.set(0.16, 0.14, 0.44);
  group.add(tire);

  return {
    group,
    collider: {
      minX: pos.x - 0.85,
      maxX: pos.x + 0.85,
      minZ: pos.z - 0.75,
      maxZ: pos.z + 0.75,
    },
  };
}
