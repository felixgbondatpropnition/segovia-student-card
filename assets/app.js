// Shared browser code: storage, the card face, the QR, and the bits every page needs.
(function () {
  var SSC = window.SSC;
  var config = window.SSC_CONFIG;
  var scriptUrl = document.currentScript.src;
  var siteRoot = new URL('../', scriptUrl);

  var CARD_KEY = 'ssc.card.v1';
  var LOG_KEY = 'ssc.savings.v1';

  // Blocked site data makes the localStorage getter itself throw, so every touch is guarded.
  var store = {
    read: function (key) {
      try { return JSON.parse(window.localStorage.getItem(key)); } catch (e) { return null; }
    },
    write: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove: function (key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* nothing to remove */ }
    }
  };

  function getCard() {
    var c = store.read(CARD_KEY);
    // Re-validate through the same door a venue uses, so a damaged record never renders.
    if (!c || !c.card) return null;
    try {
      var card = SSC.decodeCard(SSC.encodeCard(c.card));
      if (!card) return null;
      return {
        card: card,
        email: typeof c.email === 'string' ? c.email : '',
        expired: SSC.isExpired(card.validTo, new Date()),
        // Issued by another version of this prototype (it briefly sold a monthly card): still a
        // well-formed card, but not the one on sale now.
        outdated: card.termName !== config.term.name
      };
    } catch (e) {
      return null; // a hand-edited record with the wrong types inside
    }
  }

  // Cards are only on sale while the term in config.js is still running.
  function termOpen() {
    return !SSC.isExpired(config.term.ends, new Date());
  }

  function issueCard(name, email) {
    if (!termOpen() || !SSC.emailAllowed(email, config.emailDomains)) return null;
    var card = {
      id: SSC.newCardId(function (n) { return window.crypto.getRandomValues(new Uint8Array(n)); }),
      name: SSC.cleanName(name),
      termName: config.term.name,
      validTo: config.term.ends
    };
    var ok = store.write(CARD_KEY, { card: card, email: String(email).trim(), issuedAt: new Date().toISOString() });
    store.remove(LOG_KEY);
    return ok ? card : null;
  }

  function removeCard() {
    store.remove(CARD_KEY);
    store.remove(LOG_KEY);
  }

  function getLog() {
    var log = store.read(LOG_KEY);
    return Array.isArray(log) ? log.filter(function (e) { return e && typeof e.bill === 'number' && typeof e.saved === 'number'; }) : [];
  }

  function addSaving(bill) {
    var log = getLog();
    log.unshift({ bill: bill, saved: SSC.savingOn(bill, config.discount), at: new Date().toISOString() });
    return store.write(LOG_KEY, log.slice(0, 200));
  }

  function removeLastSaving() {
    return store.write(LOG_KEY, getLog().slice(1));
  }

  // The card carries the English term name. Show the Spanish one when it is this term's card.
  function termNameEs(card) {
    return card.termName === config.term.name && config.term.nameEs ? config.term.nameEs : card.termName;
  }

  function verifyUrl(card) {
    return new URL('verify/', siteRoot).href + '#' + SSC.encodeCard(card);
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // The aqueduct as it stands. The water channel on top is level and the ground falls away
  // beneath it, so the arches are two tiers deep where the valley is lowest, one tier where the
  // ground rises, and stop where it runs into the hill. Stone is solid and the arches are holes,
  // so whatever is behind (the dusk glow) shows through them.
  //   top:    where the channel sits, as a share of the drawing's height (the hills can rise above it)
  //   ground: [x, y] points the ground passes through, both as shares of the drawing. Keep y
  //           under 1 so there is always land along the bottom for the arches to stand on.
  //   size:   on the page, the height at which the arches are full size; shorter drawings scale
  //           them down. On the card, `scale` sets it instead, because the card scales as a whole.
  //   span:   the width the ground is laid out over; a narrower screen sees the part at `focus`
  var SCENES = {
    hero: { top: 0.2, size: 250, span: 1240, focus: 0.4,
      ground: [[0, 0.04], [0.08, 0.3], [0.24, 0.78], [0.42, 0.93], [0.6, 0.9], [0.8, 0.66], [0.93, 0.42], [1, 0.32]] },
    head: { top: 0.3, size: 170, span: 1240, focus: 0.7,
      ground: [[0, 0.1], [0.12, 0.34], [0.32, 0.72], [0.55, 0.94], [0.78, 0.9], [0.92, 0.62], [1, 0.4]] },
    card: { top: 0.14, scale: 0.9,
      ground: [[0, 0.36], [0.16, 0.7], [0.4, 0.96], [0.62, 0.94], [0.86, 0.68], [1, 0.4]] }
  };

  // A smooth curve through every point (Catmull-Rom), read at t from 0 to 1.
  function curveAt(points, t) {
    t = Math.min(1, Math.max(0, t));
    var i = 0;
    while (i < points.length - 2 && t > points[i + 1][0]) i++;
    var a = points[Math.max(i - 1, 0)][1], b = points[i][1], c = points[i + 1][1], d = points[Math.min(i + 2, points.length - 1)][1];
    var u = (t - points[i][0]) / (points[i + 1][0] - points[i][0]);
    return b + 0.5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a)));
  }

  function aqueductPaths(scene, w, h, k) {
    var bay = 44 * k, r = 13 * k;
    var top = h * scene.top;
    var upperCrown = top + 12 * k, upperFoot = top + 60 * k, lowerCrown = top + 70 * k;
    function f(n) { return Math.round(n * 10) / 10; }
    // An opening from its crown down to its foot. Where the ground is higher than the springing,
    // only the top of the arch shows above it, as a chord across the circle.
    function arch(cx, crown, foot) {
      var spring = crown + r;
      if (foot >= spring) {
        return 'M' + f(cx - r) + ' ' + f(foot) + 'V' + f(spring) + 'A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(cx + r) + ' ' + f(spring) + 'V' + f(foot) + 'Z';
      }
      var half = Math.sqrt(r * r - (spring - foot) * (spring - foot));
      return 'M' + f(cx - half) + ' ' + f(foot) + 'A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(cx + half) + ' ' + f(foot) + 'Z';
    }
    var stone = 'M0 ' + f(top) + 'H' + f(w) + 'V' + f(h + 1) + 'H0Z';
    for (var cx = (w % bay) / 2 + bay / 2; cx < w; cx += bay) {
      // Each opening stops level at the highest ground beneath it, as a builder would set it.
      var foot = Math.min(h + 1, h * Math.min(curveAt(scene.ground, (cx - r) / w), curveAt(scene.ground, cx / w), curveAt(scene.ground, (cx + r) / w)));
      if (foot > upperCrown + 3 * k) stone += arch(cx, upperCrown, Math.min(foot, upperFoot));
      if (foot > lowerCrown + 3 * k) stone += arch(cx, lowerCrown, foot);
    }
    var land = 'M0 ' + f(h + 1);
    for (var x = 0; x < w + 6; x += 6) land += 'L' + f(Math.min(x, w)) + ' ' + f(h * curveAt(scene.ground, Math.min(x, w) / w));
    return { stone: stone, land: land + 'L' + f(w) + ' ' + f(h + 1) + 'Z' };
  }

  function aqueductSvg(scene, w, h, k, attrs) {
    var p = aqueductPaths(scene, w, h, k);
    // The stone takes the text colour and the land a tone of its own (--land), so the ground
    // reads as ground rather than as more wall.
    return '<svg aria-hidden="true" focusable="false" ' + attrs + '>' +
      '<path fill="currentColor" fill-rule="evenodd" d="' + p.stone + '"/><path style="fill: var(--land, currentColor)" d="' + p.land + '"/></svg>';
  }

  // Across the page the arches keep their size, so the drawing is made for the box it sits in
  // and redrawn when that box changes width. A box that is hidden has no width yet and is drawn
  // when it first appears.
  function drawAqueduct(el) {
    var scene = SCENES[el.getAttribute('data-aqueduct')] || SCENES.hero;
    var w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    var k = Math.min(1, h / scene.size);
    var span = Math.max(w, scene.span * k);
    var viewX = (span - w) * scene.focus;
    // Draw the whole span, then show the part of it that fits, starting at viewX.
    el.innerHTML = aqueductSvg(scene, span, h, k, 'width="' + w + '" height="' + h + '" viewBox="' + Math.round(viewX) + ' 0 ' + w + ' ' + h + '"');
    el.setAttribute('data-drawn', w + 'x' + h);
  }

  function redrawIfResized(el) {
    if (el.getAttribute('data-drawn') !== el.clientWidth + 'x' + el.clientHeight) drawAqueduct(el);
  }

  function watchAqueducts() {
    var boxes = document.querySelectorAll('[data-aqueduct]');
    if (!boxes.length) return;
    // Watching each box, not the window, is what catches one that starts hidden and is shown
    // later by the page's own script (the card page does this).
    if ('ResizeObserver' in window) {
      var watcher = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) { redrawIfResized(entry.target); });
      });
      Array.prototype.forEach.call(boxes, function (el) { watcher.observe(el); });
      return;
    }
    var frame = 0;
    function all() { Array.prototype.forEach.call(boxes, redrawIfResized); }
    all();
    window.addEventListener('load', all); // by then the page's own script has shown what it shows
    window.addEventListener('resize', function () {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(all);
    });
  }

  // On the card the drawing scales with the card, like everything else on it.
  function cardAqueduct() {
    return aqueductSvg(SCENES.card, 600, 150, SCENES.card.scale, 'class="card-arches" viewBox="0 0 600 150"');
  }

  // card may be null: the face then shows where the name goes instead of inventing one.
  // opts.still leaves the card out of the hover tilt (the small pictures of a card use it).
  function cardFace(card, opts) {
    var name = card && card.name ? esc(card.name) : 'Your name here';
    var id = card && card.id ? esc(card.id) : 'SG-····-····';
    var validTo = card && card.validTo ? card.validTo : config.term.ends;
    var shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(validTo + 'T00:00:00Z'));
    return '<div class="card"' + (opts && opts.still ? '' : ' data-tilt') + '>' +
      cardAqueduct() +
      '<div class="card-in">' +
      '<div class="card-title">Segovia<br>Student Card<span>' + esc(card && card.termName ? card.termName : config.term.name) + '</span></div>' +
      '<div class="card-badge">' + config.discount + '%<small>OFF</small></div>' +
      '<div class="card-foot"><div style="min-width:0">' +
      '<div class="card-name' + (card && card.name ? '' : ' is-blank') + '" data-card-name>' + name + '</div>' +
      '<div class="card-id">' + id + '</div></div>' +
      '<div class="card-valid">Valid to<b>' + esc(shortDate) + '</b></div></div>' +
      '</div><div class="card-sheen"></div></div>';
  }

  function enableTilt(scope) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    Array.prototype.forEach.call((scope || document).querySelectorAll('[data-tilt]'), function (el) {
      var host = el.parentElement;
      host.addEventListener('pointermove', function (ev) {
        var r = host.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width - 0.5;
        var y = (ev.clientY - r.top) / r.height - 0.5;
        // perspective() lives in the transform itself: the CSS property only reaches direct children.
        el.style.transform = 'perspective(1200px) rotateY(' + (x * 14).toFixed(2) + 'deg) rotateX(' + (-y * 12).toFixed(2) + 'deg)';
        el.style.setProperty('--sheen', (x * 60).toFixed(1) + '%');
      });
      host.addEventListener('pointerleave', function () {
        el.style.transform = '';
        el.style.removeProperty('--sheen');
      });
    });
  }

  function qrSvg(text) {
    var qr = window.qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true, title: 'Card QR code' });
  }

  function realVenues() {
    return config.venues.filter(function (v) { return !v.example && v.name; });
  }

  // Examples are only ever shown while there is not a single real venue.
  function shownVenues() {
    var real = realVenues();
    return real.length ? real : config.venues.filter(function (v) { return v.example; });
  }

  function venueItem(v) {
    var title = v.example ? esc(v.kind) : esc(v.name);
    var sub = v.example ? esc(v.area) : esc(v.kind) + ' · ' + esc(v.area);
    return '<li class="venue"><span class="venue-name">' + title + '</span>' +
      (v.example ? '<span class="tag">Example</span>' : '<span></span>') +
      '<span class="venue-area">' + sub + '</span>' +
      '<span class="venue-offer"><b>' + config.discount + '% off</b> ' + esc(v.offer) + '</span></li>';
  }

  function fillShared() {
    var hasCard = !!getCard();
    var examplesOnly = realVenues().length === 0;

    Array.prototype.forEach.call(document.querySelectorAll('[data-proto]'), function (el) {
      el.textContent = examplesOnly
        ? 'Prototype. No payment is taken, no venue has signed yet, and the venues shown are examples.'
        : 'Prototype. No payment is taken.';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-proto-es]'), function (el) {
      el.textContent = examplesOnly
        ? 'Prototipo. No se cobra nada, todavía no se ha unido ningún local y los locales que aparecen son ejemplos.'
        : 'Prototipo. No se cobra nada.';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cta]'), function (el) {
      el.textContent = hasCard ? 'My card' : 'Get the card';
      el.setAttribute('href', new URL(hasCard ? 'card/' : 'join/', siteRoot).href);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-fill]'), function (el) {
      var key = el.getAttribute('data-fill');
      var values = {
        price: SSC.formatEuros(config.price),
        discount: config.discount + '%',
        term: config.term.name,
        termEnds: SSC.formatDate(config.term.ends),
        termEndsEs: SSC.formatDate(config.term.ends, 'es-ES'),
        breakEven: SSC.formatEuros(SSC.breakEvenSpend(config.price, config.discount)),
        launchVenues: String(config.targets.launchVenues),
        venueTarget: String(config.targets.venues)
      };
      if (key in values) el.textContent = values[key];
    });
    watchAqueducts();
    Array.prototype.forEach.call(document.querySelectorAll('[data-venue-contact]'), function (el) {
      if (config.venueContactUrl) { el.setAttribute('href', config.venueContactUrl); el.hidden = false; }
      else el.hidden = true;
    });
  }

  function registerWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(new URL('sw.js', siteRoot).href).catch(function () { /* offline support is a bonus */ });
    });
  }

  window.SSCApp = {
    config: config,
    siteRoot: siteRoot,
    getCard: getCard,
    termOpen: termOpen,
    issueCard: issueCard,
    removeCard: removeCard,
    getLog: getLog,
    addSaving: addSaving,
    removeLastSaving: removeLastSaving,
    termNameEs: termNameEs,
    verifyUrl: verifyUrl,
    cardFace: cardFace,
    enableTilt: enableTilt,
    qrSvg: qrSvg,
    shownVenues: shownVenues,
    realVenues: realVenues,
    venueItem: venueItem,
    esc: esc
  };

  fillShared();
  registerWorker();
})();
