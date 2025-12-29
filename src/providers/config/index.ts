import { ProviderConfig } from '../../types/sharedTypes';
// 统一导出所有模型配置，便于代码 import
import zhipu from './zhipu.json';
import minimax from './minimax.json';
import moonshot from './moonshot.json';
import deepseek from './deepseek.json';
import codex from './codex.json';
import antigravity from './antigravity.json';

const providers = {
    zhipu,
    minimax,
    moonshot,
    deepseek,
    codex,
    antigravity
};

export type ProviderName = keyof typeof providers;

export const configProviders = providers as Record<ProviderName, ProviderConfig>;
