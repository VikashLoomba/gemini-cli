/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  type Prompt,
  type PromptArgument,
  type GetPromptResult,
  type ListPromptsResult,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListPromptsResultSchema,
  GetPromptResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Interface for a discovered MCP prompt that can be converted to a slash command
 */
export interface DiscoveredMCPPrompt {
  /** The MCP client instance used to communicate with the server */
  readonly client: Client;
  /** The name of the MCP server this prompt comes from */
  readonly serverName: string;
  /** The name of the prompt as exposed by the server */
  readonly name: string;
  /** Human-readable description of the prompt */
  readonly description?: string;
  /** Arguments that this prompt accepts */
  readonly arguments?: PromptArgument[];
  /** Whether the server is trusted (affects confirmation flow) */
  readonly trust?: boolean;
  /** Timeout for prompt execution */
  readonly timeout?: number;
}

/**
 * Converts a discovered MCP prompt to a slash command compatible format
 */
export function promptToSlashCommandName(
  serverName: string,
  promptName: string,
): string {
  // Create a command name by combining server and prompt names
  // Replace invalid characters with underscores and ensure uniqueness
  let commandName = promptName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  
  // If the command name would conflict, prefix with server name
  commandName = `${serverName}__${commandName}`;
  
  // Ensure command name isn't too long (similar to tool naming)
  if (commandName.length > 63) {
    commandName = commandName.slice(0, 28) + '___' + commandName.slice(-32);
  }
  
  return commandName;
}

/**
 * Executes an MCP prompt by calling prompts/get on the server
 */
export async function executeMCPPrompt(
  client: Client,
  promptName: string,
  args: Record<string, string> = {},
  timeout?: number,
): Promise<GetPromptResult> {
  const request = {
    method: 'prompts/get' as const,
    params: {
      name: promptName,
      arguments: args,
    },
  };

  const response = await client.request(
    request,
    GetPromptResultSchema,
    {
      timeout: timeout,
    },
  );

  return response;
}

/**
 * Discovers prompts from an MCP server
 */
export async function discoverMCPPrompts(
  client: Client,
  timeout?: number,
): Promise<Prompt[]> {
  try {
    const request = {
      method: 'prompts/list' as const,
      params: {},
    };

    const response: ListPromptsResult = await client.request(
      request,
      ListPromptsResultSchema,
      {
        timeout: timeout,
      },
    );

    return response.prompts || [];
  } catch (error) {
    // If the server doesn't support prompts, just return empty array
    console.debug('Server does not support prompts or prompts/list failed:', error);
    return [];
  }
}