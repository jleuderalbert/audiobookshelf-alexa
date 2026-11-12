# Installation guide (for first-timers)

> 🇩🇪 German version: [installation.de.md](installation.de.md). Overview, features and development notes: [README](../README.md).


This walkthrough takes you from "I have audiobookshelf running at home"
to "Alexa plays my audiobooks", assuming you've never touched AWS or the
Alexa Developer Console. Plan for **about 60–90 minutes** the first
time. AWS Free Tier covers a personal skill; you should pay $0/month
unless you set something else up at AWS.

You'll create accounts on three services along the way: an Amazon
Developer account (Alexa skills), an AWS account (Lambda hosting),
and — if you don't already have public HTTPS — possibly Cloudflare
(free tunnel). Use the **same email address** for the Amazon and
Alexa accounts; Echo devices are linked by Amazon account.

## Step 1 — Make audiobookshelf reachable from the internet over HTTPS

Alexa runs in Amazon's cloud and downloads each track directly from
your audiobookshelf server. That means your server must be reachable
from the public internet at a `https://...` URL with a valid TLS
certificate (self-signed certs do **not** work). It does not need to be
fast — Alexa buffers — but it must be reachable.

If your audiobookshelf is already at e.g. `https://abs.yourdomain.com`,
skip to step 2. Otherwise pick one of these options:

**Option A — Cloudflare Tunnel (recommended for beginners).** Free, no
port forwarding, automatic HTTPS. Requires a domain you own (any
registrar is fine; cheapest is `~$10/year`). Walkthrough:
<https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/>.
After setup you'll have something like
`https://abs.yourdomain.com → http://localhost:13378` (or whatever
port your audiobookshelf listens on internally).

**Option B — Reverse proxy with Let's Encrypt.** Nginx/Caddy/Traefik
in front of audiobookshelf, with a real domain pointed at your home IP
(plus port forwarding 443→reverse-proxy on your router). More moving
parts than option A and you have to keep your IP up-to-date with a
dynamic DNS provider unless your ISP gives you a static one.

**Option C — VPS in front of audiobookshelf.** Rent a $5/month VPS
(Hetzner, DigitalOcean, …), run a reverse proxy there, and connect it
to your home server via Tailscale or WireGuard. Simplest if you don't
have a usable home network.

**Test:** from any device outside your home network, open
`https://your-abs-url/ping` in a browser. You should see `pong` (or
similar). If you get a certificate warning, fix that before continuing
— Alexa rejects untrusted certificates.

> **Security note.** Once your audiobookshelf is on the public
> internet, anyone who guesses your URL can hit the login page. Make
> sure each user account has a strong password. The skill itself uses
> an API key (next step), not a password — keys can be revoked
> instantly without changing your password.

## Step 2 — Create an audiobookshelf API key

1. Log in to your audiobookshelf web UI as an **admin** user.
2. Click your username (top-right) → **Settings**.
3. Open **Users**, click your user, then the **API Keys** tab.
4. **Create API Key**:
   - Name: `Alexa` (or anything memorable)
   - User: your own user
   - Expiration: leave empty for "never" (you can always revoke it)
   - Make sure it's **enabled**
5. Click **Create**. The key appears **once** — copy it now and put it
   in a password manager. It looks like a long `eyJhbGc...` string.

You'll paste this into AWS in step 7.

## Step 3 — Install Node.js on your computer

You need Node.js to install the skill's dependencies. Get **Node.js
20 or later** (LTS recommended) from <https://nodejs.org/>. Any
version from 20.x onward works for local install/test (Lambda runs
with a pinned runtime regardless). Verify in a terminal:

```bash
node --version    # should print v20.x.y or higher
npm --version     # should print 10.x.y or similar
```

## Step 4 — Get this repository onto your machine

```bash
git clone https://github.com/<your-fork-or-this-repo>/audiobookshelf-alexa.git
cd audiobookshelf-alexa
cd lambda
npm install
npm test    # should print "39 pass" — proves the code works on your machine
cd ..
```

If `npm test` fails, fix that before continuing. Don't try to deploy
broken code.

## Step 5 — Create an AWS account (if you don't have one)

1. Go to <https://aws.amazon.com/free/> and click **Create a Free
   Account**. You'll need a credit card; AWS does not charge for the
   Free Tier, but a card is required for verification.
2. Pick the region you want everything to live in. **`us-east-1`
   (N. Virginia)** is the right choice for English- and
   German-language skills — Alexa Skills Kit is wired to that region
   for those locales. Stick with `us-east-1` everywhere below.
