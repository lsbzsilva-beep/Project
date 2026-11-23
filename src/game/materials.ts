import * as THREE from 'three';
import { BlackwoodTextureBank } from './textures';

export interface PropMaterialBank {
  doorWood: THREE.MeshLambertMaterial;
  weatheredWood: THREE.MeshLambertMaterial;
  darkTrim: THREE.MeshLambertMaterial;
  rustedMetal: THREE.MeshLambertMaterial;
  tarnishedBrass: THREE.MeshPhongMaterial;
  gunmetal: THREE.MeshPhongMaterial;
  stainedCanvas: THREE.MeshLambertMaterial;
  leatherStrap: THREE.MeshLambertMaterial;
  frostedGlass: THREE.MeshLambertMaterial;
  transomGlass: THREE.MeshLambertMaterial;
  sealedGlass: THREE.MeshLambertMaterial;
  sealedBacking: THREE.MeshLambertMaterial;
  amberBottle: THREE.MeshPhongMaterial;
  chartPaper: THREE.MeshLambertMaterial;
  wardTileFloor: THREE.MeshLambertMaterial;
  chapelStainedGlass: THREE.MeshLambertMaterial;
  morgueSteelDrawers: THREE.MeshPhongMaterial;
  townRoad: THREE.MeshLambertMaterial;
  townSidewalk: THREE.MeshLambertMaterial;
  townBrick: THREE.MeshLambertMaterial;
  townClapboardCream: THREE.MeshLambertMaterial;
  townClapboardSage: THREE.MeshLambertMaterial;
  townClapboardRust: THREE.MeshLambertMaterial;
  townCorrugated: THREE.MeshLambertMaterial;
  slateRoof: THREE.MeshLambertMaterial;
  plasterWall: THREE.MeshLambertMaterial;
  woodFloor: THREE.MeshLambertMaterial;
  pineFoliage: THREE.MeshLambertMaterial;
  pineBark: THREE.MeshLambertMaterial;
  carNavy: THREE.MeshPhongMaterial;
  carRust: THREE.MeshPhongMaterial;
  carCream: THREE.MeshPhongMaterial;
  warmWindowGlow: THREE.MeshLambertMaterial;
  weedFoliage: THREE.MeshLambertMaterial;
  concreteBarrier: THREE.MeshLambertMaterial;
  rustedBarrel: THREE.MeshLambertMaterial;
  cardboard: THREE.MeshLambertMaterial;
  hazardYellow: THREE.MeshLambertMaterial;
  dispose: () => void;
}

export const SHARED_VERTEX_SNAP = { value: 0 };

/**
 * Applies optional gentle PlayStation-style clip-space vertex snapping
 * when vertexSnap mode is enabled (active in VHS Maldito preset or toggle).
 */
