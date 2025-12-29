# Copilot Helper Pro - Extension providing multiple domestic AI model providers support



By integrating mainstream domestic AI model providers, it offers developers richer and more locally suitable AI programming assistant options. Currently has built-in support for **native AI model** providers such as ZhipuAI, Volcengine Ark, MiniMax, MoonshotAI, DeepSeek, Alibaba Cloud Bailian, etc. Additionally, the extension has been adapted to support OpenAI and Anthropic API interface compatible models, supporting custom access to any third-party **cloud service models** that provide compatible interfaces.

#### EOL Built-in Provider End-of-Support Plan

No providers are currently scheduled for end-of-support.

## 🚀 Quick Start

### 1. Install Extension

Search for `Copilot Helper Pro` in the VS Code extension marketplace and install, or use the extension identifier: `vicanent.copilot-helper-pro`

### 2. Get Started

1. Open the `GitHub Copilot Chat` panel in `VS Code`
2. Select `Manage Models` at the bottom of the model selector, and choose the desired provider from the pop-up model provider list
3. If using for the first time, after selecting a provider, you'll be prompted to set an ApiKey. Complete the API key configuration according to the prompts, then return to the model selector to add and enable the model
4. After selecting the target model in the model selector, you can start chatting with the AI assistant

## 🤖 Built-in AI Large Model Providers

### [**ZhipuAI**](https://bigmodel.cn/) - GLM Series

