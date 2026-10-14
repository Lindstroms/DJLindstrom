import type { ReactNode } from 'react'
import { content } from '../content'

const UPDATED = '14. oktober 2026'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-display text-lg font-black">{title}</h2>
      <div className="grid gap-2 text-sm leading-relaxed text-zinc-300">{children}</div>
    </section>
  )
}

// Privatlivspolitik (GDPR). Holdes i almindeligt sprog – og skal opdateres, hvis siden begynder at indsamle mere.
export default function Privacy() {
  return (
    <article className="grid grid-cols-1 gap-7">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Privatlivspolitik</p>
        <h1 className="mt-2 font-display text-2xl font-black sm:text-3xl">Sådan passer jeg på dine oplysninger</h1>
        <p className="mt-2 text-sm text-zinc-400">Senest opdateret {UPDATED}</p>
      </header>

      <Section title="Hvem er ansvarlig?">
        <p>
          Lindstrøm Management (DJ Lindstrøm)
          <br />
          CVR 46097939 · Hjortevænget 205, 2980 Kokkedal
          <br />
          E-mail:{' '}
          <a className="text-accent" href={`mailto:${content.email}`}>
            {content.email}
          </a>{' '}
          · Tlf. 50 45 50 55
        </p>
        <p>Har du spørgsmål til, hvordan dine oplysninger bruges, så skriv eller ring – så svarer jeg hurtigst muligt.</p>
      </Section>

      <Section title="Hvilke oplysninger gemmer jeg – og hvorfor?">
        <ul className="grid list-disc gap-2 pl-5">
          <li>
            <b>Når du sender en forespørgsel:</b> navn, evt. firma, e-mail, telefon, adresse for festen, dato, antal gæster, valg af
            lyd & lys og din besked. Det bruger jeg til at svare dig, sende et tilbud og planlægge festen.{' '}
            <i>Retsgrundlag: indgåelse og opfyldelse af en aftale (GDPR art. 6, stk. 1, litra b).</i>
          </li>
          <li>
            <b>Tilbud og fakturaer:</b> navn, adresse, e-mail, evt. CVR og beløb.{' '}
            <i>Retsgrundlag: aftale samt bogføringsloven (art. 6, stk. 1, litra b og c).</i>
          </li>
          <li>
            <b>Musikønsker og tidsplan</b>, som du selv udfylder via din bookingside – fx sangønsker, program for aftenen og en
            kontaktperson på dagen. Skriver du en anden persons navn og telefon som kontakt, så sørg for, at vedkommende er
            indforstået. <i>Retsgrundlag: opfyldelse af aftalen (litra b) og min legitime interesse i at afvikle festen (litra f).</i>
          </li>
          <li>
            <b>Gæsternes sangønsker under festen:</b> sang, evt. fornavn og et tilfældigt, anonymt id gemt i gæstens browser, så man
            kun kan stemme én gang. <i>Retsgrundlag: legitim interesse (litra f).</i>
          </li>
          <li>
            <b>Anmeldelser:</b> stjerner, tekst og det navn, du vælger. Anmeldelsen vises kun på siden, hvis du har sagt ja til
            det. <i>Retsgrundlag: samtykke (litra a) – du kan til enhver tid trække det tilbage.</i>
          </li>
        </ul>
        <p>Jeg sælger aldrig dine oplysninger og bruger dem ikke til nyhedsbreve eller reklame.</p>
      </Section>

      <Section title="Hvem kan se oplysningerne?">
        <p>Kun mig. For at siden kan fungere, bruger jeg disse leverandører (databehandlere), som behandler data på mine vegne:</p>
        <ul className="grid list-disc gap-1 pl-5">
          <li>
            <b>Supabase</b> – database og login. Data ligger på servere i EU (Irland).
          </li>
          <li>
            <b>Resend</b> – afsendelse af e-mails (kvitteringer, tilbud og fakturaer). Overførsel til USA sker efter EU's
            standardkontraktbestemmelser.
          </li>
          <li>
            <b>GitHub Pages</b> – hosting af selve hjemmesiden. Som på alle hjemmesider registreres din IP-adresse i serverens
            tekniske logfiler.
          </li>
        </ul>
        <p>
          Når du søger efter sange, sendes kun søgeordet videre til Apple (iTunes) og Deezer. Albumcovers og 30-sekunders
          lydklip hentes direkte fra deres servere, når du ser eller afspiller dem.
        </p>
      </Section>

      <Section title="Hvor længe gemmer jeg dem?">
        <ul className="grid list-disc gap-1 pl-5">
          <li>Forespørgsler, der ikke bliver til en booking, slettes automatisk 12 måneder efter festens dato.</li>
          <li>Gæsternes sangønsker slettes automatisk 30 dage efter festen.</li>
          <li>
            Bookinger, tilbud og fakturaer gemmes i 5 år fra udgangen af regnskabsåret, som bogføringsloven kræver – derefter
            slettes de.
          </li>
          <li>Anmeldelser gemmes, indtil du beder mig fjerne dem.</li>
        </ul>
      </Section>

      <Section title="Cookies">
        <p>
          Siden bruger hverken cookies, statistik eller reklame-tracking. Din browser gemmer kun det, der er nødvendigt for, at
          siden virker – fx et anonymt id til afstemningen om sangønsker. Derfor er der ingen cookie-banner.
        </p>
      </Section>

      <Section title="Dine rettigheder">
        <p>
          Du har ret til at få indsigt i de oplysninger, jeg har om dig, og til at få dem rettet, slettet, begrænset eller udleveret
          (dataportabilitet). Du kan også gøre indsigelse mod behandlingen og trække et samtykke tilbage. Oplysninger, som
          bogføringsloven kræver, at jeg gemmer, kan dog først slettes, når fristen er udløbet.
        </p>
        <p>
          Skriv til{' '}
          <a className="text-accent" href={`mailto:${content.email}`}>
            {content.email}
          </a>
          , så hjælper jeg dig.
        </p>
        <p>
          Er du utilfreds med, hvordan jeg behandler dine oplysninger, kan du klage til Datatilsynet, Carl Jacobsens Vej 35, 2500
          Valby –{' '}
          <a className="text-accent" href="https://www.datatilsynet.dk" target="_blank" rel="noreferrer">
            datatilsynet.dk
          </a>
          .
        </p>
      </Section>
    </article>
  )
}
