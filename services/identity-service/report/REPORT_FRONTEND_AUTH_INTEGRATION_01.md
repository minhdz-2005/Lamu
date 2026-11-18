# Frontend auth integration — evidence 16/11/2026

Triển khai local P0–P4 theo [plan](PLAN_FRONTEND_AUTH_INTEGRATION_01.md), giới hạn mục 8.1 và yêu cầu hiện tại. Không commit/push/deploy; không sửa DB shared, không gửi SMTP ngoài. Kết quả dưới đây từ phiên triển khai này, không lấy báo cáo mock/backend cũ làm evidence.

| Phase | Trạng thái local | Kết quả |
|---|---|---|
| P0 | PASS | Canonical/projection v1.4.1, exact proxy/mode isolation, DB/mail riêng, browser routing/IP/upstream-down |
| P1 | PASS | Typed client, validated bootstrap, cross-tab locking, rotation/logout/generation/cache regression |
| P2 | PASS | Login/register thật, partial success chỉ retry login, validation/redirect/layout bảo toàn |
| P3 | PASS | Recovery browser thật qua inbox SMTP local, reset/revocation, memory-only proof và uncertain mutation |
| P4 | PASS local | 22 unit + 38 provider/browser/contract, coverage core, build/types/audit/diff/rollback; giới hạn bên dưới |

## Môi trường và authority

- Working tree trên HEAD `e5187ea`; baseline chỉ có plan untracked, không có code thay đổi cần bảo toàn. Windows/PowerShell, Node 24.19.0, Next 16.4.3, React 19.3.1, Playwright 1.56.1 dùng Chrome cài local, headless. Ngày báo cáo theo Asia/Saigon.
- Canonical `shared/contracts/http/identity.openapi.json` v1.4.0 → **v1.4.1**: sửa enum thiếu mã `INVALID_RECOVERY` mà provider đã trả. Gateway projection và `generated/identity.d.ts` sinh lại bằng generator pinned hiện có. Không đổi payload endpoint hay thêm service/migration.
- Browser → Next cùng origin `/api/identity/...` → Gateway loopback `/api/...` → Identity loopback → PostgreSQL 16 test riêng. Chỉ bảy POST auth và GET `/users/me`; business vẫn mock `/api`.
- Runner `scripts/test-db.cjs` đã đọc trước khi chạy: tạo container tên ngẫu nhiên `lamu-m1-test-{timestamp}`, DB `identity_test`, user `identity_test`, bind `127.0.0.1` cổng ngẫu nhiên, tmpfs riêng. Chỉ migration/seed trong DB này; seed idempotent chạy hai lần. Mailpit v1.27.10 riêng cùng lượt. Cuối lượt xóa đúng hai container do runner tạo, không xóa volume shared.
- SMTP local thực qua `SmtpSecurityMailSender` + `SecurityMailWorker`, đọc thư qua Mailpit HTTP API theo mailbox tổng hợp riêng từng test. SMTP ngoài/Gmail: **NOT_RUN**, không cần quyền inbox ngoài để nghiệm thu local. OTP lấy từ thư đã gửi; không lấy từ endpoint giả hoặc giải mã DB để làm evidence E2E.
- URL test có cổng động. Lượt provider ban đầu PostgreSQL `127.0.0.1:59923`; lượt hợp nhất PASS 37/37 dùng `127.0.0.1:49247`; lượt sau cùng được ghi bổ sung cuối báo cáo. Không ghi password, OTP, JWT, refresh/reset token, HMAC/encryption key vào báo cáo.

## Thay đổi chính

