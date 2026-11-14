# M1 — Sửa cấu hình module resolution

Ngày 13/11/2026. Nguồn: người dùng báo IDE cảnh báo `moduleResolution=node10` bị deprecated.

Nguyên nhân: `tsconfig.base.json` dùng `moduleResolution: node`, alias cũ của node10; Identity/Gateway/runtime kế thừa cấu hình này. Backend đang pin TypeScript 5.9.3; không thêm ignoreDeprecations 6.0 vào compiler cũ hoặc thay dependency để tắt cảnh báo.

Thay đổi: module/moduleResolution sang Node16. Các package không khai type=module nên output ứng dụng vẫn CommonJS. ts-jest dùng isolatedModules trong tsconfig.tests.json, các interface/type trong chữ ký decorator được import type rõ ràng. Test runner dùng Node --experimental-vm-modules để hỗ trợ dynamic import của Prisma được giữ lại ở chế độ Node16; không áp dụng cờ VM này cho process ứng dụng.

Bằng chứng: npm run typecheck PASS (build ba workspace + typecheck tests); npm run test:m1 PASS 12 suites/42 tests, 15.844s. Coverage statements 98.84%, branches 91.71%, functions 100%, lines 99.02%; branch accounting thay đổi sau isolated transpilation. Lần chạy trước cờ VM có test FAIL do Jest không hỗ trợ dynamic import, đã sửa runner và chạy lại GREEN; không tính lần FAIL thành PASS. Node có ExperimentalWarning cho VM modules trong test, không phải cảnh báo deprecated moduleResolution.

npm run format:check và git diff --check PASS. Không đổi business logic, dependency versions hoặc commit. Docker image/Compose chưa rebuild sau sửa compiler: NOT RUN ở follow-up này; bằng chứng image trong báo cáo M1 trước đó phản ánh cấu hình tại lần build đó. IDE có thể cần TypeScript: Restart TS Server để nạp lại cấu hình.

Nguồn kỹ thuật: https://www.typescriptlang.org/tsconfig/moduleResolution.html và https://www.typescriptlang.org/tsconfig/module.html .