3. Once your account is active, sign in to the **AWS Console**
   <https://console.aws.amazon.com/>.

> **Cost expectation.** A personal skill makes a few hundred Lambda
> requests per month. AWS Free Tier covers 1,000,000 Lambda
> requests/month forever. You should see $0 charges. Set up a
> [billing alarm](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/monitor_estimated_charges_with_cloudwatch.html)
> for $1 just to sleep well at night.

## Step 6 — Create the Lambda function

1. In the AWS Console, switch to region **N. Virginia (us-east-1)**
   (top-right region picker).
2. Search for **Lambda** in the top search bar; open the Lambda
   service.
3. Click **Create function**.
4. Choose **Author from scratch**.
5. Fill in:
   - **Function name:** `audiobookshelf-alexa`
   - **Runtime:** `Node.js 24.x` (the current LTS at time of writing;
     `Node.js 22.x` and newer also work)
   - **Architecture:** `x86_64` (default)
   - **Permissions:** leave at "Create a new role with basic Lambda
     permissions"
6. Click **Create function**.

Give it a minute. You'll land on the function's overview page.

## Step 7 — Upload the Lambda code as a ZIP

On your computer (macOS / Linux / WSL / Git Bash):

```bash
cd lambda
npm install                # if you haven't yet
zip -r ../audiobookshelf-alexa.zip . -x "test/*"
cd ..
```

On Windows PowerShell (no `zip` command by default):

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

Either way you end up with `audiobookshelf-alexa.zip` next to the
`lambda/` folder containing `index.js`, `lib/`, `node_modules/`, and
`package.json` (about 200–300 KB).

In the AWS Console, on the Lambda function page:

1. Scroll to the **Code** section.
2. Click **Upload from** → **.zip file** → **Upload**.
3. Choose `audiobookshelf-alexa.zip`. Wait for the upload to finish
   (a few seconds for ~5 MB).
4. Once it's loaded you should see `index.js` in the in-browser
   editor.

Now the **handler setting** must match `index.handler`:

1. Scroll down to the **Runtime settings** panel and click **Edit**.
2. Set **Handler** to `index.handler`. (This is the default; verify
   it.)
3. Save.

## Step 8 — Set the environment variables

Still on the Lambda function page:

1. Click the **Configuration** tab.
2. Click **Environment variables** in the left side panel.
3. Click **Edit** → **Add environment variable** twice:
   - `ABS_BASE_URL` = your audiobookshelf URL, **no trailing slash**
     (e.g. `https://abs.yourdomain.com`)
   - `ABS_API_KEY` = the API key you copied in step 2
4. Optionally a third one if you have multiple libraries and want to
   pin one:
   - `ABS_DEFAULT_LIBRARY_ID` = the library ID (find it in the
     audiobookshelf URL when browsing a library)
5. Only if audiobookshelf sits behind **Cloudflare Access**: create a
   service token (Zero Trust → Access → Service credentials), allow it
   with a *Service Auth* policy on the `/api` path, and add both:
   - `CF_ACCESS_CLIENT_ID` = the token's Client ID
   - `CF_ACCESS_CLIENT_SECRET` = the token's Client Secret

   They're sent as headers on API calls only. Stream URLs are fetched
   by the Echo without headers, so the stream path
   (`/api/items/*/file/*`) needs its own Access rule (e.g. Bypass
   limited to your home IP).
6. Click **Save**.

While you're in **Configuration**, also bump the function timeout —
the default 3 seconds is too tight for a cold-start Lambda calling
audiobookshelf:

1. **Configuration → General configuration → Edit**.
2. Set **Timeout** to `0 min 10 sec` (10 seconds).
3. **Save**.

## Step 9 — Add the Alexa Skills Kit trigger

This connects Alexa to the Lambda; the inverse wiring (Alexa skill →
Lambda ARN) happens in step 11.

1. Still on the Lambda function page, go to the **Configuration** tab.
2. Click **Triggers** → **Add trigger**.
3. Select **Alexa Skills Kit** from the dropdown.
4. Skill ID verification: pick **Disable** for now — you don't have a
   skill ID yet. Once you have one in step 10, come back here and
   paste it in.
5. Click **Add**.

Now copy the **function ARN** — it's at the top of the Lambda page,
looks like
`arn:aws:lambda:us-east-1:123456789012:function:audiobookshelf-alexa`.
You'll paste it in step 11.

## Step 10 — Create the Alexa skill

1. Go to <https://developer.amazon.com/alexa/console/ask> and sign in
   with the same Amazon account as your Echo. Accept the developer
   agreement if prompted.
