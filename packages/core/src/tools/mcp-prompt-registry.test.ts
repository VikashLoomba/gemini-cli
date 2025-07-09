/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MCPPromptRegistry } from './mcp-prompt-registry.js';
import { DiscoveredMCPPrompt } from './mcp-prompt.js';

describe('MCPPromptRegistry', () => {
  let registry: MCPPromptRegistry;
  let mockPrompt1: DiscoveredMCPPrompt;
  let mockPrompt2: DiscoveredMCPPrompt;

  beforeEach(() => {
    registry = new MCPPromptRegistry();
    
    mockPrompt1 = {
      client: {} as any,
      serverName: 'test-server',
      name: 'test-prompt-1',
      description: 'Test prompt 1',
      arguments: [{ name: 'arg1', required: true }],
      trust: false,
      timeout: 5000,
    };

    mockPrompt2 = {
      client: {} as any,
      serverName: 'test-server',
      name: 'test-prompt-2',
      description: 'Test prompt 2',
      arguments: [],
      trust: true,
      timeout: 10000,
    };
  });

  it('should register a prompt', () => {
    registry.registerPrompt(mockPrompt1);
    
    expect(registry.size()).toBe(1);
    expect(registry.getPrompt('test-prompt-1')).toBe(mockPrompt1);
  });

  it('should get all prompts', () => {
    registry.registerPrompt(mockPrompt1);
    registry.registerPrompt(mockPrompt2);
    
    const allPrompts = registry.getAllPrompts();
    expect(allPrompts).toHaveLength(2);
    expect(allPrompts).toContain(mockPrompt1);
    expect(allPrompts).toContain(mockPrompt2);
  });

  it('should get prompts by server', () => {
    registry.registerPrompt(mockPrompt1);
    registry.registerPrompt(mockPrompt2);

    const serverPrompts = registry.getPromptsByServer('test-server');
    expect(serverPrompts).toHaveLength(2);
    expect(serverPrompts).toContain(mockPrompt1);
    expect(serverPrompts).toContain(mockPrompt2);
  });

  it('should return empty array for unknown server', () => {
    const serverPrompts = registry.getPromptsByServer('unknown-server');
    expect(serverPrompts).toHaveLength(0);
  });

  it('should return undefined for unknown prompt', () => {
    const prompt = registry.getPrompt('unknown-prompt');
    expect(prompt).toBeUndefined();
  });

  it('should clear all prompts', () => {
    registry.registerPrompt(mockPrompt1);
    registry.registerPrompt(mockPrompt2);
    
    expect(registry.size()).toBe(2);
    
    registry.clear();
    
    expect(registry.size()).toBe(0);
    expect(registry.getAllPrompts()).toHaveLength(0);
  });

  it('should track prompts by server correctly', () => {
    const prompt3: DiscoveredMCPPrompt = {
      client: {} as any,
      serverName: 'another-server',
      name: 'test-prompt-3',
      description: 'Test prompt 3',
      arguments: [],
      trust: false,
      timeout: 3000,
    };

    registry.registerPrompt(mockPrompt1);
    registry.registerPrompt(mockPrompt2);
    registry.registerPrompt(prompt3);

    expect(registry.getPromptsByServer('test-server')).toHaveLength(2);
    expect(registry.getPromptsByServer('another-server')).toHaveLength(1);
  });
});