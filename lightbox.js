/* Reimel Ltd - screenshot viewer. No dependencies, no external requests.
   Any <img class="shot-img"> becomes clickable; a data-full attribute names a
   larger file to load on demand, otherwise the displayed image is reused. */
(function () {
  var shots = document.querySelectorAll('img.shot-img');
  if (!shots.length) return;

  var overlay, figure, image, closeBtn, lastFocus;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.hidden = true;

    figure = document.createElement('figure');
    image = document.createElement('img');
    figure.appendChild(image);

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lightbox-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';

    overlay.appendChild(figure);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });
  }

  function open(shot) {
    if (!overlay) build();
    lastFocus = document.activeElement;
    image.src = shot.getAttribute('data-full') || shot.currentSrc || shot.src;
    image.alt = shot.alt || '';
    overlay.hidden = false;
    document.body.classList.add('lightbox-open');
    closeBtn.focus();
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove('lightbox-open');
    if (lastFocus) lastFocus.focus();
  }

  Array.prototype.forEach.call(shots, function (shot) {
    shot.tabIndex = 0;
    shot.setAttribute('role', 'button');
    shot.title = 'Click to enlarge';
    shot.addEventListener('click', function () { open(shot); });
    shot.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(shot); }
    });
  });
})();
