/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  promptToSlashCommandName,
  discoverMCPPrompts,
  executeMCPPrompt,
} from './mcp-prompt.js';
import type { ListPromptsResult, GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(),
}));

describe('MCP Prompt functionality', () => {
  let mockClient: Client;

  beforeEach(() => {
    mockClient = {
      request: vi.fn(),
    } as any;
  });

  describe('promptToSlashCommandName', () => {
    it('should create a command name with server prefix', () => {
      const commandName = promptToSlashCommandName('test-server', 'my-prompt');
      expect(commandName).toBe('test-server__my-prompt');
    });

    it('should sanitize invalid characters', () => {
      const commandName = promptToSlashCommandName('test-server', 'my prompt!@#');
      expect(commandName).toBe('test-server__my_prompt___');
    });

    it('should truncate long command names', () => {
      const longPromptName = 'very-long-prompt-name-that-exceeds-the-maximum-allowed-length-for-command-names';
      const commandName = promptToSlashCommandName('test-server', longPromptName);
      expect(commandName.length).toBeLessThanOrEqual(63);
      expect(commandName).toContain('___'); // truncation marker
    });
  });

  describe('discoverMCPPrompts', () => {
    it('should discover prompts from server', async () => {
      const mockResponse: ListPromptsResult = {
        prompts: [
          {
            name: 'test-prompt',
            description: 'A test prompt',
            arguments: [
              { name: 'input', description: 'Input text', required: true },
            ],
          },
        ],
      };

      mockClient.request = vi.fn().mockResolvedValue(mockResponse);

      const prompts = await discoverMCPPrompts(mockClient, 5000);

      expect(mockClient.request).toHaveBeenCalledWith(
        { method: 'prompts/list', params: {} },
        expect.any(Object),
        { timeout: 5000 },
      );
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('test-prompt');
      expect(prompts[0].description).toBe('A test prompt');
    });

    it('should return empty array when server does not support prompts', async () => {
      mockClient.request = vi.fn().mockRejectedValue(new Error('Method not found'));

      const prompts = await discoverMCPPrompts(mockClient, 5000);

      expect(prompts).toHaveLength(0);
    });

    it('should handle server returning no prompts', async () => {
      const mockResponse: ListPromptsResult = {
        prompts: [],
      };

      mockClient.request = vi.fn().mockResolvedValue(mockResponse);

      const prompts = await discoverMCPPrompts(mockClient, 5000);

      expect(prompts).toHaveLength(0);
    });
  });

  describe('executeMCPPrompt', () => {
    it('should execute a prompt with arguments', async () => {
      const mockResponse: GetPromptResult = {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Generated prompt text',
            },
          },
        ],
      };

      mockClient.request = vi.fn().mockResolvedValue(mockResponse);

      const result = await executeMCPPrompt(
        mockClient,
        'test-prompt',
        { input: 'test input' },
        5000,
      );

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'prompts/get',
          params: {
            name: 'test-prompt',
            arguments: { input: 'test input' },
          },
        },
        expect.any(Object),
        { timeout: 5000 },
      );
      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].content?.type).toBe('text');
    });

    it('should execute a prompt without arguments', async () => {
      const mockResponse: GetPromptResult = {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Generated prompt text',
            },
          },
        ],
      };

      mockClient.request = vi.fn().mockResolvedValue(mockResponse);

      const result = await executeMCPPrompt(mockClient, 'test-prompt');

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'prompts/get',
          params: {
            name: 'test-prompt',
            arguments: {},
          },
        },
        expect.any(Object),
        { timeout: undefined },
      );
      expect(result.messages).toHaveLength(1);
    });

    it('should handle prompt execution errors', async () => {
      mockClient.request = vi.fn().mockRejectedValue(new Error('Prompt not found'));

      await expect(
        executeMCPPrompt(mockClient, 'nonexistent-prompt'),
      ).rejects.toThrow('Prompt not found');
    });
  });
});