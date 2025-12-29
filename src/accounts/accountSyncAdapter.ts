/*---------------------------------------------------------------------------------------------
 *  Account Sync Adapter
 *  Đồng bộ giữa AccountManager và các hệ thống auth hiện có
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AccountManager } from './accountManager';
import { OAuthCredentials, ApiKeyCredentials } from './types';
import { Logger } from '../utils/logger';
import { ApiKeyManager } from '../utils/apiKeyManager';
import { ProviderKey } from '../types/providerKeys';

/**
 * Adapter để đồng bộ accounts từ các nguồn khác nhau
 */
export class AccountSyncAdapter {
    private static instance: AccountSyncAdapter;
    private accountManager: AccountManager;
    private disposables: vscode.Disposable[] = [];

    private constructor() {
        this.accountManager = AccountManager.getInstance();
        this.disposables.push(
            this.accountManager.onAccountChange(async (event) => {
                try {
                    if (event.type === 'added' || event.type === 'switched' || event.type === 'updated') {
                        await this.syncToApiKeyManager(event.provider);
                    } else if (event.type === 'removed') {
                        await this.handleAccountRemoval(event.provider);
                    }
                } catch (error) {
                    Logger.warn(`Failed to sync ${event.provider} to ApiKeyManager:`, error);
                }
            })
        );
    }

    /**
     * Khởi tạo adapter
     */
    static initialize(): AccountSyncAdapter {
        if (!AccountSyncAdapter.instance) {
            AccountSyncAdapter.instance = new AccountSyncAdapter();
        }
        return AccountSyncAdapter.instance;
    }

    /**
     * Lấy instance
     */
    static getInstance(): AccountSyncAdapter {
        if (!AccountSyncAdapter.instance) {
            throw new Error('AccountSyncAdapter not initialized');
        }
        return AccountSyncAdapter.instance;
    }

    /**
     * Đồng bộ Antigravity account từ ApiKeyManager
     */
    async syncAntigravityAccount(): Promise<void> {
        try {
            const stored = await ApiKeyManager.getApiKey(ProviderKey.Antigravity);
            if (!stored) {
                return;
            }

            const authData = JSON.parse(stored) as {
                access_token: string;
                refresh_token: string;
                email?: string;
                project_id?: string;
                expires_at: string;
            };

            // Kiểm tra xem đã có account này chưa
            const existingAccounts = this.accountManager.getAccountsByProvider(ProviderKey.Antigravity);
            const existingByEmail = existingAccounts.find(acc => acc.email === authData.email);

            if (existingByEmail) {
                // Cập nhật credentials
                const credentials: OAuthCredentials = {
                    accessToken: authData.access_token,
                    refreshToken: authData.refresh_token,
                    expiresAt: authData.expires_at
                };
                await this.accountManager.updateCredentials(existingByEmail.id, credentials);
                Logger.debug(`Updated Antigravity account: ${authData.email}`);
            } else {
                // Thêm account mới
                const displayName = authData.email || 'Antigravity Account';
                const credentials: OAuthCredentials = {
                    accessToken: authData.access_token,
                    refreshToken: authData.refresh_token,
                    expiresAt: authData.expires_at
                };

                await this.accountManager.addOAuthAccount(
                    ProviderKey.Antigravity,
                    displayName,
                    authData.email || '',
                    credentials,
                    { projectId: authData.project_id }
                );
                Logger.info(`Synced Antigravity account: ${displayName}`);
            }
        } catch (error) {
            Logger.error('Failed to sync Antigravity account:', error);
        }
    }

    /**
     * Đồng bộ Codex account từ ApiKeyManager
     */
    async syncCodexAccount(): Promise<void> {
        try {
            const stored = await ApiKeyManager.getApiKey('codex');
            if (!stored) {
                return;
            }

            const authData = JSON.parse(stored) as {
                access_token: string;
                refresh_token: string;
                email?: string;
                expires_at: string;
            };

            // Kiểm tra xem đã có account này chưa
            const existingAccounts = this.accountManager.getAccountsByProvider('codex');
            const existingByEmail = existingAccounts.find(acc => acc.email === authData.email);

            if (existingByEmail) {
                // Cập nhật credentials
                const credentials: OAuthCredentials = {
                    accessToken: authData.access_token,
                    refreshToken: authData.refresh_token,
                    expiresAt: authData.expires_at
                };
                await this.accountManager.updateCredentials(existingByEmail.id, credentials);
                Logger.debug(`Updated Codex account: ${authData.email}`);
            } else {
                // Thêm account mới
                const displayName = authData.email || 'Codex Account';
                const credentials: OAuthCredentials = {
                    accessToken: authData.access_token,
                    refreshToken: authData.refresh_token,
                    expiresAt: authData.expires_at
                };

                await this.accountManager.addOAuthAccount(
                    'codex',
                    displayName,
                    authData.email || '',
                    credentials
                );
                Logger.info(`Synced Codex account: ${displayName}`);
            }
        } catch (error) {
            Logger.error('Failed to sync Codex account:', error);
        }
    }

