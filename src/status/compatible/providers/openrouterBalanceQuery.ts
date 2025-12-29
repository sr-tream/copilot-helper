/*---------------------------------------------------------------------------------------------
 *  OpenRouter Balance Query
 *--------------------------------------------------------------------------------------------*/

import { IBalanceQuery, BalanceQueryResult } from '../balanceQuery';
import { StatusLogger } from '../../../utils/statusLogger';
import { ApiKeyManager } from '../../../utils/apiKeyManager';
import { Logger } from '../../../utils';

/**
 * OpenRouter API Response Type
 */
interface OpenRouterBalanceResponse {
    /** Response data */
    data: {
        /** Total purchased credits */
        total_credits: number;
        /** Total used credits */
        total_usage: number;
    };
}

/**
 * OpenRouter Balance Query
 */
export class OpenrouterBalanceQuery implements IBalanceQuery {
    /**
     * Query OpenRouter Balance
     * @param providerId Provider identifier
     * @returns Balance query result
     */
    async queryBalance(providerId: string): Promise<BalanceQueryResult> {
        StatusLogger.debug(`[OpenrouterBalanceQuery] Querying balance for provider ${providerId}`);

        try {
            // Get API Key
            const apiKey = await ApiKeyManager.getApiKey(providerId);

            if (!apiKey) {
                throw new Error(`API key for provider ${providerId} not found`);
            }

            // Call OpenRouter Balance Query API
            const response = await fetch('https://openrouter.ai/api/v1/credits', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const result = (await response.json()) as OpenRouterBalanceResponse;

            // Parse balance data
            const totalCredits = result.data.total_credits || 0; // Total purchased credits
            const totalUsage = result.data.total_usage || 0; // Total used credits
            const balance = totalCredits - totalUsage; // Available balance

            StatusLogger.debug('[OpenrouterBalanceQuery] Balance query successful');

            return {
                balance,
                currency: 'USD' // OpenRouter uses USD
            };
        } catch (error) {
            Logger.error('[OpenrouterBalanceQuery] Failed to query balance', error);
            throw new Error(`OpenRouter balance query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
