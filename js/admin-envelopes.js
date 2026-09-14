let envelopes = [];
let envelopeDirty = false;
let envelopeBusy = false;
const envelopeTabName = PRICING_CONFIG.ENVELOPES_TAB_NAME;

async function envelopeSheetRequest(path = '', options = {}) {
  const response = await fetch(`${SHEETS_BASE}/${PRICING_CONFIG.SHEET_ID}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  return parseResponse(response, 'Không truy cập được dữ liệu phong bì');
}

async function envelopeSheetExists() {
  const data = await envelopeSheetRequest('?fields=sheets.properties.title');
  return data.sheets.some((sheet) => sheet.properties.title === envelopeTabName);
}

async function ensureEnvelopeSheet() {
  if (!await envelopeSheetExists()) {
    await envelopeSheetRequest(':batchUpdate', {
      method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: envelopeTabName } } }] }),
    });
  }
  const data = await envelopeSheetRequest(`/values/${encodeURIComponent(`${envelopeTabName}!A1:D1`)}`);
  const headers = data.values?.[0] || [];
  if (headers.length && JSON.stringify(headers) !== JSON.stringify(ENVELOPE_HEADERS)) {
    throw new Error('Tab Envelopes cần đúng các cột: ' + ENVELOPE_HEADERS.join(', '));
  }
  if (!headers.length) {
    await envelopeSheetRequest(`/values/${encodeURIComponent(`${envelopeTabName}!A1:D1`)}?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({ values: [ENVELOPE_HEADERS] }),
    });
  }
}

async function loadEnvelopes(selectedId = $('envelopeSelect').value) {
  $('envelopeSubmit').disabled = true;
  envelopes = envelopeRows(await envelopeSheetExists()
    ? await readPrivateSheet(accessToken, PRICING_CONFIG.SHEET_ID, envelopeTabName, 'A:D') : []);
  const items = envelopes;
  $('envelopeSelect').replaceChildren(new Option('＋ Thêm phong bì mới', ''), ...items.map((item) => new Option(item.name, item.envelope_id)));
  $('envelopeRows').innerHTML = items.map((item) => `<tr>
    <td><img class="envelope-thumbnail" src="${escapeHtml(envelopeUrl(item.image_url))}" alt="" loading="lazy" /></td>
    <td><strong>${escapeHtml(item.name)}</strong><small>${envelopeUrl(item.video_url) ? 'Đã cài link video' : 'Chưa cài link video'}</small></td>
    <td><button type="button" class="button secondary" data-envelope-id="${escapeHtml(item.envelope_id)}">Sửa</button></td>
  </tr>`).join('');
  $('envelopeCount').textContent = `${items.length} mẫu · ${items.filter((item) => envelopeUrl(item.video_url)).length} mẫu đã cài video`;
  $('envelopeSelect').value = items.some((item) => item.envelope_id === selectedId) ? selectedId : '';
  fillEnvelopeForm();
  $('envelopeSubmit').disabled = false;
}

function fillEnvelopeForm() {
  const id = $('envelopeSelect').value;
  const item = envelopes.find((row) => row.envelope_id === id) || {};
  $('envelopeFormTitle').textContent = id ? 'Sửa phong bì' : 'Thêm phong bì mới';
  for (const field of ['name', 'image_url', 'video_url']) $('envelopeForm').elements[field].value = item[field] || '';
  envelopeDirty = false;
  $('envelopeSaveMeta').textContent = '';
  previewEnvelope();
}

function previewEnvelope() {
  const form = $('envelopeForm');
  const imageUrl = envelopeUrl(form.elements.image_url.value);
  $('envelopePreviewImage').hidden = !imageUrl;
  $('envelopeImageError').hidden = true;
  if (imageUrl) $('envelopePreviewImage').src = imageUrl;
  else $('envelopePreviewImage').removeAttribute('src');
  $('envelopePreviewName').textContent = form.elements.name.value;
  const url = envelopeUrl(form.elements.video_url.value);
  $('envelopePreviewLink').hidden = !url;
  if (url) $('envelopePreviewLink').href = url;
  else $('envelopePreviewLink').removeAttribute('href');
}

$('envelopePreviewImage').onerror = () => { $('envelopeImageError').hidden = false; };
$('envelopePreviewImage').onload = () => { $('envelopeImageError').hidden = true; };
for (const tab of ['pricing', 'envelopes']) {
  $(tab + 'Tab').onclick = () => {
    for (const name of ['pricing', 'envelopes']) {
      $(name + 'Panel').classList.toggle('hidden', name !== tab);
      $(name + 'Tab').classList.toggle('secondary', name !== tab);
      $(name + 'Tab').setAttribute('aria-pressed', String(name === tab));
    }
  };
}
$('envelopeSelect').onchange = fillEnvelopeForm;
$('envelopeForm').addEventListener('input', () => {
  envelopeDirty = true;
  $('envelopeSaveMeta').textContent = '';
  previewEnvelope();
});
$('envelopeRows').onclick = (event) => {
  const button = event.target.closest('button[data-envelope-id]');
  if (!button || envelopeBusy) return;
  $('envelopeSelect').value = button.dataset.envelopeId;
  fillEnvelopeForm();
  $('envelopeForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
$('envelopeRefresh').onclick = async () => {
  try { await loadEnvelopes(); showStatus('Đã tải lại phong bì.'); }
  catch (error) { showStatus(error.message, 'error'); }
};
$('envelopeForm').onsubmit = async (event) => {
  event.preventDefault();
  if (envelopeBusy) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  for (const key of ENVELOPE_HEADERS) data[key] = String(data[key] ?? '').trim();
  const isNew = !data.envelope_id;
  if (isNew) data.envelope_id = `envelope_${crypto.randomUUID()}`;
  if (!data.name || !envelopeUrl(data.image_url) || !envelopeUrl(data.video_url)) {
    return showStatus('Nhập tên phong bì và link ảnh/video hợp lệ, bắt đầu bằng https:// hoặc http://.', 'error');
  }
  envelopeBusy = true;
  const controls = [...$('envelopeForm').elements, $('envelopeRefresh')];
  controls.forEach((control) => { control.disabled = true; });
  try {
    await ensureEnvelopeSheet();
    // Re-read before saving so a newly created row from another session is updated.
    const latest = await readPrivateSheet(accessToken, PRICING_CONFIG.SHEET_ID, envelopeTabName, 'A:D');
    const existing = latest.find((row) => row.envelope_id === data.envelope_id);
    if (!isNew && !existing) throw new Error('Mẫu này đã bị xóa khỏi Sheet. Hãy tải lại danh sách.');
    const range = existing ? `A${existing.rowNumber}:D${existing.rowNumber}` : 'A:D';
    await envelopeSheetRequest(`/values/${encodeURIComponent(`${envelopeTabName}!${range}`)}${existing ? '' : ':append'}?valueInputOption=RAW`, {
      method: existing ? 'PUT' : 'POST', body: JSON.stringify({ values: [objectToRow(data, ENVELOPE_HEADERS)] }),
    });
    envelopeDirty = false;
    await loadEnvelopes(data.envelope_id);
    $('envelopeSaveMeta').textContent = 'Đã lưu phong bì. Tải lại trang mẫu để xem thay đổi.';
    showStatus(`Đã lưu ${data.name}.`);
  } catch (error) { showStatus(error.message, 'error'); }
  finally {
    envelopeBusy = false;
    controls.forEach((control) => { control.disabled = false; });
  }
};
window.addEventListener('beforeunload', (event) => {
  if (envelopeDirty || envelopeBusy) { event.preventDefault(); event.returnValue = ''; }
});
