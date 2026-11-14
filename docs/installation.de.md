# Installationsanleitung (für Einsteiger)

> 🇬🇧 English version: [installation.md](installation.md). Überblick, Funktionen und Entwicklung: [README](../README.md#deutsche-anleitung).


Diese Anleitung führt dich von "audiobookshelf läuft zuhause" zu
"Alexa spielt meine Hörbücher", auch wenn du AWS oder die Alexa
Developer Console noch nie benutzt hast. Plane beim ersten Mal etwa
**60–90 Minuten** ein. Der AWS Free Tier deckt einen privaten Skill
ab — du solltest 0 €/Monat zahlen, sofern du nicht woanders etwas
anlegst.

Du legst unterwegs Konten bei drei Diensten an: ein Amazon-Developer-
Konto (Alexa-Skills), ein AWS-Konto (Lambda-Hosting) und — falls du
noch kein öffentliches HTTPS hast — eventuell Cloudflare (gratis
Tunnel). Verwende für Amazon und Alexa **dieselbe E-Mail-Adresse**;
Echo-Geräte sind ans Amazon-Konto gebunden.

## Schritt 1 — audiobookshelf per HTTPS aus dem Internet erreichbar machen

Alexa läuft in Amazons Cloud und lädt jeden Track direkt von deinem
audiobookshelf-Server. Das heißt, dein Server muss aus dem öffentlichen
Internet unter einer `https://...`-URL mit gültigem TLS-Zertifikat
erreichbar sein (selbstsignierte Zertifikate funktionieren **nicht**).
Schnell muss er nicht sein — Alexa puffert — aber erreichbar.

Wenn dein audiobookshelf bereits unter z. B.
`https://abs.deinedomain.de` läuft, springe zu Schritt 2. Sonst wähle
eine der folgenden Optionen:

**Option A — Cloudflare Tunnel (empfohlen für Einsteiger).** Gratis,
keine Portweiterleitung, automatisches HTTPS. Benötigt eine eigene
Domain (jeder Registrar geht; günstig ab ~10 €/Jahr). Anleitung:
<https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/>.
Nach Setup hast du z. B.
`https://abs.deinedomain.de → http://localhost:13378` (oder
welcher Port intern läuft).

**Option B — Reverse Proxy mit Let's Encrypt.** Nginx/Caddy/Traefik
vor audiobookshelf, mit echter Domain auf deine Heim-IP (plus Port-
Forwarding 443→Reverse Proxy am Router). Mehr bewegliche Teile als
Option A, und du brauchst Dynamic DNS, falls deine ISP keine statische
IP gibt.

**Option C — VPS vor audiobookshelf.** 5-€/Monat-VPS (Hetzner,
DigitalOcean, …) mit Reverse Proxy mieten und per Tailscale oder
WireGuard mit dem Heimserver verbinden. Am simpelsten, wenn das
Heimnetz nicht mitspielt.

**Test:** Von einem Gerät außerhalb deines Heimnetzes
`https://deine-abs-url/ping` im Browser öffnen. Du solltest `pong`
(oder ähnliches) sehen. Bei Zertifikatswarnung erst die fixen, bevor
du weitermachst — Alexa lehnt nicht vertrauenswürdige Zertifikate ab.

> **Sicherheitshinweis.** Sobald audiobookshelf öffentlich erreichbar
> ist, kommt jeder, der die URL errät, an die Login-Seite. Sorge für
> starke Passwörter pro Benutzer. Der Skill nutzt einen API-Key
> (nächster Schritt), kein Passwort — Keys lassen sich sofort
> widerrufen, ohne das Passwort zu ändern.

## Schritt 2 — audiobookshelf-API-Key anlegen

1. Als **Admin** in der audiobookshelf-Web-UI einloggen.
2. Benutzername (oben rechts) → **Settings**.
3. **Users** öffnen, dein Benutzer anklicken, dann Tab **API Keys**.
4. **Create API Key**:
   - Name: `Alexa` (oder etwas Wiedererkennbares)
   - User: dein eigener Benutzer
   - Expiration: leer lassen für "nie" (du kannst jederzeit widerrufen)
   - Sicherstellen, dass er **enabled** ist
5. **Create** klicken. Der Key erscheint **einmalig** — sofort
   kopieren und in den Passwort-Manager. Sieht aus wie ein langer
   `eyJhbGc...`-String.

Den fügst du in Schritt 7 in AWS ein.

## Schritt 3 — Node.js installieren

Du brauchst Node.js, um die Skill-Abhängigkeiten zu installieren.
**Node.js 20 oder neuer** (LTS empfohlen) von <https://nodejs.org/>.
Jede Version ab 20.x funktioniert lokal (Lambda läuft ohnehin auf
einer fix gepinnten Runtime). Im Terminal prüfen:

```bash
node --version    # sollte v20.x.y oder höher zeigen
npm --version     # sollte 10.x.y oder ähnlich zeigen
```

## Schritt 4 — Repo klonen

```bash
git clone https://github.com/<dein-fork-oder-dieses-repo>/audiobookshelf-alexa.git
cd audiobookshelf-alexa
cd lambda
npm install
npm test    # sollte "39 pass" zeigen — beweist, dass der Code lokal läuft
cd ..
```

Wenn `npm test` fehlschlägt, das erst fixen — keinen kaputten Code
deployen.

## Schritt 5 — AWS-Konto anlegen (falls noch keins)

1. Auf <https://aws.amazon.com/free/> auf **Create a Free Account**.
   Eine Kreditkarte wird zur Verifikation benötigt; AWS belastet im
   Free Tier nichts.
2. Region wählen, in der alles laufen soll. **`us-east-1` (N. Virginia)**
   ist die richtige Wahl für englische und deutsche Skills — Alexa
   Skills Kit ist für diese Locales an die Region gebunden. Bleibe
   überall bei `us-east-1`.
3. Sobald das Konto aktiv ist, in der **AWS Console**
   <https://console.aws.amazon.com/> einloggen.

> **Kostenerwartung.** Ein privater Skill macht ein paar hundert
> Lambda-Requests pro Monat. Der AWS Free Tier deckt 1.000.000
> Lambda-Requests/Monat dauerhaft ab. Du solltest 0 € sehen. Stelle
> für die Nachtruhe einen
> [Billing-Alarm](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/monitor_estimated_charges_with_cloudwatch.html)
> bei 1 € ein.

## Schritt 6 — Lambda-Funktion erstellen

1. In der AWS Console oben rechts auf Region **N. Virginia
   (us-east-1)** wechseln.
2. Oben **Lambda** suchen und öffnen.
3. **Create function** klicken.
4. **Author from scratch** wählen.
5. Ausfüllen:
   - **Function name:** `audiobookshelf-alexa`
   - **Runtime:** `Node.js 24.x` (aktuelles LTS; `Node.js 22.x` und
     neuer gehen auch)
   - **Architecture:** `x86_64` (Standard)
   - **Permissions:** "Create a new role with basic Lambda
     permissions" lassen
6. **Create function**.

Eine Minute warten — du landest auf der Übersicht der Funktion.

## Schritt 7 — Lambda-Code als ZIP hochladen

Auf dem Rechner (macOS / Linux / WSL / Git Bash):

```bash
cd lambda
npm install                # falls noch nicht geschehen
zip -r ../audiobookshelf-alexa.zip . -x "test/*"
cd ..
```

Auf Windows PowerShell (kein `zip` von Haus aus):

```powershell
$src = "lambda"
$dst = "audiobookshelf-alexa.zip"
$temp = Join-Path $env:TEMP "abs-alexa-pkg"
if (Test-Path $dst) { Remove-Item $dst -Force }
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp | Out-Null
Get-ChildItem -Path $src -Exclude "test" | Copy-Item -Destination $temp -Recurse -Force
Compress-Archive -Path (Join-Path $temp "*") -DestinationPath $dst -Force
Remove-Item $temp -Recurse -Force
```

So oder so liegt am Ende `audiobookshelf-alexa.zip` neben dem
`lambda/`-Ordner und enthält `index.js`, `lib/`, `node_modules/`
und `package.json` (ca. 200–300 KB).

In der AWS Console auf der Lambda-Seite:

1. Zum Bereich **Code** scrollen.
2. **Upload from** → **.zip file** → **Upload**.
3. `audiobookshelf-alexa.zip` auswählen. Upload abwarten (wenige
   Sekunden bei ~5 MB).
4. Nach dem Laden sollte `index.js` im Editor sichtbar sein.

Der **Handler** muss auf `index.handler` stehen:

1. Zum Bereich **Runtime settings** scrollen, **Edit**.
2. **Handler** auf `index.handler` setzen (Standard; bitte prüfen).
3. Speichern.

## Schritt 8 — Umgebungsvariablen setzen

Weiter auf der Lambda-Seite:

1. Tab **Configuration**.
2. Links **Environment variables**.
3. **Edit** → zweimal **Add environment variable**:
   - `ABS_BASE_URL` = audiobookshelf-URL, **ohne abschließenden Slash**
     (z. B. `https://abs.deinedomain.de`)
   - `ABS_API_KEY` = der in Schritt 2 kopierte API-Key
4. Optional eine dritte, falls du mehrere Bibliotheken hast und eine
   festlegen willst:
   - `ABS_DEFAULT_LIBRARY_ID` = die Bibliotheks-ID (in der
     audiobookshelf-URL beim Browsen einer Bibliothek sichtbar)
5. Nur falls audiobookshelf hinter **Cloudflare Access** liegt: einen
   Service Token anlegen (Zero Trust → Access → Service credentials),
   ihn mit einer *Service Auth*-Policy für den Pfad `/api` erlauben und
   beide eintragen:
   - `CF_ACCESS_CLIENT_ID` = Client ID des Tokens
   - `CF_ACCESS_CLIENT_SECRET` = Client Secret des Tokens

   Sie werden nur bei API-Aufrufen als Header mitgeschickt. Stream-URLs
   ruft der Echo ohne Header ab, daher braucht der Stream-Pfad
   (`/api/items/*/file/*`) eine eigene Access-Regel (z. B. Bypass nur
   für deine Heim-IP).
6. **Save**.

Im Tab **Configuration** auch das Funktions-Timeout erhöhen — die
Standard-3-Sekunden sind für einen kalten Lambda-Aufruf gegen
audiobookshelf zu knapp:

1. **Configuration → General configuration → Edit**.
2. **Timeout** auf `0 min 10 sec` (10 Sekunden).
3. **Save**.

## Schritt 9 — Alexa-Skills-Kit-Trigger hinzufügen

Das verbindet Alexa mit Lambda; die Gegenrichtung (Alexa-Skill →
Lambda-ARN) folgt in Schritt 11.

1. Auf der Lambda-Seite Tab **Configuration**.
2. **Triggers** → **Add trigger**.
3. **Alexa Skills Kit** wählen.
4. Skill ID verification: vorerst **Disable** — du hast noch keine
   Skill-ID. Nach Schritt 10 hier nochmal rein und eintragen.
5. **Add**.

Jetzt den **Function ARN** kopieren — steht oben auf der Lambda-Seite,
sieht aus wie
`arn:aws:lambda:us-east-1:123456789012:function:audiobookshelf-alexa`.
Den fügst du in Schritt 11 ein.

## Schritt 10 — Alexa-Skill anlegen

1. Auf <https://developer.amazon.com/alexa/console/ask> einloggen,
   mit demselben Amazon-Konto wie dein Echo. Developer-Vereinbarung
   ggf. annehmen.
2. **Create Skill**.
3. **Skill name:** `Audiobookshelf` (oder beliebig — das ist nicht
   der Aufrufname).
4. **Primary locale:** German (DE), wenn du hauptsächlich Deutsch
   sprichst; English (US) sonst. Der andere Locale lässt sich später
   ergänzen.
5. **Experience type:** **Other → Custom**.
6. **Hosting:** **Provision your own** (Lambda hast du schon).
7. **Template:** **Start from scratch**.
8. **Create skill** → kurz warten.

Du landest im Skill Builder. Jetzt das Interaction Model hochladen:

1. Links **JSON Editor** unter **Interaction Model**.
2. `skill-package/interactionModels/custom/de-DE.json` (oder
   `en-US.json`) lokal im Editor öffnen, gesamten Inhalt kopieren und
   in den JSON Editor einfügen, vorhandenen Inhalt überschreiben.
   (Drag-and-Drop der Datei geht auch.)
3. **Save Model** (oben).
4. **Build Model** (auch oben). ~30 Sekunden auf den grünen Haken
   warten.
5. Für beide Locales: oben rechts Sprachwähler → anderen Locale
   hinzufügen, wiederholen.

> **Zum Aufrufnamen.** Das ausgelieferte `de-DE.json` nutzt
> `meine hörbücher` als Aufrufnamen. Das ist Absicht — Alexas
> deutsche Spracherkennung transkribiert "audiobookshelf" als drei
> Wörter ("audio book shelf") und matcht keinen Ein-Wort-Aufruf.
> Mehrwortige deutsche Phrasen bestehen außerdem die Zertifizierung,
> da Amazon Ein-Wort-Aufrufnamen für Nicht-Marken-Skills verbietet.
> Wenn du das `invocationName`-Feld änderst, bleib bei zwei oder
> mehr alltäglichen Wörtern.

## Schritt 10b — AudioPlayer-Schnittstelle aktivieren (PFLICHT)

Diesen Schritt vergisst man leicht, **ohne ihn spielt der Skill keinen
Ton.** Ohne aktivierten AudioPlayer antwortet Echo mit *"Bei der
Antwort des angeforderten Skill ist ein Problem aufgetreten"*, sobald
du ein Buch abspielen willst.

1. Im Skill Builder links **Interfaces** (unter **Build**).
2. Zeile **Audio Player** auf **ON**.
3. **Save** (oben).
4. **Build skill** (oben rechts), grünen Haken abwarten — nach jeder
   Änderung an Interfaces, Modell oder Aufrufnamen neu bauen.

## Schritt 11 — Skill mit Lambda verdrahten

Weiter im Skill Builder:

1. Links **Endpoint**.
2. **AWS Lambda ARN** wählen.
3. **Default Region:** den Lambda-Function-ARN aus Schritt 9 einfügen.
4. (Andere Regionen ignorieren, außer du willst Failover.)
5. **Save Endpoints**. Die Console zeigt eine **Skill ID** — kopieren.

Zurück in AWS Console → Lambda → deine Funktion → Configuration →
Triggers, den Alexa-Skills-Kit-Trigger **bearbeiten**:

1. **Skill ID verification** von Disable auf **Enable**.
2. Skill ID einfügen.
3. Speichern.

Damit kann niemand, der zufällig deinen Lambda-ARN kennt, die Funktion
aufrufen.

## Schritt 12 — Test aktivieren und ausprobieren

1. Im Skill Builder oben Tab **Build** → **Build Model**, falls noch
   nicht. Grünen Haken abwarten.
2. Tab **Test**. Den Schalter oben von **"Off"** auf **"Development"**
   stellen. **Pflicht — sonst sieht dein Echo den Skill nicht.**
3. Im Test-Simulator links eintippen:
   `öffne meine hörbücher`.
4. Du solltest die Begrüßung hören/sehen.
5. `mache weiter` versuchen — Lambda liefert eine
   `AudioPlayer.Play`-Direktive im JSON-Output.

> **Der Simulator kann keinen Ton.** Wenn Lambda eine
> `AudioPlayer.Play`-Direktive liefert, zeigt der Test-Simulator
> *"Bei der Antwort des angeforderten Skill ist ein Problem
> aufgetreten"*. Das ist die Limitierung des Simulators, **kein
> echter Fehler**. Im JSON-Output prüfen — wenn dort eine
> wohlgeformte `AudioPlayer.Play`-Direktive mit Stream-URL steht,
> funktioniert der Skill und ein echter Echo spielt das Audio.

Für echte Wiedergabe: mit einem **echten Echo am gleichen Amazon-
Konto** wie deine Developer Console sprechen:

```
"Alexa, öffne meine hörbücher"
"mache weiter"
"Alexa, sage meine hörbücher spiele <buchtitel>"
```

Skills im Development-Modus sind auf eigenen Echos automatisch aktiv —
keine Veröffentlichung, keine "Installation" in der Alexa-App nötig.

> **Erster Aufruf ist langsam.** Cold Start einer ungenutzten Lambda
> plus Round-Trip zu audiobookshelf dauert beim ersten Mal nach
> langer Pause 4–6 Sekunden. Folgeaufrufe sind meist unter 1 Sekunde.
> Wenn der allererste Versuch in einen Timeout läuft (Alexa: "Es
> liegt ein Problem vor"), 10 Sekunden warten und nochmal — dann ist
> die Lambda warm.

## Fehlersuche

| Symptom | Wahrscheinliche Ursache / Fix |
|---|---|
| **Echo: "Bei der Antwort des angeforderten Skill ist ein Problem aufgetreten"** — der Skill öffnet sauber, scheitert nur an `mache weiter` / `spiele …` | Die **AudioPlayer-Schnittstelle ist nicht aktiviert**. Skill Builder → **Interfaces** → **Audio Player** ON → **Save** → **Build skill**. (Siehe Schritt 10b.) |
| **Echo: "Ich weiß nicht, wie ich dir dabei helfen kann"** bei "Alexa, öffne …" | Entweder (a) der **Test-Schalter** im Developer-Konsole steht auf **"Off"** (auf **Development** stellen), oder (b) der **Aufrufname** wird nicht sauber transkribiert. Im Alexa-**Sprachverlauf** (alexa.amazon.de → Aktivität → Sprachverlauf) ansehen, was Alexa verstanden hat, und einen mehrwortigen Aufrufnamen wählen, der zur Transkription passt. |
| **Echo: "I could not reach your audiobookshelf server"** | API-Key falsch, abgelaufen oder deaktiviert. In audiobookshelf neu erstellen und `ABS_API_KEY` im Lambda-Env aktualisieren. |
| **Erste Wiedergabe-Anfrage läuft in Timeout, zweite klappt** | Lambda Cold Start plus langsamer Upstream; mit kurzem `öffne meine hörbücher` vorwärmen, dann `mache weiter`. Durch das 10-s-Timeout aus Schritt 8 schon abgemildert. |
| **Skill antwortet auf Englisch, obwohl du Deutsch gesprochen hast** | Skill-Builder-Sprache ist en-US. de-DE-Locale im Skill Builder ergänzen oder Primärsprache umstellen. Echo-Sprache muss ebenfalls Deutsch (Deutschland) unter **Alexa-App → Geräte → \<Echo\> → Sprache** sein. |
| **Skill ist gar nicht auf deinem Echo** | Echo und Developer Console müssen am **selben Amazon-Konto** hängen. Unter **Alexa-App → Mehr → Fertigkeiten und Spiele → Deine Fertigkeiten → Dev** nachsehen — der Skill sollte dort erscheinen. Sonst hast du verschiedene Konten benutzt. |
| **`Lambda timeout` in den CloudWatch-Logs** | Default-Timeout 3 Sekunden; auf 10 s erhöhen (Configuration → General configuration → Edit). |
| **`index.handler is undefined`** | ZIP wurde aus dem falschen Verzeichnis gebaut. `zip` **innerhalb von `lambda/`** ausführen, nicht aus dem Repo-Root — `index.js` muss im **Wurzelverzeichnis** der ZIP liegen. |
| **Audio spielt ein paar Sekunden, dann Stopp** | Entweder Cloudflare/Reverse Proxy unterstützt keine HTTP-**Range-Requests**, oder die Datei ist kein für Alexa streambares Format (muss MP3/AAC/M4A/OGG mit passendem `Content-Type` sein). Mit `curl -I -H "Range: bytes=0-1023" "<stream-url>"` testen — du solltest `206 Partial Content` bekommen. |
| **Falsches Buch wird gespielt, oder `spiele <titel>` sagt "konnte nicht finden"** | Im [Sprachverlauf](https://www.amazon.de/alexaprivacy/apd/rvh) nachsehen, was Alexa wirklich verstanden hat — Alexas deutsche Spracherkennung (a) lässt Umlaute weg, (b) verschmilzt Bindestrichworte (`kanguruchroniken` für `Känguru-Chroniken`), (c) verenglisch Endungen (`kangaroochronicles`). Der Fuzzy-Fallback fängt alle drei; falls es trotzdem danebenliegt, das markanteste Wort allein nennen (`spiele Chroniken`). Bei sehr generischem Titel die audiobookshelf-Metadaten oder den Dateinamen anpassen. |
| **`Alexa, nächstes Kapitel` geht nicht, aber `Alexa, weiter` schon** | Erwartet. Während AudioPlayer läuft, erreichen den Skill nur Built-in-Intents (NextIntent, PauseIntent, …). Die kurzen `weiter` / `zurück` benutzen — sie mappen auf denselben Kapitel-Skip-Handler. |

CloudWatch ist dein Freund. Auf der Lambda-Seite → **Monitor** →
**Logs anzeigen in CloudWatch** das jüngste Log-Stream öffnen, um
`console.error` und `console.log` aus dem Handler zu sehen. Die
`AudioPlayer event:`-Zeilen zeigen, welche AudioPlayer-Events Echo
zurückgesendet hat und ggf. den Fehlercode.

## Neu deployen nach Code-Änderungen

Nach Änderungen in `lambda/` (Bash / WSL / Git Bash):

```bash
cd lambda
npm install        # nur falls package.json geändert
npm test           # immer, vor dem Deployen
zip -r ../audiobookshelf-alexa.zip . -x "test/*"
cd ..
```

PowerShell-Äquivalent (Windows):

```powershell
Push-Location lambda
npm install        # nur falls package.json geändert
npm test           # immer, vor dem Deployen
Pop-Location
$temp = Join-Path $env:TEMP "abs-alexa-pkg"
if (Test-Path "audiobookshelf-alexa.zip") { Remove-Item "audiobookshelf-alexa.zip" -Force }
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp | Out-Null
Get-ChildItem -Path "lambda" -Exclude "test" | Copy-Item -Destination $temp -Recurse -Force
Compress-Archive -Path (Join-Path $temp "*") -DestinationPath "audiobookshelf-alexa.zip" -Force
Remove-Item $temp -Recurse -Force
```

Neue ZIP über Lambda → Code → **Hochladen von** → **.zip-Datei**
einspielen. Das Alexa-Skill-Modell muss nur neu hochgeladen werden,
wenn du `skill-package/` geändert hast. Nach Modelländerung im Skill
Builder **Build Model** klicken — und nach Änderungen an
**Interfaces** oder Aufrufnamen ebenfalls neu bauen.

Wenn du das AudioPlayer-Token-Format (`lib/playback.js`) änderst,
schlagen laufende Wiedergabesessions bis zum Neustart fehl — alte
Tokens dekodieren nicht gegen den neuen Code.

## Automatisches Deployment mit GitHub Actions

`.github/workflows/deploy-lambda.yml` führt die Tests aus und deployt
`lambda/` in deine bestehende Lambda-Funktion, sobald auf `main` etwas
unter `lambda/` geändert wird (oder manuell über **Actions → Deploy
Lambda → Run workflow**). Die Anmeldung bei AWS läuft über OpenID
Connect, es liegen also keine AWS-Schlüssel in GitHub. Solange nichts
eingerichtet ist, laufen nur die Tests.

Einmalige Einrichtung in AWS (IAM-Konsole):

1. **Identity providers → Add provider → OpenID Connect**: Provider-URL
   `https://token.actions.githubusercontent.com`, Audience
   `sts.amazonaws.com`. (Überspringen, falls schon vorhanden.)
2. **Roles → Create role → Web identity**: diesen Provider wählen,
   Audience `sts.amazonaws.com`, GitHub organization = dein
   GitHub-Benutzer, Repository = dieses Repo, Branch = `main`. Name
   z. B. `github-deploy-audiobookshelf-alexa`.

   **Subject-Format prüfen.** Der Assistent schreibt die
   Trust-Bedingung als `repo:<owner>/<repo>:ref:refs/heads/main`.
   Repositories mit GitHubs *Immutable Subject* schicken stattdessen
   die numerischen Owner- und Repo-IDs, und das Deployment scheitert
   dann mit "Not authorized to perform sts:AssumeRoleWithWebIdentity".
   Prüfen mit:

   ```bash
   gh api repos/<owner>/<repo>/actions/oidc/customization/sub
   ```

   Steht dort `"use_immutable_subject": true`, die Trust Relationship
   der Rolle bearbeiten und die Bedingung
   `token.actions.githubusercontent.com:sub` auf das zurückgegebene
   `sub_claim_prefix` plus `:ref:refs/heads/main` setzen, z. B.
   `repo:jdoe@1234567/audiobookshelf-alexa@987654321:ref:refs/heads/main`.
3. Statt einer verwalteten Policy diese Inline-Policy hinzufügen
   (Region, Konto-ID und Funktionsname ersetzen):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"],
       "Resource": "arn:aws:lambda:us-east-1:<konto-id>:function:<funktionsname>"
     }]
   }
   ```

Dann in GitHub unter **Settings → Secrets and variables → Actions →
Variables** anlegen:

| Variable | Wert |
|----------|------|
| `AWS_DEPLOY_ROLE_ARN` | ARN der Rolle aus Schritt 2 (Pflicht) |
| `LAMBDA_FUNCTION_NAME` | dein Funktionsname (Standard `audiobookshelf-alexa`) |
| `AWS_REGION` | Region der Funktion (Standard `us-east-1`) |

Der Workflow aktualisiert nur den Code; Runtime, Handler und
Umgebungsvariablen bleiben so, wie sie in der Lambda-Konsole
eingestellt sind.

### Skill-Paket (Manifest und Interaktionsmodelle)

`.github/workflows/deploy-skill.yml` lädt `skill-package/` bei jedem
Push auf `main`, der es ändert (oder manuell), über die gemeinsame Action
[`jleuderalbert/alexa-skill-deploy`](https://github.com/jleuderalbert/alexa-skill-deploy) in die **Development**-Stage des
Skills. Dabei wird der Endpoint im Manifest auf die Lambda von oben
gesetzt (Konto aus `AWS_DEPLOY_ROLE_ARN`, dazu `AWS_REGION` und
`LAMBDA_FUNCTION_NAME`), danach werden die Interaktionsmodelle
hochgeladen; schlägt ein Modell-Build fehl, schlägt der Workflow fehl.
Solange `ALEXA_SKILL_ID` nicht gesetzt ist, wird er übersprungen.

Er braucht einen Login-with-Amazon-Refresh-Token für dein
Entwicklerkonto. Auf deinem Rechner, nach `ask configure`, den aus
deinem ASK-CLI-Profil als Secret speichern (oder mit
`ask util generate-lwa-tokens` einen eigenen erzeugen):

```bash
jq -r '.profiles.default.token.refresh_token' ~/.ask/cli_config | gh secret set ASK_REFRESH_TOKEN
```

Der Token gibt vollen SMAPI-Zugriff auf alle Skills des
Entwicklerkontos, also nur als Secret ablegen. Dann diese Variablen
anlegen:

| Variable | Wert |
|----------|------|
| `ALEXA_SKILL_ID` | deine Skill-ID, `amzn1.ask.skill....` (Pflicht) |
| `ASK_VENDOR_ID` | deine Vendor-ID (`ask smapi get-vendor-list`) (Pflicht) |
| `ALEXA_LOCALES` | optional, z. B. `de-DE`, um nur diese Sprache zu deployen (Standard: alle Sprachen in `skill.json`) |

Lokal prüfen, ohne hochzuladen, mit einem Klon von `alexa-skill-deploy`:
`SKILL_ID=... ENDPOINT=<Lambda-ARN> DRY_RUN=1 ../alexa-skill-deploy/deploy-skill-package.sh`.

## Power-User-Abkürzung: ASK CLI

Wer auf der Kommandozeile zuhause ist, fasst die Schritte 6–11 mit
der [ASK CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/quick-start-alexa-skills-kit-command-line-interface.html)
in einem Befehl zusammen:

```bash
npm i -g ask-cli
ask configure       # einmalig browser-basierter AWS- + Alexa-Login
cd lambda && npm install && cd ..
ask deploy
```

`ask deploy` packt `lambda/`, legt die Lambda-Funktion an oder
aktualisiert sie, lädt das Skill-Manifest und die Interaction Models
hoch und verdrahtet den Endpoint. `ABS_BASE_URL` und `ABS_API_KEY`
einmalig auf der Lambda setzen (Lambda-Konsole → Configuration →
Environment variables, oder `aws lambda update-function-configuration`).
