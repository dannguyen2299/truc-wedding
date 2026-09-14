const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const config = fs.readFileSync('js/envelopes-config.js', 'utf8');
const api = fs.readFileSync('js/sheetsApi.js', 'utf8');
const publicScript = fs.readFileSync('js/envelopes-sheet.js', 'utf8');

function context(extra = {}) {
  const ctx = vm.createContext({ URL, console, ...extra });
  vm.runInContext(config + '\n' + api, ctx);
  return ctx;
}

test('URL validation rejects executable protocols and credentials', () => {
  const ctx = context();
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '/relative', 'https://user:pass@example.com']) {
    ctx.value = value;
    assert.equal(vm.runInContext('envelopeUrl(value)', ctx), '');
  }
  assert.equal(vm.runInContext('envelopeUrl("https://example.com/video?v=1")', ctx), 'https://example.com/video?v=1');
});

function publicPage(values, ok = true) {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', setAttribute() {}, replaceChildren() { this.innerHTML = ''; } });
    return nodes.get(id);
  };
  const ctx = context({
    PRICING_CONFIG: { SHEET_ID: 'test', ENVELOPES_TAB_NAME: 'Envelopes', API_KEY: 'test' },
    fetch: async () => ({ ok, status: 403, json: async () => ({ values }) }),
    console: { warn() {} }, document: { getElementById: node },
  });
  vm.runInContext(publicScript, ctx);
  return { ctx, node };
}

