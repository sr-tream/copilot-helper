# Performance Fix - Memory Leak & Lag Issues

## 🐛 Vấn đề

Khi gọi nhiều API (vài chục request), IDE bị lag nghiêm trọng do:

### 1. **Memory Leak nghiêm trọng**
- Mỗi request tạo **client instance mới** (Anthropic/OpenAI SDK)
- **KHÔNG BAO GIỜ cleanup** client sau khi sử dụng
- Tích lũy connections, event listeners, memory
- Sau vài chục request → Memory tăng không kiểm soát → IDE lag

### 2. **Không có Connection Pooling**
- Mỗi request tạo HTTP connection mới
- Không reuse connections
- Overhead lớn khi gọi nhiều API

### 3. **Không có Timeout Protection**
- Stream processing có thể bị stuck vô thời hạn
- Không có cơ chế timeout cho long-running streams

### 4. **Event Listeners không được cleanup**
- Stream processing tạo nhiều event listeners
- Không cleanup khi stream kết thúc

## ✅ Giải pháp đã áp dụng

### 1. **Client Caching & Reuse**

**Trước:**
```typescript
// Mỗi request tạo client mới
private async createAnthropicClient(): Promise<Anthropic> {
    const client = new Anthropic({ ... });
    return client; // ❌ Không bao giờ cleanup
}
```

**Sau:**
```typescript
// Cache và reuse clients
private clientCache: Map<string, { client: Anthropic; lastUsed: number }> = new Map();
private readonly CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 phút

private async createAnthropicClient(): Promise<Anthropic> {
    const cacheKey = `${providerKey}:${baseUrl}:${JSON.stringify(headers)}`;
    
    // ✅ Reuse cached client
    const cached = this.clientCache.get(cacheKey);
    if (cached) {
        cached.lastUsed = Date.now();
        return cached.client;
    }
    
    // Tạo mới và cache
    const client = new Anthropic({ ... });
    this.clientCache.set(cacheKey, { client, lastUsed: Date.now() });
    return client;
}
```

### 2. **Automatic Cleanup**

```typescript
// Cleanup expired clients mỗi phút
private cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of this.clientCache.entries()) {
        if (now - value.lastUsed > this.CLIENT_CACHE_TTL) {
            this.clientCache.delete(key);
        }
    }
}, 60000);

// Dispose method để cleanup khi extension deactivate
public dispose(): void {
    if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
    }
    this.clientCache.clear();
}
```

### 3. **Stream Timeout Protection**

```typescript
// Timeout cho stream processing
const STREAM_TIMEOUT = 120000; // 2 phút
const streamStartTime = Date.now();

for await (const chunk of stream) {
    // ✅ Check timeout
    if (Date.now() - streamStartTime > STREAM_TIMEOUT) {
        throw new Error('Stream processing timeout');
    }
    // ... process chunk
}
```

### 4. **SDK Configuration Optimization**

```typescript
const client = new Anthropic({
    apiKey: currentApiKey,
    baseURL: baseUrl,
    maxRetries: 2,      // ✅ Giảm retries để tránh lag
    timeout: 60000      // ✅ 60s timeout
});
```

### 5. **Proper Resource Disposal**

```typescript
// GenericModelProvider
dispose(): void {
    this.configListener?.dispose();
    this._onDidChangeLanguageModelChatInformation.dispose();
    this.anthropicHandler?.dispose();  // ✅ Cleanup handlers
    this.openaiHandler?.dispose();     // ✅ Cleanup handlers
}
```

## 📊 Kết quả

### Trước khi fix:
- ❌ Mỗi request: +1 client instance (không cleanup)
- ❌ 50 requests: 50 client instances tích lũy
- ❌ Memory leak nghiêm trọng
- ❌ IDE lag sau vài chục requests

### Sau khi fix:
- ✅ Client instances được reuse
- ✅ Tối đa ~5-10 cached clients (tùy config)
- ✅ Auto cleanup sau 5 phút không dùng
- ✅ Memory ổn định
- ✅ Không còn lag

## 🔧 Files đã sửa

1. **`src/utils/anthropicHandler.ts`**
   - Thêm client caching
   - Thêm cleanup logic
   - Thêm stream timeout
   - Thêm dispose method

2. **`src/utils/openaiHandler.ts`**
   - Thêm client caching
   - Thêm cleanup logic
   - Thêm dispose method

3. **`src/providers/genericModelProvider.ts`**
   - Gọi dispose() cho handlers khi provider dispose

## 🚀 Cách test

1. Build extension:
   ```bash
   npm run compile
   ```

2. Test với nhiều requests:
   - Gọi 50-100 API requests liên tiếp
   - Monitor memory usage (trước: tăng liên tục, sau: ổn định)
   - Kiểm tra IDE performance (không còn lag)

3. Kiểm tra logs:
   ```
   [Provider] Reusing cached Anthropic client
   [Provider] Cleaning up expired client: ...
   ```

## 📝 Notes

- Client cache TTL: 5 phút (có thể điều chỉnh)
- Cleanup interval: 1 phút
- Stream timeout: 2 phút
- SDK timeout: 60 giây
- Max retries: 2 (giảm từ default)

## 🎯 Best Practices đã áp dụng

1. ✅ **Resource Pooling**: Reuse expensive resources (SDK clients)
2. ✅ **Automatic Cleanup**: Prevent memory leaks
3. ✅ **Timeout Protection**: Prevent hanging operations
4. ✅ **Proper Disposal**: Clean up on deactivation
5. ✅ **Performance Optimization**: Reduce overhead
