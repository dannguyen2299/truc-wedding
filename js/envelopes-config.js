const ENVELOPE_HEADERS = ['envelope_id', 'name', 'image_url', 'video_url', 'status'];

function envelopeUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

// The Sheet is the only catalog source; retain its row order.
function envelopeRows(rows) {
  const ids = new Set();
  return rows.map((row) => {
    const item = { rowNumber: row.rowNumber };
    for (const key of ENVELOPE_HEADERS) item[key] = String(row[key] ?? '').trim();
    return item;
  }).filter((row) => {
    if (!row.envelope_id || ids.has(row.envelope_id)) return false;
    ids.add(row.envelope_id);
    return true;
  });
}

// Existing rows without a status remain visible.
function envelopeIsVisible(item) {
  return String(item.status || '').trim().toLowerCase() !== 'inactive';
}
