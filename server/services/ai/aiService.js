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
   *   provider?: string,
   * }} params
   * @returns {Promise<{ role: 'assistant', content: string }>}
   */
  async generateResponse({
    messages,
    systemInstruction = NOVA_SYSTEM_INSTRUCTION,
    attachments,
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
        });
    }
  }

  /**
   * Generates a progressive streaming response from the active AI provider.
   * @param {{
   *   messages: Array<{ role: string, content: string }>,
   *   systemInstruction?: string,
   *   onChunk: (text: string) => void,
   *   signal?: AbortSignal,
   *   provider?: string,
   * }} params
   * @returns {Promise<void>}
   */
  async streamResponse({
    messages,
    systemInstruction = NOVA_SYSTEM_INSTRUCTION,
    onChunk,
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
   *   provider?: string,
   * }} params
   * @returns {Promise<{ role: 'assistant', content: string, model: string }>}
   */
  async analyzeDocument({
    documentText,
    fileName,
    instruction,
    provider = 'gemini',
  }) {
    switch (provider.toLowerCase()) {
      case 'gemini':
      default:
        return await this.defaultProvider.analyzeDocument({
          documentText,
          fileName,
          instruction,
        });
    }
  }
}

export const aiService = new AIService();