| Khu vực | File | Hành vi |
|---|---|---|
| Transport | `frontend/src/app/api/identity/[...path]/route.ts`, `lib/identityProxy.ts`, `lib/authMode.ts` | Route cụ thể thắng catch-all; allowlist chính xác, upstream fixed server config, timeout 8s, không redirect/fallback mock; strip cookie/XFF/context/client IP; giữ status/body/request-ID/Retry-After/Cache-Control |
| Client | `frontend/src/lib/apiClient.ts`, `errors.ts`, `types.ts` | Request UUID, timeout 10s cả body, cancellation, validate tokens/profile/recovery response, error tiếng Việt, Retry-After delta/date/fallback/cap; không tự replay auth mutation |
| Session | `frontend/src/lib/auth.ts`, `useSession.ts` | Atomic record v2 theo mode + generation; Web Lock 15s; refresh intent trước rotation, single flight; cache/writer generation guard; logout cặp hiện hành; bootstrap xác minh `/users/me`; retry profile riêng |
| Auth | `features/auth/authApi.ts`, `validation.ts`, `AuthPage.tsx` | Consumer types derive canonical; register thành công chỉ retry login; generation chụp trước register; password nguyên vẹn, Unicode code points theo DTO; một redirect owner, default/allowlist `/me` |
| Recovery | `features/auth/RecoveryForm.tsx`, `recoveryState.ts` | EMAIL→CODE→NEW_PASSWORD→SUCCESS; generic 202; OTP text sáu số; resend/rate deadline; reset proof chỉ memory; clear khi back/resend/reset/reload; reset yêu cầu login lại, clear local session xuyên tab |
| Verification | `frontend/tests/*.test.ts`, `tests/frontend-auth-{browser,contract}.spec.*`, `scripts/frontend-auth-rollback.cjs` | Unit/race/transport/contract, browser thật + fault injection, build rollback drill |
| Docs/config | frontend README/env, UI spec/report, plan/report này | Flag build-time, topology/trust, mode/legacy/rollback và evidence tách biệt |

Layout/style auth cũ được giữ; chỉ nối state/logic, thêm input/button/message recovery bằng AuthField/AuthNotice sẵn có. Không nối Account, tổ chức, Event, vé, thanh toán. `tests/helpers.ts` chỉ thêm optional RecoveryConfig để browser harness bật SecurityModule thật; provider test cũ không bị thay đổi mặc định.

## Quyết định và finding F01–F07

| ID | Trạng thái | Quyết định và evidence hiện tại |
|---|---|---|
| F01 | PASS local | Namespace `lamu.session.v2.mock|real`; legacy `luma.*` không import. Real JWT không attach vào business mock, mock 401 không refresh real. `mode.test.ts` chạy real→mock→real; rollback browser chạy mock với Gateway down và sentinel namespace real nguyên vẹn. Tab build cũ phải reload khi đổi mode, không migration/copy credential |
| F02 | PASS local | Web Locks exclusive, chờ 15s, browser giải phóng khi tab đóng/crash. Không hỗ trợ: writer real fail closed với thông báo. Storage event + focus/visibility đọc lại record; mọi thao tác đọc record mới. Login/refresh/logout/reset/cache writer giữ lock và generation guard. Persist refreshAttempt trước gửi, response mất/crash không gửi lại proof cũ. Browser hai tab chỉ một rotation; logout/reset đồng bộ; lock deadline + đóng owner rồi retry PASS |
| F03 | PASS local | `frontend-auth-rollback.cjs` build mock, browser mock login khi upstream chết, kiểm namespace, restore build real. Không deploy. Thứ tự bật/tắt/config và tác động không rollback được ở README/plan |
| F04 | PASS local | Authenticated chỉ sau `/users/me` validated. Browser assert canonical Profile và mailbox/tên thật rồi mới `/me`. Profile lỗi có retry/đăng nhập lại; late profile không phục hồi cache sau logout. Account giữ preview, nút logout preview không dùng để test; logout thật kiểm qua header `/events` |
| F05 | PASS | Node test/tsx có ngay P1; c8 threshold 80% core và Playwright browser tại P4. Scripts/dependency lockfile đã thêm; không đợi P4 mới viết test session |
| F06 | PASS topology local | Proxy unit exact allowlist/header/error; browser transport thật; spoof X-Client-IP/XFF không tạo bucket giả, budget DB tăng theo socket `127.0.0.1`; Gateway down trả 502 không login mock. Không tin client header. Budget IP gộp ở Next là giới hạn topology, chưa khẳng định production IP attribution |
| F07 | PASS | Chốt same-origin/localStorage ở plan/env/README; CORS không được thêm. Nội dung “chỉ tài liệu” còn lại được giữ dưới nhãn lịch sử, không chặn triển khai |

Web Locks bảo vệ các tab cùng origin có code mới, không phải biện pháp chống XSS. localStorage có rủi ro XSS đã được người dùng chấp nhận; không âm thầm đổi sang cookie/BFF. Reset thành công xóa phiên browser hiện hành kể cả tài khoản đang đăng nhập khác email reset; backend revoke chỉ tài khoản reset. Rollback không khôi phục mật khẩu, refresh đã rotation hay phiên đã revoke.

## Checkpoint TDD thực tế (không commit theo chỉ đạo)

