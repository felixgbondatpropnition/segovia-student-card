// Everything the team will want to change lives here: price, discount, term, targets, venues
// and the contact link. The one exception is the link-preview text in each page's <head> and
// in manifest.webmanifest, which is plain HTML and repeats the price and the discount.
(function (root) {
  var config = {
    price: 10, // euros per term
    discount: 15, // per cent off at partner venues

    // The card runs for one term and expires at the end of `ends` (Madrid time).
    term: { name: 'Autumn term 2026', nameEs: 'Trimestre de otoño 2026', ends: '2026-12-18' },

    // Targets from the pitch. Shown as targets, never as achievements.
    targets: { launchVenues: 10, venues: 30 },

    // How a venue gets in touch. Leave empty until the team has a number or a group:
    // while it is empty the site shows no contact button at all.
    // Example: 'https://wa.me/34600000000' or a WhatsApp group invite link.
    venueContactUrl: '',

    // `example: true` means nobody has signed. The site labels these as examples and
    // drops them the moment a single real venue (example: false, with a name) is added.
    venues: [
      { example: true, kind: 'Tapas bar', area: 'San Lorenzo', offer: 'food and drink' },
      { example: true, kind: 'Café', area: 'Plaza Mayor', offer: 'coffee, breakfast and cakes' },
      { example: true, kind: 'Asador', area: 'Old town', offer: 'lunch and dinner' },
      { example: true, kind: 'Cocktail bar', area: 'Calle Real', offer: 'all drinks' },
      { example: true, kind: 'Bakery', area: 'San Lorenzo', offer: 'everything on the counter' },
      { example: true, kind: 'Bookshop', area: 'Old town', offer: 'books and stationery' },
      { example: true, kind: 'Barber', area: 'By the Aqueduct', offer: 'cuts and shaves' },
      { example: true, kind: 'Gym', area: 'By the Aqueduct', offer: 'memberships' }
    ]
  };

  root.SSC_CONFIG = config;
  if (typeof module !== 'undefined') module.exports = config;
})(typeof window !== 'undefined' ? window : globalThis);
