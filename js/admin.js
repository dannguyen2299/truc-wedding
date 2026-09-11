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

let tokenClient;
let accessToken = null;
let currentUser = null;
let packages = [];

const $ = (id) => document.getElementById(id);

function showStatus(message, type = 'success') {
  $('statusMessage').textContent = message;
  $('statusMessage').className = `notice ${type}`;
  $('statusMessage').setAttribute('role', type === 'error' ? 'alert' : 'status');
}

function statusLabel(status) {
  return status === 'inactive' ? 'Đang ẩn' : 'Đang hiện';
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

function renderPackages() {
  const rows = PACKAGE_IDS.map((id) => findPackage(id) || { package_id: id, status: '', label: PACKAGE_NAMES[id] });
  $('packageRows').innerHTML = rows.map((pkg) => `<tr>
    <td><strong>${escapeHtml(PACKAGE_NAMES[pkg.package_id] || pkg.package_id)}</strong><small>${escapeHtml(pkg.package_id)}</small></td>
    <td>${escapeHtml(pkg.original_price || '—')}</td>
    <td>${escapeHtml(pkg.final_price || '—')}</td>
    <td>${pkg.status ? `<span class="status-pill ${escapeHtml(pkg.status)}">${escapeHtml(statusLabel(pkg.status))}</span>` : '<span class="status-pill">Chưa có dữ liệu</span>'}</td>
    <td class="row-actions"><button class="button secondary" data-action="edit" data-id="${escapeHtml(pkg.package_id)}">Sửa</button></td>
  </tr>`).join('');
  $('packageCount').textContent = `${packages.length}/4 gói đã có dữ liệu`;
}

function fillFormFromPackage(packageId) {
  const pkg = findPackage(packageId) || {};
  const form = $('packageForm');
  form.elements.package_id.value = packageId;
  form.elements.status.value = pkg.status || 'active';
  form.elements.label.value = pkg.label || PACKAGE_NAMES[packageId] || '';
  form.elements.final_price.value = pkg.final_price || '';
  form.elements.original_price.value = pkg.original_price || '';
  form.elements.discount_label.value = pkg.discount_label || '';
  form.elements.subtitle.value = pkg.subtitle || '';
  form.elements.features.value = pkg.features || '';
  $('formTitle').textContent = `Sửa ${PACKAGE_NAMES[packageId] || packageId}`;
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
  await loadPackages();
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
  } catch (error) { showStatus(error.message, 'error'); }
  $('packageSubmit').disabled = false;
});

$('packageDelete').onclick = async () => {
  const packageId = $('packageSelect').value;
  const existing = findPackage(packageId);
  if (!existing) return showStatus(`${PACKAGE_NAMES[packageId]} chưa có dữ liệu trên sheet.`, 'error');
  if (!confirm(`Xoá dữ liệu ${PACKAGE_NAMES[packageId]} khỏi Google Sheet? Trang chủ sẽ tự động giữ nguyên giá đang hiển thị hiện tại (không đổi ngay lập tức) cho tới khi bạn thêm lại dữ liệu.`)) return;
  try {
    await deletePrivateRow(accessToken, PRICING_CONFIG.SHEET_ID, PRICING_CONFIG.TAB_NAME, existing.rowNumber);
    showStatus(`Đã xoá dữ liệu ${PACKAGE_NAMES[packageId]}.`);
    await loadPackages();
  } catch (error) { showStatus(error.message, 'error'); }
};

function start() {
  if (!PRICING_CONFIG.CLIENT_ID || PRICING_CONFIG.CLIENT_ID.startsWith('YOUR_')) {
    return showStatus('Chưa cấu hình CLIENT_ID trong js/pricing-config.js.', 'error');
  }
  initAuth();
}

start();
