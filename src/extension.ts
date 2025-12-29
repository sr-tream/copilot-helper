import * as vscode from 'vscode';
import { GenericModelProvider } from './providers/common/genericModelProvider';
import { ZhipuProvider } from './providers/zhipu/zhipuProvider';

import { MiniMaxProvider } from './providers/minimax/minimaxProvider';
import { CompatibleProvider } from './providers/compatible/compatibleProvider';
import { ProviderKey } from './types/providerKeys';
import { AntigravityProvider } from './providers/antigravity/provider';
import { CodexProvider } from './providers/codex/codexProvider';
import { InlineCompletionShim } from './copilot/inlineCompletionShim';
import {
    Logger,
    StatusLogger,
    CompletionLogger,
    TokenCounter,
    ApiKeyManager,
    ConfigManager,
    JsonSchemaProvider
} from './utils';
import { CompatibleModelManager } from './utils/compatibleModelManager';
import { LeaderElectionService, StatusBarManager, registerCombinedQuotaCommand } from './status';
import { registerAllTools } from './tools';
import {
    AccountManager,
    registerAccountCommands,
    AccountStatusBar,
    AccountSyncAdapter,
    AccountQuotaCache
} from './accounts';
import { registerSettingsPageCommand } from './ui';
import { CodexRateLimitStatusBar } from './status/codexRateLimitStatusBar';

/**
 * 全局变量 - 存储已注册的提供商实例，用于扩展卸载时的清理
 */
const registeredProviders: Record<
    string,
    GenericModelProvider | ZhipuProvider | MiniMaxProvider | CompatibleProvider | AntigravityProvider | CodexProvider
> = {};
const registeredDisposables: vscode.Disposable[] = [];

// 内联补全提供商实例（使用轻量级 Shim，延迟加载真正的补全引擎）
let inlineCompletionProvider: InlineCompletionShim | undefined;

/**
 * 激活提供商 - 基于配置文件动态注册（并行优化版本）
 */
async function activateProviders(context: vscode.ExtensionContext): Promise<void> {
    const startTime = Date.now();
    const configProvider = ConfigManager.getConfigProvider();

    if (!configProvider) {
        Logger.warn('Provider configuration not found, skipping provider registration');
        return;
    }

    // Skip Codex here because it is registered separately with a specialized provider (CodexProvider)
    const providerEntries = Object.entries(configProvider).filter(([providerKey]) => providerKey !== 'codex');

    // Set extension path (for tokenizer initialization)
    TokenCounter.setExtensionPath(context.extensionPath);

    Logger.info(`⏱️ Starting parallel registration of ${providerEntries.length} providers...`);

    // Register all providers in parallel to improve performance
    const registrationPromises = providerEntries.map(async ([providerKey, providerConfig]) => {
        try {
            Logger.trace(`Registering provider: ${providerConfig.displayName} (${providerKey})`);
            const providerStartTime = Date.now();

            let provider: GenericModelProvider | ZhipuProvider | MiniMaxProvider;
            let disposables: vscode.Disposable[];

            if (providerKey === 'zhipu') {
                // 对 zhipu 使用专门的 provider（配置向导功能）
                const result = ZhipuProvider.createAndActivate(context, providerKey, providerConfig);
                provider = result.provider;
                disposables = result.disposables;
            } else if (providerKey === 'minimax') {
                // 对 minimax 使用专门的 provider（多密钥管理和配置向导）
                const result = MiniMaxProvider.createAndActivate(context, providerKey, providerConfig);
                provider = result.provider;
                disposables = result.disposables;
            } else {
                // 其他提供商使用通用 provider（支持基于 sdkMode 的自动选择）
                const result = GenericModelProvider.createAndActivate(context, providerKey, providerConfig);
                provider = result.provider;
                disposables = result.disposables;
            }

            const providerTime = Date.now() - providerStartTime;
            Logger.info(`✅ ${providerConfig.displayName} provider registered successfully (time: ${providerTime}ms)`);
            return { providerKey, provider, disposables };
        } catch (error) {
            Logger.error(`❌ Failed to register provider ${providerKey}:`, error);
            return null;
        }
    });

    // Wait for all provider registrations to complete
    const results = await Promise.all(registrationPromises);

    // Collect successfully registered providers
    for (const result of results) {
        if (result) {
            registeredProviders[result.providerKey] = result.provider;
            registeredDisposables.push(...result.disposables);
        }
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => r !== null).length;
    Logger.info(
        `⏱️ Provider registration completed: ${successCount}/${providerEntries.length} successful (total time: ${totalTime}ms)`
    );
}

