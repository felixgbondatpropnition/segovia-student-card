// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const SSC = require('../assets/core.js');
const config = require('../assets/config.js');

// The fixture is a card from the first, per-term version on purpose: those links must keep decoding.
const card = { id: 'SG-7K2M-9QXD', name: 'María José Núñez', termName: 'Autumn term 2026', validTo: '2026-12-18' };
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');

test('a card survives the round trip, accents included', () => {
  assert.deepEqual(SSC.decodeCard(SSC.encodeCard(card)), card);
});

test('the payload is safe to put in a URL fragment', () => {
  assert.match(SSC.encodeCard(card), /^[A-Za-z0-9_-]+$/);
});

test('an edited card is rejected', () => {
  const fields = JSON.parse(Buffer.from(SSC.encodeCard(card), 'base64url').toString('utf8'));
  for (const [index, value] of [[2, 'Someone Else'], [4, '2031-12-18'], [1, 'SG-AAAA-BBBB'], [3, 'Spring term 2027']]) {
    const edited = fields.slice();
    edited[index] = value;
    assert.equal(SSC.decodeCard(b64url(JSON.stringify(edited))), null, 'field ' + index);
  }
});

test('rubbish is rejected, never thrown', () => {
  const bad = ['', null, undefined, 'hello', '%%%', b64url('{}'), b64url('[]'), b64url('[1,2,3,4,5,6]'),
    b64url(JSON.stringify([2, card.id, card.name, card.termName, card.validTo, 'x'])),
    b64url(JSON.stringify([1, card.id, card.name, card.termName, '2026-02-30', SSC.checksum('x')]))];
  for (const p of bad) assert.equal(SSC.decodeCard(p), null, String(p));
});

test('a correctly checksummed card with an impossible date is still rejected', () => {
  const c = { ...card, validTo: '2026-02-30' };
  const sum = SSC.checksum([c.id, c.name, c.termName, c.validTo].join('|'));
  assert.equal(SSC.decodeCard(b64url(JSON.stringify([1, c.id, c.name, c.termName, c.validTo, sum]))), null);
});

test('the card is good on its last day in Madrid and dead the moment that day ends', () => {
  const p = SSC.encodeCard(card);
  // 18 Dec 2026 22:59:59 UTC is 23:59:59 in Madrid (CET, UTC+1).
  assert.equal(SSC.checkPayload(p, new Date('2026-12-18T22:59:59Z')).status, 'valid');
  assert.equal(SSC.checkPayload(p, new Date('2026-12-18T23:00:00Z')).status, 'expired');
  assert.equal(SSC.checkPayload(p, new Date('2026-09-18T10:00:00Z')).status, 'valid');
  assert.equal(SSC.checkPayload('nonsense', new Date()).status, 'unreadable');
});

test('Madrid date follows summer time too', () => {
  // 30 Sep 22:30 UTC is already 1 Oct 00:30 in Madrid (CEST, UTC+2).
  assert.equal(SSC.madridDate(new Date('2026-09-30T22:30:00Z')), '2026-10-01');
  assert.equal(SSC.madridDate(new Date('2026-09-30T21:30:00Z')), '2026-09-30');
});

test('a monthly card runs to the day before the same date next month', () => {
  assert.equal(SSC.validToFor('2026-09-18', 1), '2026-10-17');
  assert.equal(SSC.validToFor('2026-03-01', 1), '2026-03-31');
  assert.equal(SSC.validToFor('2026-12-31', 1), '2027-01-30'); // over the year end
  assert.equal(SSC.validToFor('2026-01-31', 1), '2026-02-27'); // February has no 31st
  assert.equal(SSC.validToFor('2028-01-31', 1), '2028-02-28'); // leap year: clamps to the 29th, less a day
  assert.equal(SSC.validToFor('2026-10-31', 1), '2026-11-29');
  assert.equal(SSC.validToFor('2026-09-18', 3), '2026-12-17');
  // A card issued today is valid today and on its last day, and dead the day after.
  const last = SSC.validToFor('2026-09-18', 1);
  assert.equal(SSC.isExpired(last, new Date('2026-09-18T10:00:00Z')), false);
  assert.equal(SSC.isExpired(last, new Date('2026-10-17T21:59:00Z')), false); // 23:59 in Madrid
  assert.equal(SSC.isExpired(last, new Date('2026-10-17T22:00:00Z')), true); // midnight in Madrid
});

