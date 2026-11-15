'use strict';

// Self-hosted alternative to AWS Lambda: a plain HTTP server for the skill's
// HTTPS endpoint, run behind a reverse proxy or tunnel that terminates TLS.
// POST / takes Alexa requests; each must carry a valid Alexa signature, a
// fresh timestamp and the skill ID in SKILL_ID (on Lambda, the function's
// invoke permission does that last check). GET /health is for local checks.

const http = require('node:http');
const {
  SkillRequestSignatureVerifier,
  TimestampVerifier,
} = require('ask-sdk-express-adapter');

const MAX_BODY_BYTES = 256 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function skillIdOf(envelope) {
  return (envelope.context && envelope.context.System
    && envelope.context.System.application.applicationId)
    || (envelope.session && envelope.session.application.applicationId);
}

// verifiers is injectable so tests can skip Amazon's certificate check.
function createServer({ skill, skillId, verifiers }) {
  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      send(res, 200, { status: 'ok' });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/') {
      send(res, 404, { error: 'not found' });
      return;
    }

    const started = Date.now();
    let envelope;
    try {
      const body = await readBody(req);
      await Promise.all(verifiers.map((v) => v.verify(body, req.headers)));
      envelope = JSON.parse(body);
    } catch (err) {
      console.warn('Rejected request:', err.message);
      send(res, 400, { error: 'invalid request' });
      return;
    }

    // One line per Alexa request, e.g. "IntentRequest PlayBookIntent 200 312ms".
    const { type, intent } = envelope.request || {};
    const label = [type, intent && intent.name].filter(Boolean).join(' ');
    if (skillIdOf(envelope) !== skillId) {
      console.warn(`${label} 400: request for another skill`);
      send(res, 400, { error: 'invalid request' });
      return;
    }
    try {
      const response = await skill.invoke(envelope);
      send(res, 200, response);
      console.log(`${label} 200 ${Date.now() - started}ms`);
    } catch (err) {
      console.error(`${label} 500 ${Date.now() - started}ms:`, err);
      send(res, 500, { error: 'internal error' });
    }
  });
}

if (require.main === module) {
  const skillId = process.env.SKILL_ID;
  if (!skillId) {
    console.error('SKILL_ID is not set; refusing to start.');
    process.exit(1);
  }
  const port = Number(process.env.PORT || 3000);
  const server = createServer({
    skill: require('./index').skill,
    skillId,
    verifiers: [new SkillRequestSignatureVerifier(), new TimestampVerifier()],
  });
  server.listen(port, () => console.log(`Listening on :${port} for skill ${skillId}`));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

module.exports = { createServer };
