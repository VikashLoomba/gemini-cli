/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMCPPrompt } from './mcp-prompt.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { MCPPrompt } from './mcp-prompt.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

describe('mcp-prompt', () => {
  let mockClient: Client;
  let mockPrompt: MCPPrompt;

  beforeEach(() => {
    mockClient = {
      getPrompt: vi.fn(),
    } as unknown as Client;

    mockPrompt = {
      name: 'test-prompt',
      description: 'A test prompt',
      arguments: [
        {
          name: 'arg1',
          description: 'First argument',
          required: true,
        },
        {
          name: 'arg2',
          description: 'Second argument',
          required: false,
        },
      ],
      serverName: 'test-server',
      client: mockClient,
    };
  });

  describe('getMCPPrompt', () => {
    it('should call client.getPrompt with correct parameters', async () => {
      const expectedResult: GetPromptResult = {
        description: 'Test result',
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Hello, world!',
            },
          },
        ],
      };

      vi.mocked(mockClient.getPrompt).mockResolvedValue(expectedResult);

      const args = { arg1: 'value1', arg2: 'value2' };
      const result = await getMCPPrompt(mockPrompt, args);

      // getMCPPrompt converts all arguments to strings
      expect(mockClient.getPrompt).toHaveBeenCalledWith({
        name: 'test-prompt',
        arguments: { arg1: 'value1', arg2: 'value2' },
      });
      expect(result).toEqual(expectedResult);
    });

    it('should handle prompts with no arguments', async () => {
      const expectedResult: GetPromptResult = {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Simple prompt',
            },
          },
        ],
      };

      vi.mocked(mockClient.getPrompt).mockResolvedValue(expectedResult);

      const result = await getMCPPrompt(mockPrompt);

      expect(mockClient.getPrompt).toHaveBeenCalledWith({
        name: 'test-prompt',
        arguments: undefined,
      });
      expect(result).toEqual(expectedResult);
    });

    it('should handle resource content in messages', async () => {
      const expectedResult: GetPromptResult = {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'resource' as const,
              resource: {
                uri: 'file:///example.txt',
                text: 'File contents',
                mimeType: 'text/plain',
              },
            },
          },
        ],
      };

      vi.mocked(mockClient.getPrompt).mockResolvedValue(expectedResult);

      const result = await getMCPPrompt(mockPrompt, { arg1: 'value' });

      expect(mockClient.getPrompt).toHaveBeenCalledWith({
        name: 'test-prompt',
        arguments: { arg1: 'value' },
      });
      const content = result.messages[0].content;
      expect(content.type).toBe('resource');
      if (content.type === 'resource' && 'resource' in content) {
        expect(content.resource.uri).toBe('file:///example.txt');
      }
    });
  });
});
