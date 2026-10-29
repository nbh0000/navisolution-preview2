(() => {
  'use strict';
  document.querySelectorAll('[data-catalog]').forEach(catalog => {
    const tabs = [...catalog.querySelectorAll('[data-category-tab]')];
    const panels = [...catalog.querySelectorAll('[data-category-panel]')];
    if (!tabs.length) return;
    catalog.classList.add('is-enhanced');
    catalog.querySelector('nav').setAttribute('role', 'tablist');
    const select = (index, focus = false, updateLocation = false) => {
      tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; panels[i].hidden = i !== index; });
      if (focus) tabs[index].focus();
      if (updateLocation) history.replaceState(null, '', `#${panels[index].id}`);
    };
    tabs.forEach((tab, index) => {
      tab.id = `catalog-tab-${index}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panels[index].id);
      panels[index].setAttribute('role', 'tabpanel');
      panels[index].setAttribute('aria-labelledby', tab.id);
      tab.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); select(index, false, true);
      });
      tab.addEventListener('keydown', event => {
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault(); select(next, true, true);
      });
    });
    const initial = panels.findIndex(panel => `#${panel.id}` === location.hash);
    select(initial < 0 ? 0 : initial);
  });
  const menu = document.querySelector('.n-mobile-menu');
  if (menu) {
    document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { menu.open = false; }));
  }
  const invalid = document.querySelector('[aria-invalid="true"]');
  if (invalid) invalid.focus({ preventScroll: false });
})();
