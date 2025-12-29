/*---------------------------------------------------------------------------------------------
 *  AIPing Balance Query
 *--------------------------------------------------------------------------------------------*/

import { IBalanceQuery, BalanceQueryResult } from '../balanceQuery';
import { StatusLogger } from '../../../utils/statusLogger';
import { ApiKeyManager } from '../../../utils/apiKeyManager';
import { Logger } from '../../../utils';

/**
 * AIPing API Response Type
 */
interface AIPingBalanceResponse {
    /** Response status code */
    code: number;
    /** Response message */
    msg: string;
    /** Balance data object */
    data: AIPingBalanceData;
}

/**
 * AIPing Balance Data Object
 */
interface AIPingBalanceData {
    /** Gift balance, in CNY */
    gift_remain: number;
    /** Recharge balance, in CNY */
    recharge_remain: number;
    /** Total balance, in CNY */
    total_remain: number;
}

/**
 * AIPing Balance Query
 */
export class AiPingBalanceQuery implements IBalanceQuery {
    /**
     * Query AIPing Balance
     * @param providerId Provider identifier
     * @returns Balance query result
     */
    async queryBalance(providerId: string): Promise<BalanceQueryResult> {
        StatusLogger.debug(`[AiPingBalanceQuery] Querying balance for provider ${providerId}`);

        try {
            // Get API Key
            const apiKey = await ApiKeyManager.getApiKey(providerId);

            if (!apiKey) {
                throw new Error(`API key for provider ${providerId} not found`);
            }

            // Call AIPing Balance Query API
            const response = await fetch('https://aiping.cn/api/v1/user/remain/points', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const result = (await response.json()) as AIPingBalanceResponse;

            // Check API response status code
            if (result.code !== 0) {
                throw new Error(`API returned error: ${result.msg || 'Unknown error'}`);
            }

            // Parse balance data
            const data = result.data;
            const paid = data.recharge_remain || 0; // Recharge balance
            const granted = data.gift_remain || 0; // Gift balance
            const balance = data.total_remain || paid + granted; // Total balance

            StatusLogger.debug('[AiPingBalanceQuery] Balance query successful');

            return {
                paid,
                granted,
                balance,
                currency: 'CNY'
            };
        } catch (error) {
            Logger.error('[AiPingBalanceQuery] Failed to query balance', error);
            throw new Error(`AIPing balance query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
