/* 3D 나비 — 실사 날개 텍스처(assets/img/bf3d)를 휘어지는 날개 면에 입혀 WebGL 로 날갯짓.
   mountButterfly(canvas, { mode: 'fly' | 'hover' | 'still' }) → { setTime(t), render(), destroy() }
   - fly   : 지정 영역 안을 천천히 떠다님 (히어로)
   - hover : 제자리에서 날갯짓 (표식·스프라이트 렌더)
   텍스처 원본: docs/source/bf3d (Codex 제작), 준비 스크립트: tools/make-bf3d.py */
import * as THREE from '../vendor/three.module.min.js';

const BASE = (document.querySelector('meta[name="bf3d-base"]') || {}).content || '/assets/img/bf3d/';

const VERT = /* glsl */`
  uniform float uSide, uPhase, uAmp, uAspect;
  varying vec2 vUv; varying vec3 vN; varying vec3 vPos; varying float vShade;
  const float PI = 3.14159265;
  float wave(float p) {                       // 내려치기는 빠르게, 올리기는 천천히
    float s = fract(p);
    return s < .42 ? .5 - .5 * cos(PI * s / .42) : .5 + .5 * cos(PI * (s - .42) / .58);
  }
  void main() {
    float d = position.x;                     // 0(몸통) → 1(날개 끝)
    float yy = position.y;                    // +: 머리 쪽, -: 꼬리 쪽
    float hind = smoothstep(.05, -.25, yy);   // 뒷날개일수록 1
    float lag = d * .09 + hind * .07;
    float up = wave(uPhase - lag);            // 0: 아래, 1: 위
    float a = mix(-.32, 1.25, up) * uAmp * (.82 + .3 * d) + hind * .08 * uAmp;
    float bend = .22 * d * d * (up - .5) * uAmp;   // 끝으로 갈수록 뒤늦게 휘는 곡률
    float ang = a + bend;
    vec3 p = vec3(uSide * d * cos(ang), yy * uAspect, d * sin(ang));
    p.z += sin(PI * clamp(d, 0., 1.)) * .025 * (1. - up);  // 날개 막의 미세한 볼록함
    vec3 n = normalize(vec3(-uSide * sin(ang), 0., cos(ang)));
    vUv = vec2(.5 + uSide * d * .5, .5 + yy);
    vN = normalize(normalMatrix * n);
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    vPos = mv.xyz; vShade = d;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */`
  uniform sampler2D uMap; uniform vec3 uL; uniform float uSide;
  varying vec2 vUv; varying vec3 vN; varying vec3 vPos; varying float vShade;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < .02) discard;
    bool top = gl_FrontFacing == (uSide > 0.);
    vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(-vPos), l = normalize(uL);
    float dif = .74 + .36 * max(dot(n, l), 0.);
    float spec = pow(max(dot(reflect(-l, n), v), 0.), 28.) * .5;
    float fr = pow(1. - abs(dot(n, v)), 2.2);
    vec3 pearl = mix(vec3(1., .86, .93), vec3(1., .93, .8), smoothstep(.2, .9, fr));
    vec3 c = t.rgb * dif * mix(vec3(1.), pearl, .55) + (spec * vec3(1., .92, .96) + .06 * vec3(1., .78, .86)) * fr * (1. - fr) * 4. * t.a;
    if (!top) c = mix(c, vec3(dot(c, vec3(.3, .59, .11))) * vec3(1.05, .95, .97), .25) * .97;  // 날개 뒷면은 옅게
    gl_FragColor = vec4(c, t.a);
    #include <colorspace_fragment>
  }`;

const BODY_FRAG = /* glsl */`
  uniform sampler2D uMap; varying vec2 vUv;
  void main() { vec4 t = texture2D(uMap, vUv); if (t.a < .02) discard; gl_FragColor = vec4(t.rgb * 1.05, t.a);
  #include <colorspace_fragment>
  }`;
const BODY_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

const texCache = {};
function loadTex(name) {
  if (!texCache[name]) texCache[name] = new Promise(res => new THREE.TextureLoader().load(BASE + name, t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; res(t);
  }));
  return texCache[name];
}

export async function mountButterfly(canvas, opts = {}) {
  const mode = opts.mode || 'hover';
  const aspect = opts.aspect || .667;         // 텍스처 높이/폭
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: !!opts.capture });
  renderer.setPixelRatio(opts.dpr || Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, .1, 50);
  camera.position.set(0, 0, 5.2);

  const [wingTex, bodyTex] = await Promise.all([loadTex('wings.webp'), loadTex('body.webp')]);
  const geo = new THREE.PlaneGeometry(1, 1, 48, 48);
  geo.translate(.5, 0, 0);                    // x: 0..1, y: -.5...5
  const L = new THREE.Vector3(-.4, .9, 1.2);
  const uni = side => ({ uSide: { value: side }, uPhase: { value: 0 }, uAmp: { value: 1 }, uAspect: { value: aspect * 2 }, uMap: { value: wingTex }, uL: { value: L } });
  const mat = side => new THREE.ShaderMaterial({ uniforms: uni(side), vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false });
  const wl = new THREE.Mesh(geo, mat(-1)), wr = new THREE.Mesh(geo, mat(1));
  const body = new THREE.Mesh(new THREE.PlaneGeometry(2, 2 * aspect), new THREE.ShaderMaterial({ uniforms: { uMap: { value: bodyTex } }, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  body.position.z = .004; body.renderOrder = 2;
  const bf = new THREE.Group(); bf.add(wl, wr, body);
  const rig = new THREE.Group(); rig.add(bf); scene.add(rig);
  const span = opts.span || 1;                // 화면 대비 크기
  bf.scale.setScalar(span);

  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
  }
  resize();

  const speed = opts.speed || 1.15;           // 초당 날갯짓 횟수
  function pose(t) {
    // 날갯짓 2~3번 후 잠깐 활공
    const cyc = t * speed, k = cyc % 5;
    const glide = !opts.noGlide && k > 3.6 ? Math.sin(Math.PI * Math.min(1, (k - 3.6) / 1.4)) : 0;
    const amp = 1 - .82 * glide;
    for (const w of [wl, wr]) { w.material.uniforms.uPhase.value = cyc; w.material.uniforms.uAmp.value = amp; }
    const beat = Math.sin(cyc * Math.PI * 2);
    let x = 0, y = 0, z = 0, yaw = 0, roll = 0, pitch = 0;
    if (mode === 'fly') {
      const bx = opts.box || [1.6, .8];
      x = Math.sin(t * .23) * bx[0] + Math.sin(t * .51 + 1) * bx[0] * .25;
      y = Math.sin(t * .31 + .5) * bx[1] + Math.sin(t * .77) * bx[1] * .2;
      z = Math.sin(t * .19) * .4;
      const vx = Math.cos(t * .23) * .23 * bx[0], vy = Math.cos(t * .31 + .5) * .31 * bx[1];
      yaw = Math.atan2(vx, 1) * .9; roll = -vx * .6; pitch = vy * .5;
    }
    rig.position.set(x + (opts.offset ? opts.offset[0] : 0), y - beat * .035 * amp + (opts.offset ? opts.offset[1] : -.12), z);
    bf.rotation.set((opts.tilt ?? -.72) + pitch + beat * .04 * amp, 0, 0);   // 등 쪽을 비스듬히 내려다보는 3/4 시점
    rig.rotation.set(0, yaw + (opts.yaw ?? -.22), (opts.roll ?? .12) + roll);
  }

  let raf = 0, t0 = performance.now(), running = false, tFixed = null;
  function frame(now) {
    pose(tFixed ?? (now - t0) / 1000);
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }
  const api = {
    setTime(t) { tFixed = t; pose(t); renderer.render(scene, camera); },
    start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize, renderer,
    destroy() { api.stop(); renderer.dispose(); }
  };
  if (mode !== 'still' && !opts.capture) {
    new IntersectionObserver(es => es[0].isIntersecting ? api.start() : api.stop()).observe(canvas);
    window.addEventListener('resize', resize);
  } else api.setTime(opts.t || 0);
  return api;
}

// data-bf3d 캔버스 자동 연결
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('canvas[data-bf3d]').forEach(cv => {
  const o = JSON.parse(cv.dataset.bf3d || '{}');
  if (reduce) o.mode = 'still';
  mountButterfly(cv, o).then(() => cv.classList.add('is-ready')).catch(() => cv.remove());
});
