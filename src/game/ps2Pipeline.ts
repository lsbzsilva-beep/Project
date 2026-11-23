import * as THREE from 'three';
import { Ps2ResolutionId, Ps2Settings } from './types';

const PS2_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const PS2_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uRenderRes;
  uniform vec2 uScreenRes;
  uniform float uTime;
  uniform float uDithering;
  uniform float uScanlines;
  uniform float uColorSteps;
  uniform float uCurvature;
  uniform float uMode; // 0 = Silent Fog PS2, 1 = Camcorder 480i IR, 2 = VHS Cursed, 3 = Native HD
  uniform float uNightVision;
  uniform float uLightning;
  uniform float uFade;

  varying vec2 vUv;

  float bayer4(vec2 pos) {
    int x = int(mod(pos.x, 4.0));
    int y = int(mod(pos.y, 4.0));
    int idx = y * 4 + x;
    if (idx == 0) return 0.0 / 16.0;
    if (idx == 1) return 8.0 / 16.0;
    if (idx == 2) return 2.0 / 16.0;
    if (idx == 3) return 10.0 / 16.0;
    if (idx == 4) return 12.0 / 16.0;
    if (idx == 5) return 4.0 / 16.0;
    if (idx == 6) return 14.0 / 16.0;
    if (idx == 7) return 6.0 / 16.0;
    if (idx == 8) return 3.0 / 16.0;
    if (idx == 9) return 11.0 / 16.0;
    if (idx == 10) return 1.0 / 16.0;
    if (idx == 11) return 9.0 / 16.0;
    if (idx == 12) return 15.0 / 16.0;
    if (idx == 13) return 7.0 / 16.0;
    if (idx == 14) return 13.0 / 16.0;
    return 5.0 / 16.0;
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 curveUv(vec2 uv, float k) {
    if (k <= 0.001) return uv;
    vec2 centered = uv * 2.0 - 1.0;
    vec2 offset = abs(centered.yx) / vec2(4.2, 3.6);
    centered = centered + centered * offset * offset * (k * 3.8);
    return centered * 0.5 + 0.5;
  }

  float fxaaLuma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  vec3 sampleFxaa(sampler2D tex, vec2 uv, vec2 res) {
    vec2 rcp = 1.0 / max(res, vec2(1.0));
    vec3 rgbM = texture2D(tex, uv).rgb;
    vec3 rgbNW = texture2D(tex, uv + vec2(-1.0, -1.0) * rcp).rgb;
    vec3 rgbNE = texture2D(tex, uv + vec2(1.0, -1.0) * rcp).rgb;
    vec3 rgbSW = texture2D(tex, uv + vec2(-1.0, 1.0) * rcp).rgb;
    vec3 rgbSE = texture2D(tex, uv + vec2(1.0, 1.0) * rcp).rgb;

    float lumaM = fxaaLuma(rgbM);
    float lumaNW = fxaaLuma(rgbNW);
    float lumaNE = fxaaLuma(rgbNE);
    float lumaSW = fxaaLuma(rgbSW);
    float lumaSE = fxaaLuma(rgbSE);

    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
    float range = lumaMax - lumaMin;

    if (range < max(0.028, lumaMax * 0.11)) {
      return rgbM;
    }

    vec2 dir;
    dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
    dir.y = (lumaNW + lumaSW) - (lumaNE + lumaSE);

    float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 1.0 / 128.0);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcpDirMin, vec2(-6.0), vec2(6.0)) * rcp;

    vec3 rgbA = 0.5 * (
      texture2D(tex, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
      texture2D(tex, uv + dir * (2.0 / 3.0 - 0.5)).rgb
    );
    vec3 rgbB = rgbA * 0.5 + 0.25 * (
      texture2D(tex, uv + dir * -0.5).rgb +
      texture2D(tex, uv + dir * 0.5).rgb
    );

    float lumaB = fxaaLuma(rgbB);
    if (lumaB < lumaMin || lumaB > lumaMax) {
      return rgbA;
    }
    return rgbB;
  }

  void main() {
    vec2 uv = curveUv(vUv, uCurvature);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.012, 0.015, 0.014, 1.0);
      return;
    }

    // VHS horizontal tracking micro-wobble
    if (uMode > 1.5 && uMode < 2.5) {
      float band = sin(uv.y * 28.0 + uTime * 9.0);
      float tear = smoothstep(0.92, 1.0, sin(uv.y * 5.0 - uTime * 2.2));
      uv.x += (band * 0.0008 + tear * 0.0045 * sin(uTime * 37.0));
    }

    // Edge-directed FXAA anti-aliasing + subtle NTSC chroma bleed
    vec3 col = sampleFxaa(tDiffuse, uv, uRenderRes);
    float chromaOffset = (uMode > 1.5 && uMode < 2.5) ? 0.0022 : (uMode < 2.5 ? 0.00035 : 0.0);
    if (chromaOffset > 0.0) {
      float r = texture2D(tDiffuse, uv + vec2(chromaOffset, 0.0)).r;
      float b = texture2D(tDiffuse, uv - vec2(chromaOffset, 0.0)).b;
      col.r = mix(col.r, r, 0.55);
      col.b = mix(col.b, b, 0.55);
    }

    // Slight PS2 horizontal DAC blend without re-introducing stair-step aliasing
    if (uMode < 2.5) {
      vec2 texel = vec2(1.0 / max(uRenderRes.x, 1.0), 0.0);
      vec3 leftCol = texture2D(tDiffuse, uv - texel * 0.35).rgb;
      vec3 rightCol = texture2D(tDiffuse, uv + texel * 0.35).rgb;
      col = mix(col, (leftCol + rightCol) * 0.5, 0.14);
    }

    // Lift shadow detail cleanly while rolling off bright highlights so neither dark corners nor beam centers clip
    if (uMode < 2.5) {
      col = max(col, vec3(0.0));
      col = (col * 1.32 + vec3(0.012)) / (vec3(1.0) + col * 0.28);
    } else {
      col = max(col, vec3(0.0));
      col = (col * 1.24 + vec3(0.008)) / (vec3(1.0) + col * 0.18);
    }

    // Grade by preset / IR Night Vision
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    if (uNightVision > 0.5) {
      float boosted = pow(clamp(luma * 2.25 + 0.03, 0.0, 1.0), 0.85);
      vec3 irCol = vec3(boosted * 0.34, boosted * 1.05, boosted * 0.44);
      col = mix(col, irCol, 0.92);
    } else if (uMode < 0.5) {
      // Silent Fog PS2: atmospheric ash-slate shadows + warm tungsten beam highlights
      vec3 shadowTint = vec3(0.95, 1.01, 0.97);
      vec3 hiTint = vec3(1.06, 0.98, 0.88);
      col *= mix(shadowTint, hiTint, smoothstep(0.08, 0.68, luma));
      col = mix(vec3(luma), col, 0.92);
    } else if (uMode > 1.5 && uMode < 2.5) {
      // VHS Cursed: colder cyan shadows + bruised contrast
      col = mix(vec3(luma), col, 0.84);
      col *= vec3(0.94, 0.98, 1.05);
    }

    float fade = clamp(uFade, 0.0, 1.0);
    col *= (1.0 - fade);

    // 4x4 Bayer ordered dithering + 15-bit PS2 color quantization
    vec2 pixelPos = floor(uv * uRenderRes);
    if (uDithering > 0.5) {
      float threshold = bayer4(pixelPos) - 0.5;
      float steps = max(uColorSteps, 8.0);
      col = clamp(col + threshold * (1.0 / steps), 0.0, 1.0);
      col = floor(col * steps + 0.5) / steps;
    }

    // Subtle CRT scanlines (steady phase to prevent 30Hz horizontal flicker on LCD screens)
    if (uScanlines > 0.5) {
      float lineCoord = uv.y * uRenderRes.y;
      float interlace = sin(lineCoord * 3.14159265 * 2.0);
      float scanMask = 1.0 - (0.06 + (uMode > 1.5 && uMode < 2.5 ? 0.04 : 0.0)) * (0.5 - 0.5 * interlace);
      col *= scanMask;
    }

    // Subtle analog grain
    float grainAmt = (uMode > 1.5 && uMode < 2.5) ? 0.055 : (uNightVision > 0.5 ? 0.045 : (uMode < 2.5 ? 0.022 : 0.008));
    float grain = (hash12(pixelPos + fract(uTime * 17.3) * 100.0) - 0.5) * grainAmt * (1.0 - fade);
    col += grain;

    // Gentle vignette + storm lightning glint
    vec2 distVec = uv - 0.5;
    float vig = 1.0 - dot(distVec, distVec) * (uMode < 2.5 ? 0.34 : 0.18);
    col *= clamp(vig, 0.58, 1.0);
    col += vec3(0.08, 0.1, 0.13) * uLightning * 0.45 * (1.0 - fade);
    col *= (1.0 - smoothstep(0.92, 1.0, fade));

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