2. Click **Create Skill**.
3. **Skill name:** `Audiobookshelf` (or anything you like — this is
   not the invocation name).
4. **Primary locale:** English (US) if you'll mostly speak English;
   German (DE) otherwise. You can add the other locale later.
5. **Experience type:** **Other → Custom**.
6. **Hosting:** **Provision your own** (you have a Lambda already).
7. **Template:** **Start from scratch**.
8. Click **Create skill** → wait a few seconds.

You'll land in the skill builder. Now upload the interaction model:

1. In the left sidebar, click **JSON Editor** under **Interaction
   Model**.
2. Open `skill-package/interactionModels/custom/en-US.json` (or
   `de-DE.json`) on your computer in a text editor, copy its full
   contents, and paste them into the JSON Editor, replacing whatever's
   there. (You can also drag-and-drop the file onto the editor.)
3. Click **Save Model** (top of page).
4. Click **Build Model** (also at the top). Wait ~30 seconds for the
   green checkmark.
5. If you want both locales: top-right language picker → add the other
   locale and repeat.

> **About the invocation name.** The shipped models use
> `audiobookshelf` / `meine hörbücher` as the invocation name. The
> English one is a single word, which works for a skill in development
> (it's the product's name) but may need to change for certification,
> since Amazon disallows single-word invocation names for non-brand
> skills. Avoid `my audiobooks` in English: it resolves to a different
> skill. In German keep two or more words: German speech recognition
> transcribes "audiobookshelf" as three separate words.

## Step 10b — Enable the AudioPlayer interface (REQUIRED)

This step is easy to miss but **the skill will not play audio
without it.** Without AudioPlayer enabled, your Echo will respond
with *"There was a problem with the requested skill's response"*
whenever you ask it to play a book.

1. Still in the Alexa skill builder, click **Interfaces** in the left
   sidebar (under **Build**).
2. Find the **Audio Player** row and toggle it **ON**.
3. Click **Save** (top of the page).
4. Click **Build skill** (top right) and wait for the green check —
   you'll need to rebuild any time you change interfaces, the model,
   or invocation name.

## Step 11 — Wire the skill to the Lambda

Still in the Alexa skill builder:

1. Click **Endpoint** in the left sidebar.
2. Choose **AWS Lambda ARN**.
3. **Default Region:** paste the Lambda function ARN from step 9.
4. (Skip the other regions unless you want failover.)
5. Click **Save Endpoints**. The console copies a **Skill ID** to the
   clipboard message and shows it on this page; copy it.

Now go back to the AWS Console → Lambda → your function →
Configuration → Triggers, and **edit** the Alexa Skills Kit trigger:

1. Switch **Skill ID verification** from Disable to **Enable**.
2. Paste the Skill ID.
3. Save.

This stops random people who somehow got your Lambda ARN from
invoking it.

## Step 12 — Enable testing and try it out

1. Back in the Alexa skill builder, click **Build** (top tab) →
   **Build Model** if you haven't yet. Wait for the green check.
2. Click **Test** (top tab). Switch the toggle at the top of the
   page from **"Off"** to **"Development"**. **This is required —
   without it your Echo doesn't see the skill.**
3. In the test simulator panel on the left, type:
   `open audiobookshelf`.
4. You should hear/see the welcome message.
5. Try `continue` — Lambda returns an `AudioPlayer.Play` directive in
   the JSON Output panel.

> **The simulator can't play audio.** When the Lambda returns an
> `AudioPlayer.Play` directive, the Test simulator displays *"There
> was a problem with the requested skill's response"*. That message
> is the simulator's own limitation, **not** an actual error. Check
> the JSON Output panel — if you see a properly formed
> `AudioPlayer.Play` directive with a stream URL, the skill is
> working and the audio will play on a real Echo.

For real audio playback, talk to **a real Echo device on the same
Amazon account** as your developer console:

```
"Alexa, open audiobookshelf"
"continue"
"Alexa, ask audiobookshelf to play <book title>"
```

Skills in Development mode are automatically enabled on your own
Echo devices — no need to publish, no need to "install" anything in
the Alexa app.

