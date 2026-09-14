const PACKAGE_HEADERS = [
  'package_id', 'status', 'label', 'final_price', 'original_price', 'discount_label', 'subtitle', 'features',
];

const PACKAGE_IDS = ['goi1', 'goi2', 'goi3', 'govip'];
const PACKAGE_NAMES = {
  goi1: 'Gói 1',
  goi2: 'Gói 2',
  goi3: 'Gói 3',
  govip: 'Gói VIP',
};
const PACKAGE_EDITABLE_FIELDS = {
  goi1: ['original_price', 'features'],
  goi2: ['original_price', 'discount_label', 'features'],
  goi3: ['original_price', 'discount_label', 'features'],
  govip: [],
};
const PACKAGE_HELP = {
  goi1: 'Gói 1 hiển thị giá hiện tại, giá gốc, mô tả và danh sách tính năng.',
  goi2: 'Gói 2 hiển thị đầy đủ giá, nhãn giảm giá, mô tả và danh sách tính năng.',
  goi3: 'Gói 3 hiển thị đầy đủ giá, nhãn giảm giá, mô tả và danh sách tính năng.',
  govip: 'Gói VIP chỉ hiển thị nhãn, giá hiện tại và mô tả trên trang chủ.',
};

let tokenClient;
let accessToken = null;
let currentUser = null;
let packages = [];
let isDirty = false;

const $ = (id) => document.getElementById(id);

function showStatus(message, type = 'success') {
  $('statusMessage').textContent = message;
  $('statusMessage').className = `notice ${type}`;
  $('statusMessage').setAttribute('role', type === 'error' ? 'alert' : 'status');
}

function saveToken(token, expiresIn) {
  sessionStorage.setItem('wedding_admin_token', JSON.stringify({ token, expiresAt: Date.now() + expiresIn * 1000 }));
}

function loadToken() {
  try {
    const value = JSON.parse(sessionStorage.getItem('wedding_admin_token') || 'null');
    return value && Date.now() < value.expiresAt ? value.token : null;
  } catch { return null; }
}

function findConfiguredAdmin(email) {
  return (PRICING_CONFIG.ADMINS || []).find((account) => account.email?.toLowerCase() === email?.toLowerCase());
}

function findPackage(packageId) {
  return packages.find((item) => item.package_id === packageId);
}

function sheetValueToPlainText(value) {
  const container = document.createElement('div');
  container.innerHTML = String(value ?? '').replace(/<br\s*\/?\s*>/gi, '\n');
  return container.textContent || '';
}

function renderPackages() {
  const rows = PACKAGE_IDS.map((id) => findPackage(id) || { package_id: id, status: '', label: PACKAGE_NAMES[id] });
  $('packageRows').innerHTML = rows.map((pkg) => `<tr>
    <td><strong>${escapeHtml(PACKAGE_NAMES[pkg.package_id] || pkg.package_id)}</strong><small>${escapeHtml(pkg.package_id)}</small></td>
    <td>${escapeHtml(pkg.original_price || '—')}</td>
    <td>${escapeHtml(pkg.final_price || '—')}</td>
    <td class="row-actions"><button class="button secondary" data-action="edit" data-id="${escapeHtml(pkg.package_id)}">Sửa</button></td>
  </tr>`).join('');
  $('packageCount').textContent = `${packages.length}/4 gói đã có dữ liệu`;
}

function fillFormFromPackage(packageId) {
  const pkg = findPackage(packageId) || {};
  const form = $('packageForm');
  form.elements.package_id.value = packageId;
  form.elements.label.value = pkg.label || PACKAGE_NAMES[packageId] || '';
  form.elements.final_price.value = pkg.final_price || '';
  form.elements.original_price.value = pkg.original_price || '';
  form.elements.discount_label.value = pkg.discount_label || '';
  form.elements.subtitle.value = sheetValueToPlainText(pkg.subtitle);
  form.elements.features.value = sheetValueToPlainText(pkg.features);
  updateEditableFields(packageId);
  isDirty = false;
  $('saveMeta').textContent = '';
  $('formTitle').textContent = `Sửa ${PACKAGE_NAMES[packageId] || packageId}`;
}

function updateEditableFields(packageId) {
  const visibleFields = new Set(PACKAGE_EDITABLE_FIELDS[packageId] || []);
  document.querySelectorAll('[data-package-field]').forEach((field) => {
    field.classList.toggle('hidden', !visibleFields.has(field.dataset.packageField));
  });
  $('priceRow').classList.toggle('single-field', packageId === 'govip');
  $('packageHelp').textContent = PACKAGE_HELP[packageId] || '';
  updatePreview();
}