/**
 * Activate compatible provider
 */
async function activateCompatibleProvider(context: vscode.ExtensionContext): Promise<void> {
    try {
        Logger.trace('Registering compatible provider...');
        const providerStartTime = Date.now();

        // 创建并激活兼容提供商
        const result = CompatibleProvider.createAndActivate(context);
        const provider = result.provider;
        const disposables = result.disposables;

        // 存储注册的提供商和 disposables
        registeredProviders['compatible'] = provider;
        registeredDisposables.push(...disposables);

        const providerTime = Date.now() - providerStartTime;
        Logger.info(`✅ Compatible Provider registered successfully (time: ${providerTime}ms)`);
    } catch (error) {
        Logger.error('❌ Failed to register compatible provider:', error);
    }
}

/**
 * Activate inline completion provider (lightweight Shim, lazy load the actual completion engine)
 */
async function activateInlineCompletionProvider(context: vscode.ExtensionContext): Promise<void> {
    try {
        Logger.trace('Registering inline completion provider (Shim mode)...');
        const providerStartTime = Date.now();

        // 创建并激活轻量级 Shim（不包含 @vscode/chat-lib 依赖）
        const result = InlineCompletionShim.createAndActivate(context);
        inlineCompletionProvider = result.provider;
        registeredDisposables.push(...result.disposables);

        const providerTime = Date.now() - providerStartTime;
        Logger.info(`✅ Inline completion provider registered successfully - Shim mode (time: ${providerTime}ms)`);
    } catch (error) {
        Logger.error('❌ Failed to register inline completion provider:', error);
    }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    // 将单例实例存储到 globalThis，供 copilot.bundle.js 中的模块使用
    globalThis.__chp_singletons = {
        CompletionLogger,
        ApiKeyManager,
        StatusBarManager,
        ConfigManager
    };

    const activationStartTime = Date.now();

    try {
        Logger.initialize('Copilot Helper Pro'); // 初始化日志管理器
        StatusLogger.initialize('GitHub Copilot Models Provider Status'); // 初始化高频状态日志管理器
        CompletionLogger.initialize('Copilot Helper Pro Inline Completion'); // 初始化高频内联补全日志管理器

        const isDevelopment = context.extensionMode === vscode.ExtensionMode.Development;
        Logger.info(`🔧 Copilot Helper Pro Extension Mode: ${isDevelopment ? 'Development' : 'Production'}`);
        // Check and prompt VS Code log level settings
        if (isDevelopment) {
            Logger.checkAndPromptLogLevel();
        }

        Logger.info('⏱️ Starting Copilot Helper Pro extension activation...');

        // Step 0: Initialize leader election service
        let stepStartTime = Date.now();
        LeaderElectionService.initialize(context);
        Logger.trace(`⏱️ Leader election service initialized (time: ${Date.now() - stepStartTime}ms)`);

        // Step 1: Initialize API key manager
        stepStartTime = Date.now();
        ApiKeyManager.initialize(context);
        Logger.trace(`⏱️ API密钥管理器初始化完成 (耗时: ${Date.now() - stepStartTime}ms)`);

        // 步骤1.1: 初始化多账户管理器
        stepStartTime = Date.now();
        AccountManager.initialize(context);
        // 初始化 Account Quota Cache
        AccountQuotaCache.initialize(context);
        const accountDisposables = registerAccountCommands(context);
        context.subscriptions.push(...accountDisposables);
        // 初始化账户状态栏
        const accountStatusBar = AccountStatusBar.initialize();
        context.subscriptions.push({ dispose: () => accountStatusBar.dispose() });
        // 初始化 Codex Rate Limit 状态栏（恢复缓存数据）
        const codexRateLimitStatusBar = CodexRateLimitStatusBar.initialize(context);
        context.subscriptions.push({ dispose: () => codexRateLimitStatusBar.dispose() });
        // 注册 Combined Quota Popup 命令（Antigravity + Codex 共用）
        registerCombinedQuotaCommand(context);
        // 初始化账户同步适配器并同步现有账户
        const accountSyncAdapter = AccountSyncAdapter.initialize();
        context.subscriptions.push({ dispose: () => accountSyncAdapter.dispose() });
        // 异步同步现有账户（不阻塞启动）
        accountSyncAdapter.syncAllAccounts().catch(err => Logger.warn('Account sync failed:', err));

        // Listen to account changes and update AntigravityQuotaWatcher config
        const accountManager = AccountManager.getInstance();

        const updateAntigravityConfig = async () => {
            const activeAccount = accountManager.getActiveAccount(ProviderKey.Antigravity);
            if (!activeAccount) return;

            const credentials = await accountManager.getCredentials(activeAccount.id);
            if (!credentials) return;

            // Extract token from credentials (supports both accessToken and apiKey formats)
            const token =
                (credentials as { accessToken?: string; apiKey?: string }).accessToken ??
                (credentials as { accessToken?: string; apiKey?: string }).apiKey;

            if (token) {
                const config = vscode.workspace.getConfiguration('antigravityQuotaWatcher');
                if (config.get('apiKey') !== token) {
                    await config.update('apiKey', token, vscode.ConfigurationTarget.Global);
                }
            }
        };

        // Initial update
        updateAntigravityConfig();

        context.subscriptions.push(
            accountManager.onAccountChange(async event => {
                if (
                    event.provider === ProviderKey.Antigravity &&
                    (event.type === 'switched' || event.type === 'updated' || event.type === 'added')
                ) {
                    await updateAntigravityConfig();
                }
            })
        );

        Logger.trace(`⏱️ 多账户管理器初始化完成 (耗时: ${Date.now() - stepStartTime}ms)`);

        // 步骤1.2: 注册设置页面命令
        stepStartTime = Date.now();
        const settingsPageDisposable = registerSettingsPageCommand(context);
        context.subscriptions.push(settingsPageDisposable);
        Logger.trace(`⏱️ Settings page command registered (time: ${Date.now() - stepStartTime}ms)`);

        // 步骤2: 初始化配置管理器
        stepStartTime = Date.now();
        const configDisposable = ConfigManager.initialize();
        context.subscriptions.push(configDisposable);
        Logger.trace(`⏱️ Configuration manager initialized (time: ${Date.now() - stepStartTime}ms)`);
        // Step 2.1: Initialize JSON Schema provider
        stepStartTime = Date.now();
        JsonSchemaProvider.initialize();
        context.subscriptions.push({ dispose: () => JsonSchemaProvider.dispose() });
        Logger.trace(`⏱️ JSON Schema provider initialized (time: ${Date.now() - stepStartTime}ms)`);
        // Step 2.2: Initialize compatible model manager
        stepStartTime = Date.now();
        CompatibleModelManager.initialize();
        Logger.trace(`⏱️ Compatible model manager initialized (time: ${Date.now() - stepStartTime}ms)`);

        // Step 3: Activate providers (parallel optimization)
        stepStartTime = Date.now();
        await activateProviders(context);
        Logger.trace(`⏱️ 模型提供者注册完成 (耗时: ${Date.now() - stepStartTime}ms)`);
        // 步骤3.1: 激活兼容提供商
        stepStartTime = Date.now();
        await activateCompatibleProvider(context);
        Logger.trace(`⏱️ 兼容提供商注册完成 (耗时: ${Date.now() - stepStartTime}ms)`);

        // 步骤3.2: 初始化所有状态栏（包含创建和注册）
        stepStartTime = Date.now();
        await StatusBarManager.initializeAll(context);
        Logger.trace(`⏱️ 所有状态栏初始化完成 (耗时: ${Date.now() - stepStartTime}ms)`);

        // Step 4: Register tools
        stepStartTime = Date.now();
        registerAllTools(context);
        Logger.trace(`⏱️ Tools registered (time: ${Date.now() - stepStartTime}ms)`);

        // Step 4.1: Activate Antigravity Provider
        stepStartTime = Date.now();
        const antigravityResult = AntigravityProvider.createAndActivate(context);
        registeredProviders[ProviderKey.Antigravity] = antigravityResult.provider;
        registeredDisposables.push(...antigravityResult.disposables);
        Logger.trace(`⏱️ Antigravity Provider registered (time: ${Date.now() - stepStartTime}ms)`);

        // Step 4.2: Activate Codex Provider (OpenAI GPT-5)
        stepStartTime = Date.now();
        const codexResult = CodexProvider.createAndActivate(context);
        registeredProviders[ProviderKey.Codex] = codexResult.provider;
        registeredDisposables.push(...codexResult.disposables);
        Logger.trace(`⏱️ Codex Provider registered (time: ${Date.now() - stepStartTime}ms)`);

        // Step 5: Register inline completion provider (lightweight Shim, lazy load the actual completion engine)
        stepStartTime = Date.now();
        await activateInlineCompletionProvider(context);
        Logger.trace(`⏱️ NES inline completion provider registered (time: ${Date.now() - stepStartTime}ms)`);

        // Step 6: Register Copilot helper commands
        stepStartTime = Date.now();
        const copilotAttachSelectionCmd = vscode.commands.registerCommand('chp.copilot.attachSelection', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('No active editor found.');
                    return;
                }

                const selection = editor.selection;
                const document = editor.document;
                const fileName = document.fileName.split('/').pop() || document.fileName;

                let lineRange: string;
                if (selection.start.line === selection.end.line) {
                    lineRange = `${selection.start.line + 1}`;
                } else {
                    lineRange = `${selection.start.line + 1}-${selection.end.line + 1}`;
                }

                const referenceText = `@${fileName}:${lineRange} `;

                await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
                await vscode.commands.executeCommand('workbench.action.chat.insertIntoInput', referenceText);
            } catch (error) {
                Logger.warn('Unable to execute Copilot attach selection:', error);
                vscode.window.showWarningMessage(
                    'Failed to insert reference to Copilot Chat. Make sure GitHub Copilot Chat is installed.'
                );
            }
        });
        context.subscriptions.push(copilotAttachSelectionCmd);

        // Command: Insert file handle reference with line range (format: #handle:filename:L1-L100)
        const copilotInsertHandleCmd = vscode.commands.registerCommand('chp.copilot.insertHandle', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('No active editor found.');
                    return;
                }

                const selection = editor.selection;
                const document = editor.document;
                const fileName = document.fileName.split('/').pop() || document.fileName;

                let lineRange: string;
                if (selection.isEmpty) {
                    // No selection - use current line
                    lineRange = `L${selection.start.line + 1}`;
                } else if (selection.start.line === selection.end.line) {
                    // Single line selection
                    lineRange = `L${selection.start.line + 1}`;
                } else {
                    // Multi-line selection
                    lineRange = `L${selection.start.line + 1}-L${selection.end.line + 1}`;
                }

                // Format: #handle:filename:L1-L100 (e.g., #handle:extension.ts:L1-L100)
                const handleText = `#file:${fileName}:${lineRange} `;

                // Focus Copilot Chat panel
                await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
                // Use 'type' command to insert text at cursor position (appends to existing text)
                await vscode.commands.executeCommand('type', { text: handleText });

                Logger.trace(`Inserted handle reference: ${handleText}`);
            } catch (error) {
                Logger.warn('Unable to insert handle reference:', error);
                vscode.window.showWarningMessage(
                    'Failed to insert handle reference to Copilot Chat. Make sure GitHub Copilot Chat is installed.'
                );
            }
        });
        context.subscriptions.push(copilotInsertHandleCmd);

        // Command: Insert file handle with full path reference (format: #handle:path/to/file.ts:L1-L100)
        const copilotInsertHandleFullPathCmd = vscode.commands.registerCommand(
            'chp.copilot.insertHandleFullPath',
            async () => {
                try {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showWarningMessage('No active editor found.');
                        return;
                    }

                    const selection = editor.selection;
                    const document = editor.document;

                    // Get relative path from workspace
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                    let relativePath: string;
                    if (workspaceFolder) {
                        relativePath = vscode.workspace.asRelativePath(document.uri, false);
                    } else {
                        relativePath = document.fileName.split('/').pop() || document.fileName;
                    }

                    let lineRange: string;
                    if (selection.isEmpty) {
                        lineRange = `L${selection.start.line + 1}`;
                    } else if (selection.start.line === selection.end.line) {
                        lineRange = `L${selection.start.line + 1}`;
                    } else {
                        lineRange = `L${selection.start.line + 1}-L${selection.end.line + 1}`;
                    }

                    // Format: #handle:path/to/file.ts:L1-L100
                    const handleText = `#handle:${relativePath}:${lineRange} `;

                    // Focus Copilot Chat panel
                    await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
                    // Use 'type' command to insert text at cursor position (appends to existing text)
                    await vscode.commands.executeCommand('type', { text: handleText });
                } catch (error) {
                    Logger.warn('Unable to insert handle reference with full path:', error);
                    vscode.window.showWarningMessage('Failed to insert handle reference to Copilot Chat.');
                }
            }
        );
        context.subscriptions.push(copilotInsertHandleFullPathCmd);
        Logger.trace(`⏱️ Copilot helper commands registered (time: ${Date.now() - stepStartTime}ms)`);

        const totalActivationTime = Date.now() - activationStartTime;
        Logger.info(`✅ Copilot Helper Pro extension activation completed (total time: ${totalActivationTime}ms)`);
    } catch (error) {
        const errorMessage = `Copilot Helper Pro extension activation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        Logger.error(errorMessage, error instanceof Error ? error : undefined);

        // Try to display user-friendly error message
        vscode.window.showErrorMessage(
            'Copilot Helper Pro extension startup failed. Please check the output window for details.'
        );
        // Re-throw error to let VS Code know extension startup failed
        throw error;
    }
}

// This method is called when your extension is deactivated
export function deactivate() {
    try {
        // Clean up all status bars
        StatusBarManager.disposeAll();

        // Stop leader election service
        LeaderElectionService.stop();

        // Clean up all registered provider resources
        for (const [providerKey, provider] of Object.entries(registeredProviders)) {
            try {
                if (typeof provider.dispose === 'function') {
                    provider.dispose();
                    Logger.trace(`Provider ${providerKey} resources cleaned up`);
                }
            } catch (error) {
                Logger.warn(`Error cleaning up provider ${providerKey} resources:`, error);
            }
        }

        // Clean up inline completion provider
        if (inlineCompletionProvider) {
            inlineCompletionProvider.dispose();
            Logger.trace('Inline completion provider cleaned up');
        }

        // Clean up multi-account manager
        try {
            AccountManager.getInstance().dispose();
            Logger.trace('Multi-account manager cleaned up');
        } catch {
            // AccountManager may not be initialized
        }

        ConfigManager.dispose(); // Clean up configuration manager
        StatusLogger.dispose(); // Clean up status logger
        CompletionLogger.dispose(); // Clean up inline completion logger
        Logger.dispose(); // Dispose Logger only when extension is destroyed
    } catch (error) {
        Logger.error('Error during Copilot Helper Pro extension deactivation:', error);
    }
}
