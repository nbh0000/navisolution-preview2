import * as THREE from '../vendor/three/three.module.min.js';

const asset = filename => new URL('../img/aerial/' + filename, import.meta.url).href;
const BODY_PROFILES = {
  blue: [[0,.39],[.15,.395],[.20,.42],[.30,.46],[.36,.475],[.42,.463],[.53,.475],[.65,.485],[.75,.497],[1,.5]],
  amber: [[0,.32],[.06,.33],[.15,.38],[.25,.43],[.32,.465],[.38,.46],[.46,.449],[.56,.465],[.68,.475],[.80,.488],[.85,.5],[1,.5]],
  ivory: [[0,.31],[.06,.315],[.15,.375],[.25,.43],[.32,.463],[.39,.455],[.46,.447],[.56,.463],[.68,.474],[.77,.481],[.85,.497],[1,.5]],
  lemon: [[0,.39],[.08,.4],[.18,.445],[.26,.475],[.30,.477],[.38,.468],[.45,.466],[.53,.474],[.61,.482],[.69,.497],[.75,.5],[1,.5]],
};
// Each entry has its own authored specimen, anatomy profile and flight rhythm.
const SPECIMENS = [
  { key:'blue', file:'butterfly-blue.webp', size:37, mobileSize:29.5, phase:1.1, speed:.15, roll:-.14,
    hz:4.6, beats:4, rest:.62, lag:.028, seed:17, desktop:[.28,.00,.085,.13], mobile:[.23,-.15,.12,.12], project:[.22,.04,.12,.18] },
  { key:'amber', file:'butterfly-amber.webp', size:28, mobileSize:24, phase:3.1, speed:.19, roll:.12,
    hz:6.3, beats:5, rest:.39, lag:.020, seed:41, desktop:[.14,.28,.065,.07], mobile:[-.26,.015,.08,.085], project:[-.22,.17,.12,.10] },
  { key:'ivory', file:'butterfly-ivory.webp', size:21, mobileSize:19, phase:4.8, speed:.17, roll:-.08,
    hz:7.4, beats:6, rest:.28, lag:.014, seed:73, desktop:[.36,-.30,.06,.065], mobile:[-.04,-.13,.10,.05], project:[.23,-.27,.16,.09] },
  { key:'lemon', file:'butterfly-lemon.webp', size:25, mobileSize:22, phase:.4, speed:.13, roll:.16,
    hz:5.2, beats:4, rest:.75, lag:.025, seed:109, desktop:[.10,-.35,.075,.04], mobile:[0,0,0,0], project:[-.21,-.25,.12,.08] },
];

