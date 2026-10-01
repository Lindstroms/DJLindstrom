// Alle tekster og links på forsiden – ret frit her.

export const content = {
  instagram: {
    handle: '@viktorlindstrm',
    url: 'https://www.instagram.com/viktorlindstrm/',
  },
  email: 'viktor@fam-lindstrom.dk',

  hero: {
    kicker: 'Firmaevents · Bryllupper · Private fester',
    tagline: 'Lyd, energi og timing, der løfter hele aftenen.',
    image: 'img/hero-viktor.webp', // billede i toppen (i /public)
    imageAlt: 'DJ Lindstrøm bag pulten til en havefest',
  },

  about: {
    title: 'Viktor bag pulten',
    image: 'img/viktor-bar.webp',
    imageAlt: 'Viktor – DJ Lindstrøm – bag pulten',
    paragraphs: [
      'Jeg læser rummet og bygger aftenen op – fra lounge-stemning under middagen til et fyldt dansegulv, når det gælder.',
      'Hvert set skræddersys til jeres gæster, lokation og program. Med professionelt anlæg, lys og fuld teknisk opsætning får I en oplevelse, der matcher eventets niveau.',
    ],
  },

  highlights: [
    { icon: '🎚️', title: 'Skræddersyet set', text: 'Musik tilpasset publikum, tidspunkt og stemning – aldrig en standardplayliste.' },
    { icon: '🔊', title: 'Pro lyd & lys', text: 'Professionelt anlæg og lys, dimensioneret til rummet.' },
    { icon: '⚡', title: 'Svar inden for 24 timer', text: 'Et konkret tilbud – hurtigt og uden binding.' },
  ],

  inAction: {
    title: 'Se mig i aktion',
    video: 'img/viktor-live.mp4',
    videoWebm: 'img/viktor-live.webm',
    poster: 'img/viktor-live-poster.webp',
    photo: 'img/viktor-firmaevent.webp',
    photoAlt: 'DJ Lindstrøm med fuldt lydanlæg til et firmaevent',
  },

  steps: [
    { title: 'Forespørgsel', text: 'Fortæl om eventet – det tager to minutter.' },
    { title: 'Tilbud', text: 'Du får et skræddersyet tilbud inden for 24 timer.' },
    { title: 'Showtime', text: 'Musik og teknik er på plads. I nyder aftenen.' },
  ],

  // Billeder til galleriet – læg filerne i /public/gallery/ og skriv navnene her,
  // fx { src: 'gallery/bryllup-1.jpg', alt: 'Bryllup i Aarhus' }. Sektionen vises først, når der er billeder.
  gallery: [] as { src: string; alt: string }[],
}