    /**
     * Đồng bộ API Key account từ ApiKeyManager
     */
    async syncApiKeyAccount(provider: string, displayName?: string): Promise<void> {
        try {
            const apiKey = await ApiKeyManager.getApiKey(provider);
            if (!apiKey) {
                return;
            }

            // Kiểm tra xem đã có account này chưa
            const existingAccounts = this.accountManager.getAccountsByProvider(provider);
            
            if (existingAccounts.length === 0) {
                // Thêm account mới
                const name = displayName || `${provider} Account`;
                await this.accountManager.addApiKeyAccount(provider, name, apiKey);
                Logger.info(`Synced ${provider} account from ApiKeyManager`);
            }
        } catch (error) {
            Logger.error(`Failed to sync ${provider} account:`, error);
        }
    }

    /**
     * Đồng bộ tất cả accounts từ ApiKeyManager
     */
    async syncAllAccounts(): Promise<void> {
        const providers = ['zhipu', 'moonshot', 'minimax', 'deepseek'];
        
        // Sync Antigravity (OAuth)
        await this.syncAntigravityAccount();

        // Sync Codex (OAuth)
        await this.syncCodexAccount();

        // Sync API Key providers
        for (const provider of providers) {
            await this.syncApiKeyAccount(provider);
        }

        // Sync active accounts back to ApiKeyManager for compatibility
        const allProviders = [ProviderKey.Antigravity, ProviderKey.Codex, ...providers];
        for (const provider of allProviders) {
            await this.syncToApiKeyManager(provider);
        }
    }

    /**
     * Khi có account mới được thêm qua AccountManager, 
     * cập nhật ApiKeyManager để tương thích ngược
     */
    async syncToApiKeyManager(provider: string): Promise<void> {
        const activeCredentials = await this.accountManager.getActiveCredentials(provider);
        if (!activeCredentials) {
            return;
        }

        if ('apiKey' in activeCredentials) {
            await ApiKeyManager.setApiKey(provider, activeCredentials.apiKey);
        } else if ('accessToken' in activeCredentials && provider === ProviderKey.Antigravity) {
            // Antigravity cần format đặc biệt
            const account = this.accountManager.getActiveAccount(provider);
            const authData = {
                type: ProviderKey.Antigravity,
                access_token: activeCredentials.accessToken,
                refresh_token: activeCredentials.refreshToken,
                email: account?.email || '',
                project_id: account?.metadata?.projectId || '',
                expires_at: activeCredentials.expiresAt,
                timestamp: Date.now()
            };
            await ApiKeyManager.setApiKey(ProviderKey.Antigravity, JSON.stringify(authData));
        } else if ('accessToken' in activeCredentials && provider === ProviderKey.Codex) {
            // Codex cần format đặc biệt
            const account = this.accountManager.getActiveAccount(provider);
            
            // Get existing data to preserve account_id, organization_id, etc.
            const existingData = await ApiKeyManager.getApiKey('codex');
            let existingParsed: any = {};
            if (existingData) {
                try {
                    existingParsed = JSON.parse(existingData);
                } catch (e) {
                    // Ignore parse errors
                }
            }
            
            const authData = {
                type: 'codex',
                access_token: activeCredentials.accessToken,
                refresh_token: activeCredentials.refreshToken,
                email: account?.email || '',
                // IMPORTANT: Preserve these fields from existing storage
                account_id: existingParsed.account_id || account?.metadata?.accountId,
                organization_id: existingParsed.organization_id,
                project_id: existingParsed.project_id,
                organizations: existingParsed.organizations,
                expires_at: activeCredentials.expiresAt,
                timestamp: Date.now()
            };
            Logger.info('[accountSync] Preserving Codex account/org data during sync');
            await ApiKeyManager.setApiKey('codex', JSON.stringify(authData));
        }
    }

    /**
     * Khi account bị xóa, cập nhật hoặc xóa ApiKeyManager để tránh sync ngược
     */
    private async handleAccountRemoval(provider: string): Promise<void> {
        const remainingAccounts = this.accountManager.getAccountsByProvider(provider);
        if (remainingAccounts.length === 0) {
            await ApiKeyManager.deleteApiKey(provider);
            return;
        }

        // Còn account khác -> sync lại active account để tương thích ngược
        await this.syncToApiKeyManager(provider);
    }

    /**
     * Dispose
     */
    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}
