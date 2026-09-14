let envelopes = [];
let envelopeDirty = false;
let envelopeBusy = false;
const envelopeTabName = PRICING_CONFIG.ENVELOPES_TAB_NAME;

async function envelopeSheetRequest(path = '', options = {}) {
  const response = await fetch(`${SHEETS_BASE}/${PRICING_CONFIG.SHEET_ID}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  return parseResponse(response, 'Không truy cập được dữ liệu thiệp');
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
  const data = await envelopeSheetRequest(`/values/${encodeURIComponent(`${envelopeTabName}!A1:E1`)}`);
  const headers = data.values?.[0] || [];
  const legacyHeaders = ENVELOPE_HEADERS.slice(0, 4);
  const isLegacy = JSON.stringify(headers.slice(0, 4)) === JSON.stringify(legacyHeaders) && !headers[4];
  if (headers.length && !isLegacy && JSON.stringify(headers) !== JSON.stringify(ENVELOPE_HEADERS)) {
    throw new Error('Tab Envelopes cần đúng các cột: ' + ENVELOPE_HEADERS.join(', '));
  }
  if (!headers.length || isLegacy) {
    const range = isLegacy ? 'E1' : 'A1:E1';
    await envelopeSheetRequest(`/values/${encodeURIComponent(`${envelopeTabName}!${range}`)}?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({ values: [isLegacy ? ['status'] : ENVELOPE_HEADERS] }),
    });
  }
}

async function loadEnvelopes(selectedId = $('envelopeSelect').value) {
  $('envelopeSubmit').disabled = true;
  envelopes = envelopeRows(await envelopeSheetExists()
    ? await readPrivateSheet(accessToken, PRICING_CONFIG.SHEET_ID, envelopeTabName, 'A:E') : []);
  const items = envelopes;
  $('envelopeSelect').replaceChildren(new Option('＋ Thêm thiệp mới', ''), ...items.map((item) => new Option(item.name, item.envelope_id)));
  renderEnvelopeList();
  $('envelopeSelect').value = items.some((item) => item.envelope_id === selectedId) ? selectedId : '';
  fillEnvelopeForm();
  $('envelopeSubmit').disabled = false;
  $('envelopeAddSamples').disabled = false;
}

function renderEnvelopeList() {
  const items = envelopes;
  $('envelopeRows').innerHTML = items.map((item) => `<tr>
    <td><img class="envelope-thumbnail" src="${escapeHtml(envelopeUrl(item.image_url))}" alt="" loading="lazy" /></td>
    <td><strong>${escapeHtml(item.name)}</strong><small>${envelopeIsVisible(item) ? 'Đang hiện' : 'Đang ẩn'}</small><small>${envelopeUrl(item.video_url) ? 'Đã cài link video' : 'Chưa cài link video'}</small></td>
    <td><button type="button" class="button secondary" data-envelope-id="${escapeHtml(item.envelope_id)}">Sửa</button>
      <button type="button" class="button secondary" data-envelope-id="${escapeHtml(item.envelope_id)}" data-toggle-status="true">${envelopeIsVisible(item) ? 'Ẩn thiệp' : 'Hiện thiệp'}</button></td>
  </tr>`).join('');
  $('envelopeCount').textContent = `${items.length} mẫu · ${items.filter((item) => envelopeUrl(item.video_url)).length} mẫu đã cài video`;
}

