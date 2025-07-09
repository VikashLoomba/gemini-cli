/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveredMCPPrompt } from './mcp-prompt.js';

/**
 * Registry for discovered MCP prompts
 */
export class MCPPromptRegistry {
  private prompts: Map<string, DiscoveredMCPPrompt> = new Map();
  private promptsByServer: Map<string, DiscoveredMCPPrompt[]> = new Map();

  /**
   * Register a discovered MCP prompt
   */
  registerPrompt(prompt: DiscoveredMCPPrompt): void {
    this.prompts.set(prompt.name, prompt);

    // Update server mapping
    if (!this.promptsByServer.has(prompt.serverName)) {
      this.promptsByServer.set(prompt.serverName, []);
    }
    this.promptsByServer.get(prompt.serverName)!.push(prompt);
  }

  /**
   * Get a prompt by name
   */
  getPrompt(name: string): DiscoveredMCPPrompt | undefined {
    return this.prompts.get(name);
  }

  /**
   * Get all registered prompts
   */
  getAllPrompts(): DiscoveredMCPPrompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Get prompts from a specific server
   */
  getPromptsByServer(serverName: string): DiscoveredMCPPrompt[] {
    return this.promptsByServer.get(serverName) || [];
  }

  /**
   * Clear all prompts (useful for testing)
   */
  clear(): void {
    this.prompts.clear();
    this.promptsByServer.clear();
  }

  /**
   * Get the number of registered prompts
   */
  size(): number {
    return this.prompts.size;
  }
}