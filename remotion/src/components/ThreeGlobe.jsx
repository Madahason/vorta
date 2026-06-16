// Three.js 3D Globe — fully deterministic Remotion composition.
//
// DETERMINISM CONTRACT:
//   - Rotation is driven by `frame / fps * rotationSpeed` — never requestAnimationFrame.
//   - The renderer is created once (useRef) and reused across renders.
//   - No Date.now(), Math.random(), or external timers anywhere in this file.
//   - The scene is re-rendered exactly once per `frame` change via useEffect.

import { useRef, useEffect } from 'react';
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';
import * as THREE from 'three';

// Convert geographic coordinates to 3D Cartesian (sphere radius r)
function latLngToVec3(lat, lng, r = 1.02) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

// Deterministic point cloud seeded by a fixed sequence (no Math.random)
// Uses a Halton sequence for quasi-random uniform sphere coverage.
function halton(index, base) {
  let f = 1; let r = 0;
  let i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}

function buildDotCloud(count = 1200) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    // Fibonacci sphere distribution (deterministic)
    const theta = Math.acos(1 - 2 * (i + 0.5) / count);
    const phi   = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
    positions.push(
      Math.sin(theta) * Math.cos(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.sin(phi),
    );
  }
  return new Float32Array(positions);
}

export function ThreeGlobe({ scene }) {
  const canvasRef   = useRef(null);
  const threeRef    = useRef(null);  // holds { renderer, camera, scene3, globe, markers, dots }
  const frame       = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const markers      = scene?.globe_markers || [];
  const rotationSpeed = scene?.rotation_speed ?? 0.15;  // radians/second

  // ── Build Three.js scene once ──────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || threeRef.current) return;

    const canvas   = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);  // deterministic — no devicePixelRatio variance
    renderer.setClearColor(0x0a0a0a, 1);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 2.6);
    camera.lookAt(0, 0, 0);

    const scene3 = new THREE.Scene();

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene3.add(ambient);
    const dirLight = new THREE.DirectionalLight(0x8cb4ff, 1.1);
    dirLight.position.set(2, 2, 1);
    scene3.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0x3b5998, 0.4);
    rimLight.position.set(-2, -1, -1);
    scene3.add(rimLight);

    // Globe sphere
    const geo     = new THREE.SphereGeometry(1, 72, 72);
    const mat     = new THREE.MeshPhongMaterial({
      color:     0x0d1520,
      emissive:  0x0a0f1a,
      specular:  0x334466,
      shininess: 18,
    });
    const globe   = new THREE.Mesh(geo, mat);
    scene3.add(globe);

    // Atmosphere glow (additive blending shell)
    const atmoGeo = new THREE.SphereGeometry(1.06, 64, 64);
    const atmoMat = new THREE.MeshPhongMaterial({
      color:       0x1a3a6e,
      transparent: true,
      opacity:     0.12,
      side:        THREE.BackSide,
    });
    scene3.add(new THREE.Mesh(atmoGeo, atmoMat));

    // Dot cloud surface (land suggestion)
    const dotPositions = buildDotCloud(1600);
    const dotGeo  = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3));
    const dotMat  = new THREE.PointsMaterial({ color: 0x2a5298, size: 0.012, sizeAttenuation: true });
    const dots    = new THREE.Points(dotGeo, dotMat);
    scene3.add(dots);

    // Latitude/longitude grid lines
    const gridMat = new THREE.LineBasicMaterial({ color: 0x1a2a4a, transparent: true, opacity: 0.35 });
    const addCircle = (axis, angle) => {
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        if (axis === 'lat') {
          const r = Math.cos(angle); const y = Math.sin(angle);
          pts.push(new THREE.Vector3(r * Math.cos(t), y, r * Math.sin(t)));
        } else {
          pts.push(new THREE.Vector3(Math.cos(angle) * Math.cos(t), Math.sin(t), Math.sin(angle) * Math.cos(t)));
        }
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      scene3.add(new THREE.Line(g, gridMat));
    };
    [-60, -30, 0, 30, 60].forEach(deg => addCircle('lat', deg * Math.PI / 180));
    [0, 45, 90, 135].forEach(deg => addCircle('lng', deg * Math.PI / 180));

    // Markers
    const markerGroup = new THREE.Group();
    scene3.add(markerGroup);
    markers.forEach(({ lat, lng, label, color = '#3b82f6' }) => {
      const pos    = latLngToVec3(lat, lng);
      const col    = new THREE.Color(color);

      // Pulsing sphere at location
      const mGeo   = new THREE.SphereGeometry(0.018, 12, 12);
      const mMat   = new THREE.MeshBasicMaterial({ color: col });
      const mesh   = new THREE.Mesh(mGeo, mMat);
      mesh.position.copy(pos);
      markerGroup.add(mesh);

      // Halo ring
      const hGeo   = new THREE.RingGeometry(0.025, 0.038, 32);
      const hMat   = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
      const halo   = new THREE.Mesh(hGeo, hMat);
      halo.position.copy(pos.clone().multiplyScalar(1.001));
      halo.lookAt(new THREE.Vector3(0, 0, 0));
      markerGroup.add(halo);
    });

    threeRef.current = { renderer, camera, scene3, globe, dots, markerGroup };

    return () => {
      renderer.dispose();
      threeRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // run once — markers handled inside frame effect

  // ── Render deterministically on every frame ───────────────────────────────
  useEffect(() => {
    if (!threeRef.current) return;
    const { renderer, camera, scene3, globe, dots, markerGroup } = threeRef.current;

    const t = frame / fps;

    // Globe rotation — deterministic, no requestAnimationFrame
    const angle = t * rotationSpeed;
    globe.rotation.y = angle;
    dots.rotation.y  = angle;
    markerGroup.rotation.y = angle;

    // Marker pulse — sinusoidal scale driven by frame
    markerGroup.children.forEach((child, i) => {
      if (child.geometry?.type === 'SphereGeometry') {
        const pulse = 1 + 0.25 * Math.sin((frame / fps) * Math.PI * 2 * 0.8 + i * 1.2);
        child.scale.setScalar(pulse);
      }
    });

    renderer.render(scene3, camera);
  }, [frame, fps, rotationSpeed]);

  return (
    <AbsoluteFill style={{ background: '#0a0a0a' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </AbsoluteFill>
  );
}

export default ThreeGlobe;