function updatePreview() {
  const form = $('packageForm');
  const packageId = form.elements.package_id.value;
  const visibleFields = new Set(PACKAGE_EDITABLE_FIELDS[packageId] || []);
  const label = form.elements.label.value.trim() || PACKAGE_NAMES[packageId];
  const finalPrice = form.elements.final_price.value.trim();
  const originalPrice = form.elements.original_price.value.trim();
  const discountLabel = form.elements.discount_label.value.trim();
  const subtitle = form.elements.subtitle.value.trim();
  const features = form.elements.features.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  $('previewPackage').textContent = PACKAGE_NAMES[packageId] || '';
  $('previewFinal').textContent = finalPrice ? `${label}: ${finalPrice}` : label;
  $('previewOriginal').textContent = originalPrice;
  $('previewOriginal').hidden = !visibleFields.has('original_price') || !originalPrice;
  $('previewDiscount').textContent = discountLabel;
  $('previewDiscount').hidden = !visibleFields.has('discount_label') || !discountLabel;
  $('previewSubtitle').textContent = subtitle;
  $('previewSubtitle').hidden = !subtitle;
  $('previewFeatures').replaceChildren(...features.map((feature) => {
    const item = document.createElement('li');
    item.textContent = feature;
    return item;
  }));
  $('previewFeatures').hidden = !visibleFields.has('features') || !features.length;
}

async function loadPackages() {
  packages = await readPrivateSheet(accessToken, PRICING_CONFIG.SHEET_ID, PRICING_CONFIG.TAB_NAME);
  renderPackages();
  fillFormFromPackage($('packageSelect').value);
}

async function loadAdminData() {
  const account = findConfiguredAdmin(currentUser.email);
  if (!account) throw new Error('Tài khoản Google này chưa được cấp quyền quản trị (kiểm tra CONFIG.ADMINS).');
  $('userInfo').textContent = `${account.display_name || currentUser.email}`;
  $('loginBox').classList.add('hidden');
  $('adminPanel').classList.remove('hidden');
  $('logoutBtn').classList.remove('hidden');
  const results = await Promise.allSettled([loadPackages(), loadEnvelopes()]);
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length) throw new Error(failures.map((result) => result.reason.message).join(' · '));
}

function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: PRICING_CONFIG.CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email',
    callback: async (response) => {
      if (response.error) return showStatus(`Đăng nhập thất bại: ${response.error}`, 'error');
      accessToken = response.access_token;
      saveToken(accessToken, response.expires_in);
      try {
        currentUser = await getGoogleUser(accessToken);
        await loadAdminData();
      } catch (error) { showStatus(error.message, 'error'); }
    },
  });
  const stored = loadToken();
  if (stored) {
    accessToken = stored;
    getGoogleUser(accessToken).then((user) => { currentUser = user; return loadAdminData(); }).catch((error) => {
      console.error('Khôi phục phiên đăng nhập thất bại:', error);
      sessionStorage.removeItem('wedding_admin_token');
    });
  }
}

$('loginBtn').onclick = () => tokenClient.requestAccessToken();
$('logoutBtn').onclick = () => {
  if (accessToken && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(accessToken, () => {});
  sessionStorage.removeItem('wedding_admin_token');
  window.location.reload();
};

$('refreshBtn').onclick = async () => {
  try {
    await loadPackages();
    showStatus('Đã tải lại danh sách gói.');
  } catch (error) { showStatus(error.message, 'error'); }
};

$('packageSelect').addEventListener('change', (event) => fillFormFromPackage(event.target.value));

$('packageForm').addEventListener('input', () => {
  isDirty = true;
  $('saveMeta').textContent = '';
  updatePreview();
});

$('packageRows').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action="edit"]');
  if (!button) return;
  $('packageSelect').value = button.dataset.id;
  fillFormFromPackage(button.dataset.id);
  $('packageForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('packageForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const packageId = form.elements.package_id.value;
  const data = Object.fromEntries(new FormData(form).entries());
  data.package_id = packageId;
  data.status = 'active';
  const existing = findPackage(packageId);
  $('packageSubmit').disabled = true;
  try {
    if (existing) {
      await updatePrivateRow(accessToken, PRICING_CONFIG.SHEET_ID, PRICING_CONFIG.TAB_NAME, existing.rowNumber, data, PACKAGE_HEADERS);
      showStatus(`Đã cập nhật ${PACKAGE_NAMES[packageId]}.`);
    } else {
      await appendPrivateRow(accessToken, PRICING_CONFIG.SHEET_ID, PRICING_CONFIG.TAB_NAME, data, PACKAGE_HEADERS);
      showStatus(`Đã thêm dữ liệu cho ${PACKAGE_NAMES[packageId]}.`);
    }
    await loadPackages();
    isDirty = false;
    $('saveMeta').textContent = `Đã lưu lúc ${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())}.`;
  } catch (error) { showStatus(error.message, 'error'); }
  $('packageSubmit').disabled = false;
});

window.addEventListener('beforeunload', (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

function start() {
  if (!PRICING_CONFIG.CLIENT_ID || PRICING_CONFIG.CLIENT_ID.startsWith('YOUR_')) {
    return showStatus('Chưa cấu hình CLIENT_ID trong js/pricing-config.js.', 'error');
  }
  initAuth();
}

start();
