import { geminiService } from './geminiService.js';
import { NOVA_SYSTEM_INSTRUCTION } from './systemPrompt.js';

/**
 * Central AI Service Abstraction Layer
 * Provides a provider-agnostic interface for both synchronous and streaming chat controllers.
 */
class AIService {
  constructor() {
    this.defaultProvider = geminiService;
  }

  /**
   * Generates a non-streaming response from the active AI provider.
   * @param {{
   *   messages: Array<{ role: string, content: string }>,
   *   systemInstruction?: string,
   *   attachments?: Array<{ type: string, mimeType: string, data?: string }>,
   *   signal?: AbortSignal,
   *   onModelSelected?: (model: string) => void,
   *   provider?: string,
   * }} params
   * @returns {Promise<{ role: 'assistant', content: string, model: string }>}
   */
  async generateResponse({
    messages,
    systemInstruction = NOVA_SYSTEM_INSTRUCTION,
    attachments,
    signal,
    onModelSelected,
    provider = 'gemini',
  }) {
    let effectiveMessages = [...messages];
    if (Array.isArray(attachments) && attachments.length > 0) {
      const lastUserIdx = effectiveMessages.findLastIndex((m) => m.role === 'user');
      if (lastUserIdx !== -1) {
        effectiveMessages[lastUserIdx] = {
          ...effectiveMessages[lastUserIdx],
          attachments,
        };
      }
    }

    switch (provider.toLowerCase()) {
      case 'gemini':
      default:
        return await this.defaultProvider.generateResponse({
          messages: effectiveMessages,
          systemInstruction,
          signal,
          onModelSelected,
        });
    }
  }

  /**
   * Generates a progressive streaming response from the active AI provider.
   * @param {{
   *   messages: Array<{ role: string, content: string }>,
   *   systemInstruction?: string,
   *   onChunk: (text: string) => void,
   *   onModelSelected?: (model: string) => void,
   *   signal?: AbortSignal,
   *   provider?: string,
   * }} params
   * @returns {Promise<{ model: string }>}
   */
  async streamResponse({
    messages,
    systemInstruction = NOVA_SYSTEM_INSTRUCTION,
    onChunk,
    onModelSelected,
    signal,
    provider = 'gemini',
  }) {
    switch (provider.toLowerCase()) {
      case 'gemini':
      default:
        return await this.defaultProvider.streamResponse({
          messages,
          systemInstruction,
          onChunk,
          onModelSelected,
          signal,
        });
    }
  }

  /**
   * Generates a document analysis response from the active AI provider.
   * @param {{
   *   documentText: string,
   *   fileName: string,
   *   instruction?: string,
   *   signal?: AbortSignal,
   *   onModelSelected?: (model: string) => void,
   *   provider?: string,
   * }} params
   * @returns {Promise<{ role: 'assistant', content: string, model: string }>}
   */
  async analyzeDocument({
    documentText,
    fileName,
    instruction,
    signal,
    onModelSelected,
    provider = 'gemini',
  }) {
    switch (provider.toLowerCase()) {
      case 'gemini':
      default:
        return await this.defaultProvider.analyzeDocument({
          documentText,
          fileName,
          instruction,
          signal,
          onModelSelected,
        });
    }
  }
}

export const aiService = new AIService();
