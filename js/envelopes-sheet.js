function renderEnvelopeCatalog(rows) {
  const catalog = document.getElementById('envelopeCatalog');
  const items = envelopeRows(rows).filter(envelopeIsVisible);
  catalog.innerHTML = items.map((item) => {
    const name = escapeHtml(item.name || 'Thiệp');
    const imageUrl = envelopeUrl(item.image_url);
    const videoUrl = envelopeUrl(item.video_url);
    const image = imageUrl ? `<img class="envelope-image" src="${escapeHtml(imageUrl)}" alt="${name}" loading="lazy">` : '<p class="envelope-image">Chưa có ảnh đại diện</p>';
    const picture = videoUrl ? `<a class="envelope-picture" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer">${image}</a>` : `<div class="envelope-picture">${image}</div>`;
    return `<article class="envelope-card"><h2>${name}</h2>${picture}${videoUrl
      ? `<a class="envelope-view" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer">Xem thiệp</a>`
      : '<p class="envelope-unavailable">Video đang cập nhật</p>'}</article>`;
  }).join('');
  return items.length;
}

async function loadEnvelopeCatalog() {
  const status = document.getElementById('envelopeCatalogStatus');
  const retry = document.getElementById('envelopeCatalogRetry');
  const catalog = document.getElementById('envelopeCatalog');
  status.textContent = 'Đang tải danh sách thiệp…';
  catalog.setAttribute('aria-busy', 'true');
  retry.hidden = true;
  try {
    const response = await fetch(valuesUrl(PRICING_CONFIG.SHEET_ID,
      `${PRICING_CONFIG.ENVELOPES_TAB_NAME}!A:E`, `?key=${encodeURIComponent(PRICING_CONFIG.API_KEY)}`));
    const data = await parseResponse(response, 'Không tải được thiệp');
    const count = renderEnvelopeCatalog(rowsToObjects(data.values));
    status.textContent = count ? '' : 'Chưa có thiệp nào.';
  } catch (error) {
    catalog.replaceChildren();
    status.textContent = 'Không tải được danh sách thiệp. Vui lòng thử lại.';
    retry.hidden = false;
    console.warn('[envelopes-sheet]', error.message);
  } finally {
    catalog.setAttribute('aria-busy', 'false');
  }
}
document.getElementById('envelopeCatalogRetry').onclick = loadEnvelopeCatalog;
loadEnvelopeCatalog();
