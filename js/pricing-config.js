// Cấu hình nguồn dữ liệu Bảng giá (Google Sheet).
//
// HƯỚNG DẪN THIẾT LẬP:
// 1. Tạo một Google Sheet mới, đặt tên tab là "Packages".
// 2. Hàng đầu tiên là tên cột (giữ đúng tên, không dấu, viết liền):
//    package_id | status | label | final_price | original_price | discount_label | subtitle | features
// 3. Điền 4 dòng dữ liệu cho package_id: goi1, goi2, goi3, govip
//    (dùng đúng 4 mã này vì code đang tham chiếu theo package_id).
// 4. Share sheet ở chế độ "Anyone with the link" - Viewer (chỉ cần xem, không cần chỉnh sửa công khai).
// 5. Vào Google Cloud Console > APIs & Services > Credentials, tạo API key mới,
//    giới hạn (Restrict key) chỉ cho "Google Sheets API", và giới hạn theo HTTP referrer
//    là domain của trang cưới (vd: https://www.ziuwedding.site/*) để tránh bị lộ/lạm dụng key.
// 6. Dán Sheet ID (chuỗi trong URL sheet, giữa /d/ và /edit) và API key vào bên dưới.
//
// TRANG QUẢN TRỊ (admin.html) - THÊM ĐỂ ĐĂNG NHẬP SỬA GIÁ:
// 7. Vào Google Cloud Console > APIs & Services > Credentials, tạo "OAuth client ID"
//    loại "Web application". Thêm "Authorized JavaScript origins":
//    domain thật (vd: https://www.ziuwedding.site) và http://localhost:PORT nếu cần test.
//    Dán Client ID vào CLIENT_ID bên dưới.
// 8. Vào chính Google Sheet vừa tạo ở bước 1, bấm Share, thêm email Google của admin
//    với quyền Editor (khác với "Anyone with the link" ở bước 4 - đây là quyền ghi riêng).
// 9. Thêm email đó vào danh sách ADMINS bên dưới thì mới đăng nhập được vào admin.html.
// Dannguyen22
const PRICING_CONFIG = {
  SHEET_ID: '1yVgLBkG-8-12D1R_4r25ig-q6Ec5QClmOuGTeaq_hn8',
  API_KEY: 'AIzaSyBXs7DxIWRoh2oQxy5fIgZo02rQnKvdRFc',
  TAB_NAME: 'Packages',
  ENVELOPES_TAB_NAME: 'Envelopes',

  CLIENT_ID: '484251388580-8dkrm0hvbviugkg83pbnlcg3dvdon4qq.apps.googleusercontent.com',

  // Danh sách email được phép đăng nhập admin.html để sửa bảng giá.
  ADMINS: [
    { email: 'dannguyen22993@gmail.com', display_name: 'Dan Nguyen' },
    { email: 'laithitruc1357@gmail.com', display_name: 'Lai Thi Truc' },
  ],
};
