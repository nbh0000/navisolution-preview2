/* 나비솔루션 공통 스크립트 — 토스트·모달·수량·복사/공유·폼 전송 */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  /* ---------- toast ---------- */
  const ICONS = { success: 'check', error: 'alert', info: 'alert' };
  function toast(message, type, ms) {
    type = type || 'info';
    const wrap = $('#toasts');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast toast--' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = '<svg class="icon"><use href="#i-' + (ICONS[type] || 'alert') + '"/></svg><span></span>';
    el.lastChild.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 220); }, ms || 2600);
  }
  window.toast = toast;
  (window.__flash || []).forEach(f => toast(f.message, f.type));

  /* ---------- modal (<dialog class="modal" id="...">) ---------- */
  function openModal(id) {
    const d = typeof id === 'string' ? document.getElementById(id) : id;
    if (!d) return;
    if (!d.open) d.showModal();
    d.addEventListener('click', e => { if (e.target === d) d.close(); }, { once: true });
  }
  function closeModal(id) { const d = typeof id === 'string' ? document.getElementById(id) : id; if (d && d.open) d.close(); }
  window.openModal = openModal; window.closeModal = closeModal;
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-modal-open]');
    if (o) { e.preventDefault(); openModal(o.getAttribute('data-modal-open')); return; }
    const c = e.target.closest('[data-modal-close]');
    if (c) { e.preventDefault(); closeModal(c.closest('dialog')); }
  });

  /* ---------- confirm: <form data-confirm="정말 취소할까요?"> ---------- */
  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.dataset.confirm && !window.confirm(f.dataset.confirm)) { e.preventDefault(); return; }
    // 중복 제출 방지
    const btn = f.querySelector('button[type=submit], .btn[type=submit]');
    if (btn && !f.hasAttribute('data-no-loading')) { setTimeout(() => { btn.classList.add('is-loading'); btn.disabled = true; }, 0); }
  });

  /* ---------- stepper ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('.stepper button');
    if (!b) return;
    const input = $('input', b.parentElement);
    const min = +input.min || 1, max = +input.max || 999;
    let v = +input.value || min;
    v += b.dataset.step === '-' ? -1 : 1;
    v = Math.max(min, Math.min(max, v));
    if (+input.value !== v) { input.value = v; input.dispatchEvent(new Event('change', { bubbles: true })); }
  });

  /* ---------- copy & share ---------- */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  }
  window.copyText = copyText;
  document.addEventListener('click', async e => {
    const c = e.target.closest('[data-copy]');
    if (c) { e.preventDefault(); toast((await copyText(c.dataset.copy)) ? '복사했습니다.' : '복사에 실패했습니다.', 'success'); return; }
    const s = e.target.closest('[data-share]');
    if (s) {
      e.preventDefault();
      const data = { title: s.dataset.shareTitle || document.title, text: s.dataset.shareText || '', url: s.dataset.share };
      if (navigator.share) { try { await navigator.share(data); } catch (_) {} }
      else { toast((await copyText(data.url)) ? '링크를 복사했습니다.' : '공유를 지원하지 않는 브라우저입니다.', 'info'); }
    }
  });

  /* ---------- fetch helper (JSON, CSRF) ---------- */
  async function api(url, body, method) {
    const res = await fetch(url, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': window.__csrf || '', 'X-Requested-With': 'XMLHttpRequest' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (res.status === 401 && data.login) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); return data; }
    if (!res.ok && data.message) toast(data.message, 'error');
    return data;
  }
  window.api = api;

  /* ---------- 전환 이벤트 (픽셀 ID 가 있을 때만 실제 발송) ---------- */
  window.track = function (name, params) {
    params = params || {};
    try {
      if (window.gtag) gtag('event', name, params);
      if (window.fbq) fbq('trackCustom', name, params);
      if (window.ttq) ttq.track(name, params);
    } catch (_) {}
  };
  const pending = document.body.dataset.track;
  if (pending) window.track(pending);

  /* ---------- 숫자 입력 자동 하이픈 (data-format="phone|bizno") ---------- */
  document.addEventListener('input', e => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !el.dataset.format) return;
    const d = el.value.replace(/\D/g, '');
    if (el.dataset.format === 'phone') {
      el.value = d.length < 4 ? d : d.length < 8 ? d.replace(/(\d{3})(\d+)/, '$1-$2') : d.replace(/(\d{3})(\d{3,4})(\d{4}).*/, '$1-$2-$3');
    } else if (el.dataset.format === 'bizno') {
      el.value = d.length < 4 ? d : d.length < 6 ? d.replace(/(\d{3})(\d+)/, '$1-$2') : d.replace(/(\d{3})(\d{2})(\d{0,5}).*/, '$1-$2-$3');
    }
  });

  /* ---------- 다음 우편번호 (버튼: data-postcode, 결과: data-zip / data-addr1 / data-addr2) ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-postcode]');
    if (!b) return;
    e.preventDefault();
    const run = () => new daum.Postcode({
      oncomplete: data => {
        const scope = b.closest('form') || document;
        const zip = $('[data-zip]', scope), a1 = $('[data-addr1]', scope), a2 = $('[data-addr2]', scope);
        if (zip) zip.value = data.zonecode;
        if (a1) a1.value = data.roadAddress || data.jibunAddress;
        if (a2) a2.focus();
      }
    }).open();
    if (window.daum && window.daum.Postcode) return run();
    const s = document.createElement('script');
    s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    s.onload = run; document.head.appendChild(s);
  });
})();

/* 나비프로젝트 히어로 — 천천히 흩날리는 꽃잎과 빛 입자 */
(function () {
  'use strict';
  const cv = document.querySelector('.b-petals');
  if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = cv.getContext('2d');
  let w = 0, h = 0, items = [], running = false, raf = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
    w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function make(initial) {
    const petal = Math.random() < .55;
    return { petal, x: rnd(w * .35, w * 1.05), y: initial ? rnd(-h * .1, h) : rnd(-60, -10), s: petal ? rnd(5, 11) : rnd(.6, 1.8),
      vx: rnd(-.45, -.1), vy: petal ? rnd(.25, .6) : rnd(-.15, .2), rot: rnd(0, 6.28), vr: rnd(-.02, .02), ph: rnd(0, 6.28), life: 0, max: petal ? 1e9 : rnd(200, 420) };
  }
  function draw(p) {
    if (p.petal) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, .55 + .45 * Math.sin(p.ph));
      const g = ctx.createLinearGradient(-p.s, 0, p.s, 0); g.addColorStop(0, 'rgba(255,214,222,.9)'); g.addColorStop(1, 'rgba(240,160,182,.75)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-p.s, 0); ctx.quadraticCurveTo(0, -p.s * .9, p.s, 0); ctx.quadraticCurveTo(0, p.s * .9, -p.s, 0); ctx.fill(); ctx.restore();
    } else {
      const t = p.life / p.max, a = Math.sin(Math.PI * t) * .9;
      ctx.fillStyle = 'rgba(255,236,214,' + a.toFixed(3) + ')'; ctx.shadowColor = 'rgba(255,200,170,.9)'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
    }
  }
  function step() {
    ctx.clearRect(0, 0, w, h);
    items = items.filter(p => {
      p.life++; p.ph += .03; p.rot += p.vr; p.x += p.vx + Math.sin(p.ph) * .25; p.y += p.vy;
      if (p.y > h + 20 || p.x < -20 || p.life > p.max) return false;
      draw(p); return true;
    });
    while (items.length < (w < 768 ? 26 : 46)) items.push(make(false));
    if (running) raf = requestAnimationFrame(step);
  }
  resize(); for (let i = 0; i < (w < 768 ? 26 : 46); i++) items.push(make(true));
  window.addEventListener('resize', resize);
  new IntersectionObserver(es => {
    if (es[0].isIntersecting && !running) { running = true; raf = requestAnimationFrame(step); }
    if (!es[0].isIntersecting) { running = false; cancelAnimationFrame(raf); }
  }).observe(cv);
})();