> **First call is slow.** Cold-start of an idle Lambda + the round
> trip to audiobookshelf can take 4–6 seconds the first time you
> invoke an intent after a long pause. Subsequent calls are usually
> under 1 second. If your very first attempt times out (Alexa says
> "There was a problem"), wait 10 seconds and try again — the
> Lambda is warm now.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| **Echo: "There was a problem with the requested skill's response"** — but the skill opens fine and only fails on `continue` / `play …` | The **AudioPlayer interface is not enabled** for the skill. Go to the skill builder → **Interfaces** → toggle **Audio Player** ON → **Save** → **Build skill**. (See Step 10b.) |
| **Echo: "I don't know how to help you with that"** when you say "Alexa, open …" | Either (a) the skill's **Test toggle is "Off"** in the developer console (set to **Development**), or (b) the **invocation name** can't be transcribed by Alexa's speech recognition. Check the Alexa **voice history** (alexa.amazon.com → Activity → Voice history) to see what Alexa thought you said, and pick a multi-word invocation name that matches the transcription. |
| **Echo: "I could not reach your audiobookshelf server"** | API key is wrong, expired, or disabled. Re-create in audiobookshelf and update `ABS_API_KEY` in Lambda env. |
| **First playback request times out, second works** | Lambda cold start + slow upstream call; pre-warm with a quick `open audiobookshelf` first, then issue the `continue`. Already mitigated by the 10 s timeout from Step 8. |
| **Skill responds in the wrong language** | The skill builder language doesn't match your Echo. Add the missing locale in the skill builder, or switch your skill's primary locale. Make sure your Echo's language matches under **Alexa app → Devices → \<Echo\> → Language**. |
| **Skill is not on your Echo at all** | The Echo and the developer console must use the **same Amazon account**. Check **Alexa app → More → Skills & Games → Your Skills → Dev** — the skill should appear there. If it doesn't, you used different accounts. |
| **`Lambda timeout` in CloudWatch logs** | Default Lambda timeout is 3 seconds; bump it to 10 s (Configuration → General configuration → Edit). |
| **`index.handler is undefined`** | The ZIP was built from the wrong directory. Re-run the `zip` command **from inside `lambda/`**, not from the repo root — `index.js` must be at the **root** of the ZIP. |
| **Audio plays for a few seconds, then stops** | Either Cloudflare/your reverse proxy doesn't support HTTP **range requests**, or the file isn't a format Alexa can stream (it must be MP3/AAC/M4A/OGG and served with a matching `Content-Type`). Test with `curl -I -H "Range: bytes=0-1023" "<stream-url>"` — you should get `206 Partial Content`. |
| **Wrong book is played, or `play <title>` says "couldn't find"** | Check what Alexa actually heard in your [voice history](https://www.amazon.com/alexa-privacy/apd/rvh) — Alexa often (a) drops umlauts, (b) mashes hyphenated words together, or (c) anglicizes endings. The skill's fuzzy fallback handles these; if it still misses, say the most distinctive word alone. For a book whose title is very generic, set up a more specific phrase by editing the audiobookshelf metadata or rename the file. |
| **`Alexa, next chapter` doesn't work, but `Alexa, next` does** | Expected. While AudioPlayer is playing, only built-in intents (NextIntent, PauseIntent, …) reach the skill. Use the short `next` / `previous` forms — they map to the same chapter-skip handler. |

CloudWatch is your friend. In the Lambda function page → **Monitor** →
**View logs in CloudWatch**, click the most recent log stream to see
`console.error` and `console.log` output from the handler. The
`AudioPlayer event:` lines tell you which AudioPlayer events the Echo
sent back and any error code.

## Re-deploying after code changes

Whenever you change anything in `lambda/` (Bash / WSL / Git Bash):

```bash
cd lambda
npm install        # only if you changed package.json
npm test           # always, before deploying
zip -r ../audiobookshelf-alexa.zip . -x "test/*"
cd ..
```

PowerShell equivalent (Windows):

```powershell
Push-Location lambda
npm install        # only if you changed package.json
npm test           # always, before deploying
Pop-Location
$temp = Join-Path $env:TEMP "abs-alexa-pkg"
if (Test-Path "audiobookshelf-alexa.zip") { Remove-Item "audiobookshelf-alexa.zip" -Force }
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp | Out-Null
Get-ChildItem -Path "lambda" -Exclude "test" | Copy-Item -Destination $temp -Recurse -Force
Compress-Archive -Path (Join-Path $temp "*") -DestinationPath "audiobookshelf-alexa.zip" -Force
Remove-Item $temp -Recurse -Force
```

Upload the new ZIP via Lambda → Code → **Upload from** → **.zip
file**. The Alexa skill model only needs re-uploading if you changed
`skill-package/`. After an interaction-model change, click **Build
Model** in the skill builder — and remember to also rebuild after
changing **Interfaces** or the invocation name.

If you change the AudioPlayer token shape (`lib/playback.js`), expect
already-running playback sessions to fail until they restart — older
tokens won't decode against the new code.

## Automatic deployment with GitHub Actions

`.github/workflows/deploy-lambda.yml` runs the tests and deploys
`lambda/` to your existing Lambda function on every push to `main`
that touches `lambda/` (or manually via **Actions → Deploy Lambda →
Run workflow**). It logs in to AWS via OpenID Connect, so no AWS keys
are stored in GitHub. Until it's configured, only the tests run.

One-time setup in AWS (IAM console):

1. **Identity providers → Add provider → OpenID Connect**: provider
   URL `https://token.actions.githubusercontent.com`, audience
   `sts.amazonaws.com`. (Skip if it already exists.)
2. **Roles → Create role → Web identity**: pick that provider, audience
   `sts.amazonaws.com`, GitHub organization = your GitHub user,
   repository = this repo, branch = `main`. Name it e.g.
   `github-deploy-audiobookshelf-alexa`.

   **Check the subject format.** The wizard writes the trust condition
   as `repo:<owner>/<repo>:ref:refs/heads/main`. Repositories using
   GitHub's *immutable subject* send the numeric owner and repo IDs
   instead, and the deploy then fails with "Not authorized to perform
   sts:AssumeRoleWithWebIdentity". Check with:

   ```bash
   gh api repos/<owner>/<repo>/actions/oidc/customization/sub
   ```

   If it shows `"use_immutable_subject": true`, edit the role's trust
   relationship and set the `token.actions.githubusercontent.com:sub`
   condition to the returned `sub_claim_prefix` plus
   `:ref:refs/heads/main`, e.g.
   `repo:jdoe@1234567/audiobookshelf-alexa@987654321:ref:refs/heads/main`.
3. Instead of a managed policy, add this inline policy (replace
   region, account ID and function name):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"],
       "Resource": "arn:aws:lambda:us-east-1:<account-id>:function:<function-name>"
     }]
   }
   ```

Then in GitHub: **Settings → Secrets and variables → Actions →
Variables** and add:

| Variable | Value |
|----------|-------|
| `AWS_DEPLOY_ROLE_ARN` | ARN of the role from step 2 (required) |
| `LAMBDA_FUNCTION_NAME` | your function name (default `audiobookshelf-alexa`) |
| `AWS_REGION` | the function's region (default `us-east-1`) |

The workflow only updates the code; runtime, handler and environment
variables stay as configured in the Lambda console.

### Skill package (manifest and interaction models)

`.github/workflows/deploy-skill.yml` uploads `skill-package/` to the
skill's **development** stage on every push to `main` that touches it
(or manually), via `scripts/deploy-skill-package.sh`. It sets the
manifest's endpoint to the Lambda above (account from
`AWS_DEPLOY_ROLE_ARN`, plus `AWS_REGION` and `LAMBDA_FUNCTION_NAME`),
then uploads the interaction models and fails if a model build fails.
Until `ALEXA_SKILL_ID` is set, it's skipped.

It needs a Login with Amazon refresh token for your developer account.
On your machine, after `ask configure`, store the one from your ASK CLI
profile as a secret (or create a separate one with
`ask util generate-lwa-tokens`):

```bash
jq -r '.profiles.default.token.refresh_token' ~/.ask/cli_config | gh secret set ASK_REFRESH_TOKEN
```

The token grants full SMAPI access to all skills of the developer
account, so keep it only as a secret. Then add these variables:

| Variable | Value |
|----------|-------|
| `ALEXA_SKILL_ID` | your skill ID, `amzn1.ask.skill....` (required) |
| `ASK_VENDOR_ID` | your vendor ID (`ask smapi get-vendor-list`) (required) |
| `ALEXA_LOCALES` | optional, e.g. `de-DE` to deploy only that locale (default: all locales in `skill.json`) |

To check locally without uploading:
`SKILL_ID=... ENDPOINT_ARN=... DRY_RUN=1 scripts/deploy-skill-package.sh`.

## Power-user shortcut: ASK CLI

If you're comfortable on the command line, the [ASK CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/quick-start-alexa-skills-kit-command-line-interface.html)
collapses steps 6–11 into one command:

```bash
npm i -g ask-cli
ask configure       # one-time browser-based AWS + Alexa login
cd lambda && npm install && cd ..
ask deploy
```

`ask deploy` packages `lambda/`, creates/updates the Lambda function,
uploads the skill manifest and interaction models, and wires the
endpoint. Set `ABS_BASE_URL` and `ABS_API_KEY` on the Lambda once
afterwards (Lambda console → Configuration → Environment variables, or
`aws lambda update-function-configuration`).
