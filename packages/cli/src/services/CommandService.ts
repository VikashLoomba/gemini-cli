/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from '../ui/commands/types.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { getMCPPromptCommands } from './MCPPromptService.js';

const loadBuiltInCommands = async (): Promise<SlashCommand[]> => [
  clearCommand,
  helpCommand,
  memoryCommand,
];

const loadAllCommands = async (): Promise<SlashCommand[]> => {
  const builtInCommands = await loadBuiltInCommands();
  const mcpPromptCommands = getMCPPromptCommands();
  
  return [...builtInCommands, ...mcpPromptCommands];
};

export class CommandService {
  private commands: SlashCommand[] = [];

  constructor(
    private commandLoader: () => Promise<SlashCommand[]> = loadAllCommands,
  ) {
    // The constructor can be used for dependency injection in the future.
  }

  async loadCommands(): Promise<void> {
    // Load built-in commands and MCP prompt commands
    this.commands = await this.commandLoader();
  }

  getCommands(): SlashCommand[] {
    return this.commands;
  }
}
