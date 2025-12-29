/*---------------------------------------------------------------------------------------------
 *  OpenAI Types
 *  Type definitions for OpenAI provider
 *--------------------------------------------------------------------------------------------*/

import OpenAI from 'openai';
import type { ProcessStreamOptions } from '../common/commonTypes';

export type { ProcessStreamOptions };

// OpenAI format types
export interface OpenAIDelta {
    role?: string;
    content?: string | null;
    tool_calls?: OpenAIToolCallDelta[];
}

export interface OpenAIToolCallDelta {
    index: number;
    id?: string;
    type?: string;
    function?: {
        name?: string;
        arguments?: string;
    };
}

export interface OpenAIStreamChoice {
    index: number;
    delta: OpenAIDelta;
    finish_reason?: string | null;
}

export interface OpenAIStreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: OpenAIStreamChoice[];
}

// Antigravity/Gemini format types
export interface GeminiPart {
    text?: string;
    thought?: boolean;
    thoughtSignature?: string;
    functionCall?: {
        id?: string;
        name?: string;
        args?: Record<string, unknown>;
    };
    inlineData?: {
        mimeType?: string;
        data?: string;
    };
}

export interface GeminiCandidate {
    content?: {
        parts?: GeminiPart[];
        role?: string;
    };
    finishReason?: string;
}

export interface GeminiResponse {
    response?: {
        candidates?: GeminiCandidate[];
        usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            totalTokenCount?: number;
        };
    };
    candidates?: GeminiCandidate[];
}

/**
 * 扩展Delta类型以支持reasoning_content字段
 */
export interface ExtendedDelta extends OpenAI.Chat.ChatCompletionChunk.Choice.Delta {
    reasoning_content?: string;
}

/**
 * 扩展Choice类型以支持兼容旧格式的message字段
 */
export interface ExtendedChoice extends OpenAI.Chat.Completions.ChatCompletionChunk.Choice {
    message?: {
        content?: string;
        reasoning_content?: string;
    };
}

/**
 * 扩展助手消息类型，支持 reasoning_content 字段
 */
export interface ExtendedAssistantMessageParam extends OpenAI.Chat.ChatCompletionAssistantMessageParam {
    reasoning_content?: string;
}
