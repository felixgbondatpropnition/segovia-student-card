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

  var archCount = 0;
  // Two tiers of arches, the way the aqueduct stacks them. `fill` paints the stone and the
  // arches are holes, so whatever sits behind shows through.
  function archTiers(fill, width) {
    var id = 'arch' + (++archCount);
    return '<defs>' +
      '<pattern id="' + id + 'u" width="72" height="66" patternUnits="userSpaceOnUse">' +
      '<path fill="' + fill + '" fill-rule="evenodd" d="M0 0h72v66H0zM14 66V32a22 22 0 0 1 44 0v34z"/></pattern>' +
      '<pattern id="' + id + 'l" y="66" width="72" height="130" patternUnits="userSpaceOnUse">' +
      '<path fill="' + fill + '" fill-rule="evenodd" d="M0 0h72v130H0zM12 130V38a24 24 0 0 1 48 0v92z"/></pattern>' +
      '</defs>' +
      '<rect width="' + width + '" height="66" fill="url(#' + id + 'u)"/>' +
      '<rect y="66" width="' + width + '" height="130" fill="url(#' + id + 'l)"/>';
  }

  // On the card the arches scale with the card.
  function archesSvg(fill, className) {
    return '<svg class="' + className + '" aria-hidden="true" focusable="false" preserveAspectRatio="xMinYMax slice" viewBox="0 0 1440 196">' +
      archTiers(fill, '1440') + '</svg>';
  }

  // Across the page they keep their size and simply repeat.
  function aqueductBand(fill) {
    return '<svg aria-hidden="true" focusable="false" width="100%" height="196">' + archTiers(fill, '100%') + '</svg>';
  }

  // card may be null: the face then shows where the name goes instead of inventing one.
  function cardFace(card) {
    var name = card && card.name ? esc(card.name) : 'Your name here';
    var id = card && card.id ? esc(card.id) : 'SG-····-····';
    var validTo = card && card.validTo ? card.validTo : config.term.ends;
    var shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(validTo + 'T00:00:00Z'));
    return '<div class="card" data-tilt>' +
      archesSvg('#F9E795', 'card-arches') +
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
    Array.prototype.forEach.call(document.querySelectorAll('[data-aqueduct]'), function (el) {
      el.innerHTML = aqueductBand(el.getAttribute('data-aqueduct') || '#2F3C7E');
    });
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
