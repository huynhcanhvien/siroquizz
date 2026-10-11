# AI: đọc toàn bộ tài liệu, tối đa 200 thẻ

- Giới hạn nội dung: tổng văn bản trích xuất tối đa 100.000 token ước tính (CJK: khoảng 1 token/ký tự; chữ Latin: khoảng 1 token/2,5 ký tự). Kiểm tra cả từng tài liệu và tổng các tài liệu trong job, trước khi gọi AI tạo thẻ.
- Không giới hạn số trang PDF. PaddleOCR đọc PDF scan tiếng Trung/Anh trên trình duyệt, tuần tự từng trang, rồi tải văn bản lên. PDF có lớp văn bản được đọc bằng PDF.js.
- Giới hạn tải lên để quản lý bộ nhớ: tối đa 100 tệp, 50MB/tệp, tổng 200MB; kiểm tra phía client và server.
- OCR dự phòng bằng vision trên máy chủ vẫn tối đa 10 trang scan/job. Scan lớn cần trình duyệt hỗ trợ PaddleOCR và ngôn ngữ Trung/Anh; tài liệu ngôn ngữ khác nên có lớp văn bản.
- AI xử lý mọi đoạn văn bản, không lấy mẫu đoạn theo số thẻ yêu cầu. Phân bổ số thẻ cho các đoạn; nếu số đoạn vượt số thẻ yêu cầu, mỗi đoạn tạo ít nhất một ứng viên. Chuẩn hóa, loại từ trùng và chọn trải đều các ứng viên để giữ tối đa số thẻ yêu cầu, không quá 200.
- Tài liệu gồm các cặp từ/nghĩa rõ ràng vẫn được nhập trực tiếp miễn phí. Đọc và chuẩn hóa toàn bộ các cặp trước khi chọn tối đa 200 thẻ.
- Credit của người dùng vẫn tính theo số thẻ thực nhận và trang OCR máy chủ; dự toán token nhà cung cấp tính toàn bộ nội dung. Hạn mức AI và số dư credit hiện có vẫn áp dụng.

Kiểm chứng: PDF thật 100 trang × 20 mục từ được trích xuất đủ; E2E render đủ 100 trang scan với kết quả OCR giả lập, tải đủ 2.000 cặp từ/nghĩa và lưu 200 thẻ. Mô hình PaddleOCR thật được kiểm tra riêng trên ảnh tiếng Trung/Anh; chưa đánh giá độ chính xác trên một tài liệu scan thật 100 trang.
