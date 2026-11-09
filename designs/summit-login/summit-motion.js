(() => {
  const page = document.body;
  const button = document.querySelector('button.motion');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const updateButton = () => {
    const paused = page.classList.contains('paused');
    const label = reducedMotion.matches
      ? '系统已开启减少动态效果，背景动效已关闭'
      : paused ? '继续背景动效' : '暂停背景动效';
    button.disabled = reducedMotion.matches;
    button.setAttribute('aria-pressed', String(reducedMotion.matches || paused));
    button.setAttribute('aria-label', label);
    button.title = label;
  };

  button.addEventListener('click', () => {
    if (reducedMotion.matches) return;
    page.classList.toggle('paused');
    updateButton();
  });

  const updateVisibility = () => {
    page.classList.toggle('page-hidden', document.hidden);
  };

  document.addEventListener('visibilitychange', updateVisibility);
  reducedMotion.addEventListener('change', updateButton);
  updateVisibility();
  updateButton();
})();
