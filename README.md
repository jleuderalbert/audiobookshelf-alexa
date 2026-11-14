# audiobookshelf-alexa

A personal-use Alexa skill that streams audiobooks from a self-hosted
[audiobookshelf](https://www.audiobookshelf.org/) instance.

It runs on AWS Lambda (Node.js 24) and uses Alexa's `AudioPlayer`
interface to stream tracks directly from your audiobookshelf server.
Playback progress is synced back to audiobookshelf so it stays in sync
with the web/mobile apps.

> 🇩🇪 **Deutsche Version weiter unten** — siehe [Deutsche Anleitung](#deutsche-anleitung).

---

# English

## Features

The default **invocation name** is `audiobookshelf` (English) and
`meine hörbücher` (German); change it in
`skill-package/interactionModels/custom/*.json` if you want
something else. In German pick a multi-word phrase: German speech
recognition splits "audiobookshelf" into separate words. In English,
`my audiobooks` is taken by another skill or Amazon feature, so
utterances with it never reach this skill.

- **Launch** — `Alexa, open audiobookshelf`.
- **Play by title** — `play <title>`. Searches the library, picks the
  top hit, and resumes from saved progress if the book was already
  started.
- **Continue** — `continue` resumes the most recently played
  in-progress audiobook. `continue <title>` resumes a specific one.
- **In-progress list** — `what am I listening to?` lists the top five.
- **Chapter navigation** — `next` jumps to the next chapter;
  `previous` jumps to the previous. Uses audiobookshelf's
  `media.chapters[]`, not file boundaries.
- **Time-based seek** — `skip 30 seconds back`,
  `skip 5 minutes forward`.
- **Sleep timer** — `set a sleep timer for 30 minutes`. Cancel with
  `cancel sleep timer`. The deadline is encoded in the AudioPlayer
  token; playback stops at the end of the next track that finishes
  after the deadline (i.e. up to one track length of overshoot — no
  external scheduler required).
- **Listing** — `list my libraries`, `what is new?` for recently added
  books.
- **Standard transport** — `pause`, `resume`, `stop`. Hardware
  Next/Previous buttons (`PlaybackController.*`) map to chapter skip.
- **en-US and de-DE locales.**

## Prerequisites

1. An audiobookshelf instance reachable from the public internet over
   **HTTPS** with a valid certificate. Alexa's AudioPlayer fetches stream
   URLs directly from your server, so it cannot be on a private LAN.
2. An audiobookshelf **API key**: in the web UI go to *Settings → Users
   → API Keys*, create one for the user account you want to use, and
   copy the JWT it shows once.
3. An [Amazon Developer](https://developer.amazon.com/alexa) account and
   an AWS account.
4. Either the [ASK CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/quick-start-alexa-skills-kit-command-line-interface.html)
   (`npm i -g ask-cli`) or willingness to copy/paste files into the
   developer console and zip up the Lambda by hand.

## Layout

```
.
├── skill-package/                 # Alexa skill manifest + interaction models
│   ├── skill.json
│   └── interactionModels/custom/{de-DE,en-US}.json
├── lambda/                        # AWS Lambda backend
│   ├── index.js                   # Skill entry point and intent handlers
│   ├── lib/
│   │   ├── absClient.js           # audiobookshelf HTTP client
│   │   ├── playback.js            # AudioPlayer token + offset helpers
│   │   └── strings.js             # Localized response strings
│   └── test/                      # node:test unit tests
├── docs/installation{,.de}.md     # Installation guides (EN / DE)
├── .github/workflows/             # automatic Lambda + skill deploys (skill via jleuderalbert/alexa-skill-deploy)
├── ask-resources.json             # ASK CLI deployment config
└── .env.example                   # Required Lambda env vars
```

## Installation

Step-by-step setup (audiobookshelf over HTTPS, Lambda, Alexa skill), troubleshooting,
re-deploying and automatic deployment with GitHub Actions:
**[docs/installation.md](docs/installation.md)**.

## Development

```bash
cd lambda
npm install
npm test            # 39 tests across helpers, HTTP client, and the handler
node --check index.js
```

### Debugging without an Echo

`test/handler.test.js` invokes `exports.handler` directly with synthesized
Alexa request envelopes (Launch, IntentRequest, AudioPlayer events,
PlaybackController). The audiobookshelf API is stubbed via an in-memory
mock (`test/fixtures/abs-mock.js`), so the suite runs offline.

This is the only way to test the **AudioPlayer event flow** — the
Developer Console simulator and `ask dialog` don't fire
`AudioPlayer.PlaybackStarted` / `PlaybackNearlyFinished` /
`PlaybackStopped`, so the auto-enqueue and sleep-timer logic cannot be
verified there. The handler tests cover those events end-to-end:

```bash
npm test
```

Iteration loop: edit `index.js` → `npm test` → done.

For ad-hoc live testing against a real audiobookshelf instance, set
`ABS_BASE_URL` and `ABS_API_KEY` and call `lib/absClient.js` directly:

```js
const { fromEnv } = require('./lib/absClient');
const c = fromEnv();
c.listLibraries().then((r) => console.log(JSON.stringify(r, null, 2)));
```

## Voice-command cheat sheet

Alexa treats commands differently depending on whether your skill
is in an **active session** (you just said "open audiobookshelf"
and Alexa is listening for follow-ups) or **AudioPlayer mode** (a
book is playing). During AudioPlayer mode only built-in intents
get routed to the skill without an explicit invocation — custom
phrases need the skill name.

| What you want | Active session | AudioPlayer mode (book playing) |
|---|---|---|
| Start a book | `play <title>` | `Alexa, ask audiobookshelf to play <title>` |
| Continue last book | `continue` | not applicable (already playing) |
| Pause | `pause` | `Alexa, pause` |
| Stop | `stop` | `Alexa, stop` |
| Next chapter | `next chapter` / `next` | **`Alexa, next`** (built-in) |
| Previous chapter | `previous chapter` / `previous` | **`Alexa, previous`** (built-in) |
| Skip ±N seconds/minutes | `skip 30 seconds forward` | `Alexa, ask audiobookshelf to skip 30 seconds forward` |
| Sleep timer | `set a sleep timer for 20 minutes` | `Alexa, ask audiobookshelf sleep timer 20 minutes` |
| What's playing | `what am I listening to` | use Alexa app or pause first |

> **Why "next chapter" doesn't work bare while a book is playing.**
> Alexa Skills Kit only forwards a fixed list of built-in intents
> (`AMAZON.NextIntent`, `AMAZON.PreviousIntent`, `AMAZON.PauseIntent`,
> `AMAZON.StopIntent`, `AMAZON.ResumeIntent`, …) to the skill during
> AudioPlayer playback. Custom intents like `NextChapterIntent` only
> match when the skill is explicitly invoked. The good news: the
> built-in `Alexa, next` already does the chapter jump, because the
> skill maps `AMAZON.NextIntent` to the same handler as
> `NextChapterIntent`.

## Limitations / known gaps

- **Personal use only.** There is no account linking; the same
  `ABS_API_KEY` is used for every invocation. Don't publish this skill
  on the public Alexa store as-is.
- **Search is best-effort.** The skill first tries audiobookshelf's
  server-side search with several query variants (raw, dehyphenated,
  article-stripped, longest-keyword) and falls back to a local
  fuzzy match (3-gram score with substring bonus, umlaut/punctuation
  normalization) over the entire library if that fails. This catches
  Alexa's habit of mashing words together and English-y endings. If
  you have hundreds of books with very similar titles, the top result
  might still be wrong; in that case prefer the most distinctive
  word from the title.
- **Sleep timer overshoot** — the deadline is enforced at AudioPlayer
  event boundaries. Playback stops at the end of whichever track is
  nearly-finished after the deadline. For an audiobook with 30-minute
  files the timer can overshoot by up to one file; for files of a few
  minutes (typical chapter-per-file rips) the overshoot is small.
- **Progress sync** sends a heartbeat on AudioPlayer events; sub-second
  accuracy relative to the audiobookshelf web player is not guaranteed.
- **Continue picks the newest in-progress book** when no title is
  given. With many in-progress books, prefer `continue <title>` for
  predictability.

## Audiobookshelf API references

- API reference (notes itself as out-of-date but still the best
  starting point): <https://api.audiobookshelf.org/>
- API keys guide: <https://www.audiobookshelf.org/guides/api-keys/>
- Current API source of truth: the audiobookshelf server source itself
  at <https://github.com/advplyr/audiobookshelf>.

---

# Deutsche Anleitung

Ein Alexa-Skill für den Privatgebrauch, der Hörbücher von einer
selbst gehosteten [audiobookshelf](https://www.audiobookshelf.org/)-
Instanz streamt.

Er läuft auf AWS Lambda (Node.js 24) und nutzt Alexas
`AudioPlayer`-Schnittstelle, um Tracks direkt vom audiobookshelf-Server
zu streamen. Der Wiedergabefortschritt wird zurück an audiobookshelf
synchronisiert, sodass alles mit der Web-/Mobile-App in Sync bleibt.

## Funktionen

Der Standard-**Aufrufname** ist `meine hörbücher` (Deutsch) und
`audiobookshelf` (Englisch); änderbar in
`skill-package/interactionModels/custom/*.json`. Auf Deutsch eine
mehrwortige Phrase wählen: die deutsche Spracherkennung zerlegt
"audiobookshelf" in einzelne Wörter. Auf Englisch ist `my audiobooks`
von einem anderen Skill oder einer Amazon-Funktion belegt, Äußerungen
damit erreichen diesen Skill nie.

- **Starten** — `Alexa, öffne meine hörbücher`.
- **Spielen nach Titel** — `Spiele <Titel>`. Durchsucht die
  Bibliothek, nimmt den besten Treffer und setzt am gespeicherten
  Fortschritt fort, falls das Buch schon begonnen wurde.
- **Weitermachen** — `Mache weiter` setzt das zuletzt gespielte
  laufende Hörbuch fort. `Mache mit <Titel> weiter` setzt ein
  bestimmtes fort.
- **Liste laufender Bücher** — `Welche Bücher höre ich gerade?` listet
  die fünf neuesten.
- **Kapitelnavigation** — `Nächstes Kapitel` springt zum nächsten;
  `voriges Kapitel` zum vorherigen. Nutzt audiobookshelfs
  `media.chapters[]`, nicht Dateigrenzen.
- **Zeitsprung** — `Spring 30 Sekunden zurück`,
  `Spring 5 Minuten vor`.
- **Sleep Timer** — `Stelle den Sleep Timer auf 30 Minuten`.
  Beenden mit `Sleep Timer aus`. Das Ablaufdatum steckt im
  AudioPlayer-Token; die Wiedergabe stoppt am Ende des nächsten Tracks,
  der nach Ablauf endet (also bis zu eine Tracklänge Überlauf — kein
  externer Scheduler nötig).
- **Listen** — `Liste meine Bibliotheken`, `Was ist neu?` für zuletzt
  hinzugefügte Bücher.
- **Standard-Steuerung** — `pause`, `weiter`, `stop`. Hardware-
  Next/Previous-Tasten (`PlaybackController.*`) springen Kapitel.
- **de-DE und en-US.**

## Voraussetzungen

1. Eine audiobookshelf-Instanz, die aus dem öffentlichen Internet
   über **HTTPS** mit gültigem Zertifikat erreichbar ist. Alexas
   AudioPlayer holt Stream-URLs direkt vom Server, kann also nicht im
   privaten LAN sein.
2. Ein audiobookshelf-**API-Key**: in der Web-UI unter *Settings →
   Users → API Keys* erstellen und das einmalig angezeigte JWT
   kopieren.
3. Ein [Amazon-Developer-Konto](https://developer.amazon.com/alexa)
   und ein AWS-Konto.
4. Entweder die [ASK CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/quick-start-alexa-skills-kit-command-line-interface.html)
   (`npm i -g ask-cli`) oder die Bereitschaft, Dateien manuell in die
   Developer Console zu kopieren und die Lambda per Hand zu zippen.

## Installation

Schritt-für-Schritt-Einrichtung (audiobookshelf per HTTPS, Lambda, Alexa-Skill), Fehlersuche,
Neu-Deployen und automatisches Deployment mit GitHub Actions:
**[docs/installation.de.md](docs/installation.de.md)**.

## Entwicklung

```bash
cd lambda
npm install
npm test            # 39 Tests über Helfer, HTTP-Client und Handler
node --check index.js
```

### Debuggen ohne Echo

`test/handler.test.js` ruft `exports.handler` direkt mit
synthetisierten Alexa-Request-Envelopes (Launch, IntentRequest,
AudioPlayer-Events, PlaybackController) auf. Die audiobookshelf-API
ist über einen In-Memory-Mock (`test/fixtures/abs-mock.js`) gestubbt,
der ganze Suite läuft offline.

Das ist der einzige Weg, den **AudioPlayer-Event-Flow** zu testen —
Developer-Console-Simulator und `ask dialog` feuern keine
`AudioPlayer.PlaybackStarted` / `PlaybackNearlyFinished` /
`PlaybackStopped`, sodass Auto-Enqueue und Sleep-Timer-Logik dort
nicht prüfbar sind. Die Handler-Tests decken diese Events
end-to-end ab:

```bash
npm test
```

Iterationsschleife: `index.js` editieren → `npm test` → fertig.

Für ad-hoc Live-Tests gegen eine echte audiobookshelf-Instanz
`ABS_BASE_URL` und `ABS_API_KEY` setzen und `lib/absClient.js` direkt
aufrufen:

```js
const { fromEnv } = require('./lib/absClient');
const c = fromEnv();
c.listLibraries().then((r) => console.log(JSON.stringify(r, null, 2)));
```

## Sprachbefehl-Spickzettel

Alexa behandelt Befehle unterschiedlich, je nachdem, ob dein Skill in
einer **aktiven Session** ist (du hast gerade "öffne meine hörbücher"
gesagt und Alexa wartet auf Folgebefehle) oder im **AudioPlayer-Modus**
(ein Buch läuft). Im AudioPlayer-Modus erreichen den Skill nur
Built-in-Intents ohne explizite Anrufung — eigene Phrasen brauchen den
Skill-Namen.

| Was du willst | Aktive Session | AudioPlayer-Modus (Buch läuft) |
|---|---|---|
| Buch starten | `spiele <titel>` | `Alexa, sage meine hörbücher spiele <titel>` |
| Letztes Buch fortsetzen | `mache weiter` | nicht nötig (läuft schon) |
| Pause | `pause` | `Alexa, pause` |
| Stop | `stop` | `Alexa, stop` |
| Nächstes Kapitel | `nächstes kapitel` / `weiter` | **`Alexa, weiter`** oder `Alexa, nächstes` (Built-in) |
| Voriges Kapitel | `voriges kapitel` / `zurück` | **`Alexa, zurück`** (Built-in) |
| ±N Sekunden/Minuten springen | `spring 30 sekunden vor` | `Alexa, sage meine hörbücher spring 30 sekunden vor` |
| Sleep Timer | `stelle den sleep timer auf 20 minuten` | `Alexa, sage meine hörbücher sleep timer 20 minuten` |
| Was läuft gerade | `welche bücher höre ich gerade` | Alexa-App nutzen oder vorher pausieren |

> **Warum "nächstes Kapitel" während der Wiedergabe nicht ohne
> weiteres geht.** Alexa Skills Kit leitet im AudioPlayer-Modus nur
> eine feste Liste Built-in-Intents (`AMAZON.NextIntent`,
> `AMAZON.PreviousIntent`, `AMAZON.PauseIntent`, `AMAZON.StopIntent`,
> `AMAZON.ResumeIntent`, …) an den Skill weiter. Eigene Intents wie
> `NextChapterIntent` matchen nur bei expliziter Anrufung. Die gute
> Nachricht: `Alexa, weiter` macht den Kapitelsprung schon, weil der
> Skill `AMAZON.NextIntent` auf denselben Handler wie
> `NextChapterIntent` mappt.

## Einschränkungen / bekannte Lücken

- **Nur für Privatgebrauch.** Kein Account-Linking; derselbe
  `ABS_API_KEY` wird für jede Anfrage verwendet. Diesen Skill nicht
  unverändert im öffentlichen Alexa-Store veröffentlichen.
- **Suche ist Best-Effort.** Der Skill probiert zuerst die
  serverseitige audiobookshelf-Suche mit mehreren Query-Varianten
  (roh, ohne Bindestriche, ohne Artikel, längstes Schlagwort) und
  fällt auf einen lokalen Fuzzy-Match zurück (3-Gramm-Score mit
  Substring-Bonus, Umlaut-/Interpunktion-Normalisierung) über die
  ganze Bibliothek. Das fängt Alexas Eigenheit, Wörter zu verschmelzen
  (`kanguruchroniken` → `Känguru-Chroniken`) und Endungen zu
  verenglischen (`kangaroochronicles`). Bei hunderten Büchern mit
  sehr ähnlichen Titeln kann der Top-Treffer trotzdem falsch sein —
  dann das markanteste Wort des Titels nennen
  (`spiele Känguru-Chroniken`).
- **Sleep-Timer-Überlauf** — die Deadline greift an
  AudioPlayer-Event-Grenzen. Die Wiedergabe endet am Ende des Tracks,
  der nach der Deadline fast fertig ist. Bei 30-Minuten-Dateien kann
  der Timer bis zu eine Datei überlaufen; bei wenigen Minuten
  (typisch ein Kapitel pro Datei) ist der Überlauf gering.
- **Fortschritts-Sync** sendet einen Heartbeat bei AudioPlayer-Events;
  sub-Sekunden-Genauigkeit gegenüber dem audiobookshelf-Web-Player ist
  nicht garantiert.
- **`Mache weiter` nimmt das neueste laufende Buch**, wenn kein Titel
  genannt ist. Bei vielen offenen Büchern lieber
  `Mache mit <Titel> weiter` für Vorhersagbarkeit.

## audiobookshelf-API-Referenzen

- API-Referenz (laut Eigenangabe veraltet, aber bester Startpunkt):
  <https://api.audiobookshelf.org/>
- API-Keys-Guide: <https://www.audiobookshelf.org/guides/api-keys/>
- Aktuelle API-Quelle der Wahrheit: der audiobookshelf-Server-Quellcode
  selbst unter <https://github.com/advplyr/audiobookshelf>.
