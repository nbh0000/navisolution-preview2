import * as THREE from '../vendor/three/three.module.min.js';

/** A rose-and-copper butterfly, modelled locally from curved wing membranes. */
export function createButterfly(container, options = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const resources = new Set();
  const own = resource => (resources.add(resource), resource);
  let renderer;
  let disposed = false;
  let paused = reduced.matches;
  let inView = true;
  let raf = 0;
  let previous = 0;
  let elapsed = 0;
  let dirty = true;
  let bounds;
  const mouse = new THREE.Vector2();
  const target = new THREE.Vector2();

  const fallback = () => {
    container.dataset.state = 'fallback';
    container.querySelector('canvas')?.remove();
    const toggle = container.closest('.n-cinematic')?.querySelector('.n-motion-toggle');
    if (toggle) toggle.hidden = true;
    options.onError?.();
  };
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    fallback();
    return { setPaused() {}, dispose() {} };
  }

  renderer.setClearColor(0x261b23, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;opacity:0';
  container.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  camera.position.set(0, 0.35, 10);
  camera.lookAt(0, 0.35, 0);

  // The reflections come from a small photographic light rig, not a network HDR.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#261b23');
  const boxes = [];
  const softbox = (w, h, xyz, color, intensity) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...xyz);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
    boxes.push(mesh);
  };
  softbox(8, 8, [-5, 6, 5], '#fff1df', 2.2);
  softbox(3, 9, [6, 1, 3], '#ebbdca', 1.6);
  softbox(9, 2, [0, -5, 3], '#e9c4a3', 1.3);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, 0.025, 0.1, 30);
  scene.environment = environment.texture;
  boxes.forEach(box => { box.geometry.dispose(); box.material.dispose(); });
  pmrem.dispose();

  const butterfly = new THREE.Group();
  scene.add(butterfly);
  const bodyMaterial = own(new THREE.MeshPhysicalMaterial({ color: '#71384a', metalness: 0.25, roughness: 0.57, clearcoat: 0.25, envMapIntensity: 0.7 }));
  const sphere = own(new THREE.SphereGeometry(1, 20, 14));
  const bodyPart = (scale, xyz, mat = bodyMaterial) => {
    const part = new THREE.Mesh(sphere, mat);
    part.scale.set(...scale);
    part.position.set(...xyz);
    butterfly.add(part);
    return part;
  };
  bodyPart([0.11, 0.34, 0.105], [0, 0.24, 0.06]);
  bodyPart([0.079, 0.56, 0.08], [0, -0.49, 0.04]);
  bodyPart([0.115, 0.12, 0.11], [0, 0.62, 0.07]);

  const antennaMaterial = own(new THREE.MeshStandardMaterial({ color: '#bd8c79', metalness: 0.55, roughness: 0.4 }));
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.045, 0.68, 0.06),
      new THREE.Vector3(side * 0.12, 0.9, 0.12),
      new THREE.Vector3(side * 0.28, 1.11, 0.15),
      new THREE.Vector3(side * 0.43, 1.17, 0.12),
    ]);
    butterfly.add(new THREE.Mesh(own(new THREE.TubeGeometry(curve, 22, 0.013, 5, false)), antennaMaterial));
    bodyPart([0.027, 0.044, 0.025], [side * 0.43, 1.17, 0.12], antennaMaterial);
  }

  const fore = forewingShape();
  const hind = hindwingShape();
  const wingMaterial = () => own(new THREE.MeshPhysicalMaterial({
    color: '#f5d5cd', metalness: 0.16, roughness: 0.42,
    clearcoat: 0.48, clearcoatRoughness: 0.3,
    iridescence: 0.25, iridescenceIOR: 1.3, iridescenceThicknessRange: [140, 280],
    sheen: 0.55, sheenColor: new THREE.Color('#edc4c4'), sheenRoughness: 0.6,
    side: THREE.DoubleSide, transparent: true, opacity: 0.94,
    envMapIntensity: 0.7, depthWrite: true,
  }));
  const foreMaterial = wingMaterial();
  const hindMaterial = wingMaterial();
  const foreGeometry = own(wingGeometry(fore, new THREE.Vector2(1.5, 0.8), false));
  const hindGeometry = own(wingGeometry(hind, new THREE.Vector2(1.0, -0.7), true));
  own(new THREE.TextureLoader().load(new URL('../img/bf3d/wings.webp', import.meta.url).href, texture => {
    if (disposed) { texture.dispose(); return; }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    for (const material of [foreMaterial, hindMaterial]) {
      material.color.set('#fff7f1');
      material.map = texture;
      material.bumpMap = texture;
      material.bumpScale = 0.035;
      material.alphaTest = 0.08;
      material.needsUpdate = true;
    }
    canvas.style.opacity = '1';
    invalidate();
  }, undefined, () => { api.dispose(); fallback(); }));
  const hinges = [];

  for (const side of [-1, 1]) {
    const wingPair = new THREE.Group();
    wingPair.scale.x = side;
    butterfly.add(wingPair);
    const rear = new THREE.Group();
    rear.position.z = -0.04;
    rear.add(new THREE.Mesh(hindGeometry, hindMaterial));
    wingPair.add(rear);
    const front = new THREE.Group();
    front.position.z = 0.025;
    front.add(new THREE.Mesh(foreGeometry, foreMaterial));
    wingPair.add(front);

    hinges.push({ pair: wingPair, rear, side });
  }

  scene.add(new THREE.AmbientLight('#e7c9cf', 0.9));
  const key = new THREE.DirectionalLight('#fff1db', 2.5);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#eaa9c1', 2.1);
  rim.position.set(4, 1, -2);
  scene.add(rim);
  const warm = new THREE.PointLight('#ffd5a8', 8, 15, 2);
  warm.position.set(1, -3, 3);
  scene.add(warm);

  function pose() {
    const flap = 0.32 + Math.sin(elapsed * 2.5) * 0.23;
    for (const { pair, rear, side } of hinges) {
      pair.rotation.y = -side * flap;
      rear.rotation.y = Math.sin(elapsed * 2.5 - 0.3) * 0.045;
    }
    butterfly.rotation.set(-0.2 + mouse.y * 0.15, -0.24 + mouse.x * 0.23, -0.31 + Math.sin(elapsed * 0.36) * 0.025);
    butterfly.position.set(Math.sin(elapsed * 0.3) * 0.04, Math.sin(elapsed * 0.62) * 0.085, 0);
    key.position.set(-3 + mouse.x * 2, 5 + mouse.y * 2, 5);
  }

  function resize() {
    if (disposed) return;
    bounds = container.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    inView = bounds.bottom > 0 && bounds.top < innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.25 : 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Preserve an airy margin around the wings, including their highest pose.
    const fitHeight = 6.3;
    const fitWidth = 7.9 / Math.max(0.5, camera.aspect);
    camera.position.z = Math.max(fitHeight, fitWidth) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.updateProjectionMatrix();
    invalidate();
  }
  function schedule() {
    if (!raf && !disposed && inView && !document.hidden) raf = requestAnimationFrame(render);
  }
  function invalidate() { dirty = true; schedule(); }
  function render(now) {
    raf = 0;
    if (disposed || !inView || document.hidden) { previous = 0; return; }
    const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
    previous = now;
    if (!paused) {
      elapsed += dt;
      mouse.lerp(target, 1 - Math.exp(-5 * dt));
    }
    if (dirty || !paused) { pose(); renderer.render(scene, camera); dirty = false; }
    if (!paused) schedule();
  }
  const pointerSurface = container.closest('.n-cinematic') || container;
  function pointerMove(event) {
    if (paused || !finePointer.matches || !bounds) return;
    target.set(THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1), THREE.MathUtils.clamp(1 - (event.clientY - bounds.top) / bounds.height * 2, -1, 1));
    schedule();
  }
  function pointerLeave() { target.set(0, 0); }
  function visibility() {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; previous = 0; }
    else invalidate();
  }
  function lost(event) {
    event.preventDefault();
    api.dispose();
    fallback();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersection = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView) { cancelAnimationFrame(raf); raf = 0; previous = 0; }
    else { bounds = container.getBoundingClientRect(); invalidate(); }
  }, { threshold: 0 });
  intersection.observe(container);
  pointerSurface.addEventListener('pointermove', pointerMove, { passive: true });
  pointerSurface.addEventListener('pointerleave', pointerLeave, { passive: true });
  document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('webglcontextlost', lost);

  const api = {
    setPaused(value) {
      paused = Boolean(value);
      container.dataset.paused = String(paused);
      target.copy(mouse);
      previous = 0;
      invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      pointerSurface.removeEventListener('pointermove', pointerMove);
      pointerSurface.removeEventListener('pointerleave', pointerLeave);
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('webglcontextlost', lost);
      resources.forEach(resource => resource.dispose());
      environment.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
  resize();
  pose();
  renderer.render(scene, camera);
  container.dataset.state = 'ready';
  container.dataset.paused = String(paused);
  options.onReady?.();
  schedule();
  return api;
}

function forewingShape() {
  const s = new THREE.Shape();
  const p = (x,y) => [(x - 768) / 1536 * 5.4, (507 - y) / 1536 * 5.4];
  s.moveTo(...p(795,515));
  s.bezierCurveTo(...p(888,278),...p(1180,-5),...p(1456,-5));
  s.bezierCurveTo(...p(1545,-5),...p(1548,70),...p(1525,122));
  s.bezierCurveTo(...p(1478,180),...p(1446,208),...p(1472,300));
  s.bezierCurveTo(...p(1475,384),...p(1420,468),...p(1364,502));
  s.bezierCurveTo(...p(1245,510),...p(994,488),...p(795,515));
  return s;
}
function hindwingShape() {
  const s = new THREE.Shape();
  const p = (x,y) => [(x - 768) / 1536 * 5.4, (507 - y) / 1536 * 5.4];
  s.moveTo(...p(792,502));
  s.bezierCurveTo(...p(970,474),...p(1284,494),...p(1362,636));
  s.bezierCurveTo(...p(1450,758),...p(1340,928),...p(1237,984));
  s.bezierCurveTo(...p(1162,1045),...p(1080,1026),...p(993,964));
  s.bezierCurveTo(...p(867,885),...p(817,648),...p(792,502));
  return s;
}
function wingZ(x, y, hind) {
  const breadth = Math.sin(Math.min(Math.PI, x / 2.7 * Math.PI));
  return breadth * (hind ? 0.15 : 0.25) + x * x * 0.022 + Math.sin(y * 2.2 + x) * x * 0.025;
}
function wingGeometry(shape, centre, hind) {
  const contour = shape.getPoints(28);
  contour.pop();
  const segments = contour.length;
  const rings = 24;
  const positions = [], uv = [], indices = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (const p of contour) {
      const x = THREE.MathUtils.lerp(centre.x, p.x, t);
      const y = THREE.MathUtils.lerp(centre.y, p.y, t);
      positions.push(x, y, wingZ(x, y, hind));
      uv.push(0.5 + x / 5.4, 0.5 + y / (5.4 * 1014 / 1536));
    }
  }
  for (let r = 0; r < rings; r++) for (let j = 0; j < segments; j++) {
    const a = r * segments + j, b = r * segments + (j + 1) % segments, c = a + segments, d = b + segments;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function initialize() {
  for (const stage of document.querySelectorAll('.n-butterfly-stage')) {
    if (stage.dataset.mounted) continue;
    stage.dataset.mounted = 'true';
    const toggle = stage.closest('.n-cinematic')?.querySelector('.n-motion-toggle');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let paused = reduced.matches;
    let instance;
    try { instance = createButterfly(stage); } catch { stage.dataset.state = 'fallback'; stage.querySelector('canvas')?.remove(); }
    if (!instance || stage.dataset.state !== 'ready') {
      if (toggle) toggle.hidden = true;
      continue;
    }
    const sync = () => {
      instance.setPaused(paused);
      if (!toggle) return;
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.setAttribute('aria-label', paused ? '나비 움직임 재생' : '나비 움직임 멈춤');
      const label = toggle.querySelector('span');
      if (label) label.textContent = paused ? '움직임 재생' : '움직임 멈춤';
      toggle.dataset.paused = String(paused);
    };
    if (toggle) toggle.hidden = false;
    toggle?.addEventListener('click', () => { paused = !paused; sync(); });
    reduced.addEventListener('change', () => { paused = reduced.matches; sync(); });
    sync();
    window.addEventListener('pagehide', event => { if (!event.persisted) instance.dispose(); }, { once: true });
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
