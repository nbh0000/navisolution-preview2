// 스크롤 등장 효과. 화면에 들어올 때마다(내려갈 때도, 다시 올라올 때도) 다시 나타난다.
// 위로 올라오며 만나는 요소는 위에서, 아래로 내려가며 만나는 요소는 아래에서 들어온다.
(function () {
  if (!('IntersectionObserver' in window)) return;
  var main = document.getElementById('main');
  if (!main) return;

  // 묶음은 자식들이 차례로 나타나고, 낱개는 통째로 나타난다.
  var GROUPS = '.rf-support__steps,.nv-benefits__rows,.x-business__services,.x-partner__list,.grid,.r-product-grid,.catalog-directory,.nv-story__pillars,.x-support__list,.x-faq__list,.x-referrer-info__list,.r-business__list,.r-entry,.a-join__choices,.n-mall-groups,.nv-close__values';
  var PHOTOS = 'figure,.nv-story__frame,.nv-benefits__photo,.a-mall-banner,.gallery,.r-business__statement';
  var BLOCKS = 'h1,h2,.x-section-heading p,.sentence-copy,.x-hero__lead,.x-hero__description,.n-collection__desc,.r-actions,.x-actions,.rf-close,.form-section,.purchase-panel,.n-mall-group__head,.n-page-head,.rf-eyebrow';
  var SKIP = '.header,.footer,.tabbar,.sticky-cta,[data-spatial-scene],.rv-group>*';

  function tag(el, kind, i) {
    if (el.closest('.rv') || el.classList.contains('rv')) return;
    el.classList.add('rv');
    el.dataset.rv = kind;
    if (i != null) el.style.setProperty('--rv-i', Math.min(i, 7));
  }
  main.querySelectorAll(GROUPS).forEach(function (g) {
    if (g.closest(SKIP) || g.closest('.rv-group')) return;
    g.classList.add('rv-group');
    Array.prototype.forEach.call(g.children, function (c, i) { tag(c, 'item', i); });
  });
  main.querySelectorAll(PHOTOS).forEach(function (el) { if (!el.closest(SKIP)) tag(el, 'photo'); });
  main.querySelectorAll(BLOCKS).forEach(function (el) { if (!el.closest(SKIP)) tag(el, /^H[12]$/.test(el.tagName) ? 'text' : 'block'); });

  var items = main.querySelectorAll('.rv');
  document.documentElement.classList.add('rv-ready');

  // 들어올 때는 화면 아래 10% 안쪽까지 와야 나타나고, 사라질 때는 완전히 벗어난 뒤에 숨긴다.
  var enter = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('is-in'); });
  }, { rootMargin: '0px 0px -10% 0px' });
  var leave = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) return;
      e.target.classList.remove('is-in');
      e.target.dataset.rvSide = e.boundingClientRect.top < 0 ? 'above' : 'below';
    });
  });
  items.forEach(function (el) { enter.observe(el); leave.observe(el); });
})();
