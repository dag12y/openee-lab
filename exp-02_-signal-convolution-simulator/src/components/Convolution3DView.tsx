import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Eye, Maximize2, Minimize2 } from 'lucide-react';
import {
  CONTINUOUS_DOMAIN_MAX,
  CONTINUOUS_DOMAIN_MIN,
  ContinuousSignalParams,
  defaultContinuousH,
  defaultContinuousX,
  evalContinuousConvolutionAt,
  evalContinuousRegular,
  sampleContinuousOutput,
  sampleContinuousSignal,
} from '../math/convolution';
import { ContinuousSignalControls } from './SignalControls';

type CameraViewPreset = 'orbit' | 'slice' | 'output' | 'top';

interface Convolution3DViewProps {
  xParams: ContinuousSignalParams;
  hParams: ContinuousSignalParams;
  tValue: number;
  onChangeX: (next: ContinuousSignalParams) => void;
  onChangeH: (next: ContinuousSignalParams) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const GRID_RES = 145;
const STAGE_MIN = CONTINUOUS_DOMAIN_MIN; // -6
const STAGE_MAX = CONTINUOUS_DOMAIN_MAX; // +6
const STAGE_SPAN = STAGE_MAX - STAGE_MIN; // 12
const RIBBON_OFFSET = 6.45;
const RAIL_Y = 0.14;
const SURFACE_Y_SCALE = 1.25;
const RIBBON_Y_SCALE = 1.05;

// Pre-allocated scratch math helpers (zero GC inside render loop)
const _color = new THREE.Color();
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _projVec = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createStageGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Matte medium-slate stage pad inside rails matching reference visual contrast
  ctx.fillStyle = '#5B6475';
  ctx.fillRect(0, 0, size, size);

  const pad = 28;
  const spanPx = size - pad * 2;
  const toPx = (u: number) => pad + ((u - STAGE_MIN) / STAGE_SPAN) * spanPx;

  // Grid lines every 1 unit
  for (let i = STAGE_MIN; i <= STAGE_MAX; i += 1) {
    const p = toPx(i);
    const isZero = i === 0;
    const isBorder = Math.abs(i) === 6;
    ctx.strokeStyle = isZero
      ? 'rgba(226, 232, 240, 0.38)'
      : isBorder
        ? 'rgba(226, 232, 240, 0.30)'
        : 'rgba(226, 232, 240, 0.16)';
    ctx.lineWidth = isZero ? 2.2 : 1.2;

    // Vertical (tau)
    ctx.beginPath();
    ctx.moveTo(p, pad);
    ctx.lineTo(p, size - pad);
    ctx.stroke();

    // Horizontal (t)
    ctx.beginPath();
    ctx.moveTo(pad, p);
    ctx.lineTo(size - pad, p);
    ctx.stroke();
  }

