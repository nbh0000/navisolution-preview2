(() => {
  const header = document.querySelector('.header');
  const chapters = [...document.querySelectorAll('[data-scene-chapter]')];
  let chapterTops = [];
  const measure = () => {chapterTops = chapters.map(chapter => chapter.getBoundingClientRect().top + scrollY);};
  const onScroll = () => {
    header?.classList.toggle('is-scrolled', scrollY > 30);
    let index = 0;
    for (let i=0;i<chapterTops.length;i++) if (chapterTops[i] <= scrollY + innerHeight * .35) index=i;
    document.body.dataset.scenePhase = chapters[index]?.dataset.sceneChapter || 'hero';
  };
  measure();
  new ResizeObserver(() => {measure();onScroll();}).observe(document.body);
  addEventListener('resize',measure,{passive:true});
  addEventListener('scroll', onScroll, {passive:true});
  onScroll();
})();
