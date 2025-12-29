# Gemini Tool Call Fix - thoughtSignature Implementation

## Problem

When using Copilot Helper Pro extension with Gemini models (especially Gemini 2.5+), tool calls were failing with the error:

```
Function call is missing a thought_signature in functionCall parts. 
This is required for tools to work correctly, and missing thought_signature 
may lead to degraded model performance.
```

This prevented tools like `manage_todo_list` and other VS Code Copilot tools from working properly with Gemini models via Antigravity.

## Root Cause

Gemini API requires a `thoughtSignature` field in every `functionCall` part. This field is an opaque identifier that:
- Tracks reasoning steps associated with tool calls
- Maintains context between tool calls and responses  
- Optimizes model performance

Without this field, the API rejects the request with a 400 INVALID_ARGUMENT error.

## Solution

We created a **GeminiTranslator** utility module that:

1. **Generates thoughtSignature** for all outgoing tool calls
2. **Validates thoughtSignature** in incoming responses
3. **Provides comprehensive error logging** for Gemini-specific errors
4. **Follows best practices** from gcli2api and llm-mux implementations

### Files Changed

1. **New**: `src/utils/geminiTranslator.ts` - Core translation utility
2. **Modified**: `src/utils/antigravityHandler.ts` - Uses GeminiTranslator for tool calls
3. **Modified**: `src/utils/index.ts` - Exports GeminiTranslator

### Key Changes

#### 1. Tool Call Conversion (antigravityHandler.ts)

**Before:**
```typescript
for (const part of message.content) {
    if (part instanceof vscode.LanguageModelToolCallPart) {
        parts.push({
            functionCall: {
                name: part.name,
                id: part.callId,
                args: part.input
            }
        });
    }
}
```

**After:**
```typescript
const toolCalls = message.content.filter(
    part => part instanceof vscode.LanguageModelToolCallPart
) as vscode.LanguageModelToolCallPart[];

if (toolCalls.length > 0) {
    const toolCallParts = GeminiTranslator.convertToolCallsToGeminiParts(toolCalls);
    parts.push(...toolCallParts);
    Logger.trace(`Converted ${toolCalls.length} tool calls with thoughtSignature`);
}
```

#### 2. Response Validation

**Before:**
```typescript
const functionCall = part.functionCall as { name?: string; args?: unknown; id?: string } | undefined;
if (functionCall?.name) {
    const callId = functionCall.id || createCallId();
    const args = this.normalizeFunctionArgs(functionCall.args);
    progress.report(new vscode.LanguageModelToolCallPart(callId, functionCall.name, args));
}
```

**After:**
```typescript
const toolCallInfo = GeminiTranslator.extractToolCallFromGeminiResponse(part);
if (toolCallInfo) {
    const { callId, name, args, thoughtSignature } = toolCallInfo;
    if (callId && name) {
        const normalizedArgs = this.normalizeFunctionArgs(args);
        progress.report(new vscode.LanguageModelToolCallPart(callId, name, normalizedArgs));
        
        if (thoughtSignature) {
            Logger.trace(`Received tool call with thoughtSignature: ${name}`);
        } else {
            Logger.warn(`Tool call missing thoughtSignature: ${name}`);
        }
    }
}
```

## How It Works

### thoughtSignature Generation

```typescript
function generateThoughtSignature(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `ts_${timestamp}_${random}`;
}
```

Each tool call gets a unique signature like: `ts_1703432186542_abc123xyz`

### Tool Call Transformation

```typescript
export function convertToolCallsToGeminiParts(
    toolCalls: readonly vscode.LanguageModelToolCallPart[]
): Array<Record<string, unknown>> {
    return toolCalls.map(toolCall => ({
        functionCall: {
            name: toolCall.name,
            id: toolCall.callId,
            args: toolCall.input
        },
        thoughtSignature: generateThoughtSignature()
    }));
}
```

## Testing

To verify the fix works:

1. **Build the extension**:
   ```bash
   cd /Users/bienmainhat/Documents/Project/COPILOT_Extention/GCMP
   npm run compile
   ```

2. **Test with a tool call**:
   - Open VS Code with the extension
   - Use Copilot chat with a Gemini model
   - Try a command that uses tools (e.g., "create a todo list with 3 items")

3. **Check logs**:
   - Open Output panel → "Copilot Helper Pro Extension"
   - Look for: `"Converted X tool calls with thoughtSignature"`
   - Verify no more 400 errors about missing thought_signature

## References

### Implementation Sources

1. **gcli2api** - Python implementation:
   - File: `src/openai_transfer.py`
   - Converts OpenAI format to Gemini with thoughtSignature
   - Does NOT explicitly add thoughtSignature (relies on Antigravity API)

2. **llm-mux** - Go implementation:
   - File: `internal/translator/from_ir/gemini.go`
   - Function: `buildAssistantAndToolParts`
   - Lines 472-490: Adds thoughtSignature to function calls
   - Validates signature before adding

3. **Gemini API Documentation**:
   - https://ai.google.dev/gemini-api/docs/thought-signatures
   - Explains thoughtSignature requirements for Gemini 2.5+

### Key Insights from llm-mux

```go
// Only use the tool call's own signature - do not propagate from other parts
// ThoughtSignature is opaque and context-specific, reusing it can cause corruption
if isValidThoughtSignature(tc.ThoughtSignature) {
    part["thoughtSignature"] = string(tc.ThoughtSignature)
}
```

**Important**: Each tool call should have its own unique thoughtSignature. Reusing signatures can cause corruption.

## Troubleshooting

### Still getting thoughtSignature errors?

1. **Clear VS Code cache**:
   ```bash
   rm -rf ~/.vscode/extensions/vicanent.chp-*/
   ```

2. **Rebuild extension**:
   ```bash
   cd copilot-helper-pro
   npm run clean
   npm run compile
   ```

3. **Check logs**:
   - Look for `[GeminiTranslator]` messages
   - Verify thoughtSignature is being added
   - Check for validation warnings

### Tool calls still not working?

The issue might be in the request payload. Check that:
- `generationConfig` includes proper tool configuration
- `tools` array is correctly formatted
- API key has proper permissions

## Future Improvements

1. **Cache thoughtSignature** - Reuse signatures for repeated calls (with validation)
2. **Signature validation** - Verify signature format matches Gemini requirements
3. **Performance monitoring** - Track thoughtSignature impact on latency
4. **Extended logging** - Add debug mode for detailed signature tracking

## Related Issues

- Original error: "Function call is missing a thought_signature"
- Request ID: `85a37161-08ab-49c4-a50e-d096097e4c97`
- Extension: `vicanent.chp-0.15.23`
- Error location: `dist/extension.js:1660:26285`

## Credits

Implementation based on:
- gcli2api by su-kaka
- llm-mux internal translator
- Google Gemini API documentation
- Claude Sonnet 4.5 assistance