| Task → test | RED quan sát | GREEN quan sát |
|---|---|---|
| Redirect/mode/atomic session → `auth.test.ts` | 3/3 fail: `/events` thay `/me`, đọc legacy access, proxy chưa tồn tại | Cùng target 3/3 PASS sau implementation |
| Refresh transient/error metadata → `client.test.ts` | 2 fail: session bị clear sau 502, thiếu Retry-After/server ID | Cùng target PASS sau sửa client/session |
| Validation/recovery state → `flow.test.ts` | 2 fail vì behavior module chưa có | 2 PASS sau thêm validate/reducer |
| HTTP recovery enum → `frontend-auth-contract.spec.cjs` | enum canonical không có INVALID_RECOVERY | 1 PASS; projection/check/generate PASS v1.4.1 |
| Direct profile 403 → `session.test.ts` | access vẫn `access` thay null | PASS, 403 clear guarded; network giữ record |
| Null membership validation → `client.test.ts` | TypeError đọc organization_id của null | PASS reject malformed profile |
| Web Lock deadline → browser test | Build trước fix: 6/7 PASS, chờ thông báo tiếng Việt timeout FAIL | Rebuild có localization: 7/7 PASS cùng suite, owner đóng thì login retry được |
| Unicode DTO boundaries → `flow.test.ts` | 128 emoji password/100 emoji tên bị từ chối sai | PASS sau code-point validation và bỏ HTML maxLength đếm UTF-16 cho tên/password |

Các test ban đầu import behavior chưa có là RED cho implementation thiếu, không tính lỗi cài dependency/harness là RED nghiệp vụ. Test T16 UUID đầu tiên từng đặt assertion trong mock fetch bị client bắt; đã chuyển assertion ra ngoài để không có false GREEN. Browser harness từng fail vì selector “Đăng ký” khác copy “Đăng ký mới”, dùng logout preview `/me`, và thiếu SecurityModule; đã sửa harness, không lấy các lỗi setup này làm bằng chứng regression ứng dụng.

## Ma trận T01–T18

PASS dưới đây là tổng hợp đúng lớp kiểm thử được nêu; không có nghĩa mọi biến thể đều chạy browser/provider thật.

| ID | Kết quả | Evidence/lớp kiểm thử |
|---|---|---|
| T01 | PASS | Browser real login/profile; p2/p3 provider test sai/unknown/LOCKED 401/403; client 403 không refresh |
| T02 | PASS | Browser register→login→real profile→DB đúng một user; provider duplicate/concurrent register/409 |
| T03 | PASS | Browser fault injection chỉ response login đầu 504; register thật commit, retry login thật; counters register=1, login=2 |
| T04 | PASS | Unit 7/8/128/129 password, 0/1/100/101 tên, email quá 254; provider rejects extra/invalid, giữ whitespace; thêm unit Unicode. Native maxLength email254 và DTO vẫn là authority cho email phức tạp |
| T05 | PASS | Browser hai tab rejected access→one rotation→real `/users/me`; unit single flight; token presence không bootstrap authenticated |
| T06 | PASS | Unit 401 sau retry hữu hạn, network/502 giữ record nhưng marker chặn replay, direct403 clear; provider locked/expired rotation tests. Raw HTTP timeout/504 mapped hữu hạn; không xóa session chỉ vì transport |
| T07 | PASS | Unit logout Bearer/current refresh, expired access refresh once rồi retry rotated pair, failure clear local, late profile/login generation; provider refresh/logout race và session proof; browser logout thật |
| T08 | PASS local | Browser two-tab refresh một winner, logout storage sync, reset đang login + tab khác thấy clear; lock15s và owner close; provider reset/login/refresh race |
| T09 | PASS | Unit external, //, backslash, encoded, auth/business/traversal đều default/me; browser default/me |
| T10 | PASS | Real generic forgot202 và mail flow; provider unknown/cooldown generic + IP budget; không lấy202 làm bằng chứng inbox |
| T11 | PASS theo lớp | OTP thật lấy Mailpit→browser verify; `012345` giữ nguyên bằng unit và browser fault fixture. Không khẳng định OTP ngẫu nhiên ở lượt real có số0 đầu |
| T12 | PASS | Provider wrong/max attempts/expiry/resend/one winner/verify reuse; UI INVALID_RECOVERY Việt hóa, retry/resend; không hiển thị số attempts còn lại do server không trả |
| T13 | PASS | Provider token expired/reused; unit back/email/resend/success xóa proof; browser fixture reload mất proof và trở email; real reset không lưu proof bền vững |
| T14 | PASS | Real browser nhận mail, reset; password cũ401, mới login; active pre-reset access/refresh401; tab khác clear. Provider atomic rollback/revocation tests |
| T15 | PASS theo lớp | Unit429 và Retry-After42/date/absent/invalid/cap; UI cooldown/busy; provider worker failure/retry/lease/expiry và SMTP local thật. SMTP ngoài NOT_RUN |
| T16 | PASS theo lớp | Proxy upstream-down502 thật, body invalid JSON unit, no implicit replay mutation; browser injected login504; lượt bổ sung lost verify/reset commit thật rồi abort response được ghi ở kết quả cuối |
| T17 | PASS local | Browser same-origin real routing; request ID/cache headers; spoofed IP budget DB; no CORS/preflight cần thiết; no mock fallback |
| T18 | PASS theo lớp | Browser 390/360px, keyboard Enter, code focus, dark theme, không overflow; ref pending chặn submit kép và revision/AbortController bỏ state sau unmount; stale response/cache covered unit. Không tuyên bố accessibility audit đầy đủ hoặc mọi browser/device |

