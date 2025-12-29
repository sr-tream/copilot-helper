# Codex Workspace Selection - Business Plan Fix

## Vấn đề
Khi đăng nhập Codex và chọn workspace Business, plugin vẫn bị lỗi "free plan" mặc dù tài khoản đã có Pro Business.

## Nguyên nhân
Plugin chỉ lưu `accountId` từ JWT token nhưng **không lưu và gửi `organizationId`** (workspace ID) khi gọi API. Do đó, Codex API mặc định sử dụng personal account (free plan) thay vì Business workspace.

## Giải pháp đã thực hiện

### 1. Cập nhật Authentication (codexAuth.ts)
- **Parse `organizations`** từ JWT token khi login
- Tự động phát hiện và chọn Business workspace (hoặc workspace đầu tiên nếu có nhiều)
- Lưu `organizationId` và danh sách `organizations` vào storage
- Thêm các method mới:
  - `getOrganizationId()`: Lấy organization_id hiện tại
  - `getOrganizations()`: Lấy danh sách tất cả organizations/workspaces

### 2. Cập nhật API Request (codexHandler.ts)
- Thêm parameter `organizationId` vào các methods
- **Thêm header `Openai-Organization`** khi gửi request nếu có organizationId
- Header này báo cho Codex API biết sử dụng workspace nào (Business/Pro)

### 3. Cập nhật Provider (codexProvider.ts)
- Lấy `organizationId` từ storage khi xử lý request
- Truyền `organizationId` vào codexHandler

### 4. Thêm Command chọn Workspace
- **Command mới**: `chp.codex.selectWorkspace`
- Cho phép người dùng chọn workspace khi có nhiều organizations:
  - Personal Account (không organization)
  - Business Workspace
  - Các workspace khác (nếu có)

## Cách sử dụng

### Bước 1: Login lại Codex
Sau khi cập nhật plugin, bạn cần login lại để plugin parse organizations từ JWT token:
```
Cmd/Ctrl + Shift + P → "Codex Login (OpenAI OAuth)"
```

### Bước 2: Chọn Workspace (nếu cần)
Nếu bạn có nhiều workspaces, sử dụng command mới để chọn:
```
Cmd/Ctrl + Shift + P → "Codex - Select Workspace (Business/Personal)"
```

Chọn workspace mong muốn:
- **Business Workspace** → Dùng Pro Business plan
- **Personal Account** → Dùng personal account

### Bước 3: Kiểm tra
Sau khi chọn workspace, plugin sẽ:
- Log thông tin organization đang dùng: `[codex] Using organization: org-xxx`
- Gửi header `Openai-Organization` trong mọi request
- Codex API sẽ sử dụng quota của workspace đã chọn

## Kiểm tra Logs
Mở VS Code Output Panel và chọn "Copilot Helper Pro" để xem logs:
- Login: `Found X organization(s). Selected: Business (org-xxx)`
- Request: `[codex] Using organization: org-xxx`

## Tự động chọn Business Workspace
Plugin tự động chọn Business workspace nếu:
1. Tên organization chứa "business" (không phân biệt hoa/thường)
2. Hoặc role là "owner"
3. Nếu không tìm thấy, chọn organization đầu tiên

## Lưu ý
- **Phải login lại** sau khi cập nhật plugin để parse organizations
- Nếu không có organizations, plugin sử dụng personal account
- Có thể chuyển đổi workspace bất cứ lúc nào bằng command `chp.codex.selectWorkspace`

## Technical Details
### Headers được gửi khi có Business Workspace:
```
Authorization: Bearer <access_token>
Chatgpt-Account-Id: <account_id>
Openai-Organization: <org_id>  ← Header mới để chỉ định workspace
```

### Storage Structure:
```json
{
  "type": "codex",
  "access_token": "...",
  "refresh_token": "...",
  "account_id": "user-xxx",
  "organization_id": "org-xxx",  // ← Field mới
  "organizations": [              // ← Field mới
    {
      "id": "org-xxx",
      "name": "Business",
      "role": "owner"
    }
  ]
}
```