function fillEnvelopeForm() {
  const id = $('envelopeSelect').value;
  const item = envelopes.find((row) => row.envelope_id === id) || {};
  $('envelopeFormTitle').textContent = id ? 'Sửa thiệp' : 'Thêm thiệp mới';
  for (const field of ['name', 'image_url', 'video_url']) $('envelopeForm').elements[field].value = item[field] || '';
  $('envelopeForm').elements.status.value = envelopeIsVisible(item) ? 'active' : 'inactive';
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
  if (button.dataset.toggleStatus) return toggleEnvelopeStatus(button.dataset.envelopeId);
  $('envelopeSelect').value = button.dataset.envelopeId;
  fillEnvelopeForm();
  $('envelopeForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
};
$('envelopeRefresh').onclick = async () => {
  try { await loadEnvelopes(); showStatus('Đã tải lại thiệp.'); }
  catch (error) { showStatus(error.message, 'error'); }
};
$('envelopeForm').onsubmit = async (event) => {
  event.preventDefault();
  if (envelopeBusy) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  for (const key of ENVELOPE_HEADERS) data[key] = String(data[key] ?? '').trim();
  data.status = envelopeIsVisible(data) ? 'active' : 'inactive';
  const isNew = !data.envelope_id;
  if (isNew) data.envelope_id = `envelope_${crypto.randomUUID()}`;
  if (!data.name || !envelopeUrl(data.image_url) || !envelopeUrl(data.video_url)) {
    return showStatus('Nhập tên thiệp và link ảnh/video hợp lệ, bắt đầu bằng https:// hoặc http://.', 'error');
  }
  envelopeBusy = true;
  const controls = [...$('envelopeForm').elements, $('envelopeRefresh'), $('envelopeAddSamples')];
  controls.forEach((control) => { control.disabled = true; });
  try {
    await ensureEnvelopeSheet();
    // Re-read before saving so a newly created row from another session is updated.
    const latest = await readPrivateSheet(accessToken, PRICING_CONFIG.SHEET_ID, envelopeTabName, 'A:E');
    const existing = latest.find((row) => row.envelope_id === data.envelope_id);
    if (!isNew && !existing) throw new Error('Mẫu này đã bị xóa khỏi Sheet. Hãy tải lại danh sách.');
    const range = existing ? `A${existing.rowNumber}:E${existing.rowNumber}` : 'A:E';
    await envelopeSheetRequest(`/values/${encodeURIComponent(`${envelopeTabName}!${range}`)}${existing ? '' : ':append'}?valueInputOption=RAW`, {
      method: existing ? 'PUT' : 'POST', body: JSON.stringify({ values: [objectToRow(data, ENVELOPE_HEADERS)] }),
    });
    envelopeDirty = false;
    await loadEnvelopes(data.envelope_id);
    $('envelopeSaveMeta').textContent = 'Đã lưu thiệp. Tải lại trang mẫu để xem thay đổi.';
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

async function toggleEnvelopeStatus(id) {
  if (envelopeBusy) return;
  envelopeBusy = true;
  const controls = [...$('envelopeForm').elements, $('envelopeRefresh'), $('envelopeAddSamples')];
  controls.forEach((control) => { control.disabled = true; });
  try {
    await ensureEnvelopeSheet();
    const latest = await readPrivateSheet(accessToken, PRICING_CONFIG.SHEET_ID, envelopeTabName, 'A:E');
    const item = latest.find((row) => row.envelope_id === id);
    if (!item) throw new Error('Thiệp đã bị xóa khỏi Sheet. Hãy tải lại danh sách.');
    const status = envelopeIsVisible(item) ? 'inactive' : 'active';
    await envelopeSheetRequest(`/values/${encodeURIComponent(`${envelopeTabName}!E${item.rowNumber}`)}?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({ values: [[status]] }),
    });
    envelopes = envelopeRows(latest.map((row) => row.envelope_id === id ? { ...row, status } : row));
    renderEnvelopeList();
    if ($('envelopeSelect').value === id) $('envelopeForm').elements.status.value = status;
    showStatus(`${status === 'inactive' ? 'Đã ẩn' : 'Đã hiện'} thiệp “${item.name}”. Tải lại trang mẫu để xem thay đổi.`);
  } catch (error) { showStatus(error.message, 'error'); }
  finally {
    envelopeBusy = false;
    controls.forEach((control) => { control.disabled = false; });
  }
}

$('envelopeAddSamples').onclick = async () => {
  if (envelopeBusy) return;
  if (envelopeDirty) return showStatus('Hãy lưu thiệp đang sửa trước khi thêm mẫu.', 'error');
  envelopeBusy = true;
  const controls = [...$('envelopeForm').elements, $('envelopeRefresh'), $('envelopeAddSamples')];
  controls.forEach((control) => { control.disabled = true; });
  try {
    const response = await fetch('assets/sample-invitations.json');
    if (!response.ok) throw new Error('Không tải được bộ thiệp mẫu. Vui lòng thử lại.');
    const samples = await response.json();
    await ensureEnvelopeSheet();
    const current = await readPrivateSheet(accessToken, PRICING_CONFIG.SHEET_ID, envelopeTabName, 'A:E');
    const ids = new Set(current.map((item) => item.envelope_id));
    const missing = envelopeRows(samples).filter((item) => !ids.has(item.envelope_id));
    if (missing.length) {
      await envelopeSheetRequest(`/values/${encodeURIComponent(`${envelopeTabName}!A:E`)}:append?valueInputOption=RAW`, {
        method: 'POST', body: JSON.stringify({ values: missing.map((item) => objectToRow(item, ENVELOPE_HEADERS)) }),
      });
    }
    await loadEnvelopes();
    showStatus(missing.length ? `Đã thêm ${missing.length} thiệp mẫu. Bạn có thể cài link video cho từng thiệp.` : 'Đã có đủ 15 thiệp mẫu, không thêm trùng.');
  } catch (error) { showStatus(error.message, 'error'); }
  finally {
    envelopeBusy = false;
    controls.forEach((control) => { control.disabled = false; });
  }
};