export class Ps2Pipeline {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderTarget: THREE.WebGLRenderTarget;
  private postScene: THREE.Scene;
  private postCamera: THREE.OrthographicCamera;
  private postMaterial: THREE.ShaderMaterial;
  private quadMesh: THREE.Mesh;

  private viewportW = 1280;
  private viewportH = 720;
  private settings: Ps2Settings;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    initialSettings: Ps2Settings,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.settings = { ...initialSettings };

    const { rw, rh } = this.computeInternalResolution(
      renderer.domElement.clientWidth || window.innerWidth,
      renderer.domElement.clientHeight || window.innerHeight,
      initialSettings.resolution,
    );

    const msaaSamples = renderer.capabilities.isWebGL2
      ? Math.min(4, Math.max(0, renderer.capabilities.maxSamples || 0))
      : 0;
    const initialFilter = initialSettings.resolution === '320x240' ? THREE.NearestFilter : THREE.LinearFilter;

    this.renderTarget = new THREE.WebGLRenderTarget(rw, rh, {
      minFilter: initialFilter,
      magFilter: initialFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: msaaSamples,
    });
    this.renderTarget.texture.generateMipmaps = false;

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.postMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        uRenderRes: { value: new THREE.Vector2(rw, rh) },
        uScreenRes: { value: new THREE.Vector2(this.viewportW, this.viewportH) },
        uTime: { value: 0 },
        uDithering: { value: initialSettings.dithering ? 1 : 0 },
        uScanlines: { value: initialSettings.scanlines ? 1 : 0 },
        uColorSteps: { value: initialSettings.colorBits === 15 ? 31 : 255 },
        uCurvature: { value: initialSettings.crtCurvature },
        uMode: { value: this.presetToModeFloat(initialSettings.preset) },
        uNightVision: { value: initialSettings.visionMode === 'ir-camcorder' ? 1 : 0 },
        uLightning: { value: 0 },
        uFade: { value: 0 },
      },
      vertexShader: PS2_VERTEX_SHADER,
      fragmentShader: PS2_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    this.quadMesh = new THREE.Mesh(geo, this.postMaterial);
    this.quadMesh.frustumCulled = false;
    this.postScene.add(this.quadMesh);
  }

  private presetToModeFloat(preset: Ps2Settings['preset']): number {
    if (preset === 'silent-fog') return 0;
    if (preset === 'camcorder-480i') return 1;
    if (preset === 'vhs-cursed') return 2;
    return 3;
  }

  private computeInternalResolution(w: number, h: number, res: Ps2ResolutionId): { rw: number; rh: number } {
    const safeW = Math.max(1, w);
    const safeH = Math.max(1, h);
    const aspect = safeW / safeH;

    if (res === '320x240') {
      const rh = 240;
      return { rw: Math.max(240, Math.round(rh * aspect)), rh };
    }
    if (res === '512x448') {
      const rh = 448;
      return { rw: Math.max(384, Math.round(rh * aspect)), rh };
    }
    if (res === '640x448') {
      const rh = 448;
      return { rw: Math.max(480, Math.round(rh * aspect)), rh };
    }
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    return {
      rw: Math.max(320, Math.round(safeW * pr)),
      rh: Math.max(240, Math.round(safeH * pr)),
    };
  }

  applySettings(next: Ps2Settings): void {
    const resChanged = next.resolution !== this.settings.resolution;
    this.settings = { ...next };

    this.postMaterial.uniforms.uDithering.value = next.dithering ? 1 : 0;
    this.postMaterial.uniforms.uScanlines.value = next.scanlines ? 1 : 0;
    this.postMaterial.uniforms.uColorSteps.value = next.colorBits === 15 ? 31 : 255;
    this.postMaterial.uniforms.uCurvature.value = next.crtCurvature;
    this.postMaterial.uniforms.uMode.value = this.presetToModeFloat(next.preset);
    this.postMaterial.uniforms.uNightVision.value = next.visionMode === 'ir-camcorder' ? 1 : 0;

    if (resChanged) {
      this.setSize(this.viewportW, this.viewportH);
    }
  }

  setSize(width: number, height: number): void {
    this.viewportW = Math.max(1, width);
    this.viewportH = Math.max(1, height);

    const { rw, rh } = this.computeInternalResolution(this.viewportW, this.viewportH, this.settings.resolution);
    const filter = this.settings.resolution === '320x240' ? THREE.NearestFilter : THREE.LinearFilter;

    this.renderTarget.texture.minFilter = filter;
    this.renderTarget.texture.magFilter = filter;
    this.renderTarget.setSize(rw, rh);
    this.postMaterial.uniforms.uRenderRes.value.set(rw, rh);
    this.postMaterial.uniforms.uScreenRes.value.set(this.viewportW, this.viewportH);
  }

  setMood(elapsed: number, lightning: number): void {
    this.postMaterial.uniforms.uTime.value = elapsed;
    this.postMaterial.uniforms.uLightning.value = lightning;
  }

  setFade(fade: number): void {
    this.postMaterial.uniforms.uFade.value = THREE.MathUtils.clamp(fade, 0, 1);
  }

  render(): void {
    this.renderScene(this.scene, this.camera);
  }

  renderScene(scene: THREE.Scene, camera: THREE.Camera): void {
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    this.renderer.setRenderTarget(prevTarget);
    this.renderer.render(this.postScene, this.postCamera);
  }

  dispose(): void {
    this.renderTarget.dispose();
    this.quadMesh.geometry.dispose();
    this.postMaterial.dispose();
  }
}
