/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  DiscoveredMCPPrompt, 
  executeMCPPrompt, 
  getMCPPromptRegistry 
} from '@google/gemini-cli-core';
import { SlashCommand, CommandContext, SlashCommandActionReturn } from '../ui/commands/types.js';
import { MessageType } from '../ui/types.js';

/**
 * Converts a discovered MCP prompt to a slash command
 */
export function mcpPromptToSlashCommand(prompt: DiscoveredMCPPrompt): SlashCommand {
  return {
    name: prompt.name,
    description: prompt.description || `Prompt from ${prompt.serverName} MCP server`,
    action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn | void> => {
      // Parse arguments if the prompt expects them
      const promptArgs: Record<string, string> = {};
      
      if (prompt.arguments && prompt.arguments.length > 0) {
        // For now, parse arguments as space-separated key=value pairs
        // TODO: Could implement more sophisticated argument parsing
        const argPairs = args.split(/\s+/).filter(Boolean);
        
        for (const pair of argPairs) {
          const [key, ...valueParts] = pair.split('=');
          if (key && valueParts.length > 0) {
            promptArgs[key] = valueParts.join('=');
          }
        }

        // Check for required arguments
        const requiredArgs = prompt.arguments.filter(arg => arg.required);
        for (const requiredArg of requiredArgs) {
          if (!promptArgs[requiredArg.name]) {
            return {
              type: 'message',
              messageType: 'error',
              content: `Missing required argument: ${requiredArg.name}${requiredArg.description ? ` (${requiredArg.description})` : ''}`,
            };
          }
        }
      }

      try {
        // Execute the MCP prompt
        const result = await executeMCPPrompt(
          prompt.client,
          prompt.name.replace(`${prompt.serverName}__`, ''), // Remove server prefix for actual prompt name
          promptArgs,
          prompt.timeout,
        );

        // Process the prompt result messages
        if (result.messages && result.messages.length > 0) {
          // Add each message to the history
          for (const message of result.messages) {
            if (message.content?.type === 'text' && message.content.text) {
              context.ui.addItem(
                {
                  type: MessageType.USER,
                  text: message.content.text,
                },
                Date.now(),
              );
            }
          }
        } else {
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Prompt '${prompt.name}' executed successfully but returned no messages.`,
            },
            Date.now(),
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to execute prompt '${prompt.name}': ${errorMessage}`,
        };
      }
    },
  };
}

/**
 * Get all MCP prompts as slash commands
 */
export function getMCPPromptCommands(): SlashCommand[] {
  const promptRegistry = getMCPPromptRegistry();
  const prompts = promptRegistry.getAllPrompts();
  
  return prompts.map(mcpPromptToSlashCommand);
}