/** Authored specimen textures on hinged, lightly bending membranes. */
export function createSpatialScene(container, options = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const resources = new Set();
  const own = object => (resources.add(object), object);
  let renderer, raf = 0, previous = 0, elapsed = 0;
  let disposed = false, paused = reduced.matches, visible = true, dirty = true, assetReady = false;
  let width = 1, height = 1, worldWidth = 10, worldHeight = 7, mobile = false;
  const pointer = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();
  const homeHero = container.closest('.a-hero');
  const projectScene = container.closest('.a-project-hero__scene');
  const failedSpecimens = new Set();

  function syncMotionState() {
    container.dataset.paused = String(paused);
    document.documentElement.dataset.scenePaused = String(paused);
    document.documentElement.dataset.sceneRunning = String(!paused && visible && !document.hidden && !disposed && assetReady);
  }
  const fallback = () => {
    container.dataset.state = 'fallback';
    paused = true;
    syncMotionState();
    container.querySelector('canvas')?.remove();
    document.querySelectorAll('[data-scene-toggle]').forEach(button => { button.hidden = true; });
    if (!container.querySelector('.spatial-scene-fallback')) {
      const image = document.createElement('img');
      image.src = asset(SPECIMENS.find(specimen => !failedSpecimens.has(specimen.key))?.file || 'butterfly-blue.webp');
      image.alt = '';
      image.className = 'spatial-scene-fallback';
      image.style.cssText = 'position:absolute;width:30px;height:auto;right:15%;top:' + (homeHero && innerWidth < 768 ? '420px' : '52%');
      image.addEventListener('error', () => image.remove(), { once: true });
      container.append(image);
    }
    options.onError?.();
  };
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    fallback();
    return { setPaused() {}, dispose() {} };
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  container.append(canvas);
  container.dataset.state = 'loading';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 50);
  camera.position.set(0, 0, 11);

  const flock = [];
  let settledAssets = 0;
  const loader = new THREE.TextureLoader();
  container.dataset.specimensLoaded = '0';
  container.dataset.specimensFailed = '0';

  function makeButterfly(texture, specimen, index) {
    const group = new THREE.Group(), hinges = [];
    const profile = BODY_PROFILES[specimen.key];
    const material = own(new THREE.MeshBasicMaterial({
      map: texture, color:'#ffffff', transparent:true, alphaTest:.03,
      side:THREE.DoubleSide, depthWrite:false, toneMapped:false,
    }));
    material.onBeforeCompile = shader => {
      shader.uniforms.wingFlex = { value:0 };
      shader.uniforms.hindLag = { value:0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float wingFlex;\nuniform float hindLag;')
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'float trailing = 1.0 - smoothstep(0.43, 0.59, uv.y);',
          'float lagAngle = -sign(position.x) * hindLag * trailing;',
          'vec2 wingXZ = vec2(transformed.x, transformed.z);',
          'transformed.x = wingXZ.x * cos(lagAngle) + wingXZ.y * sin(lagAngle);',
          'transformed.z = -wingXZ.x * sin(lagAngle) + wingXZ.y * cos(lagAngle);',
          'transformed.z += wingFlex * pow(abs(position.x) / 2.6, 2.0) * sin(uv.y * 3.14159265);',
        ].join('\n'));
      material.userData.shader = shader;
    };
    material.customProgramCacheKey = () => 'independent-specimen-wing-lag-v1';
    for (const side of [-1,1]) {
      const hinge = new THREE.Group();
      hinge.position.x = side * .055;
      const wing = new THREE.Mesh(own(specimenSection(side < 0 ? 'left' : 'right', profile)), material);
      wing.renderOrder = 1;
      hinge.add(wing);
      group.add(hinge);
      hinges.push({hinge,side});
    }
    const bodyMaterial = own(new THREE.MeshBasicMaterial({
      map:texture, color:'#ffffff', transparent:true, alphaTest:.03,
      side:THREE.DoubleSide, depthWrite:false, toneMapped:false,
    }));
    const body = new THREE.Mesh(own(specimenSection('body', profile)), bodyMaterial);
    body.position.z = .025;
    body.renderOrder = 2;
    group.add(body);
    scene.add(group);
    const motion = makeFlightRhythm(specimen, index);
    return {...specimen,index,group,hinges,material,motion};
  }

  function assetSettled() {
    settledAssets++;
    container.dataset.specimensLoaded = String(flock.length);
    container.dataset.specimensFailed = String(failedSpecimens.size);
    if (flock.length) {
      const firstReady = !assetReady;
      assetReady = true;
      container.dataset.state = 'ready';
      syncMotionState();
      resize();
      pose();
      renderer.render(scene,camera);
      if (firstReady) options.onReady?.();
      invalidate();
    } else if (settledAssets === SPECIMENS.length) {
      api.dispose();
      fallback();
    }
  }

  SPECIMENS.forEach((specimen,index) => {
    own(loader.load(asset(specimen.file), texture => {
      if (disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4,renderer.capabilities.getMaxAnisotropy());
      flock.push(makeButterfly(texture,specimen,index));
      assetSettled();
    }, undefined, () => {
      if (disposed) return;
      failedSpecimens.add(specimen.key);
      // One unavailable image removes only that individual, never the healthy flock.
      assetSettled();
    }));
  });

  function resize() {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    width = Math.max(1, rect.width || innerWidth);
    height = Math.max(1, rect.height || innerHeight);
    mobile = innerWidth < 768;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = mobile ? 40 : 35;
    camera.updateProjectionMatrix();
    worldHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    worldWidth = worldHeight * camera.aspect;
    invalidate();
  }
  function pose() {
    let visibleCount = 0;
    flock.forEach(bird => {
      const {group,hinges,material,phase,size,mobileSize,speed,roll,desktop,mobile:smallRoute,index,motion} = bird;
      group.visible = !mobile || index < 3;
      if (!group.visible) return;
      visibleCount++;
      const [cx,cy,rx,ry] = projectScene ? bird.project : mobile ? smallRoute : desktop;
      const t = elapsed * speed + phase;
      const x = cx + Math.sin(t) * rx + Math.sin(t * 2.1 + phase) * rx * .07;
      const y = cy + Math.cos(t * 1.27 + phase) * ry + Math.sin(t * 2.3) * .004;
      const dx = Math.cos(t) * rx + Math.cos(t * 2.1 + phase) * rx * .147;
      const depth = Math.sin(t * .73 + phase) * .35;
      const pixels = mobile ? mobileSize : size;
      const stroke = sampleFlightStroke(motion,0);
      let screenY = y + pointer.y * .003 + stroke.lift * .5 / height;
      if (projectScene) {
        const wingMargin = pixels * .65 + 8;
        const top = THREE.MathUtils.clamp((.5 - screenY) * height,wingMargin,height - wingMargin);
        screenY = (.5 - top / height) * (camera.position.z - depth) / camera.position.z;
      } else if (mobile) {
        const wingMargin = pixels * .65 + 8;
        const reservedTop = homeHero ? Math.min(380,Math.max(0,height - 120)) : 0;
        const progress = THREE.MathUtils.clamp((.15 - screenY) / .65,0,1);
        const top = THREE.MathUtils.lerp(reservedTop + wingMargin,height - wingMargin,progress);
        screenY = (.5 - top / height) * (camera.position.z - depth) / camera.position.z;
      }
      group.position.set(worldWidth * (x + pointer.x * .003),worldHeight * screenY,depth);
      group.scale.setScalar(worldWidth * pixels / width / 5.2);
      const travelLean = THREE.MathUtils.clamp(-dx * width / height * .9,-.24,.24);
      group.rotation.set(.09 + Math.sin(t * 1.3) * .045 + stroke.lift * .022,
        -Math.sin(t) * rx * 1.15,roll + travelLean);
      hinges.forEach(({hinge,side}) => {
        // Slight left/right timing differences remain bounded inside each burst.
        const sideStroke = sampleFlightStroke(motion,side * .004);
        hinge.rotation.y = -side * sideStroke.fold;
      });
      if (material.userData.shader) {
        const lagged = sampleFlightStroke(motion,-bird.lag);
        material.userData.shader.uniforms.hindLag.value = lagged.fold - stroke.fold;
        material.userData.shader.uniforms.wingFlex.value = (lagged.fold - stroke.fold) * .075;
      }
    });
    if (container.dataset.specimensVisible !== String(visibleCount)) {
      container.dataset.specimensVisible = String(visibleCount);
    }
  }
  function requestFrame() {
    if (!raf && assetReady && !disposed && visible && !document.hidden) raf = requestAnimationFrame(render);
  }
  function invalidate() { dirty = true; requestFrame(); }
  function render(now) {
    raf = 0;
    if (disposed || !visible || document.hidden) { previous = 0; return; }
    const dt = previous ? Math.min((now - previous) / 1000, .05) : 0;
    previous = now;
    if (!paused) {
      elapsed += dt;
      flock.forEach(bird => advanceFlightRhythm(bird,dt));
      pointer.lerp(pointerTarget, 1 - Math.exp(-6 * dt));
    }
    if (dirty || !paused) { pose(); renderer.render(scene, camera); dirty = false; }
    if (!paused) requestFrame();
  }
  function pointerMove(event) {
    if (paused || !finePointer.matches) return;
    pointerTarget.set(event.clientX / innerWidth * 2 - 1, 1 - event.clientY / innerHeight * 2);
  }
  function pointerLeave() { pointerTarget.set(0, 0); }
  function visibility() {
    syncMotionState();
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; previous = 0; }
    else invalidate();
  }
  function contextLost(event) { event.preventDefault(); api.dispose(); fallback(); }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncMotionState();
    if (!visible) { cancelAnimationFrame(raf); raf = 0; previous = 0; }
    else invalidate();
  });
  intersection.observe(container);
  window.addEventListener('pointermove', pointerMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', pointerLeave, { passive: true });
  document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('webglcontextlost', contextLost);

  const api = {
    setPaused(value) {
      paused = Boolean(value);
      syncMotionState();
      if (paused) pointerTarget.copy(pointer);
      previous = 0;
      invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      syncMotionState();
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener('pointermove', pointerMove);
      document.documentElement.removeEventListener('pointerleave', pointerLeave);
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('webglcontextlost', contextLost);
      resources.forEach(resource => resource.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
  resize();
  syncMotionState();
  return api;
}

/**
 * Atlas boundaries follow each authored specimen's antennae, thorax and abdomen. The
 * body stays anchored while each wing samples only its own part of the image.
 * Texture alpha supplies the actual biological silhouette, including its fine edge.
 */
function specimenSection(section, rows) {
  const columns = section === 'body' ? 4 : 12;
  const side = section === 'left' ? -1 : section === 'right' ? 1 : 0;
  const positions = [], uvs = [], indices = [];
  rows.forEach(([top, boundary]) => {
    const start = side < 0 ? 0 : boundary;
    const end = side > 0 ? 1 : 1 - boundary;
    const from = section === 'left' ? 0 : section === 'right' ? 1 - boundary : start;
    const to = section === 'left' ? boundary : end;
    for (let col = 0; col <= columns; col++) {
      const u = THREE.MathUtils.lerp(from, to, col / columns);
      const x = (u - .5) * 5.2 - side * .055;
      positions.push(x, (.48 - top) * (5.2 / 1.5), side ? Math.pow(Math.abs(x) / 2.6, 2) * .018 : 0);
      uvs.push(u, 1 - top);
    }
  });
  for (let row = 0; row < rows.length - 1; row++) for (let col = 0; col < columns; col++) {
    const a = row * (columns + 1) + col, b = a + 1, c = a + columns + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// These rhythms are visual tuning, not a claim of species-specific biological rates.
function rhythmNoise(seed,cycle) {
  const value = Math.sin(seed * 12.9898 + cycle * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
function makeFlightRhythm(specimen,index) {
  const rate = specimen.hz * (.94 + rhythmNoise(specimen.seed,0) * .12);
  const mode = index % 2 ? 'burst' : 'glide';
  const beats = specimen.beats + Math.floor(rhythmNoise(specimen.seed,1) * 3);
  const duration = mode === 'burst' ? beats / rate : specimen.rest;
  return {mode,rate,cycle:0,time:duration * (.14 + index * .12),duration};
}
function advanceFlightRhythm(bird,dt) {
  const m = bird.motion;
  m.time += dt;
  while (m.time >= m.duration) {
    m.time -= m.duration;
    if (m.mode === 'burst') {
      m.mode = 'glide';
      m.duration = bird.rest * (.72 + rhythmNoise(bird.seed,m.cycle + 3) * .66);
    } else {
      m.mode = 'burst';
      m.cycle++;
      m.rate = bird.hz * (.9 + rhythmNoise(bird.seed,m.cycle * 2) * .2);
      const beats = bird.beats + Math.floor(rhythmNoise(bird.seed,m.cycle * 2 + 1) * 3);
      m.duration = beats / m.rate;
    }
  }
}
function sampleFlightStroke(m,offset) {
  if (m.mode === 'glide' || m.time + offset < 0 || m.time + offset > m.duration) {
    return {fold:.12,lift:0};
  }
  // A stroke opens briskly over 38% of its cycle, then recovers over 62%.
  // Every whole-beat burst starts and ends open, joining the glide without a snap.
  const phase = ((m.time + offset) * m.rate + .38) % 1;
  const opening = phase < .38;
  const progress = opening ? phase / .38 : (phase - .38) / .62;
  const eased = progress * progress * (3 - 2 * progress);
  return {
    fold:opening ? THREE.MathUtils.lerp(1.03,.12,eased) : THREE.MathUtils.lerp(.12,1.03,eased),
    lift:opening ? Math.sin(progress * Math.PI) : 0,
  };
}

function initialize() {
  const container = document.querySelector('[data-spatial-scene]');
  if (!container || container.dataset.mounted) return;
  container.dataset.mounted = 'true';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches, instance;
  const sync = () => {
    if (!instance || container.dataset.state !== 'ready') return;
    instance.setPaused(paused);
    for (const button of document.querySelectorAll('[data-scene-toggle]')) {
      button.hidden = false;
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? '움직임 재생' : '움직임 멈춤');
      button.dataset.paused = String(paused);
      const label = button.querySelector('span');
      if (label) label.textContent = paused ? '움직임 재생' : '움직임 멈춤';
    }
  };
  try { instance = createSpatialScene(container, { onReady: sync }); } catch {
    container.dataset.state = 'fallback';
    container.querySelector('canvas')?.remove();
    document.documentElement.dataset.scenePaused = 'true';
    document.documentElement.dataset.sceneRunning = 'false';
    document.querySelectorAll('[data-scene-toggle]').forEach(button => { button.hidden = true; });
    return;
  }
  document.querySelectorAll('[data-scene-toggle]').forEach(button => button.addEventListener('click', () => { paused = !paused; sync(); }));
  reduced.addEventListener('change', () => { paused = reduced.matches; sync(); });
  window.addEventListener('pagehide', event => { if (!event.persisted) instance.dispose(); }, { once: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();

