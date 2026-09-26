// Alle tekster og links på forsiden – ret frit her.

export const content = {
  instagram: {
    handle: '@viktorlindstrm',
    url: 'https://www.instagram.com/viktorlindstrm/',
  },
  email: 'viktor@fam-lindstrom.dk',

  hero: {
    kicker: 'DJ til fest, bryllup & firmaevent',
    tagline: 'Fyld dansegulvet – fra første skål til sidste sang.',
    image: 'img/hero.webp', // baggrund i toppen (i /public)
  },

  about: {
    title: 'Hej, jeg er Viktor',
    image: 'img/viktor-pult.webp',
    imageAlt: 'DJ Lindstrom bag pulten',
    paragraphs: [
      'Jeg spiller under navnet DJ Lindstrom, og jeg elsker at læse et dansegulv og finde præcis det nummer, der får alle op at stå.',
      'Uanset om det er en 18 års fødselsdag, et bryllup eller en firmafest, aftaler vi musikken på forhånd, så den passer til jer og jeres gæster – fra de nyeste hits til klassikerne alle kan synge med på.',
    ],
  },

  highlights: [
    { icon: '🎶', title: 'Musik til alle', text: 'Hits, klassikere og ønsker – tilpasset jeres gæster.' },
    { icon: '🔊', title: 'Lyd & lys', text: 'Jeg kan medbringe anlæg og lys, der passer til stedet.' },
    { icon: '⚡', title: 'Hurtigt svar', text: 'Du får et uforpligtende tilbud inden for 24 timer.' },
  ],

  steps: [
    { title: 'Send en forespørgsel', text: 'Vælg event, dato og hvad du har brug for. Det tager 2 minutter.' },
    { title: 'Få et tilbud', text: 'Jeg vender tilbage med et tilbud inden for 24 timer.' },
    { title: 'Fest!', text: 'Vi aftaler musikken, og jeg sørger for stemningen.' },
  ],

  // Billeder til galleriet – læg filerne i /public/gallery/ og skriv navnene her,
  // fx { src: 'gallery/bryllup-1.jpg', alt: 'Bryllup i Aarhus' }. Sektionen vises først, når der er billeder.
  gallery: [] as { src: string; alt: string }[],
}
