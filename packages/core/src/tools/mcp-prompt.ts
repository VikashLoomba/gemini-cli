/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  GetPromptResult,
  PromptArgument,
} from '@modelcontextprotocol/sdk/types.js';

// Re-export the MCP SDK type for convenience
export type MCPPromptArgument = PromptArgument;

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
  serverName: string;
  client: Client;
}

// Re-export the MCP SDK type for convenience
export type MCPPromptResult = GetPromptResult;

/**
 * Gets a prompt from an MCP server with the given arguments
 */
export async function getMCPPrompt(
  prompt: MCPPrompt,
  args?: Record<string, unknown>,
): Promise<GetPromptResult> {
  // Convert arguments to string values as required by MCP SDK
  const stringArgs: Record<string, string> | undefined = args
    ? Object.fromEntries(
        Object.entries(args).map(([key, value]) => [key, String(value)]),
      )
    : undefined;

  const result = await prompt.client.getPrompt({
    name: prompt.name,
    arguments: stringArgs,
  });
  return result;
}
