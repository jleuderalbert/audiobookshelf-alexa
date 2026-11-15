'use strict';

// Tests the self-hosted HTTP server (server.js) around the skill. Alexa
// signature checks are replaced by stub verifiers; audiobookshelf calls are
// stubbed via test/fixtures/abs-mock.js.

const test = require('node:test');
const assert = require('node:assert/strict');

const { installFetch, restoreFetch } = require('./fixtures/abs-mock');
const { launch, intent } = require('./fixtures/alexa');

installFetch();
const { skill } = require('../index');
const { createServer } = require('../server');

test.after(() => { restoreFetch(); });

const SKILL_ID = 'amzn1.ask.skill.test';
const accept = { verify: async () => {} };
const reject = { verify: async () => { throw new Error('bad signature'); } };

async function withServer(verifiers, fn) {
  const server = createServer({ skill, skillId: SKILL_ID, verifiers });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    // The ABS mock replaces global fetch, so talk to the server with http.
    await fn(server.address().port);
  } finally {
    server.close();
  }
}

function request(port, method, path, body) {
  const http = require('node:http');
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

test('server answers verified requests for its skill', async () => {
  await withServer([accept], async (port) => {
    const res = await request(port, 'POST', '/', launch());
    assert.equal(res.status, 200);
    assert.match(res.body.response.outputSpeech.ssml, /Willkommen bei Audiobookshelf/);
  });
});

test('server rejects requests that fail verification', async () => {
  await withServer([accept, reject], async (port) => {
    assert.equal((await request(port, 'POST', '/', launch())).status, 400);
  });
});

test('server rejects requests for another skill', async () => {
  await withServer([accept], async (port) => {
    const env = intent('ListLibrariesIntent');
    env.context.System.application.applicationId = 'amzn1.ask.skill.other';
    env.session.application.applicationId = 'amzn1.ask.skill.other';
    assert.equal((await request(port, 'POST', '/', env)).status, 400);
  });
});

test('server only serves POST / and GET /health', async () => {
  await withServer([accept], async (port) => {
    assert.equal((await request(port, 'GET', '/health')).status, 200);
    assert.equal((await request(port, 'GET', '/')).status, 404);
    assert.equal((await request(port, 'POST', '/status', {})).status, 404);
  });
});