test('money', () => {
  assert.equal(SSC.savingOn(40, 15), 6);
  assert.equal(SSC.savingOn(33.33, 15), 5);
  assert.equal(SSC.savingOn(0.1, 15), 0.02); // 1.5 cents rounds up
  // Bills that float multiplication gets wrong by a cent (4.1 * 15 is 61.49999...).
  assert.equal(SSC.savingOn(4.1, 15), 0.62);
  assert.equal(SSC.savingOn(16.9, 15), 2.54);
  assert.equal(SSC.savingOn(33.3, 15), 5);
  // Every bill up to 10,000 euros agrees with integer half-up arithmetic.
  for (let c = 1; c <= 1000000; c++) {
    const want = Math.floor((c * 15 + 50) / 100);
    if (Math.round(SSC.savingOn(c / 100, 15) * 100) !== want) assert.fail('bill of ' + c + ' cents');
  }
  assert.equal(SSC.breakEvenSpend(10, 15), 67);
  assert.ok(SSC.savingOn(67, 15) >= 10 && SSC.savingOn(66, 15) < 10);
  assert.equal(SSC.breakEvenSpend(5, 10), 50);
  assert.deepEqual(SSC.monthMaths(120, 5, 10), { saved: 12, net: 7, paysBack: true });
  assert.deepEqual(SSC.monthMaths(50, 5, 10), { saved: 5, net: 0, paysBack: true }); // exactly break-even
  assert.deepEqual(SSC.monthMaths(40, 5, 10), { saved: 4, net: -1, paysBack: false });
  assert.deepEqual(SSC.monthMaths(0, 5, 10), { saved: 0, net: -5, paysBack: false });
  // The break-even the site prints really is the first spend that pays back.
  assert.equal(SSC.monthMaths(SSC.breakEvenSpend(config.price, config.discount), config.price, config.discount).paysBack, true);
  assert.equal(SSC.monthMaths(SSC.breakEvenSpend(config.price, config.discount) - 1, config.price, config.discount).paysBack, false);
});

test('ids use the unambiguous alphabet and the right shape', () => {
  const id = SSC.newCardId((n) => Array.from({ length: n }, (_, i) => i * 37));
  assert.match(id, /^SG-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
  // Letters the issuer never uses are refused on the way back in.
  for (const bad of ['SG-OOOO-2222', 'SG-ABCD-EFGU', 'SG-HELL-2222', 'SG-2222-2221', 'sg-abcd-efgh']) assert.equal(SSC.decodeCard(SSC.encodeCard({ ...card, id: bad })), null, bad);
  assert.notEqual(SSC.decodeCard(SSC.encodeCard({ ...card, id })), null);
});

test('names are tidied and capped', () => {
  assert.equal(SSC.cleanName('  Felix \n  Bond '), 'Felix Bond');
  assert.equal(SSC.cleanName('x'.repeat(60)).length, SSC.MAX_NAME);
  assert.equal(SSC.cleanName(null), '');
  assert.equal(SSC.cleanName('Ana \u202eznaloG'), 'Ana znaloG');
});

test('email check', () => {
  assert.ok(SSC.looksLikeEmail('a.b@student.ie.edu'));
  for (const bad of ['', 'a@b', 'a b@c.com', '@c.com', 'a@.c']) assert.ok(!SSC.looksLikeEmail(bad), bad);
});

test('config is sane and the plan name fits in a card', () => {
  assert.ok(config.price > 0 && config.discount > 0 && config.discount < 100);
  assert.ok(Number.isInteger(config.plan.months) && config.plan.months >= 1);
  assert.notEqual(SSC.decodeCard(SSC.encodeCard({ ...card, termName: config.plan.name, validTo: SSC.validToFor('2026-09-18', config.plan.months) })), null);
  for (const v of config.venues) {
    assert.ok(v.kind && v.area && v.offer);
    if (!v.example) assert.ok(v.name, 'a real venue needs a name');
  }
});

test('every page and the service worker agree on the asset version', () => {
  const fs = require('node:fs'), path = require('node:path');
  const root = path.join(__dirname, '..');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const v = sw.match(/var V = '(\d+)'/)[1];
  const pages = ['index.html', 'venues/index.html', 'join/index.html', 'card/index.html', 'verify/index.html', 'for-venues/index.html'];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const links = [...html.matchAll(/(?:href|src)="((?:\.\.\/)?(?:assets\/[\w.-]+\.(?:css|js)|vendor\/[\w.-]+\.js)[^"]*)"/g)].map((m) => m[1]);
    assert.ok(links.length >= 4, page + ' links its assets');
    for (const link of links) assert.ok(link.endsWith('?v=' + v), page + ': ' + link + ' should end ?v=' + v);
  }
  // Only this site's caches may be deleted: the origin is shared with other GitHub Pages sites.
  assert.match(sw, /k\.indexOf\(PREFIX\) === 0 && k !== CACHE/);
});
