'use strict';
(() => {
  const apply = () => {
    const line = document.querySelector('.brand p');
    if (line && line.textContent) {
      line.textContent = line.textContent.replace(/v1\.6\.[01]\b/g, 'v1.6.2');
    }
  };
  window.addEventListener('DOMContentLoaded', apply);
  setTimeout(apply, 0);
})();
