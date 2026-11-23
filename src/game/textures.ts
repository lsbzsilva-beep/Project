import * as THREE from 'three';

function hash2d(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = x - x0;
  const sy = y - y0;
  const ux = sx * sx * (3 - 2 * sx);
  const uy = sy * sy * (3 - 2 * sy);
  const wrap = (v: number, p: number) => ((v % p) + p) % p;
  const ix0 = wrap(x0, px);
  const ix1 = wrap(x0 + 1, px);
  const iy0 = wrap(y0, py);
  const iy1 = wrap(y0 + 1, py);
  const n00 = hash2d(ix0, iy0, seed);
  const n10 = hash2d(ix1, iy0, seed);
  const n01 = hash2d(ix0, iy1, seed);
  const n11 = hash2d(ix1, iy1, seed);
  return n00 + (n10 - n00) * ux + (n01 - n00) * uy + (n00 - n10 - n01 + n11) * ux * uy;
}

function fbm(u: number, v: number, freq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(u * f, v * f, f, f, seed + i * 89);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 1831565813;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BlackwoodTextureBank {
  woodFloor: THREE.Texture;
  wardTileFloor: THREE.Texture;
  chapelStainedGlass: THREE.Texture;
  morgueSteelDrawers: THREE.Texture;
  weatheredWood: THREE.Texture;
  doorWood: THREE.Texture;
  rustedMetal: THREE.Texture;
  stainedCanvas: THREE.Texture;
  concrete: THREE.Texture;
  plaster: THREE.Texture;
  slateRoof: THREE.Texture;
  dampGround: THREE.Texture;
  windowGlass: THREE.Texture;
  chartPaper: THREE.Texture;
  dustSprite: THREE.Texture;
  beamCone: THREE.Texture;
  townRoad: THREE.Texture;
  townSidewalk: THREE.Texture;
  townBrick: THREE.Texture;
  townClapboard: THREE.Texture;
  townCorrugated: THREE.Texture;
  townWelcomeSign: THREE.Texture;
  signPosto: THREE.Texture;
  signDiner: THREE.Texture;
  signDelegacia: THREE.Texture;
  signMercado: THREE.Texture;
  signArmazem: THREE.Texture;
  signIgreja: THREE.Texture;
  setPixelMode: (pixelated: boolean) => void;
  dispose: () => void;
}

export function createBlackwoodTextures(pixelMode: boolean, maxAniso = 8): BlackwoodTextureBank {
  const allTextures: THREE.Texture[] = [];
  const smoothUiTextures = new Set<THREE.Texture>();
  const pixelAniso = Math.max(2, Math.min(8, maxAniso));
  const hdAniso = Math.max(4, Math.min(16, maxAniso));

  const register = <T extends THREE.Texture>(tex: T, pixelated: boolean, forceSmooth = false): T => {
    tex.colorSpace = THREE.SRGBColorSpace;
    // Always use trilinear mipmap filtering for minFilter to prevent mip-level popping/flickering at grazing angles
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    if (forceSmooth) {
      smoothUiTextures.add(tex);
    }
    if (pixelated && !forceSmooth) {
      tex.magFilter = THREE.NearestFilter;
      tex.anisotropy = pixelAniso;
    } else {
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = hdAniso;
    }
    tex.needsUpdate = true;
    allTextures.push(tex);
    return tex;
  };

  const loadDownsampledPhoto = (
    url: string,
    rx: number,
    ry: number,
    fallbackHex: string,
    vramSize = 256,
    clamp = false,
  ): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = vramSize;
    canvas.height = vramSize;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = fallbackHex;
    ctx.fillRect(0, 0, vramSize, vramSize);

    // Paint subtle fallback grain until image resolves
    const imgData = ctx.getImageData(0, 0, vramSize, vramSize);
    const rng = seededRng(url.length * 131 + 17);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (rng() - 0.5) * 18;
      imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + n));
      imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + n));
      imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, vramSize, vramSize);
      tex.needsUpdate = true;
    };
    img.src = url;
    return register(tex, pixelMode);
  };

  const makeProcedural = (
    width: number,
    height: number,
    rx: number,
    ry: number,
    clamp: boolean,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
    forceSmooth = false,
  ): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    draw(ctx, width, height);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    return register(tex, pixelMode, forceSmooth);
  };

  const dampGround = makeProcedural(128, 128, 18, 18, false, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const c = fbm(u, v, 6, 3, 511);
        const l = fbm(u, v, 14, 2, 719);
        const idx = (y * w + x) * 4;
        img.data[idx] = Math.round(24 + c * 22 + l * 8);
        img.data[idx + 1] = Math.round(29 + c * 21 + l * 18);
        img.data[idx + 2] = Math.round(22 + c * 14 + l * 6);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  const windowGlass = makeProcedural(128, 128, 1, 1, true, (ctx, w, h) => {
    const rng = seededRng(5302);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4f5a60');
    g.addColorStop(0.55, '#3b4448');
    g.addColorStop(1, '#252b2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(20,24,26,0.22)' : 'rgba(140,152,155,0.12)';
      ctx.fillRect(rng() * w, rng() * h, 4 + rng() * 14, 4 + rng() * 14);
    }
  });

  const chartPaper = makeProcedural(
    128,
    160,
    1,
    1,
    true,
    (ctx, w, h) => {
      const rng = seededRng(2024);
      ctx.fillStyle = '#cfc3a6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2c2822';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('VALE CINZENTO', 10, 18);
      ctx.strokeStyle = 'rgba(70,65,58,0.45)';
      ctx.lineWidth = 1.5;
      for (let y = 32; y < h - 12; y += 12) {
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(w - 10, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(34,30,24,0.65)';
      for (let y = 38; y < h - 22; y += 18) {
        ctx.beginPath();
        ctx.moveTo(14, y);
        let x = 14;
        while (x < w - 18) {
          x += 6 + rng() * 6;
          ctx.lineTo(x, y + (rng() - 0.5) * 4);
        }
        ctx.stroke();
      }
    },
    true,
  );

  const dustSprite = makeProcedural(32, 32, 1, 1, true, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(235, 228, 208, 0.8)');
    g.addColorStop(0.5, 'rgba(215, 208, 188, 0.35)');
    g.addColorStop(1, 'rgba(215, 208, 188, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });

  const beamCone = makeProcedural(64, 64, 1, 1, true, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255, 244, 214, 0.45)');
    g.addColorStop(0.5, 'rgba(235, 224, 198, 0.14)');
    g.addColorStop(1, 'rgba(215, 210, 190, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });

  const woodFloor = loadDownsampledPhoto('/assets/blackwood/floor_wood_hq.webp', 1, 1, '#3a2d21', 256);
  const wardTileFloor = loadDownsampledPhoto('/src/assets/images/ward_tile_floor_1795274348790.jpg', 1, 1, '#68736a', 256);
  const chapelStainedGlass = loadDownsampledPhoto('/src/assets/images/chapel_stained_glass_1795276509655.jpg', 1, 1, '#1d2738', 256, true);
  const morgueSteelDrawers = loadDownsampledPhoto('/src/assets/images/morgue_steel_drawers_1795276509296.jpg', 1, 1, '#3b4246', 256, true);
  const weatheredWood = loadDownsampledPhoto('/assets/blackwood/wood.webp', 2, 2, '#473628', 256);
  const doorWood = loadDownsampledPhoto('/assets/blackwood/wood.webp', 1.4, 2, '#3c2c20', 256);
  const rustedMetal = loadDownsampledPhoto('/assets/blackwood/bw_rusted_metal.webp', 2, 2, '#3d3430', 128);
  const stainedCanvas = loadDownsampledPhoto('/assets/blackwood/bw_stained_linen.webp', 2, 2, '#7d7564', 128);
  const concrete = loadDownsampledPhoto('/assets/blackwood/concrete.webp', 3, 3, '#4f504a', 256);
  const plaster = loadDownsampledPhoto('/assets/blackwood/plaster.webp', 3, 3, '#636056', 256);
  const slateRoof = loadDownsampledPhoto('/assets/blackwood/bw_slate_roof.webp', 4, 2, '#2d3234', 128);

  const makeShopSign = (
    title: string,
    sub: string,
    bgHex: string,
    borderHex: string,
    textHex: string,
    subHex: string,
  ): THREE.CanvasTexture =>
    makeProcedural(
      512,
      144,
      1,
      1,
      true,
      (ctx, w, h) => {
        ctx.fillStyle = bgHex;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = borderHex;
        ctx.lineWidth = 7;
        ctx.strokeRect(8, 8, w - 16, h - 16);
        const rng = seededRng(title.length * 97 + 13);
        for (let i = 0; i < 45; i++) {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(rng() * w, rng() * h, 6 + rng() * 18, 2 + rng() * 4);
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = textHex;
        ctx.font = 'bold 38px Georgia, serif';
        ctx.fillText(title, w / 2, 56, w - 42);
        ctx.fillStyle = subHex;
        ctx.font = '600 20px monospace';
        ctx.fillText(sub, w / 2, 106, w - 48);
      },
      true,
    );

  const townRoad = makeProcedural(256, 256, 1, 14, false, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const n = fbm(u, v, 10, 3, 211);
        const edgeDirt = Math.pow(Math.abs(u - 0.5) * 2, 2.5) * 18;
        const lum = 48 + n * 24 + edgeDirt;
        const idx = (y * w + x) * 4;
        img.data[idx] = Math.round(lum * 0.98 + edgeDirt * 0.35);
        img.data[idx + 1] = Math.round(lum * 1.0 + edgeDirt * 0.25);
        img.data[idx + 2] = Math.round(lum * 0.98);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Cracked potholes & weathered asphalt fissures
    const rng = seededRng(5591);
    ctx.strokeStyle = 'rgba(20, 22, 20, 0.72)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      let cx = rng() * w;
      let cy = rng() * h;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let s = 0; s < 5; s++) {
        cx += (rng() - 0.5) * 34;
        cy += (rng() - 0.5) * 34;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    // Faded cracked center dashed highway line
    ctx.fillStyle = 'rgba(182, 148, 68, 0.58)';
    ctx.fillRect(w * 0.486, 20, w * 0.028, h * 0.36);
    // Subtle weathered shoulder lines
    ctx.fillStyle = 'rgba(165, 162, 150, 0.28)';
    ctx.fillRect(10, 0, 4, h);
    ctx.fillRect(w - 14, 0, 4, h);
  });

  const townSidewalk = makeProcedural(128, 128, 2, 2, false, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const n = fbm(u, v, 8, 3, 419);
        const moss = fbm(u, v, 5, 2, 711) > 0.62 ? 1 : 0;
        const lum = 88 + n * 26;
        const idx = (y * w + x) * 4;
        img.data[idx] = Math.round(lum * (moss ? 0.85 : 0.98));
        img.data[idx + 1] = Math.round(lum * (moss ? 1.02 : 0.97));
        img.data[idx + 2] = Math.round(lum * (moss ? 0.78 : 0.92));
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(20, 22, 20, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  });

  const townBrick = makeProcedural(128, 128, 2, 1.5, false, (ctx, w, h) => {
    const rng = seededRng(7823);
    ctx.fillStyle = '#4a433d';
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    const cols = 4;
    const bh = h / rows;
    const bw = w / cols;
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 === 0 ? 0 : bw * 0.5;
      for (let c = -1; c <= cols; c++) {
        const shade = 0.85 + rng() * 0.35;
        const red = Math.round(122 * shade);
        const grn = Math.round(64 * shade);
        const blu = Math.round(50 * shade);
        ctx.fillStyle = `rgb(${red},${grn},${blu})`;
        ctx.fillRect(c * bw + offset + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = 'rgba(18, 22, 16, 0.22)';
      ctx.fillRect(rng() * w, rng() * h, 10 + rng() * 24, 14 + rng() * 34);
    }
  });

  const townClapboard = makeProcedural(128, 128, 2, 2, false, (ctx, w, h) => {
    const rng = seededRng(4519);
    ctx.fillStyle = '#929182';
    ctx.fillRect(0, 0, w, h);
    const planks = 8;
    const ph = h / planks;
    for (let i = 0; i < planks; i++) {
      const y = i * ph;
      const g = ctx.createLinearGradient(0, y, 0, y + ph);
      const tone = Math.round((rng() - 0.5) * 18);
      g.addColorStop(0, `rgb(${168 + tone},${168 + tone},${156 + tone})`);
      g.addColorStop(0.84, `rgb(${140 + tone},${141 + tone},${130 + tone})`);
      g.addColorStop(1, '#3b3c35');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, ph);
    }
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = 'rgba(28, 26, 20, 0.16)';
      ctx.fillRect(rng() * w, rng() * h, 8 + rng() * 22, 10 + rng() * 28);
    }
  });

  const townCorrugated = makeProcedural(128, 128, 2, 2, false, (ctx, w, h) => {
    for (let x = 0; x < w; x++) {
      const wave = Math.sin((x / w) * Math.PI * 16) * 0.5 + 0.5;
      const lum = Math.round(66 + wave * 42);
      ctx.fillStyle = `rgb(${lum},${lum + 2},${lum + 3})`;
      ctx.fillRect(x, 0, 1, h);
    }
    ctx.fillStyle = 'rgba(105, 56, 28, 0.42)';
    ctx.fillRect(0, h * 0.66, w, h * 0.34);
    ctx.fillRect(w * 0.2, 0, w * 0.25, h * 0.4);
  });

  const townWelcomeSign = makeProcedural(
    512,
    256,
    1,
    1,
    true,
    (ctx, w, h) => {
      ctx.fillStyle = '#242c24';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c4ae7a';
      ctx.lineWidth = 8;
      ctx.strokeRect(14, 14, w - 28, h - 28);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8dcc0';
      ctx.font = '600 22px Georgia, serif';
      ctx.fillText('BEM-VINDO A', w / 2, 62);
      ctx.font = 'bold 46px Georgia, serif';
      ctx.fillStyle = '#f2e2b8';
      ctx.fillText('VALE CINZENTO', w / 2, 120);
      ctx.fillStyle = '#b9a882';
      ctx.font = '600 18px monospace';
      ctx.fillText('POP. 412 · SERRA DO SUL', w / 2, 174);

      // Post-apocalyptic red spray-paint quarantine warning
      ctx.save();
      ctx.translate(w * 0.5, 214);
      ctx.rotate(-0.045);
      ctx.fillStyle = 'rgba(178, 36, 28, 0.92)';
      ctx.font = 'bold 25px monospace';
      ctx.fillText('ZONA ABANDONADA · PERIGO', 0, 0);
      ctx.restore();
    },
    true,
  );

  const signPosto = makeShopSign('POSTO VALE', 'COMBUSTÍVEL · SEM ENERGIA', '#1e2c24', '#c9933b', '#f2e0b6', '#d9a44b');
  const signDiner = makeShopSign('LANCHONETE ESTRELA', 'FECHADA · EVACUAÇÃO', '#3a1a18', '#d6a456', '#f7e4bc', '#e6b86a');
  const signDelegacia = makeShopSign('DELEGACIA MUNICIPAL', 'POSTO POLICIAL ABANDONADO', '#16202a', '#9ea9b5', '#e4ecf2', '#b4c0cc');
  const signMercado = makeShopSign('MERCADO SÃO JORGE', 'MANTIMENTOS & FARMÁCIA', '#242a1e', '#b8985e', '#f0e4c8', '#cbb27d');
  const signArmazem = makeShopSign('ARMAZÉM & SERRARIA', 'SETOR OESTE · RÁDIO', '#26211c', '#8c7250', '#ded2ba', '#b39c78');
  const signIgreja = makeShopSign('PARÓQUIA DA COLINA', 'ABRIGO DE EMERGÊNCIA', '#1f1d1b', '#a89267', '#ebe0c8', '#bfb08d');

  return {
    woodFloor,
    wardTileFloor,
    chapelStainedGlass,
    morgueSteelDrawers,
    weatheredWood,
    doorWood,
    rustedMetal,
    stainedCanvas,
    concrete,
    plaster,
    slateRoof,
    dampGround,
    windowGlass,
    chartPaper,
    dustSprite,
    beamCone,
    townRoad,
    townSidewalk,
    townBrick,
    townClapboard,
    townCorrugated,
    townWelcomeSign,
    signPosto,
    signDiner,
    signDelegacia,
    signMercado,
    signArmazem,
    signIgreja,
    setPixelMode: (pixelated: boolean) => {
      for (const tex of allTextures) {
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        if (pixelated && !smoothUiTextures.has(tex)) {
          tex.magFilter = THREE.NearestFilter;
          tex.anisotropy = pixelAniso;
        } else {
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = hdAniso;
        }
        tex.needsUpdate = true;
      }
    },
    dispose: () => {
      for (const tex of allTextures) {
        tex.dispose();
      }
    },
  };
}
