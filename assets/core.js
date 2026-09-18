// Pure card logic. No DOM in here so it runs under node for the tests.
(function (root) {
  var ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; // no 0/O, 1/I/L, U
  var ID_SHAPE = /^SG-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/;
  var PAYLOAD_VERSION = 1;
  var MAX_NAME = 40;

  function cleanName(raw) {
    // Direction-override characters could make a name read as something else on the venue's screen.
    return String(raw == null ? '' : raw)
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  }

  function looksLikeEmail(raw) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(raw || '').trim());
  }

  // randomBytes: function (n) -> array-like of n bytes. Injected so tests are repeatable.
  function newCardId(randomBytes) {
    var bytes = randomBytes(8);
    var out = '';
    for (var i = 0; i < 8; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
    return 'SG-' + out.slice(0, 4) + '-' + out.slice(4);
  }

  // FNV-1a, 32 bit. This catches a mangled or hand-edited link. It is NOT security:
  // anyone who reads this file can compute it. A live version signs cards on a server.
  function checksum(text) {
    var bytes = new TextEncoder().encode(text);
    var h = 0x811c9dc5;
    for (var i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  function toBase64Url(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    var b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  function isIsoDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }

  function signingText(card) {
    return [card.id, card.name, card.termName, card.validTo].join('|');
  }

  // card: { id, name, termName, validTo }
  function encodeCard(card) {
    var fields = [PAYLOAD_VERSION, card.id, card.name, card.termName, card.validTo, checksum(signingText(card))];
    return toBase64Url(JSON.stringify(fields));
  }

  // Returns the card, or null for anything that is not a well-formed card. Well-formed is all
  // it can promise: nothing here proves who made the card.
  function decodeCard(payload) {
    try {
      var f = JSON.parse(fromBase64Url(String(payload || '')));
      if (!Array.isArray(f) || f.length !== 6 || f[0] !== PAYLOAD_VERSION) return null;
      var card = { id: f[1], name: f[2], termName: f[3], validTo: f[4] };
      if (typeof card.id !== 'string' || !ID_SHAPE.test(card.id)) return null;
      if (typeof card.name !== 'string' || !card.name || card.name !== cleanName(card.name)) return null;
      if (typeof card.termName !== 'string' || !card.termName || card.termName.length > 40) return null;
      if (!isIsoDate(card.validTo)) return null;
      if (f[5] !== checksum(signingText(card))) return null;
      return card;
    } catch (e) {
      return null;
    }
  }

  // Today's date in Segovia as YYYY-MM-DD, whatever the phone's own time zone is.
  function madridDate(now) {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    var get = function (type) { return parts.filter(function (p) { return p.type === type; })[0].value; };
    return get('year') + '-' + get('month') + '-' + get('day');
  }

  // A card is good up to and including its last day.
  function isExpired(validTo, now) {
    return madridDate(now) > validTo;
  }

  // 'valid' | 'expired' | 'unreadable', plus the card when there is one.
  function checkPayload(payload, now) {
    var card = decodeCard(payload);
    if (!card) return { status: 'unreadable', card: null };
    return { status: isExpired(card.validTo, now) ? 'expired' : 'valid', card: card };
  }

  function daysBetween(fromIso, toIso) {
    return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86400000);
  }

  // Days still to run, today and the last day both counted. 0 once the term is over.
  function daysLeft(validTo, now) {
    return Math.max(0, daysBetween(madridDate(now), validTo) + 1);
  }

  // Full weeks only. Rounding up would promise savings for weeks that do not exist.
  function weeksLeft(validTo, now) {
    return Math.floor(daysLeft(validTo, now) / 7);
  }

  function toCents(euros) {
    return Math.round(euros * 100);
  }

  // Whole cents in, whole cents out, rounded half up. Multiplying euros as floats gets
  // bills like 4.10 wrong by a cent.
  function savingOn(billEuros, discountPct) {
    return Math.floor((toCents(billEuros) * discountPct + 50) / 100) / 100;
  }

  function breakEvenSpend(price, discountPct) {
    return Math.ceil((price * 100) / discountPct);
  }

  // weeklySpend in euros at partner venues.
  function termMaths(weeklySpend, weeks, price, discountPct) {
    var perWeek = savingOn(weeklySpend, discountPct);
    var perWeekCents = toCents(perWeek);
    var total = (perWeekCents * weeks) / 100;
    var payback = perWeekCents > 0 ? Math.ceil(toCents(price) / perWeekCents) : null;
    return {
      perWeek: perWeek,
      total: total,
      net: (perWeekCents * weeks - toCents(price)) / 100,
      weeksToPayBack: payback,
      paysBackInTime: payback !== null && payback <= weeks
    };
  }

  function formatDate(iso, locale) {
    return new Intl.DateTimeFormat(locale || 'en-GB', {
      timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date(iso + 'T00:00:00Z'));
  }

  function formatEuros(amount, locale) {
    var whole = Math.round(amount * 100) % 100 === 0;
    return new Intl.NumberFormat(locale || 'en-GB', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2
    }).format(amount);
  }

  var api = {
    MAX_NAME: MAX_NAME,
    cleanName: cleanName,
    looksLikeEmail: looksLikeEmail,
    newCardId: newCardId,
    checksum: checksum,
    encodeCard: encodeCard,
    decodeCard: decodeCard,
    madridDate: madridDate,
    isExpired: isExpired,
    checkPayload: checkPayload,
    daysLeft: daysLeft,
    weeksLeft: weeksLeft,
    savingOn: savingOn,
    breakEvenSpend: breakEvenSpend,
    termMaths: termMaths,
    formatDate: formatDate,
    formatEuros: formatEuros
  };

  root.SSC = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
