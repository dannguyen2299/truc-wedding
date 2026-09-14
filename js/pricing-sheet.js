// Đổ dữ liệu Bảng giá từ Google Sheet vào các phần tử có sẵn trong trang.
// An toàn khi lỗi: nếu chưa cấu hình hoặc gọi API thất bại, trang giữ nguyên
// nội dung giá/mô tả đang có sẵn trong HTML (không làm vỡ trang).
(function () {
  const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
  const RED = 'rgb(111, 3, 3)';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
  }

  function sheetTextToHtml(value) {
    const container = document.createElement('div');
    container.innerHTML = String(value ?? '').replace(/<br\s*\/?\s*>/gi, '\n');
    return escapeHtml(container.textContent || '').replace(/\r?\n/g, '<br>');
  }

  function rowsToObjects(values) {
    if (!values || !values.length) return [];
    const headers = values[0].map((header) => String(header).trim());
    return values.slice(1).map((row) => {
      const obj = {};
      headers.forEach((header, i) => { obj[header] = (row[i] ?? '').toString().trim(); });
      return obj;
    });
  }

  async function fetchPackages() {
    const { SHEET_ID, API_KEY, TAB_NAME } = PRICING_CONFIG;
    if (!SHEET_ID || !API_KEY || SHEET_ID.startsWith('YOUR_') || API_KEY.startsWith('YOUR_')) {
      throw new Error('PRICING_CONFIG chưa được cấu hình SHEET_ID/API_KEY');
    }
    const range = encodeURIComponent(`${TAB_NAME}!A:Z`);
    const url = `${SHEETS_BASE}/${SHEET_ID}/values/${range}?key=${encodeURIComponent(API_KEY)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Sheets API lỗi (${res.status})`);
    const data = await res.json();
    const rows = rowsToObjects(data.values || []);
    const byId = {};
    rows.forEach((row) => { if (row.package_id) byId[row.package_id] = row; });
    return byId;
  }

  function setHtml(id, html) {
    if (!html) return;
    const wrapper = document.getElementById(id);
    if (!wrapper) return;
    // Chỉ thay nội dung bên trong thẻ .ladi-headline (h3/p) để giữ nguyên
    // style gốc của Ladipage (CSS định nghĩa theo "#ID > .ladi-headline").
    // Ghi đè thẳng lên div bọc ngoài sẽ xoá mất thẻ này và làm vỡ layout.
    const target = wrapper.querySelector('.ladi-headline') || wrapper;
    target.innerHTML = html;
  }

  function applyPackages(pkgs) {
    const g1 = pkgs.goi1;
    const g2 = pkgs.goi2;
    const g3 = pkgs.goi3;
    const vip = pkgs.govip;

    if (g1 && g1.status !== 'inactive') {
      setHtml('HEADLINE48', sheetTextToHtml(g1.original_price));
      setHtml('HEADLINE66', `${sheetTextToHtml(g1.label || 'Gói 1')}: <span style="color: ${RED};">${sheetTextToHtml(g1.final_price)}</span><br>`);
      setHtml('HEADLINE25', sheetTextToHtml(g1.subtitle));
      setHtml('HEADLINE82', sheetTextToHtml(g1.features));
    }

    if (g2 && g2.status !== 'inactive') {
      // Thẻ tóm tắt giá (GROUP37)
      setHtml('HEADLINE67', sheetTextToHtml(g2.original_price));
      setHtml('HEADLINE69', g2.discount_label
        ? `<span style="color: rgb(5, 41, 94);">${sheetTextToHtml(g2.discount_label)}</span> <span style="font-size: 28px;">${sheetTextToHtml(g2.final_price)}</span><br>`
        : `<span style="font-size: 28px;">${sheetTextToHtml(g2.final_price)}</span><br>`);
      setHtml('HEADLINE70', sheetTextToHtml(g2.subtitle));
      // Thẻ chi tiết (GROUP44)
      setHtml('HEADLINE86', sheetTextToHtml(g2.original_price));
      setHtml('HEADLINE89', `${sheetTextToHtml(g2.label || 'Gói 2')}: <span style="color: ${RED};">${sheetTextToHtml(g2.final_price)}</span><br>`);
      setHtml('HEADLINE88', sheetTextToHtml(g2.subtitle));
      setHtml('HEADLINE90', sheetTextToHtml(g2.features));
    }

    if (g3 && g3.status !== 'inactive') {
      // Badge nhỏ đầu bảng giá (GROUP49)
      setHtml('HEADLINE91', sheetTextToHtml(g3.original_price));
      setHtml('HEADLINE93', sheetTextToHtml(g3.subtitle));
      setHtml('HEADLINE94', `${sheetTextToHtml(g3.label || 'Gói 3')}: <span style="color: ${RED};">${sheetTextToHtml(g3.final_price)}</span><br>`);
      // Thẻ tóm tắt giá chính (GROUP39/40)
      setHtml('HEADLINE72', sheetTextToHtml(g3.original_price));
      setHtml('HEADLINE74', g3.discount_label
        ? `${sheetTextToHtml(g3.discount_label)} <span style="font-size: 28px; color: ${RED};">${sheetTextToHtml(g3.final_price)}</span><br>`
        : `<span style="font-size: 28px; color: ${RED};">${sheetTextToHtml(g3.final_price)}</span><br>`);
      setHtml('HEADLINE75', sheetTextToHtml(g3.subtitle));
      // Chi tiết tính năng (đứng độc lập, đi kèm GROUP44)
      setHtml('HEADLINE95', sheetTextToHtml(g3.features));
    }

    if (vip && vip.status !== 'inactive') {
      setHtml('HEADLINE79', `<span style="font-size: 28px;">${sheetTextToHtml(vip.final_price)}</span><br>`);
      setHtml('HEADLINE80', sheetTextToHtml(vip.subtitle));
      setHtml('HEADLINE81', `Gói <span style="color: ${RED};">${sheetTextToHtml(vip.label || 'vip')}</span><br>`);
    }
  }

  async function init() {
    try {
      const pkgs = await fetchPackages();
      applyPackages(pkgs);
    } catch (err) {
      // Im lặng giữ nguyên giá mặc định có sẵn trong HTML, chỉ log để dev biết.
      console.warn('[pricing-sheet] Không tải được bảng giá từ Google Sheet:', err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
