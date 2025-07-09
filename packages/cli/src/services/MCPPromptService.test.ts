/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mcpPromptToSlashCommand, getMCPPromptCommands } from './MCPPromptService.js';
import { DiscoveredMCPPrompt } from '@google/gemini-cli-core';
import { CommandContext } from '../ui/commands/types.js';
import { MessageType } from '../ui/types.js';

// Mock the MCP prompt registry
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getMCPPromptRegistry: vi.fn(() => ({
      getAllPrompts: vi.fn(() => []),
    })),
    executeMCPPrompt: vi.fn(),
  };
});

import { getMCPPromptRegistry, executeMCPPrompt } from '@google/gemini-cli-core';

describe('MCPPromptService', () => {
  let mockCommandContext: CommandContext;
  let mockPrompt: DiscoveredMCPPrompt;

  beforeEach(() => {
    vi.resetAllMocks();
    
    mockCommandContext = {
      services: {
        config: null,
        settings: {} as any,
        git: undefined,
        logger: {} as any,
      },
      ui: {
        addItem: vi.fn(),
        clear: vi.fn(),
        setDebugMessage: vi.fn(),
      },
      session: {
        stats: {} as any,
      },
    };

    mockPrompt = {
      client: {} as any,
      serverName: 'test-server',
      name: 'test-prompt',
      description: 'A test prompt',
      arguments: [],
      trust: false,
      timeout: 5000,
    };
  });

  describe('mcpPromptToSlashCommand', () => {
    it('should convert a prompt to a slash command', () => {
      const command = mcpPromptToSlashCommand(mockPrompt);

      expect(command.name).toBe('test-prompt');
      expect(command.description).toBe('A test prompt');
      expect(command.action).toBeDefined();
    });

    it('should use default description when none provided', () => {
      const promptWithoutDesc = { ...mockPrompt, description: undefined };
      const command = mcpPromptToSlashCommand(promptWithoutDesc);

      expect(command.description).toBe('Prompt from test-server MCP server');
    });

    it('should execute prompt without arguments', async () => {
      const mockResult = {
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

      vi.mocked(executeMCPPrompt).mockResolvedValue(mockResult);

      const command = mcpPromptToSlashCommand(mockPrompt);
      await command.action!(mockCommandContext, '');

      expect(executeMCPPrompt).toHaveBeenCalledWith(
        mockPrompt.client,
        'test-prompt',
        {},
        mockPrompt.timeout,
      );

      expect(mockCommandContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.USER,
          text: 'Generated prompt text',
        },
        expect.any(Number),
      );
    });

    it('should parse and validate required arguments', async () => {
      const promptWithArgs: DiscoveredMCPPrompt = {
        ...mockPrompt,
        arguments: [
          { name: 'required_arg', description: 'A required argument', required: true },
          { name: 'optional_arg', description: 'An optional argument', required: false },
        ],
      };

      const command = mcpPromptToSlashCommand(promptWithArgs);
      
      // Test missing required argument
      const result = await command.action!(mockCommandContext, '');
      
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Missing required argument: required_arg (A required argument)',
      });
    });

    it('should parse key=value arguments', async () => {
      const promptWithArgs: DiscoveredMCPPrompt = {
        ...mockPrompt,
        arguments: [
          { name: 'arg1', required: true },
          { name: 'arg2', required: false },
        ],
      };

      const mockResult = {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: 'Generated with args',
            },
          },
        ],
      };

      vi.mocked(executeMCPPrompt).mockResolvedValue(mockResult);

      const command = mcpPromptToSlashCommand(promptWithArgs);
      await command.action!(mockCommandContext, 'arg1=value1 arg2=value2');

      expect(executeMCPPrompt).toHaveBeenCalledWith(
        promptWithArgs.client,
        'test-prompt',
        { arg1: 'value1', arg2: 'value2' },
        promptWithArgs.timeout,
      );
    });

    it('should handle prompt execution errors', async () => {
      vi.mocked(executeMCPPrompt).mockRejectedValue(new Error('Prompt failed'));

      const command = mcpPromptToSlashCommand(mockPrompt);
      const result = await command.action!(mockCommandContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Failed to execute prompt \'test-prompt\': Prompt failed',
      });
    });

    it('should handle prompts with no messages', async () => {
      const mockResult = { messages: [] };

      vi.mocked(executeMCPPrompt).mockResolvedValue(mockResult);

      const command = mcpPromptToSlashCommand(mockPrompt);
      await command.action!(mockCommandContext, '');

      expect(mockCommandContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: 'Prompt \'test-prompt\' executed successfully but returned no messages.',
        },
        expect.any(Number),
      );
    });
  });

  describe('getMCPPromptCommands', () => {
    it('should return commands for all registered prompts', () => {
      const mockPrompts = [mockPrompt];
      vi.mocked(getMCPPromptRegistry).mockReturnValue({
        getAllPrompts: vi.fn().mockReturnValue(mockPrompts),
      } as any);

      const commands = getMCPPromptCommands();

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('test-prompt');
    });

    it('should return empty array when no prompts registered', () => {
      vi.mocked(getMCPPromptRegistry).mockReturnValue({
        getAllPrompts: vi.fn().mockReturnValue([]),
      } as any);

      const commands = getMCPPromptCommands();

      expect(commands).toHaveLength(0);
    });
  });
});