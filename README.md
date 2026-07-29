# PSNtracker

En uoffisiell PSN-spilletidsapp på
[ujicos.github.io/psn](https://ujicos.github.io/psn/) med statisk frontend på GitHub Pages og API på
Cloudflare Workers. Workeren holder NPSSO hemmelig, henter data via `psn-api` og
mellomlagrer ferdige profiler i Cloudflare KV.

> Dette bruker Sonys udokumenterte interne API-er. Endepunkter kan endres uten
> varsel. Prosjektet er ikke tilknyttet Sony Interactive Entertainment.

## Hva kan hentes?

`psn-api` 2.18 eksponerer disse områdene:

| Område | Tilgjengelige data/funksjoner | Praktisk bruk |
|---|---|---|
| Søk | Universelt søk etter online-ID, konto-ID, avatar, land, språk, PS Plus og verifisering | Finn eksakt numerisk `accountId` fra PSN-ID |
| Profil | Online-ID, «About me», avatarer, språk, PS Plus, offisiell verifisering | Profilhode og badges |
| Presence | Online/offline, primærplattform, sist online, aktive spill med navn/ikon/tittel-ID | Statusindikator og «spiller nå» |
| Spillhistorikk | Tittel-ID, navn, bilde, kategori/plattform, eierskap/PS Plus, antall starter, første/siste spilldato og spilletid ned til sekunder | Bibliotek, tidsstatistikk og topplister |
| Troféprofil | Trofénivå, nivåprogresjon og totalt antall bronse/sølv/gull/platina | Globalt trofésammendrag |
| Trofétitler | Trofésett, plattform, ikon, prosent, definerte/opptjente trofeer, skjult-flagg og sist oppdatert | Fremdrift per spill |
| Trofégrupper | Grunnspill og DLC-grupper, opptjente/definerte trofeer per gruppe | DLC-fremdrift |
| Enkeltrofeer | Navn, beskrivelse, grad, sjeldenhet, skjult-status, opptjent-status og tidspunkt | Detaljert troféside |
| Bibliotek for innlogget konto | Nylig spilte og kjøpte PS4-/PS5-spill | Egen privat bibliotekvisning |
| Sosialt | Venners konto-ID-er; for egen konto også blokkeringer og mottatte venneforespørsler | Sosiale funksjoner, underlagt personvern |
| Konto/enheter | Registrerte PS5-, PS4-, PS3- og Vita-enheter for innlogget konto | Enhetsoversikt |
| Deling/region | Delbar profillenke/QR og utledet region | Profilkort og lokalisering |

### De tre statusspørsmålene

- **Online akkurat nå:** Ja, når brukerens personvern tillater det.
  `getBasicPresence` returnerer `onlineStatus`.
- **Appearing Offline:** Nei, ikke pålitelig. PSN svarer normalt `offline`, akkurat
  som når brukeren faktisk er offline. Ikke presenter en antakelse som fakta.
- **Spiller nå / Rich Presence:** Ja, når `gameTitleInfoList` blir returnert. Den kan
  inneholde spillnavn, plattform, ikon og tittel-ID. Tom liste kan bety at brukeren
  ikke spiller, at aktiviteten er skjult, eller at Sony ikke returnerer den.

Alle data er underlagt målbrukerens PSN-personvern. «Komplett historikk» betyr
derfor alle elementer API-et tillater den autentiserende kontoen å se. Spilletid
er PSNs registrerte tid og kan mangle, være forsinket eller avvike fra faktisk tid.

Denne implementasjonen bruker profil, presence, full paginert spillhistorikk,
troféprofil og opptil 800 trofétitler. Trofédata kobles til spill etter normalisert
navn fordi spillhistorikk- og troféendepunktene ikke alltid deler samme ID.
Navnematching er «best effort»; separate regionutgaver kan derfor mangle kobling.

## Prosjektfiler

- `worker.js` – Worker-API, autentisering, paging, normalisering, CORS og KV-cache.
- `index.html` – responsivt mørkt grensesnitt med Tailwind via CDN.
- `app.js` – API-kall, søk, sortering, Topp 10 og rendering uten rammeverk.
- `wrangler.toml` – Worker-, KV- og miljøkonfigurasjon.
- `.dev.vars.example` – mal for lokal NPSSO-secret.

## 1. Hent din NPSSO

1. Åpne en privat nettleserøkt du kontrollerer, gå til
   [playstation.com](https://www.playstation.com/) og logg inn.
2. I **samme nettleserøkt** åpner du
   [ca.account.sony.com/api/v1/ssocookie](https://ca.account.sony.com/api/v1/ssocookie).
3. Kopier bare verdien fra svaret `{"npsso":"..."}`.
4. Behandle den som et passord. Ikke legg den i `worker.js`, `wrangler.toml`,
   GitHub Secrets for Pages eller nettleserens JavaScript, og aldri commit den.
5. Når autentisering slutter å virke, hent en ny verdi og oppdater Worker-secret.

NPSSO gir omfattende tilgang som din innloggede konto. Bruk helst en separat
PSN-konto med minst mulig tilgang, slå på tofaktorautentisering og ikke la API-et
eksponere andre handlinger enn lesing.

## 2. Sett opp Cloudflare Worker og KV

Krav: Node.js 20+ og en Cloudflare-konto.

```bash
cd PSNtracker
npm install
npx wrangler login
npx wrangler kv namespace create PSN_CACHE
```

Kopier namespace-ID-en fra siste kommando og erstatt
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID` i `wrangler.toml`.

Endre også:

```toml
[vars]
ALLOWED_ORIGIN = "https://DITT-GITHUB-NAVN.github.io"
CACHE_TTL_SECONDS = "900"
```

Har Pages-siden en prosjektdomenevariant, er Origin fortsatt
`https://DITT-GITHUB-NAVN.github.io` (Origin inkluderer ikke stien). Flere
tillatte origins kan oppgis kommaseparert. Ikke bruk `*` i produksjon.

Legg inn NPSSO kryptert som Worker-secret:

```bash
npx wrangler secret put NPSSO
```

Lim inn verdien når Wrangler spør. Deploy og test:

```bash
npm run check
npm run deploy
curl https://DIN-WORKER.workers.dev/api/health
curl https://DIN-WORKER.workers.dev/api/player/DIN_PSN_ID
```

API-ruter:

- `GET /api/health`
- `GET /api/player/:onlineId`
- `GET /api/player/:onlineId?refresh=1` omgår lesing fra cache (resultatet skrives
  fortsatt til KV). Ikke eksponer denne varianten ukontrollert på et populært nettsted.

Standard cachetid er 900 sekunder. KV er «eventually consistent», så en ny verdi
kan bruke tid på å nå alle regioner. Gratisnivået har også daglige lese- og
skrivegrenser; en cacheoppføring per bruker reduserer PSN- og KV-belastningen.

### Lokal Worker-utvikling

```bash
cp .dev.vars.example .dev.vars
```

Sett NPSSO i `.dev.vars` (filen er ignorert av Git), og kjør:

```bash
npm run dev
```

Wrangler bruker lokal KV under utvikling. Frontend og Worker på ulike lokale
porter krever at den lokale origin legges til i `ALLOWED_ORIGIN`, for eksempel:

```toml
ALLOWED_ORIGIN = "http://localhost:8000,https://DITT-GITHUB-NAVN.github.io"
```

## 3. Koble frontend til Workeren

Åpne `app.js` og erstatt:

```js
const API_BASE_URL = "https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev";
```

med URL-en Wrangler oppgir etter deploy. Ikke legg til avsluttende `/`.

Test frontend lokalt:

```bash
python3 -m http.server 8000
```

Åpne `http://localhost:8000`. En enkel filåpning med `file://` anbefales ikke,
fordi Origin/CORS og moduloppførsel da skiller seg fra produksjon.

## 4. Publiser på GitHub Pages

1. Opprett/push repositoryet til GitHub. Kontroller først at `.dev.vars` ikke er
   tracket: `git status --short`.
2. Gå til **Settings → Pages** i repositoryet.
3. Under **Build and deployment**, velg **Deploy from a branch**.
4. Velg branchen `main`, mappe `/ (root)`, og trykk **Save**.
5. Vent på den grønne Pages-deployen og åpne URL-en GitHub viser.
6. Hvis du endrer GitHub-brukernavn eller bruker eget domene, oppdater
   `ALLOWED_ORIGIN` og deploy Workeren på nytt.

## Videre funksjoner

De mest nyttige utvidelsene er:

- egen spillside med alle trofeer og DLC-grupper (lazy-load for å spare kall);
- plattform-, år-, fullført- og troféfilter;
- tidslinje og «spilt per måned» – krever egne snapshots, fordi PSN gir første/
  siste dato og totalsum, ikke historisk øktlogg;
- sammenligning mellom profiler;
- CSV/JSON-eksport;
- backlog/ønskeliste lagret lokalt eller i D1;
- trenddata ved periodiske snapshots via Cron Triggers;
- rate limiting med Durable Objects eller Cloudflare Rate Limiting før offentlig
  lansering.

Unngå å cache NPSSO eller access tokens i samme KV som offentlige profilsvar.
NPSSO skal kun være en Worker-secret. Denne Workeren returnerer aldri rå PSN-svar
med tokens og tilbyr bare leseruter.

## Kilder

- [`psn-api` dokumentasjon og API-oversikt](https://www.npmjs.com/package/psn-api)
- [`psn-api` prosjekt](https://github.com/achievements-app/psn-api)
- [Cloudflare Workers KV](https://developers.cloudflare.com/kv/)
- [KV namespace-binding](https://developers.cloudflare.com/kv/concepts/kv-namespaces/)
- [Wrangler secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [GitHub Pages – publisering fra branch](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
