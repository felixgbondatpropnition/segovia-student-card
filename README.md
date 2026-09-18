# Segovia Student Card

A working prototype of the card from the pitch: €15 a term, 10% off at partner bars,
restaurants and shops in Segovia.

It is a static site. There is no server, no database and no build step, which matches the
pitch ("zero product to build") and lets it run free on GitHub Pages.

## What works

- **Get the card** (`join/`): name, university email, a payment step that is switched off,
  then a card issued to the phone.
- **My card** (`card/`): the card, a QR code, and a running total of what the student has
  saved. Opens with no signal once it has been
  opened once (service worker).
- **Check a card** (`verify/`): what a venue sees after pointing any phone camera at the
  QR code. Green for valid, red for expired or not a card. Spanish first, English second.
- **Venues** (`venues/`) and **For venues** (`for-venues/`, Spanish and English).

## What is deliberately not real yet

- **No payment is taken.** The payment step says so.
- **No venue has signed.** Every listing is marked "Example". Add one real venue to
  `assets/config.js` and the examples disappear on their own.
- **Cards are not signed.** The QR code carries the name, card number and expiry date with a
  checksum that catches a mangled link. Anyone who reads the code could forge one, and a
  screenshot of a real card checks out the same as the card itself. A live
  version issues and signs cards on a server, and checks the student's email first.
- **The card lives in one browser.** Clear the browser data and it is gone.

## Changing things

Everything the team will want to change is in `assets/config.js`: price, discount, term
dates, targets, venues, and the WhatsApp link venues use to get in touch. The exception is
the link-preview text in each page's `<head>` and in `manifest.webmanifest`, which repeats
the price and the discount as plain text. While
`venueContactUrl` is empty the site shows no contact button.

After changing any file in `assets/` or `vendor/`, bump the version: the `?v=` number on the asset
links in every page and `V` in `sw.js` must move together (a test checks they match). That
is what stops a phone from pairing a new page with an old saved script.

The header and footer are repeated in the five pages that have them (`verify/` has neither).
Change one, change all five.

## Running it

    python3 -m http.server 8000      # then open http://localhost:8000
    node --test                      # card logic: encoding, expiry, the money sums

## Credits

QR codes are drawn by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
by Kazuhiko Arase (MIT), vendored in `vendor/`. Fonts are Source Serif 4, Instrument Sans and
JetBrains Mono from Google Fonts. Built with help from Claude (Anthropic).