- [**Coding Plan**](https://bigmodel.cn/glm-coding): **GLM-4.7**(Thinking), **GLM-4.6**, **GLM-4.6V**(Thinking), **GLM-4.5-Air**
    - **Usage Query**: Status bar now supports displaying periodic remaining usage, can view GLM Coding Plan usage information.
- **Pay-per-use**: **GLM-4.7**, **GLM-4.6**, **GLM-4.6V**, **GLM-4.5-Air**
- **Free Models**: **GLM-4.6V-Flash**, **GLM-4.5-Flash**
- [**International Site**](https://z.ai/model-api): International site (z.ai) switching settings now supported.
- **Search Function**: Integrated `Web Search MCP` and `Web Search API`, supports `#zhipuWebSearch` for web search.
    - `Web Search MCP` mode enabled by default, coding plan supports: Lite(100 times/month), Pro(1000 times/month), Max(4000 times/month).
    - Can disable `Web Search MCP` mode to use `Web Search API` pay-per-use billing.

### [**Volcengine Ark**](https://www.volcengine.com/product/ark) - Doubao Large Model

- [**Coding Plan Package**](https://www.volcengine.com/activity/codingplan): **Doubao-Seed-Code**, **DeepSeek-V3.2**(Thinking)
- **Coding Series**: **Doubao-Seed-Code**
- **Doubao Series**: **Doubao-Seed-1.8**, **Doubao-Seed-1.6**, **Doubao-Seed-1.6-Lite**, **Doubao-Seed-1.6-Flash**, **Doubao-Seed-1.6-Thinking**, **Doubao-Seed-1.6-Vision**
- **Collaboration Reward Plan**: **DeepSeek-V3.2**(Thinking), **DeepSeek-V3.1-terminus**, **Kimi-K2-250905**, **Kimi-K2-Thinking-251104**

### [**MiniMax**](https://platform.minimaxi.com/login)

- [**Coding Plan Programming Package**](https://platform.minimaxi.com/subscribe/coding-plan): **MiniMax-M2.1**, **MiniMax-M2**
    - **Search Function**: Integrated Coding Plan web search calling tool, supports web search via `#minimaxWebSearch`.
    - **Usage Query**: Status bar supports displaying periodic usage percentage, can view Coding Plan programming package usage information.
    - **[International Site](https://platform.minimax.io/subscribe/coding-plan)**: International site Coding Plan programming package usage now supported.
- **Pay-per-use**: **MiniMax-M2.1**, **MiniMax-M2.1-Lightning**, **MiniMax-M2**

### [**MoonshotAI**](https://platform.moonshot.cn/) - Kimi K2 Series

- [**Member Benefits**](https://www.kimi.com/coding): Kimi `Membership Plan` package's included `Kimi For Coding`, currently uses Roo Code to send Anthropic requests.
    - **Usage Query**: Status bar supports displaying periodic remaining quota, can view gifted weekly remaining usage and weekly reset time.
- Preset Models: **Kimi-K2-0905-Preview**, **Kimi-K2-Turbo-Preview**, **Kimi-K2-0711-Preview**, **Kimi-Latest**
    - **Balance Query**: Status bar supports displaying current account balance, can view account balance status.
- Thinking Models: **Kimi-K2-Thinking**, **Kimi-K2-Thinking-Turbo**

### [**DeepSeek**](https://platform.deepseek.com/) - DeepSeek

- Preset Models: **DeepSeek-V3.2**(Reasoner)
    - **Balance Query**: Status bar supports displaying current account balance, can view account balance details.

```json
  "chat.agent.thinkingStyle": "expanded", // Recommended to expand thinking content when using DeepSeek-V3.2 (Reasoner)
```

### [**Alibaba Cloud Bailian**](https://bailian.console.aliyun.com/) - Tongyi Large Model

- **Tongyi Qianwen Series**: **Qwen3-Max**, **Qwen3-VL-Plus**, **Qwen3-VL-Flash**, **Qwen-Plus**, **Qwen-Flash**

## ⚙️ Advanced Configuration

Copilot Helper Pro supports customizing AI model behavior parameters through VS Code settings, allowing you to get a more personalized AI assistant experience.

> 📝 **Note**: All parameter modifications in `settings.json` take effect immediately.

### General Model Parameters and Additional Feature Configuration

```json
{
    "chp.temperature": 0.1, // 0.0-2.0
    "chp.topP": 1.0, // 0.0-1.0
    "chp.maxTokens": 8192, // 32-256000
    "chp.editToolMode": "claude", // claude/gpt-5/none
    "chp.rememberLastModel": true, // Remember last used model
    "chp.zhipu.search.enableMCP": true // Enable `Web Search MCP` (Coding Plan exclusive)
}
```

#### Provider Configuration Override

Copilot Helper Pro supports overriding provider default settings through the `chp.providerOverrides` configuration item, including baseUrl, customHeader, model configuration, etc.

**Configuration Example**:

```json
{
    "chp.providerOverrides": {
        "dashscope": {
            "models": [
                {
                    "id": "deepseek-v3.2", // Add additional model: not in prompt options, but allows custom addition
                    "name": "Deepseek-V3.2 (Alibaba Cloud Bailian)",
                    "tooltip": "DeepSeek-V3.2 is the official version model that introduces DeepSeek Sparse Attention (a sparse attention mechanism), and also the first model from DeepSeek that integrates thinking into tool use, supporting both thinking mode and non-thinking mode tool calling.",
                    // "sdkMode": "openai", // Alibaba Cloud Bailian inherits provider settings by default, other provider models can be set as needed
                    // "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                    "maxInputTokens": 128000,
                    "maxOutputTokens": 16000,
                    "capabilities": {
                        "toolCalling": true,
                        "imageInput": false
                    }
                }
            ]
        }
    }
}
```

## 🔌 OpenAI / Anthropic Compatible Custom Model Support

Copilot Helper Pro provides **OpenAI / Anthropic Compatible** Provider to support any OpenAI or Anthropic compatible API. Through `chp.compatibleModels` configuration, you can completely customize model parameters, including extended request parameters.

1. Start the configuration wizard through `Copilot Helper Pro: Compatible Provider Settings` command.
2. Edit the `chp.compatibleModels` configuration item in `settings.json` settings.

### Custom Model Built-in Known Provider IDs and Display Names List

> Aggregated forwarding type providers can provide built-in special adaptations, not provided as individual providers.<br/>
> If you need built-in or special adaptations, please provide relevant information through Issue.

| Provider ID     | Provider Name                                          | Provider Description      | Balance Query |
| --------------- | ------------------------------------------------------ | ------------------------- | ------------ |
| **aiping**      | [**AI Ping**](https://aiping.cn/#?invitation_code=EBQQKW) |                           | User account balance |
| **aihubmix**    | [**AIHubMix**](https://aihubmix.com/?aff=xb8N)            | Enjoy 10% discount immediately | ApiKey balance   |
| **openrouter**  | [**OpenRouter**](https://openrouter.ai/)                  |                           | User account balance |
| **siliconflow** | [**SiliconFlow**](https://cloud.siliconflow.cn/i/tQkcsZbJ)   |                           | User account balance |

**Configuration Example**:

```json
{
    "chp.compatibleModels": [
        {
            "id": "glm-4.6",
            "name": "GLM-4.6",
            "provider": "zhipu",
            "model": "glm-4.6",
            "sdkMode": "openai",
            "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
            // "sdkMode": "anthropic",
            // "baseUrl": "https://open.bigmodel.cn/api/anthropic",
            "maxInputTokens": 128000,
            "maxOutputTokens": 4096,
            // "includeThinking": true, // deepseek-reasoner v3.2 requires multi-round dialogue to include thinking process
            "capabilities": {
                "toolCalling": true, // Model must support tool calling in Agent mode
                "imageInput": false
            },
            // customHeader and extraBody can be set as needed
            "customHeader": {
                "X-Model-Specific": "value",
                "X-Custom-Key": "${APIKEY}"
            },
            "extraBody": {
                "temperature": 0.1,
                "top_p": 0.9,
                // "top_p": null, // Some providers don't support setting temperature and top_p simultaneously
                "thinking": { "type": "disabled" }
            }
        }
    ]
}
```

## FIM / NES Inline Completion Suggestion Feature Configuration

- **FIM** (Fill In the Middle) is a code completion technique where the model predicts missing code in the middle through context, suitable for quickly completing single lines or short code snippets.
- **NES** (Next Edit Suggestions) is an intelligent code suggestion feature that provides more precise code completion suggestions based on current editing context, supporting multi-line code generation.

### FIM / NES Inline Completion Suggestion Model Configuration

FIM and NES completion both use separate model configurations, which can be set through `chp.fimCompletion.modelConfig` and `chp.nesCompletion.modelConfig` respectively.

- **Enable FIM Completion Mode** (recommended for DeepSeek, Qwen and other models that support FIM):
    - Tested support for `DeepSeek`, `SiliconFlow`, special support for `Alibaba Cloud Bailian`.

```json
{
    "chp.fimCompletion.enabled": true, // Enable FIM completion feature
    "chp.fimCompletion.debounceMs": 500, // Auto-trigger completion debounce delay
    "chp.fimCompletion.timeoutMs": 5000, // FIM completion request timeout
    "chp.fimCompletion.modelConfig": {
        "provider": "deepseek", // Provider ID, for others please first add OpenAI Compatible custom model provider and set ApiKey
        "baseUrl": "https://api.deepseek.com/beta", // Specify BaseUrl for FIM Completion Endpoint
        // "baseUrl": "https://api.siliconflow.cn/v1", // SiliconFlow(provider:`siliconflow`)
        // "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1", // Alibaba Cloud Bailian(provider:`dashscope`)
        "model": "deepseek-chat",
        "maxTokens": 100
        // "extraBody": { "top_p": 0.9 }
    }
}
```

- **Enable NES Manual Completion Mode**:

````json
{
    "chp.nesCompletion.enabled": true, // Enable NES completion feature
    "chp.nesCompletion.debounceMs": 500, // Auto-trigger completion debounce delay
    "chp.nesCompletion.timeoutMs": 10000, // NES completion request timeout
    "chp.nesCompletion.manualOnly": true, // Enable manual `Alt+/` shortcut to trigger code completion suggestions
    "chp.nesCompletion.modelConfig": {
        "provider": "zhipu", // Provider ID, for others please first add OpenAI Compatible custom model provider and set ApiKey
        "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4", // BaseUrl address for OpenAI Chat Completion Endpoint
        "model": "glm-4.6", // Recommend using models with better performance, check if log output contains ``` markdown code symbols
        "maxTokens": 200,
        "extraBody": {
            // GLM-4.6 enables thinking by default, it's recommended to disable thinking in completion scenarios to speed up response
            "thinking": { "type": "disabled" }
        }
    }
}
````

- **Mixed Use of FIM + NES Completion Mode**:

> - **Auto-trigger + manualOnly: false**: Intelligently select provider based on cursor position
>     - Cursor at end of line → Use FIM (suitable for completing current line)
>     - Cursor not at end of line → Use NES (suitable for editing middle parts of code)
>     - If NES provides no results or completion is meaningless, automatically fallback to FIM
> - **Auto-trigger + manualOnly: true**: Only initiate FIM requests (NES requires manual trigger)
> - **Manual Trigger** (press `Alt+/`): Directly call NES, do not initiate FIM
> - **Mode Switch** (press `Shift+Alt+/`): Switch between auto/manual (only affects NES)

### Shortcuts and Operations

| Shortcut       | Operation Description                     |
| -------------- | ---------------------------------------- |
| `Alt+/`        | Manually trigger completion suggestions (NES mode) |
| `Shift+Alt+/`  | Toggle NES manual trigger mode        |

## 🤝 Contributing Guide

We welcome community contributions! Whether reporting bugs, proposing feature suggestions, or submitting code, all can help make this project better.
