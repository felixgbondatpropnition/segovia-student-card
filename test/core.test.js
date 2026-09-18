// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const SSC = require('../assets/core.js');
const config = require('../assets/config.js');

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

test('weeks left counts full weeks only and never overstates', () => {
  assert.equal(SSC.daysLeft('2026-12-18', new Date('2026-09-18T10:00:00Z')), 92);
  assert.equal(SSC.weeksLeft('2026-12-18', new Date('2026-09-18T10:00:00Z')), 13); // 92 days
  assert.equal(SSC.weeksLeft('2026-12-18', new Date('2026-12-11T10:00:00Z')), 1); // 8 days is one week, not two
  assert.equal(SSC.weeksLeft('2026-12-18', new Date('2026-12-12T10:00:00Z')), 1); // exactly 7 days
  assert.equal(SSC.weeksLeft('2026-12-18', new Date('2026-12-13T10:00:00Z')), 0);
  assert.equal(SSC.daysLeft('2026-12-18', new Date('2026-12-18T10:00:00Z')), 1); // last day still counts
  assert.equal(SSC.daysLeft('2026-12-18', new Date('2026-12-19T10:00:00Z')), 0);
  assert.equal(SSC.daysLeft('2026-12-18', new Date('2027-01-10T10:00:00Z')), 0);
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
  assert.equal(SSC.breakEvenSpend(15, 10), 150);
  assert.deepEqual(SSC.termMaths(40, 13, 15, 10), { perWeek: 4, total: 52, net: 37, weeksToPayBack: 4, paysBackInTime: true });
  // The break-even the site prints really is the first spend that covers the price.
  assert.ok(SSC.savingOn(SSC.breakEvenSpend(config.price, config.discount), config.discount) >= config.price);
  assert.ok(SSC.savingOn(SSC.breakEvenSpend(config.price, config.discount) - 1, config.discount) < config.price);
  assert.ok(SSC.savingOn(67, 15) >= 10 && SSC.savingOn(66, 15) < 10);
  assert.deepEqual(SSC.termMaths(40, 13, 10, 15), { perWeek: 6, total: 78, net: 68, weeksToPayBack: 2, paysBackInTime: true });
  assert.deepEqual(SSC.termMaths(5, 13, 10, 15), { perWeek: 0.75, total: 9.75, net: -0.25, weeksToPayBack: 14, paysBackInTime: false });
  assert.deepEqual(SSC.termMaths(0, 14, 10, 15), { perWeek: 0, total: 0, net: -10, weeksToPayBack: null, paysBackInTime: false });
  assert.equal(SSC.termMaths(10, 3, 10, 15).paysBackInTime, false); // 1.50 a week needs 7 weeks
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

test('config is sane and the term name fits in a card', () => {
  assert.ok(config.price > 0 && config.discount > 0 && config.discount < 100);
  assert.notEqual(SSC.decodeCard(SSC.encodeCard({ ...card, termName: config.term.name, validTo: config.term.ends })), null);
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
