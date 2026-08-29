'use strict';
(() => {
  const apply = () => {
    const line = document.querySelector('.brand p');
    if (line && line.textContent) {
      line.textContent = line.textContent.replace(/v1\.[0-9]+\.[0-9]+\b/g, 'v1.13.1');
    }
  };
  window.addEventListener('DOMContentLoaded', apply);
  setTimeout(apply, 0);
})();