export function attachPs2VertexSnap(mat: THREE.Material): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPs2Snap = SHARED_VERTEX_SNAP;
    shader.vertexShader =
      'uniform float uPs2Snap;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        if (uPs2Snap > 1.0) {
          float wSafe = max(abs(gl_Position.w), 0.001);
          vec2 grid = vec2(uPs2Snap, uPs2Snap * 0.75);
          gl_Position.xy = floor((gl_Position.xy / wSafe) * grid + 0.5) / grid * wSafe;
        }`,
      );
  };
}

export function createPs2Lambert(
  params: THREE.MeshLambertMaterialParameters,
  registry: THREE.Material[],
): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    dithering: true,
    ...params,
  });
  attachPs2VertexSnap(mat);
  registry.push(mat);
  return mat;
}

export function createPs2Phong(
  params: THREE.MeshPhongMaterialParameters,
  registry: THREE.Material[],
): THREE.MeshPhongMaterial {
  const mat = new THREE.MeshPhongMaterial({
    shininess: 18,
    specular: new THREE.Color(0x282622),
    dithering: true,
    ...params,
  });
  attachPs2VertexSnap(mat);
  registry.push(mat);
  return mat;
}

export function createPropMaterials(textures: BlackwoodTextureBank): PropMaterialBank {
  const mats: THREE.Material[] = [];

  const doorWood = createPs2Lambert(
    {
      map: textures.doorWood,
      color: 0x8b6e56,
    },
    mats,
  );

  const weatheredWood = createPs2Lambert(
    {
      map: textures.weatheredWood,
      color: 0x998066,
    },
    mats,
  );

  const darkTrim = createPs2Lambert(
    {
      color: 0x26211c,
    },
    mats,
  );

  const rustedMetal = createPs2Lambert(
    {
      map: textures.rustedMetal,
      color: 0x7c716a,
    },
    mats,
  );

  const tarnishedBrass = createPs2Phong(
    {
      color: 0x9d824d,
      shininess: 26,
      specular: 0x52452a,
    },
    mats,
  );

  const gunmetal = createPs2Phong(
    {
      color: 0x3b4042,
      shininess: 24,
      specular: 0x454a4d,
    },
    mats,
  );

  const stainedCanvas = createPs2Lambert(
    {
      map: textures.stainedCanvas,
      color: 0xc8c0ae,
      side: THREE.DoubleSide,
    },
    mats,
  );

  const leatherStrap = createPs2Lambert(
    {
      color: 0x3b261b,
    },
    mats,
  );

  const frostedGlass = createPs2Lambert(
    {
      color: 0x627379,
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
    },
    mats,
  );

  const transomGlass = createPs2Lambert(
    {
      color: 0x4b5c62,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
    },
    mats,
  );

  const sealedGlass = createPs2Lambert(
    {
      map: textures.windowGlass,
      color: 0x7b8d94,
      emissive: 0x162228,
      emissiveIntensity: 0.35,
    },
    mats,
  );

  const sealedBacking = createPs2Lambert(
    {
      color: 0x16191a,
    },
    mats,
  );

  const amberBottle = createPs2Phong(
    {
      color: 0x6b3f16,
      shininess: 32,
      transparent: true,
      opacity: 0.85,
    },
    mats,
  );

  const chartPaper = createPs2Lambert(
    {
      map: textures.chartPaper,
      color: 0xd8ceb4,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    },
    mats,
  );

  const wardTileFloor = createPs2Lambert(
    {
      map: textures.wardTileFloor,
      color: 0xd6d2c6,
    },
    mats,
  );

  const chapelStainedGlass = createPs2Lambert(
    {
      map: textures.chapelStainedGlass,
      color: 0xc8d2e2,
      emissive: 0x24344d,
      emissiveIntensity: 0.78,
    },
    mats,
  );

  const morgueSteelDrawers = createPs2Phong(
    {
      map: textures.morgueSteelDrawers,
      color: 0xbcc4c8,
      shininess: 30,
      specular: 0x4b5357,
    },
    mats,
  );

  const townRoad = createPs2Lambert({ map: textures.townRoad, color: 0xd0d4d6 }, mats);
  const townSidewalk = createPs2Lambert({ map: textures.townSidewalk, color: 0xcac6ba }, mats);
  const townBrick = createPs2Lambert({ map: textures.townBrick, color: 0xcfb8ae }, mats);
  const townClapboardCream = createPs2Lambert({ map: textures.townClapboard, color: 0xd4cdb8 }, mats);
  const townClapboardSage = createPs2Lambert({ map: textures.townClapboard, color: 0xa4b3a4 }, mats);
  const townClapboardRust = createPs2Lambert({ map: textures.townClapboard, color: 0xb58672 }, mats);
  const townCorrugated = createPs2Lambert({ map: textures.townCorrugated, color: 0xb4b9bd }, mats);
  const slateRoof = createPs2Lambert({ map: textures.slateRoof, color: 0x90989c }, mats);
  const plasterWall = createPs2Lambert({ map: textures.plaster, color: 0xc8c1af }, mats);
  const woodFloor = createPs2Lambert({ map: textures.woodFloor, color: 0xc2a88c }, mats);
  const pineFoliage = createPs2Lambert({ color: 0x263b2a }, mats);
  const pineBark = createPs2Lambert({ color: 0x4b382a }, mats);
  const carNavy = createPs2Phong({ color: 0x334657, shininess: 20, specular: 0x566878 }, mats);
  const carRust = createPs2Phong({ color: 0x7e4633, shininess: 14, specular: 0x4d3b32 }, mats);
  const carCream = createPs2Phong({ color: 0xb0a994, shininess: 18, specular: 0x5c594f }, mats);
  const warmWindowGlow = createPs2Lambert(
    {
      map: textures.windowGlass,
      color: 0xd9be8a,
      emissive: 0x4a3418,
      emissiveIntensity: 0.36,
    },
    mats,
  );
  const weedFoliage = createPs2Lambert({ color: 0x535e36, side: THREE.DoubleSide }, mats);
  const concreteBarrier = createPs2Lambert({ map: textures.concrete, color: 0xb5b2a6 }, mats);
  const rustedBarrel = createPs2Lambert({ map: textures.rustedMetal, color: 0x8f4e34 }, mats);
  const cardboard = createPs2Lambert({ map: textures.stainedCanvas, color: 0xa68c67 }, mats);
  const hazardYellow = createPs2Lambert({ color: 0xc99c2c }, mats);

  return {
    doorWood,
    weatheredWood,
    darkTrim,
    rustedMetal,
    tarnishedBrass,
    gunmetal,
    stainedCanvas,
    leatherStrap,
    frostedGlass,
    transomGlass,
    sealedGlass,
    sealedBacking,
    amberBottle,
    chartPaper,
    wardTileFloor,
    chapelStainedGlass,
    morgueSteelDrawers,
    townRoad,
    townSidewalk,
    townBrick,
    townClapboardCream,
    townClapboardSage,
    townClapboardRust,
    townCorrugated,
    slateRoof,
    plasterWall,
    woodFloor,
    pineFoliage,
    pineBark,
    carNavy,
    carRust,
    carCream,
    warmWindowGlow,
    weedFoliage,
    concreteBarrier,
    rustedBarrel,
    cardboard,
    hazardYellow,
    dispose: () => {
      for (const m of mats) {
        m.dispose();
      }
    },
  };
}