test('catalog renders arbitrary Sheet rows in order with safe names and video links', async () => {
  const { node } = publicPage([
    ['envelope_id', 'name', 'image_url', 'video_url'],
    ['custom-99', '<b>New</b>', 'https://example.com/image.jpg', 'https://example.com/video'],
    ['custom-200', 'Second', '', 'javascript:alert(1)'],
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  const html = node('envelopeCatalog').innerHTML;
  assert.equal((html.match(/<article/g) || []).length, 2);
  assert.ok(html.includes('&lt;b&gt;New&lt;/b&gt;'));
  assert.ok(html.indexOf('New') < html.indexOf('Second'));
  assert.equal((html.match(/href="https:\/\/example.com\/video"/g) || []).length, 2);
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('Video đang cập nhật'));
});

test('empty Sheet renders no fixed catalog', async () => {
  const { node } = publicPage([]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(node('envelopeCatalog').innerHTML, '');
  assert.equal(node('envelopeCatalogStatus').textContent, 'Chưa có thiệp nào.');
});

test('API error shows retry instead of a hardcoded fallback', async () => {
  const { node } = publicPage([], false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(node('envelopeCatalog').innerHTML, '');
  assert.equal(node('envelopeCatalogRetry').hidden, false);
});

test('first save initializes headers and writes literal values; later saves update the existing row', async () => {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', elements: [], addEventListener() {} });
    return elements.get(id);
  };
  const calls = [];
  let exists = false;
  let headers = [];
  let rows = [];
  const ctx = context({
    PRICING_CONFIG: { SHEET_ID: 'test', ENVELOPES_TAB_NAME: 'Envelopes' }, accessToken: 'mock-token',
    crypto: { randomUUID: () => 'new-id' }, $: element, window: { addEventListener() {} }, showStatus() {},
    FormData: class { constructor() { return Object.entries({ envelope_id: element('envelopeSelect').value, name: '=literal name', image_url: 'https://example.com/image.png', video_url: 'https://example.com/video' }); } },
    fetch: async (url, options) => {
      calls.push({ url: decodeURIComponent(url), ...options });
      let data = {};
      if (url.includes('?fields=')) data = { sheets: exists ? [{ properties: { title: 'Envelopes' } }] : [] };
      else if (url.endsWith(':batchUpdate')) exists = true;
      else if (decodeURIComponent(url).includes('A1:E1')) {
        if (options.method === 'PUT') headers = JSON.parse(options.body).values[0];
        else data = { values: headers.length ? [headers] : [] };
      }
      return { ok: true, json: async () => data };
    },
  });
  vm.runInContext(fs.readFileSync('js/admin-envelopes.js', 'utf8'), ctx);
  ctx.mockRows = rows;
  vm.runInContext('loadEnvelopes = async () => {}; readPrivateSheet = async () => mockRows;', ctx);
  await element('envelopeForm').onsubmit({ preventDefault() {}, currentTarget: {} });
  assert.ok(exists);
  assert.deepEqual(headers, ['envelope_id', 'name', 'image_url', 'video_url', 'status']);
  const append = calls.find((call) => call.url.includes(':append'));
  assert.ok(append.url.endsWith('valueInputOption=RAW'));
  assert.equal(JSON.parse(append.body).values[0][1], '=literal name');
  element('envelopeSelect').value = 'envelope_new-id';
  ctx.mockRows = [{ envelope_id: 'envelope_new-id', rowNumber: 2 }];
  await element('envelopeForm').onsubmit({ preventDefault() {}, currentTarget: {} });
  assert.ok(calls.some((call) => call.method === 'PUT' && call.url.includes('Envelopes!A2:E2')));
});


test('hidden cards are omitted while old rows and active cards remain visible', async () => {
  const { node } = publicPage([
    ['envelope_id', 'name', 'image_url', 'video_url', 'status'],
    ['old', 'Legacy card', '', ''],
    ['hidden', 'Secret card', 'https://example.com/hidden.jpg', 'https://example.com/hidden', 'inactive'],
    ['active', 'Visible card', '', '', 'active'],
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  const html = node('envelopeCatalog').innerHTML;
  assert.ok(html.includes('Legacy card'));
  assert.ok(html.includes('Visible card'));
  assert.ok(!html.includes('Secret card'));
  assert.ok(!html.includes('hidden.jpg'));
});

test('legacy Sheet migration only adds E1 and visibility toggle only writes the status cell', async () => {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', elements: [], addEventListener() {} });
    return elements.get(id);
  };
  const calls = [];
  let status = '';
  let migrated = false;
  const ctx = context({
    PRICING_CONFIG: { SHEET_ID: 'test', ENVELOPES_TAB_NAME: 'Envelopes' }, accessToken: 'mock',
    $: element, window: { addEventListener() {} }, showStatus() {},
    fetch: async (url, options) => {
      const path = decodeURIComponent(url);
      let data = {};
      if (options.method === 'PUT') {
        calls.push({ path, body: JSON.parse(options.body) });
        if (path.includes('!E1?')) migrated = true;
        if (path.includes('!E7?')) status = JSON.parse(options.body).values[0][0];
      } else if (path.includes('?fields=')) data = { sheets: [{ properties: { title: 'Envelopes' } }] };
      else if (path.includes('!A1:E1')) data = { values: [['envelope_id', 'name', 'image_url', 'video_url', ...(migrated ? ['status'] : [])]] };
      return { ok: true, json: async () => data };
    },
    getRows: () => [{ envelope_id: 'card', name: 'Card', image_url: 'image', video_url: 'video', rowNumber: 7, status }],
  });
  vm.runInContext(fs.readFileSync('js/admin-envelopes.js', 'utf8'), ctx);
  vm.runInContext('readPrivateSheet = async () => getRows();', ctx);
  await vm.runInContext('toggleEnvelopeStatus("card")', ctx);
  assert.equal(status, 'inactive');
  assert.ok(element('envelopeRows').innerHTML.includes('Hiện thiệp'));
  await vm.runInContext('toggleEnvelopeStatus("card")', ctx);
  assert.equal(status, 'active');
  assert.ok(element('envelopeRows').innerHTML.includes('Ẩn thiệp'));
  assert.equal(calls.length, 3);
  assert.ok(calls[0].path.includes('!E1?'));
  assert.deepEqual(calls[0].body.values, [['status']]);
  assert.ok(calls.slice(1).every((call) => call.path.includes('!E7?')));
});

test('sample import adds 15 rows once and does not duplicate on retry', async () => {
  const samples = JSON.parse(fs.readFileSync('assets/sample-invitations.json', 'utf8'));
  assert.equal(samples.length, 15);
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: '', elements: [], addEventListener() {} });
    return elements.get(id);
  };
  const ctx = context({
    PRICING_CONFIG: { ENVELOPES_TAB_NAME: 'Envelopes' }, accessToken: 'mock', $: element,
    window: { addEventListener() {} }, showStatus() {},
    fetch: async () => ({ ok: true, json: async () => samples }),
  });
  vm.runInContext(fs.readFileSync('js/admin-envelopes.js', 'utf8'), ctx);
  vm.runInContext(`
    var savedSamples = [];
    var sampleWrites = 0;
    ensureEnvelopeSheet = async () => {};
    readPrivateSheet = async () => savedSamples;
    loadEnvelopes = async () => {};
    envelopeSheetRequest = async (path, options) => {
      sampleWrites++;
      savedSamples = JSON.parse(options.body).values.map((row) => Object.fromEntries(ENVELOPE_HEADERS.map((key, i) => [key, row[i]])));
    };
  `, ctx);
  await element('envelopeAddSamples').onclick();
  await element('envelopeAddSamples').onclick();
  assert.equal(vm.runInContext('sampleWrites', ctx), 1);
  assert.equal(vm.runInContext('savedSamples.length', ctx), 15);
});