  // Subtle coordinate tick labels with "s" suffix along borders
  ctx.fillStyle = 'rgba(226, 232, 240, 0.52)';
  ctx.font = '600 18px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let i = -4; i <= 4; i += 2) {
    if (i === 0) continue;
    const label = `${i > 0 ? '+' : ''}${i}s`;
    ctx.fillText(label, toPx(i), size - pad - 4);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = -4; i <= 4; i += 2) {
    if (i === 0) continue;
    const label = `${i > 0 ? '+' : ''}${i}s`;
    ctx.fillText(label, size - pad - 6, toPx(i));
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

function createRibbonMaterial(colorHex: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function updateRibbonGeometry(
  ribbonGeo: THREE.BufferGeometry,
  lineGeo: THREE.BufferGeometry,
  coords: number[],
  values: number[],
  axis: 'x' | 'z',
  fixedCoord: number,
  yScale: number,
  baseY: number,
) {
  const n = coords.length;
  const ribbonPos = ribbonGeo.getAttribute('position') as THREE.BufferAttribute;
  const linePos = lineGeo.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < n; i++) {
    const c = coords[i];
    const h = baseY + values[i] * yScale;
    const x = axis === 'x' ? c : fixedCoord;
    const z = axis === 'z' ? c : fixedCoord;

    ribbonPos.setXYZ(i * 2, x, baseY, z);
    ribbonPos.setXYZ(i * 2 + 1, x, h, z);
    linePos.setXYZ(i, x, h, z);
  }
  ribbonPos.needsUpdate = true;
  linePos.needsUpdate = true;
  ribbonGeo.computeBoundingSphere();
  lineGeo.computeBoundingSphere();
}

export const Convolution3DView: React.FC<Convolution3DViewProps> = ({
  xParams,
  hParams,
  tValue,
  onChangeX,
  onChangeH,
  isExpanded = false,
  onToggleExpand,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [activeCam, setActiveCam] = useState<CameraViewPreset>('orbit');
  const [controlsOpen, setControlsOpen] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);

  // DOM refs for projected 3D callout badges (updated inside Three.js render without React re-renders)
  const sliceCalloutRef = useRef<HTMLDivElement | null>(null);
  const hCalloutRef = useRef<HTMLDivElement | null>(null);
  const xCalloutRef = useRef<HTMLDivElement | null>(null);
  const yCalloutRef = useRef<HTMLDivElement | null>(null);

  // Live readout for top-left HUD
  const convResult = evalContinuousConvolutionAt(tValue, xParams, hParams, 2400);
  const hasDoubleImpulse = xParams.preset === 'impulse' && hParams.preset === 'impulse';
  const yReadout = hasDoubleImpulse && convResult.impulse
    ? Math.abs(tValue - convResult.impulse.position) < 0.06
      ? `${convResult.impulse.weight.toFixed(2)} δ`
      : '0.000'
    : `${convResult.value >= 0 ? '+' : ''}${convResult.value.toFixed(3)}`;

  const sceneControllerRef = useRef<{
    updateSurfaceAndRibbons: (
      x: ContinuousSignalParams,
      h: ContinuousSignalParams,
      t: number,
    ) => void;
    updateTimeSlice: (
      x: ContinuousSignalParams,
      h: ContinuousSignalParams,
      t: number,
    ) => void;
    setCameraView: (view: CameraViewPreset) => void;
  } | null>(null);

  const latestPropsRef = useRef({ xParams, hParams, tValue });
  latestPropsRef.current = { xParams, hParams, tValue };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL context could not be initialized in this browser.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.localClippingEnabled = true;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initW = container.clientWidth || 1200;
    const initH = container.clientHeight || 680;
    renderer.setSize(initW, initH);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost. Reloading view...');
    };
    const handleContextRestored = () => {
      setWebglError(null);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04070e);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.1, 140);
    camera.position.set(14.2, 7.6, 9.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.target.set(0, -0.55, 0.15);
    controls.minDistance = 6;
    controls.maxDistance = 32;
    controls.maxPolarAngle = Math.PI * 0.49;

    // 3-Point Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.45);
    keyLight.position.set(7, 16, 10);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -9;
      keyLight.shadow.camera.right = 9;
      keyLight.shadow.camera.top = 9;
      keyLight.shadow.camera.bottom = -9;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.65);
    rimLight.position.set(-10, 8, -10);
    scene.add(rimLight);

    // --- 1. Slate Table Base + Inner Light-Slate Grid Pad + Corner Bollards & Rails ---
    const stageGroup = new THREE.Group();
    const slabGeo = new THREE.BoxGeometry(STAGE_SPAN + 3.2, 0.36, STAGE_SPAN + 3.2);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x2b3242,
      roughness: 0.78,
      metalness: 0.14,
    });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.y = -0.18;
    slabMesh.receiveShadow = !isSoftwareGl;
    stageGroup.add(slabMesh);

    const gridTex = createStageGridTexture(renderer.capabilities.getMaxAnisotropy());
    const gridPlaneGeo = new THREE.PlaneGeometry(STAGE_SPAN + 0.5, STAGE_SPAN + 0.5);
    gridPlaneGeo.rotateX(-Math.PI / 2);
    const gridPlaneMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const gridPlaneMesh = new THREE.Mesh(gridPlaneGeo, gridPlaneMat);
    gridPlaneMesh.position.y = 0.004;
    stageGroup.add(gridPlaneMesh);

    // Metallic corner bollards + cylindrical perimeter rails
    const postBodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.7,
    });
    const postCapMat = new THREE.MeshStandardMaterial({
      color: 0xdbe4ee,
      roughness: 0.25,
      metalness: 0.85,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.28,
      metalness: 0.82,
    });

    const postBodyGeo = new THREE.CylinderGeometry(0.16, 0.19, 0.28, 24);
    const postCapGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24);
    const cornerCoords: [number, number][] = [
      [-RIBBON_OFFSET, -RIBBON_OFFSET],
      [RIBBON_OFFSET, -RIBBON_OFFSET],
      [-RIBBON_OFFSET, RIBBON_OFFSET],
      [RIBBON_OFFSET, RIBBON_OFFSET],
    ];
    for (const [cx, cz] of cornerCoords) {
      const body = new THREE.Mesh(postBodyGeo, postBodyMat);
      body.position.set(cx, 0.14, cz);
      stageGroup.add(body);

      const cap = new THREE.Mesh(postCapGeo, postCapMat);
      cap.position.set(cx, 0.29, cz);
      stageGroup.add(cap);
    }

    const railLen = RIBBON_OFFSET * 2;
    const railXGeo = new THREE.CylinderGeometry(0.045, 0.045, railLen, 14);
    railXGeo.rotateZ(Math.PI / 2);
    const railZGeo = new THREE.CylinderGeometry(0.045, 0.045, railLen, 14);
    railZGeo.rotateX(Math.PI / 2);

    const railBack = new THREE.Mesh(railXGeo, railMat);
    railBack.position.set(0, RAIL_Y, -RIBBON_OFFSET);
    stageGroup.add(railBack);

    const railFront = new THREE.Mesh(railXGeo, railMat);
    railFront.position.set(0, RAIL_Y, RIBBON_OFFSET);
    stageGroup.add(railFront);

    const railLeft = new THREE.Mesh(railZGeo, railMat);
    railLeft.position.set(-RIBBON_OFFSET, RAIL_Y, 0);
    stageGroup.add(railLeft);

    const railRight = new THREE.Mesh(railZGeo, railMat);
    railRight.position.set(RIBBON_OFFSET, RAIL_Y, 0);
    stageGroup.add(railRight);

    scene.add(stageGroup);

    // --- 2. Hardware Clipping Plane at active time slice t ---
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), latestPropsRef.current.tValue);

    // --- 3. 3D Integrand Surface (Translucent Cream-Gold Sheet + Slice Ribs) ---
    const surfaceGeo = new THREE.BufferGeometry();
    const vertCount = GRID_RES * GRID_RES;
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices: number[] = [];

    for (let r = 0; r < GRID_RES; r++) {
      const t = STAGE_MIN + (r / (GRID_RES - 1)) * STAGE_SPAN;
      for (let c = 0; c < GRID_RES; c++) {
        const tau = STAGE_MIN + (c / (GRID_RES - 1)) * STAGE_SPAN;
        const idx = (r * GRID_RES + c) * 3;
        positions[idx] = tau;
        positions[idx + 1] = 0;
        positions[idx + 2] = t;
      }
    }

    for (let r = 0; r < GRID_RES - 1; r++) {
      for (let c = 0; c < GRID_RES - 1; c++) {
        const a = r * GRID_RES + c;
        const b = a + 1;
        const d = (r + 1) * GRID_RES + c;
        const e = d + 1;
        indices.push(a, d, b);
        indices.push(b, d, e);
      }
    }

    surfaceGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    surfaceGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    surfaceGeo.setIndex(indices);

    const surfaceMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.52,
      roughness: 0.35,
      metalness: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      clippingPlanes: [clipPlane],
      clipShadows: false,
    });

    surfaceMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vStagePos;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vStagePos = position;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vStagePos;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.a *= smoothstep(0.008, 0.055, abs(vStagePos.y));`,
        );
    };

    const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    surfaceMesh.renderOrder = 2;
    scene.add(surfaceMesh);

    // Crisp translucent slice contour ribs along the 3D integrand surface
    const ribsGeo = new THREE.BufferGeometry();
    ribsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    const ribsMat = new THREE.LineBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.56,
      clippingPlanes: [clipPlane],
    });
    const ribsLines = new THREE.LineSegments(ribsGeo, ribsMat);
    ribsLines.renderOrder = 3;
    scene.add(ribsLines);

    // --- 4. Active Slice Face (Amber Overlap Fill) + Ghost Cyan x(tau) Frame at Z = t ---
    const SLICE_SAMPLES = 161;
    const sliceFaceGeo = new THREE.BufferGeometry();
    const sliceFaceVerts = new Float32Array(SLICE_SAMPLES * 2 * 3);
    const sliceFaceIdx: number[] = [];
    for (let i = 0; i < SLICE_SAMPLES - 1; i++) {
      const i0 = i * 2;
      sliceFaceIdx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
    sliceFaceGeo.setAttribute('position', new THREE.BufferAttribute(sliceFaceVerts, 3));
    sliceFaceGeo.setIndex(sliceFaceIdx);

    const sliceFaceMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const sliceFaceMesh = new THREE.Mesh(sliceFaceGeo, sliceFaceMat);
    sliceFaceMesh.renderOrder = 4;
    scene.add(sliceFaceMesh);

    const sliceLineGeo = new THREE.BufferGeometry();
    sliceLineGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(SLICE_SAMPLES * 3), 3),
    );
    const sliceLineMat = new THREE.LineBasicMaterial({ color: 0xfde047 });
    const sliceLine = new THREE.Line(sliceLineGeo, sliceLineMat);
    sliceLine.renderOrder = 5;
    scene.add(sliceLine);

    // Ghost wireframe of x(tau) standing at Z = currentT
    const ghostXGeo = new THREE.BufferGeometry();
    ghostXGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(SLICE_SAMPLES * 3), 3),
    );
    const ghostXMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const ghostXLine = new THREE.Line(ghostXGeo, ghostXMat);
    ghostXLine.renderOrder = 5;
    scene.add(ghostXLine);

    // Golden-yellow active slice guide line spanning left rail -> stage -> right rail
    const sliceGuideGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-RIBBON_OFFSET, RAIL_Y, 0),
      new THREE.Vector3(-STAGE_SPAN / 2 - 0.15, 0.025, 0),
      new THREE.Vector3(STAGE_SPAN / 2 + 0.15, 0.025, 0),
      new THREE.Vector3(RIBBON_OFFSET, RAIL_Y, 0),
    ]);
    const sliceGuideLine = new THREE.Line(
      sliceGuideGeo,
      new THREE.LineBasicMaterial({ color: 0xfacc15 }),
    );
    sliceGuideLine.renderOrder = 4;
    scene.add(sliceGuideLine);

    // --- 5. Perimeter Signal Ribbons: h(tau) Left, x(tau) Back, y(t) Right ---
    const RIBBON_SAMPLES = 161;
    const makeRibbonPair = (fillColor: number, lineColor: number, fillOpacity: number) => {
      const rGeo = new THREE.BufferGeometry();
      rGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(RIBBON_SAMPLES * 2 * 3), 3),
      );
      const rIdx: number[] = [];
      for (let i = 0; i < RIBBON_SAMPLES - 1; i++) {
        const a = i * 2;
        rIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      rGeo.setIndex(rIdx);
      const rMesh = new THREE.Mesh(rGeo, createRibbonMaterial(fillColor, fillOpacity));
      rMesh.renderOrder = 1;

      const lGeo = new THREE.BufferGeometry();
      lGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(RIBBON_SAMPLES * 3), 3),
      );
      const lLine = new THREE.Line(lGeo, new THREE.LineBasicMaterial({ color: lineColor }));
      lLine.renderOrder = 2;

      scene.add(rMesh);
      scene.add(lLine);
      return { rGeo, lGeo, rMesh, lLine };
    };

    // h(tau) along Left edge X = -RIBBON_OFFSET (Orange)
    const hRibbon = makeRibbonPair(0xf59e0b, 0xfb923c, 0.36);
    // x(tau) along Back edge Z = -RIBBON_OFFSET (Cyan)
    const xRibbon = makeRibbonPair(0x22d3ee, 0x67e8f9, 0.30);
    // y(t) output along Right edge X = +RIBBON_OFFSET (Violet-Purple)
    const yRibbon = makeRibbonPair(0xc084fc, 0xd8b4fe, 0.42);

    // Active Slice t Yellow Cube on Left rail
    const sliceCubeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.22, 0.28),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.65,
        roughness: 0.25,
      }),
    );
    sliceCubeMesh.renderOrder = 5;
    scene.add(sliceCubeMesh);

    // Output y(t) Saturn-style Glowing Sphere + Ring Marker on Right ribbon
    const yMarkerGroup = new THREE.Group();
    const ySphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.20, 20, 20),
      new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xd97706,
        emissiveIntensity: 0.85,
        roughness: 0.2,
      }),
    );
    const yRingMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.30, 0.036, 12, 36),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.9,
        roughness: 0.2,
      }),
    );
    yRingMesh.rotation.set(Math.PI * 0.32, Math.PI * 0.25, 0);
    yMarkerGroup.add(ySphereMesh);
    yMarkerGroup.add(yRingMesh);
    yMarkerGroup.renderOrder = 6;
    scene.add(yMarkerGroup);

    // --- 6. Anchor Coordinates for Projected Floating Callouts ---
    const anchors = {
      slice: new THREE.Vector3(-RIBBON_OFFSET, RAIL_Y + 0.14, 0),
      h: new THREE.Vector3(-RIBBON_OFFSET, RAIL_Y + 1.0, 0),
      x: new THREE.Vector3(0, RAIL_Y + 1.0, -RIBBON_OFFSET),
      y: new THREE.Vector3(RIBBON_OFFSET, RAIL_Y + 1.0, 1.0),
    };

    const projectCallout = (
      el: HTMLDivElement | null,
      worldPos: THREE.Vector3,
      w: number,
      h: number,
    ) => {
      if (!el) return;
      _projVec.copy(worldPos).project(camera);
      if (_projVec.z < -1 || _projVec.z > 1) {
        el.style.opacity = '0';
        return;
      }
      const sx = (_projVec.x * 0.5 + 0.5) * w;
      const sy = (-_projVec.y * 0.5 + 0.5) * h;
      if (sx < -60 || sx > w + 60 || sy < 20 || sy > h + 40) {
        el.style.opacity = '0';
        return;
      }
      el.style.opacity = '1';
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
    };

    const updateAllCallouts = () => {
      const w = container.clientWidth || initW;
      const h = container.clientHeight || initH;
      projectCallout(sliceCalloutRef.current, anchors.slice, w, h);
      projectCallout(hCalloutRef.current, anchors.h, w, h);
      projectCallout(xCalloutRef.current, anchors.x, w, h);
      projectCallout(yCalloutRef.current, anchors.y, w, h);
    };

    // --- 7. Render Loop & Camera Transition Management ---
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let camTransition: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
    let lastClockTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        const now = performance.now();
        const delta = Math.min(0.05, Math.max(0.001, (now - lastClockTime) / 1000));
        lastClockTime = now;

        let keepAnimating = false;
        if (camTransition) {
          const lambda = 7.5;
          camera.position.x = THREE.MathUtils.damp(camera.position.x, camTransition.pos.x, lambda, delta);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, camTransition.pos.y, lambda, delta);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, camTransition.pos.z, lambda, delta);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, camTransition.target.x, lambda, delta);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, camTransition.target.y, lambda, delta);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, camTransition.target.z, lambda, delta);

          const dist =
            camera.position.distanceTo(camTransition.pos) +
            controls.target.distanceTo(camTransition.target);
          if (dist < 0.04) {
            camera.position.copy(camTransition.pos);
            controls.target.copy(camTransition.target);
            camTransition = null;
          } else {
            keepAnimating = true;
          }
        }

        controls.update();
        renderer.render(scene, camera);
        updateAllCallouts();

        const done = () => {
          renderBusy = false;
          if (renderDirty || keepAnimating) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    const onControlsChange = () => requestRender();
    const onControlsStart = () => {
      camTransition = null;
    };
    controls.addEventListener('change', onControlsChange);
    controls.addEventListener('start', onControlsStart);

    // --- 8. Scene Update Functions ---
    let cachedMaxSurface = 1;
    let cachedMaxHAbs = 1;
    const aaOffsets = [-0.105, -0.07, -0.035, 0, 0.035, 0.07, 0.105];

    const eval3DAntiAliased = (arg: number, p: ContinuousSignalParams) => {
      if (p.preset === 'impulse') {
        const d = arg - p.shift;
        return p.amplitude * Math.exp(-(d * d) / (2 * 0.22 * 0.22));
      }
      if (p.preset === 'rect' || p.preset === 'double' || p.preset === 'bipolar' || p.preset === 'exp') {
        let acc = 0;
        for (let k = 0; k < aaOffsets.length; k++) {
          acc += evalContinuousRegular(arg + aaOffsets[k], p);
        }
        return acc / aaOffsets.length;
      }
      return evalContinuousRegular(arg, p);
    };

    const updateTimeSlice = (
      x: ContinuousSignalParams,
      h: ContinuousSignalParams,
      t: number,
    ) => {
      const clampedT = Math.max(STAGE_MIN, Math.min(STAGE_MAX, t));
      clipPlane.constant = clampedT;

      const sPos = sliceFaceGeo.getAttribute('position') as THREE.BufferAttribute;
      const lPos = sliceLineGeo.getAttribute('position') as THREE.BufferAttribute;
      const gPos = ghostXGeo.getAttribute('position') as THREE.BufferAttribute;
      const normScale = SURFACE_Y_SCALE / Math.max(0.5, cachedMaxSurface);
      const ghostScale = normScale * Math.max(0.4, cachedMaxHAbs);

      for (let i = 0; i < SLICE_SAMPLES; i++) {
        const tau = STAGE_MIN + (i / (SLICE_SAMPLES - 1)) * STAGE_SPAN;
        const xVal = eval3DAntiAliased(tau, x);
        const val = xVal * eval3DAntiAliased(clampedT - tau, h);
        const yH = val * normScale;
        const xGhostY = 0.02 + xVal * ghostScale;

        sPos.setXYZ(i * 2, tau, 0.015, clampedT);
        sPos.setXYZ(i * 2 + 1, tau, yH, clampedT);
        lPos.setXYZ(i, tau, yH, clampedT);
        gPos.setXYZ(i, tau, xGhostY, clampedT);
      }
      sPos.needsUpdate = true;
      lPos.needsUpdate = true;
      gPos.needsUpdate = true;
      sliceFaceGeo.computeBoundingSphere();
      sliceLineGeo.computeBoundingSphere();
      ghostXGeo.computeBoundingSphere();

      // Update cross-stage yellow guide line
      const guidePos = sliceGuideGeo.getAttribute('position') as THREE.BufferAttribute;
      guidePos.setXYZ(0, -RIBBON_OFFSET, RAIL_Y, clampedT);
      guidePos.setXYZ(1, -STAGE_SPAN / 2 - 0.15, 0.025, clampedT);
      guidePos.setXYZ(2, STAGE_SPAN / 2 + 0.15, 0.025, clampedT);
      guidePos.setXYZ(3, RIBBON_OFFSET, RAIL_Y, clampedT);
      guidePos.needsUpdate = true;

      // Update yellow cube on Left rail
      sliceCubeMesh.position.set(-RIBBON_OFFSET, RAIL_Y + 0.03, clampedT);
      anchors.slice.set(-RIBBON_OFFSET, RAIL_Y + 0.15, clampedT);

      // Update Saturn ring + sphere marker on Right y(t) ribbon
      const yAtT = evalContinuousConvolutionAt(clampedT, x, h, 1600).value;
      const yMarkerH = RAIL_Y + Math.max(-2.5, Math.min(3.2, yAtT * RIBBON_Y_SCALE * 0.78));
      yMarkerGroup.position.set(RIBBON_OFFSET, yMarkerH, clampedT);
      anchors.y.set(RIBBON_OFFSET, yMarkerH + 0.2, clampedT);

      requestRender();
    };

    const updateSurfaceAndRibbons = (
      x: ContinuousSignalParams,
      h: ContinuousSignalParams,
      t: number,
    ) => {
      const heights = new Float32Array(GRID_RES * GRID_RES);
      let maxAbsHeight = 0.001;

      for (let row = 0; row < GRID_RES; row++) {
        const tCoord = STAGE_MIN + (row / (GRID_RES - 1)) * STAGE_SPAN;
        for (let col = 0; col < GRID_RES; col++) {
          const tauCoord = STAGE_MIN + (col / (GRID_RES - 1)) * STAGE_SPAN;
          const val = eval3DAntiAliased(tauCoord, x) * eval3DAntiAliased(tCoord - tauCoord, h);
          heights[row * GRID_RES + col] = val;
          const absV = Math.abs(val);
          if (absV > maxAbsHeight) maxAbsHeight = absV;
        }
      }

      cachedMaxSurface = maxAbsHeight;
      const normScale = SURFACE_Y_SCALE / Math.max(0.5, maxAbsHeight);

      const posAttr = surfaceGeo.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = surfaceGeo.getAttribute('color') as THREE.BufferAttribute;

      for (let i = 0; i < heights.length; i++) {
        const rawH = heights[i];
        const scaledY = rawH * normScale;
        posAttr.setY(i, scaledY);

        const ratio = Math.max(-1, Math.min(1, rawH / Math.max(0.35, maxAbsHeight)));
        if (ratio >= 0) {
          // Warm amber-gold -> pale sunlit cream-yellow
          _color.setRGB(
            THREE.MathUtils.lerp(0.95, 1.0, ratio),
            THREE.MathUtils.lerp(0.75, 0.94, ratio),
            THREE.MathUtils.lerp(0.30, 0.68, ratio),
          );
        } else {
          // Cool ocean cyan for negative regions
          const nr = -ratio;
          _color.setRGB(
            THREE.MathUtils.lerp(0.18, 0.45, nr),
            THREE.MathUtils.lerp(0.65, 0.88, nr),
            THREE.MathUtils.lerp(0.88, 0.98, nr),
          );
        }
        colAttr.setXYZ(i, _color.r, _color.g, _color.b);
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      surfaceGeo.computeVertexNormals();
      surfaceGeo.computeBoundingSphere();

      // Closely spaced translucent t-slice contour ribs across surface
      const ribVerts: number[] = [];
      for (let row = 0; row < GRID_RES; row += 3) {
        const tCoord = STAGE_MIN + (row / (GRID_RES - 1)) * STAGE_SPAN;
        for (let col = 0; col < GRID_RES - 1; col++) {
          const y0 = heights[row * GRID_RES + col] * normScale;
          const y1 = heights[row * GRID_RES + col + 1] * normScale;
          if (Math.abs(y0) > 0.015 || Math.abs(y1) > 0.015) {
            const tau0 = STAGE_MIN + (col / (GRID_RES - 1)) * STAGE_SPAN;
            const tau1 = STAGE_MIN + ((col + 1) / (GRID_RES - 1)) * STAGE_SPAN;
            ribVerts.push(tau0, y0 + 0.006, tCoord, tau1, y1 + 0.006, tCoord);
          }
        }
      }
      ribsGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(ribVerts), 3),
      );
      ribsGeo.computeBoundingSphere();

      // Left Ribbon: Impulse h(tau) at X = -RIBBON_OFFSET
      const hSample = sampleContinuousSignal(h, RIBBON_SAMPLES, STAGE_MIN, STAGE_MAX);
      let hMaxAbs = 0.2;
      let hPeakVal = 0;
      let hPeakTau = h.shift;
      const hVals = hSample.values.map((v, idx) => {
        const val = h.preset === 'impulse'
          ? h.amplitude * Math.exp(-((hSample.ts[idx] - h.shift) ** 2) / (2 * 0.2 * 0.2))
          : v;
        if (Math.abs(val) > hMaxAbs) hMaxAbs = Math.abs(val);
        if (val > hPeakVal || (hPeakVal === 0 && Math.abs(val) > 0.05)) {
          hPeakVal = val;
          hPeakTau = hSample.ts[idx];
        }
        return val;
      });
      cachedMaxHAbs = hMaxAbs;
      updateRibbonGeometry(hRibbon.rGeo, hRibbon.lGeo, hSample.ts, hVals, 'z', -RIBBON_OFFSET, RIBBON_Y_SCALE, RAIL_Y);
      anchors.h.set(-RIBBON_OFFSET, RAIL_Y + Math.max(0.35, hPeakVal * RIBBON_Y_SCALE), hPeakTau);

      // Back Ribbon: Input Signal x(tau) at Z = -RIBBON_OFFSET
      const xSample = sampleContinuousSignal(x, RIBBON_SAMPLES, STAGE_MIN, STAGE_MAX);
      let xPeakVal = 0;
      let xPeakTau = x.shift;
      const xVals = xSample.values.map((v, idx) => {
        const val = x.preset === 'impulse'
          ? x.amplitude * Math.exp(-((xSample.ts[idx] - x.shift) ** 2) / (2 * 0.2 * 0.2))
          : v;
        if (val > xPeakVal || (xPeakVal === 0 && Math.abs(val) > 0.05)) {
          xPeakVal = val;
          xPeakTau = xSample.ts[idx];
        }
        return val;
      });
      updateRibbonGeometry(xRibbon.rGeo, xRibbon.lGeo, xSample.ts, xVals, 'x', -RIBBON_OFFSET, RIBBON_Y_SCALE, RAIL_Y);
      anchors.x.set(xPeakTau, RAIL_Y + Math.max(0.35, xPeakVal * RIBBON_Y_SCALE), -RIBBON_OFFSET);

      // Right Ribbon: Output y(t) at X = +RIBBON_OFFSET
      const ySample = sampleContinuousOutput(x, h, RIBBON_SAMPLES, STAGE_MIN, STAGE_MAX);
      const yVals = ySample.values.map((v, idx) => {
        const val = x.preset === 'impulse' && h.preset === 'impulse' && ySample.impulses[0]
          ? ySample.impulses[0].weight * Math.exp(-((ySample.ts[idx] - ySample.impulses[0].position) ** 2) / (2 * 0.22 * 0.22))
          : v;
        return val;
      });
      updateRibbonGeometry(yRibbon.rGeo, yRibbon.lGeo, ySample.ts, yVals, 'z', RIBBON_OFFSET, RIBBON_Y_SCALE * 0.78, RAIL_Y);

      updateTimeSlice(x, h, t);
    };

    const setCameraView = (view: CameraViewPreset) => {
      switch (view) {
        case 'orbit':
          _targetPos.set(14.2, 7.6, 9.6);
          _targetLook.set(0, -0.55, 0.15);
          break;
        case 'slice':
          _targetPos.set(0, 3.8, 15.6);
          _targetLook.set(0, 0.2, 0);
          break;
        case 'output':
          _targetPos.set(15.6, 3.4, 0);
          _targetLook.set(1.5, 0.2, 0);
          break;
        case 'top':
          _targetPos.set(-0.65, 25.2, 0.04);
          _targetLook.set(0, 0, 0);
          break;
      }
      if (isSoftwareGl) {
        camera.position.copy(_targetPos);
        controls.target.copy(_targetLook);
        camTransition = null;
        requestRender();
      } else {
        camTransition = {
          pos: _targetPos.clone(),
          target: _targetLook.clone(),
        };
        requestRender();
      }
    };

    sceneControllerRef.current = {
      updateSurfaceAndRibbons,
      updateTimeSlice,
      setCameraView,
    };

    updateSurfaceAndRibbons(
      latestPropsRef.current.xParams,
      latestPropsRef.current.hParams,
      latestPropsRef.current.tValue,
    );

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.removeEventListener('change', onControlsChange);
      controls.removeEventListener('start', onControlsStart);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
          const renderable = obj as THREE.Mesh | THREE.Line;
          renderable.geometry?.dispose();
          if (Array.isArray(renderable.material)) {
            renderable.material.forEach((m) => m.dispose());
          } else {
            renderable.material?.dispose();
          }
        }
      });
      gridTex.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneControllerRef.current?.updateSurfaceAndRibbons(xParams, hParams, tValue);
  }, [xParams, hParams]);

  useEffect(() => {
    sceneControllerRef.current?.updateTimeSlice(xParams, hParams, tValue);
  }, [tValue]);

  const handleCameraPreset = (view: CameraViewPreset) => {
    setActiveCam(view);
    sceneControllerRef.current?.setCameraView(view);
  };

  const camButtons: { id: CameraViewPreset; label: string }[] = [
    { id: 'orbit', label: '3D Orbit' },
    { id: 'slice', label: 'τ-Slice View' },
    { id: 'output', label: 'Output y(t)' },
    { id: 'top', label: 'Top (τ, t)' },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#04070E]">
      {/* Dedicated empty Three.js WebGL mount container */}
      <div
        ref={mountRef}
        data-testid="threejs-stage"
        className="h-full w-full"
      />

      {webglError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/90 text-sm text-slate-200">
          {webglError}
        </div>
      )}

      {/* Projected 3D Callout Annotations with Vertical Leader Stems */}
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
        {/* 1. Active Slice t */}
        <div
          ref={sliceCalloutRef}
          className="absolute top-0 left-0 will-change-transform transition-opacity duration-150"
          style={{ opacity: 0 }}
        >
          <div
            className={`-translate-x-1/2 flex flex-col items-center ${
              activeCam === 'top' ? '-translate-y-1/2' : '-translate-y-full'
            }`}
          >
            <div className="rounded-lg border border-amber-400/80 bg-[#070b14]/95 px-3 py-1.5 text-center shadow-[0_0_14px_rgba(251,191,36,0.28)]">
              <div className="text-[11px] font-semibold text-amber-100 whitespace-nowrap">
                Active Slice t
              </div>
              <div className="font-mono-tabular text-[10px] text-amber-300/90 whitespace-nowrap">
                x(τ) · h(t − τ)
              </div>
            </div>
            {activeCam !== 'top' && <div className="h-14 w-px bg-slate-200/75" />}
          </div>
        </div>

        {/* 2. Impulse h(tau) */}
        <div
          ref={hCalloutRef}
          className="absolute top-0 left-0 will-change-transform transition-opacity duration-150"
          style={{ opacity: 0 }}
        >
          <div
            className={`-translate-x-1/2 flex flex-col items-center ${
              activeCam === 'top' ? 'translate-y-1.5' : '-translate-y-full'
            }`}
          >
            <div className="rounded-lg border border-rose-500/80 bg-[#070b14]/95 px-3 py-1.5 text-center shadow-[0_0_14px_rgba(244,63,94,0.28)]">
              <div className="text-[11px] font-semibold text-rose-100 whitespace-nowrap">
                Impulse h(τ)
              </div>
              <div className="text-[10px] text-rose-300/85 whitespace-nowrap">
                Reference shape
              </div>
            </div>
            {activeCam !== 'top' && <div className="h-28 w-px bg-slate-200/75" />}
          </div>
        </div>

        {/* 3. Input Signal x(tau) */}
        <div
          ref={xCalloutRef}
          className="absolute top-0 left-0 will-change-transform transition-opacity duration-150"
          style={{ opacity: 0 }}
        >
          <div
            className={`-translate-x-1/2 flex flex-col items-center ${
              activeCam === 'top' ? '-translate-y-1/2' : '-translate-y-full'
            }`}
          >
            <div className="rounded-lg border border-sky-400/80 bg-[#070b14]/95 px-3 py-1.5 text-center shadow-[0_0_14px_rgba(56,189,248,0.28)]">
              <div className="text-[11px] font-semibold text-sky-100 whitespace-nowrap">
                Input Signal x(τ)
              </div>
              <div className="text-[10px] text-sky-300/85 whitespace-nowrap">
                Along τ-axis
              </div>
            </div>
            {activeCam !== 'top' && <div className="h-16 w-px bg-slate-200/75" />}
          </div>
        </div>

        {/* 4. Output y(t) = (x * h)(t) */}
        <div
          ref={yCalloutRef}
          className="absolute top-0 left-0 will-change-transform transition-opacity duration-150"
          style={{ opacity: 0 }}
        >
          <div className="-translate-x-1/2 -translate-y-full flex flex-col items-center">
            <div className="rounded-xl border border-indigo-400/85 bg-[#070b14]/95 px-4 py-2 text-center shadow-[0_0_18px_rgba(129,140,248,0.34)]">
              <div className="text-xs font-semibold text-slate-100 whitespace-nowrap">
                Output y(t) = (x * h)(t)
              </div>
              <div className="text-[10px] text-indigo-300/90 whitespace-nowrap">
                Integral along slice
              </div>
            </div>
            {activeCam !== 'top' && <div className="h-8 w-px bg-slate-200/70" />}
          </div>
        </div>
      </div>

      {/* Top-Left Compact Live Readout Pill */}
      <div className="pointer-events-auto absolute top-4 left-4 z-10 inline-flex items-center gap-3 rounded-xl border border-slate-700/70 bg-[#080d17]/92 px-3.5 py-1.5 text-xs shadow-lg">
        <span className="font-semibold text-slate-100">3D Space (τ, t)</span>
        <span className="text-slate-600" aria-hidden="true">·</span>
        <span className="font-mono-tabular font-semibold text-amber-400">
          t = <span data-testid="hud3d-t-readout">{tValue >= 0 ? '+' : ''}{tValue.toFixed(2)}</span> s
        </span>
        <span className="text-slate-600" aria-hidden="true">·</span>
        <span className="font-mono-tabular font-semibold text-indigo-300">
          y(t) = <span data-testid="hud3d-y-readout">{yReadout}</span>
        </span>
      </div>

      {/* Top-Right Camera Viewpoint Bar + Expand Button */}
      <div
        role="group"
        aria-label="3D camera viewpoints"
        className="pointer-events-auto absolute top-4 right-4 z-10 flex flex-wrap items-center gap-1 rounded-xl border border-slate-700/70 bg-[#080d17]/92 p-1 shadow-lg"
      >
        <span className="px-1.5 text-slate-400" aria-hidden="true">
          <Eye className="h-3.5 w-3.5" />
        </span>
        {camButtons.map((btn) => {
          const active = activeCam === btn.id;
          return (
            <button
              key={btn.id}
              type="button"
              aria-pressed={active}
              onClick={() => handleCameraPreset(btn.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400 ${
                active
                  ? 'bg-white text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {btn.label}
            </button>
          );
        })}
        {onToggleExpand && (
          <>
            <div className="mx-0.5 h-4 w-px bg-slate-700/80" aria-hidden="true" />
            <button
              type="button"
              onClick={onToggleExpand}
              aria-pressed={isExpanded}
              aria-label={isExpanded ? 'Collapse 3D view' : 'Expand 3D view'}
              title={isExpanded ? 'Collapse view (Esc)' : 'Expand 3D view'}
              className="inline-flex items-center justify-center rounded-lg px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400"
            >
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </>
        )}
      </div>

      {/* Bottom-Center Collapsible Two-Column Signal Strip */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center px-3">
        <button
          type="button"
          aria-expanded={controlsOpen}
          onClick={() => setControlsOpen((v) => !v)}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 border-slate-700/80 bg-[#0b101b]/95 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {controlsOpen ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Hide Signals</span>
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span>Signal Controls</span>
            </>
          )}
        </button>

        {controlsOpen && (
          <div className="pointer-events-auto w-full max-w-[1060px] rounded-xl border border-slate-700/80 bg-[#0b101b]/95 px-4 py-2.5 shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
              <div>
                <ContinuousSignalControls
                  kind="x"
                  params={xParams}
                  onChange={onChangeX}
                  onReset={() => onChangeX(defaultContinuousX())}
                  dark
                  compact
                />
              </div>

              <div className="border-t border-slate-800 pt-2.5 md:border-t-0 md:border-l md:pt-0 md:pl-5">
                <ContinuousSignalControls
                  kind="h"
                  params={hParams}
                  onChange={onChangeH}
                  onReset={() => onChangeH(defaultContinuousH())}
                  dark
                  compact
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