## Lệnh đã chạy và kết quả

Các lệnh được đối chiếu package scripts trước khi chạy; không execute lệnh bất kỳ từ plan/skill. Expected cho từng check là exit0 và assertions đạt; actual ghi dưới đây.

| Lệnh / lượt | Expected → actual | Trạng thái |
|---|---|---|
| `npm run build` và `npm run typecheck` root | runtime/Identity/Gateway build + TS tests → exit0 | PASS |
| `$env:NEXT_PUBLIC_AUTH_MODE='real'; npm --prefix frontend run build` | production real build và route cụ thể → exit0 Next16.4.3 | PASS |
| `npm --prefix frontend run typecheck` | TS UI/API/tests → exit0 | PASS |
| `node scripts/contract-projection.cjs`; `npm run generate:contracts`; `npm run contracts:check` | local refs, schema, Gateway projection → PASS | PASS |
| `npm --prefix frontend run test:coverage` | 80% thresholds core → 22/22 tests; statements/lines97.38%, branches84.87%, functions93.87% | PASS |
| `node scripts/test-db.cjs --migrate --seed --security --runTestsByPath tests/p2-auth.spec.ts tests/p3-jwt-profile.spec.ts tests/p4-session.spec.ts tests/recovery.spec.ts` | disposable DB/mail → 4 suites,29 tests PASS, includes SMTP local | PASS |
| Combined provider + browser + contract (command dưới) | Final6 suites,38 tests PASS,59.079s;8 browser tests gồm fault injections tách tên | PASS |
| `node scripts/frontend-auth-rollback.cjs` | build mock → browser mock Gateway down → restore real build | PASS cả4 dòng output |
| `npm --prefix frontend audit` | no known vulnerabilities → 0 | PASS |
| Prettier changed TS/CJS + `git diff --check` | format và whitespace → exit0 | PASS |
| ESLint | Repo frontend không có ESLint/lint script; dùng typecheck/Prettier/diff review | NOT_APPLICABLE |

```powershell
node scripts/test-db.cjs --migrate --seed --security --runTestsByPath tests/frontend-auth-browser.spec.ts tests/p2-auth.spec.ts tests/p3-jwt-profile.spec.ts tests/p4-session.spec.ts tests/recovery.spec.ts tests/frontend-auth-contract.spec.cjs
```

Coverage là c8 trên auth core được include rõ trong script: apiClient/auth/authMode/errors/identityProxy/validation/recoveryState. Không phải coverage toàn frontend; hook useSession, authApi, React UI được kiểm bằng unit selected/loadProfile và browser, chưa gộp browser JS coverage. Node native coverage từng dao động source-map giữa subprocess, nên chốt c8 pinned và threshold tái chạy được. c8 10/12 từng kéo dependency audit moderate; dependency cuối c8 9.1.0 cho audit0 (có deprecation warning dev dependencies, không phải security finding đã xác nhận). Không sửa dependency production ngoài scope.

## Review security, release và giới hạn

- Không thêm log credential hay HTML injection; React render text. Token dùng Bearer, không cookie auth tự động. Proxy chỉ upstream configured origin, không lấy URL từ client, redirect:error; browser không forward context/IP/cookie. Contract consumer types cho bảy auth; response runtime kiểm các trường UI phụ thuộc, không coi cast TS là validation.
- Session writer và refresh/logout/reset được serialize; credential pair atomic, generation guard, marker không replay rotation chưa xác định. Profile cache dùng generation và kiểm lại sau await. Không share JWT thật vào API business mock.
- Recovery không tiết lộ account từ202, không lưu OTP/reset proof vào URL/storage/log; proof clear trước reset, kết quả mất response không được coi success. Không lấy mail acceptance thay inbox evidence.
- Local transport timeout/client deadline/lock wait hữu hạn; không retry auth mutation tự động. Logout tối đa một refresh + một retry và clear local khi đã giữ lock, lỗi server không khẳng định đã revoke server. Browser thiếu Web Locks fail closed writer; không dùng read-then-write làm mutex.
- Local release order: DB/Identity/Gateway/mail readiness → allowlist transport → coordinator → UI build real → browser acceptance. Config mẫu mặc định mock, không bật real trên deploy. Dừng real khi readiness/routing/rotation sai; restore mock build, restart process và reload mọi tab.
- Rollback script output thực: `PASS build mock`; `PASS browser mock login with Gateway unavailable; real namespace untouched`; `PASS build real`; `PASS restored real production build; restart/reload required to switch running processes`. Không sửa namespace real để rollback sang mock. Local logout dưới lock nếu muốn bỏ phiên real, không copy legacy/token giữa mode.
- Password đã đổi, refresh đã rotation, server session đã revoke không được hoàn tác bằng rollback code/config. Tab chạy bundle cũ cần reload; không thể sửa code đã chạy trong tab cũ chỉ bằng thay env server.
- NOT_RUN: SMTP ngoài, production/staging rollout, edge/proxy nhiều hop và per-browser-IP attribution production, Firefox/Safari/thiết bị thật, accessibility audit đầy đủ, Account integration (ngoài scope). HTTPS và chống XSS vẫn là yêu cầu vận hành khi dùng localStorage.
- Local target acceptance và kết quả bổ sung cuối báo cáo được tách khỏi production readiness. Không có blocker cần credential ngoài để hoàn tất ba flow local. Không dùng mock tests/build như chứng cứ E2E thật.

## Kết quả lượt cuối

Lượt bổ sung đầu FAIL: Playwright route.fetch còn inflight khi đóng context, gây lỗi callback lan trong suite (8 failed/30 passed, không xem là PASS). Đã thay harness bằng Node fetch tới đúng Next proxy, xác nhận status200/body đã nhận từ backend rồi abort request browser, đợi completed trước đóng context. Không đổi production behavior để làm test pass.

Targeted rerun `node scripts/test-db.cjs --migrate --seed --security --runTestsByPath tests/frontend-auth-browser.spec.ts --testNamePattern 'lost verify'`: **1 PASS,7 skipped do filter**, 6.615s. Verify/reset đều commit thật; browser không báo success/không tự replay; reset dù mất response vẫn login bằng password mới được.

Full rerun cuối trên PostgreSQL `identity_test` tại `127.0.0.1:62780`, Mailpit SMTP/API riêng tại loopback62781/62782, container prefix `lamu-m1-test-1794766230000`: **6 suites PASS,38 tests PASS,0 failed,0 skipped**,59.079s. Gồm29 provider tests +8 browser tests +1 canonical contract test. Các container test đã được runner dọn đúng tên sau khi hoàn thành; shared Compose hiện có không bị sửa/dừng.

Browser happy path cuối giữ một phiên thật đang active trước recovery và một tab khác; reset clear record xuyên tab, từ chối chính access/refresh active trước reset, password cũ401/mới login200. Không dùng token đã logout trước đó để giả chứng minh revocation do reset. Browser keyboard fixture gửi submit lặp trong cùng lượt pending và assert chỉ một forgot request. Leading-zero/reload/theme fixture được giữ nhãn riêng, không gộp thành SMTP thật.

Verification cuối: root/frontend typecheck và build PASS, contract/projection PASS, Prettier changed-file check và git diff whitespace PASS, frontend audit0. Core c8 22/22 PASS,97.38% statements/lines,84.87% branches,93.87% functions; threshold80% PASS. Không tuyên bố coverage toàn React frontend. Security review không phát hiện secret/log credential hoặc trust header client mới trong phần thay đổi; không audit toàn git history.

**Local target acceptance VERIFIED; P0–P4 PASS trong phạm vi local/test.** Production/staging/SMTP ngoài NOT_RUN; Account preview ngoài scope. Không có bước commit/merge/deploy. Bước vận hành tiếp theo khi được yêu cầu: cấu hình topology edge/IP tin cậy và inbox được cấp quyền cho môi trường đích rồi nghiệm thu riêng; không suy từ PASS local thành production readiness.
