/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { parse } from 'shell-quote';
import { MCPServerConfig } from '../config/config.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { MCPPrompt } from './mcp-prompt.js';
import { Type, mcpToTool } from '@google/genai';
import { sanitizeParameters, ToolRegistry } from './tool-registry.js';

export const MCP_DEFAULT_TIMEOUT_MSEC = 10 * 60 * 1000; // default to 10 minutes

/**
 * Enum representing the connection status of an MCP server
 */
export enum MCPServerStatus {
  /** Server is disconnected or experiencing errors */
  DISCONNECTED = 'disconnected',
  /** Server is in the process of connecting */
  CONNECTING = 'connecting',
  /** Server is connected and ready to use */
  CONNECTED = 'connected',
}

/**
 * Enum representing the overall MCP discovery state
 */
export enum MCPDiscoveryState {
  /** Discovery has not started yet */
  NOT_STARTED = 'not_started',
  /** Discovery is currently in progress */
  IN_PROGRESS = 'in_progress',
  /** Discovery has completed (with or without errors) */
  COMPLETED = 'completed',
}

/**
 * Map to track the status of each MCP server within the core package
 */
const mcpServerStatusesInternal: Map<string, MCPServerStatus> = new Map();

/**
 * Map to store discovered MCP prompts
 */
const mcpPromptsRegistry: Map<string, MCPPrompt> = new Map();

/**
 * Track the overall MCP discovery state
 */
let mcpDiscoveryState: MCPDiscoveryState = MCPDiscoveryState.NOT_STARTED;

/**
 * Event listeners for MCP server status changes
 */
type StatusChangeListener = (
  serverName: string,
  status: MCPServerStatus,
) => void;
const statusChangeListeners: StatusChangeListener[] = [];

/**
 * Event listeners for MCP prompt changes
 */
type PromptChangeListener = () => void;
const promptChangeListeners: PromptChangeListener[] = [];

/**
 * Add a listener for MCP server status changes
 */
export function addMCPStatusChangeListener(
  listener: StatusChangeListener,
): void {
  statusChangeListeners.push(listener);
}

/**
 * Remove a listener for MCP server status changes
 */
export function removeMCPStatusChangeListener(
  listener: StatusChangeListener,
): void {
  const index = statusChangeListeners.indexOf(listener);
  if (index !== -1) {
    statusChangeListeners.splice(index, 1);
  }
}

/**
 * Add a listener for MCP prompt changes
 */
export function addMCPPromptChangeListener(listener: PromptChangeListener): void {
  promptChangeListeners.push(listener);
}

/**
 * Remove a listener for MCP prompt changes
 */
export function removeMCPPromptChangeListener(
  listener: PromptChangeListener,
): void {
  const index = promptChangeListeners.indexOf(listener);
  if (index !== -1) {
    promptChangeListeners.splice(index, 1);
  }
}

/**
 * Update the status of an MCP server
 */
function updateMCPServerStatus(
  serverName: string,
  status: MCPServerStatus,
): void {
  mcpServerStatusesInternal.set(serverName, status);
  // Notify all listeners
  for (const listener of statusChangeListeners) {
    listener(serverName, status);
  }
}

/**
 * Notify all prompt change listeners
 */
function notifyPromptChangeListeners(): void {
  for (const listener of promptChangeListeners) {
    listener();
  }
}

/**
 * Get the current status of an MCP server
 */
export function getMCPServerStatus(serverName: string): MCPServerStatus {
  return (
    mcpServerStatusesInternal.get(serverName) || MCPServerStatus.DISCONNECTED
  );
}

/**
 * Get all MCP server statuses
 */
export function getAllMCPServerStatuses(): Map<string, MCPServerStatus> {
  return new Map(mcpServerStatusesInternal);
}

/**
 * Get the current MCP discovery state
 */
export function getMCPDiscoveryState(): MCPDiscoveryState {
  return mcpDiscoveryState;
}

/**
 * Get all discovered MCP prompts
 */
export function getMCPPrompts(): MCPPrompt[] {
  return Array.from(mcpPromptsRegistry.values());
}

export async function discoverMcpTools(
  mcpServers: Record<string, MCPServerConfig>,
  mcpServerCommand: string | undefined,
  toolRegistry: ToolRegistry,
): Promise<void> {
  // Set discovery state to in progress
  mcpDiscoveryState = MCPDiscoveryState.IN_PROGRESS;

  try {
    if (mcpServerCommand) {
      const cmd = mcpServerCommand;
      const args = parse(cmd, process.env) as string[];
      if (args.some((arg) => typeof arg !== 'string')) {
        throw new Error('failed to parse mcpServerCommand: ' + cmd);
      }
      // use generic server name 'mcp'
      mcpServers['mcp'] = {
        command: args[0],
        args: args.slice(1),
      };
    }

    const discoveryPromises = Object.entries(mcpServers).map(
      ([mcpServerName, mcpServerConfig]) =>
        connectAndDiscover(mcpServerName, mcpServerConfig, toolRegistry),
    );
    await Promise.all(discoveryPromises);

    // Mark discovery as completed
    mcpDiscoveryState = MCPDiscoveryState.COMPLETED;
  } catch (error) {
    // Still mark as completed even with errors
    mcpDiscoveryState = MCPDiscoveryState.COMPLETED;
    throw error;
  }
}

/**
 * Connects to an MCP server and discovers available tools, registering them with the tool registry.
 * This function handles the complete lifecycle of connecting to a server, discovering tools,
 * and cleaning up resources if no tools are found.
 *
 * @param mcpServerName The name identifier for this MCP server
 * @param mcpServerConfig Configuration object containing connection details
 * @param toolRegistry The registry to register discovered tools with
 * @returns Promise that resolves when discovery is complete
 */
async function connectAndDiscover(
  mcpServerName: string,
  mcpServerConfig: MCPServerConfig,
  toolRegistry: ToolRegistry,
): Promise<void> {
  // Initialize the server status as connecting
  updateMCPServerStatus(mcpServerName, MCPServerStatus.CONNECTING);

  let transport;
  if (mcpServerConfig.httpUrl) {
    const transportOptions: StreamableHTTPClientTransportOptions = {};

    if (mcpServerConfig.headers) {
      transportOptions.requestInit = {
        headers: mcpServerConfig.headers,
      };
    }

    transport = new StreamableHTTPClientTransport(
      new URL(mcpServerConfig.httpUrl),
      transportOptions,
    );
  } else if (mcpServerConfig.url) {
    transport = new SSEClientTransport(new URL(mcpServerConfig.url));
  } else if (mcpServerConfig.command) {
    transport = new StdioClientTransport({
      command: mcpServerConfig.command,
      args: mcpServerConfig.args || [],
      env: {
        ...process.env,
        ...(mcpServerConfig.env || {}),
      } as Record<string, string>,
      cwd: mcpServerConfig.cwd,
      stderr: 'pipe',
    });
  } else {
    console.error(
      `MCP server '${mcpServerName}' has invalid configuration: missing httpUrl (for Streamable HTTP), url (for SSE), and command (for stdio). Skipping.`,
    );
    // Update status to disconnected
    updateMCPServerStatus(mcpServerName, MCPServerStatus.DISCONNECTED);
    return;
  }

  const mcpClient = new Client({
    name: 'gemini-cli-mcp-client',
    version: '0.0.1',
  });

  // patch Client.callTool to use request timeout as genai McpCallTool.callTool does not do it
  // TODO: remove this hack once GenAI SDK does callTool with request options
  if ('callTool' in mcpClient) {
    const origCallTool = mcpClient.callTool.bind(mcpClient);
    mcpClient.callTool = function (params, resultSchema, options) {
      return origCallTool(params, resultSchema, {
        ...options,
        timeout: mcpServerConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
      });
    };
  }

  try {
    await mcpClient.connect(transport, {
      timeout: mcpServerConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
    });
    // Connection successful
    updateMCPServerStatus(mcpServerName, MCPServerStatus.CONNECTED);
  } catch (error) {
    // Create a safe config object that excludes sensitive information
    const safeConfig = {
      command: mcpServerConfig.command,
      url: mcpServerConfig.url,
      httpUrl: mcpServerConfig.httpUrl,
      cwd: mcpServerConfig.cwd,
      timeout: mcpServerConfig.timeout,
      trust: mcpServerConfig.trust,
      // Exclude args, env, and headers which may contain sensitive data
    };

    let errorString =
      `failed to start or connect to MCP server '${mcpServerName}' ` +
      `${JSON.stringify(safeConfig)}; \n${error}`;
    if (process.env.SANDBOX) {
      errorString += `\nMake sure it is available in the sandbox`;
    }
    console.error(errorString);
    // Update status to disconnected
    updateMCPServerStatus(mcpServerName, MCPServerStatus.DISCONNECTED);
    return;
  }

  mcpClient.onerror = (error) => {
    console.error(`MCP ERROR (${mcpServerName}):`, error.toString());
    // Update status to disconnected on error
    updateMCPServerStatus(mcpServerName, MCPServerStatus.DISCONNECTED);
  };

  if (transport instanceof StdioClientTransport && transport.stderr) {
    transport.stderr.on('data', (data) => {
      const stderrStr = data.toString();
      // Filter out verbose INFO logs from some MCP servers
      if (!stderrStr.includes('] INFO')) {
        console.debug(`MCP STDERR (${mcpServerName}):`, stderrStr);
      }
    });
  }

  // Check server capabilities before attempting to discover tools
  const capabilities = mcpClient.getServerCapabilities();
  
  // Discover tools if the server supports them
  if (capabilities?.tools) {
    try {
      const mcpCallableTool = mcpToTool(mcpClient);
      const tool = await mcpCallableTool.tool();

      if (!tool || !Array.isArray(tool.functionDeclarations)) {
        console.error(
          `MCP server '${mcpServerName}' did not return valid tool function declarations. Skipping tool registration.`,
        );
      } else {

    for (const funcDecl of tool.functionDeclarations) {
      if (!funcDecl.name) {
        continue;
      }

      const { includeTools, excludeTools } = mcpServerConfig;
      const toolName = funcDecl.name;

      let isEnabled = false;
      if (includeTools === undefined) {
        isEnabled = true;
      } else {
        isEnabled = includeTools.some(
          (tool) => tool === toolName || tool.startsWith(`${toolName}(`),
        );
      }

      if (excludeTools?.includes(toolName)) {
        isEnabled = false;
      }

      if (!isEnabled) {
        continue;
      }

      let toolNameForModel = funcDecl.name;

      // Replace invalid characters (based on 400 error message from Gemini API) with underscores
      toolNameForModel = toolNameForModel.replace(/[^a-zA-Z0-9_.-]/g, '_');

      const existingTool = toolRegistry.getTool(toolNameForModel);
      if (existingTool) {
        toolNameForModel = mcpServerName + '__' + toolNameForModel;
      }

      // If longer than 63 characters, replace middle with '___'
      // (Gemini API says max length 64, but actual limit seems to be 63)
      if (toolNameForModel.length > 63) {
        toolNameForModel =
          toolNameForModel.slice(0, 28) + '___' + toolNameForModel.slice(-32);
      }

      sanitizeParameters(funcDecl.parameters);

      toolRegistry.registerTool(
        new DiscoveredMCPTool(
          mcpCallableTool,
          mcpServerName,
          toolNameForModel,
          funcDecl.description ?? '',
          funcDecl.parameters ?? { type: Type.OBJECT, properties: {} },
          funcDecl.name,
          mcpServerConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
          mcpServerConfig.trust,
        ),
      );
    }
      }
    } catch (error) {
      console.error(
        `Failed to list or register tools for MCP server '${mcpServerName}': ${error}`,
      );
      // Don't disconnect yet - the server might still support prompts
    }
  } else {
    // Server does not support tools
  }

  // Discover prompts from MCP server if supported
  if (capabilities?.prompts) {
    try {
      const promptsResult = await mcpClient.listPrompts();
      if (promptsResult?.prompts && Array.isArray(promptsResult.prompts)) {
        let promptsAdded = false;
        for (const prompt of promptsResult.prompts) {
          if (!prompt.name) {
            continue;
          }

          // Create a unique key for the prompt (prefixed with server name to avoid conflicts)
          const promptKey = `${mcpServerName}:${prompt.name}`;

          // Store the prompt in our registry
          mcpPromptsRegistry.set(promptKey, {
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments,
            serverName: mcpServerName,
            client: mcpClient,
          });
          promptsAdded = true;
        }
        
        // Notify listeners that prompts have been added
        if (promptsAdded) {
          notifyPromptChangeListeners();
        }
      }
    } catch (error) {
      // This should not happen if the server advertises prompt support
      console.error(
        `MCP server '${mcpServerName}' advertises prompt support but failed to list prompts: ${error}`,
      );
    }
  } else {
    // Server does not support prompts
  }

  // If no tools or prompts were registered from this MCP server, the following 'if' block
  // will close the connection. This is done to conserve resources and prevent
  // an orphaned connection to a server that isn't providing any usable
  // functionality. Connections to servers that did provide tools or prompts are kept
  // open, as those features will require the connection to function.
  const hasTools = toolRegistry.getToolsByServer(mcpServerName).length > 0;
  const hasPrompts = Array.from(mcpPromptsRegistry.values()).some(
    (prompt) => prompt.serverName === mcpServerName,
  );

  if (!hasTools && !hasPrompts) {
    console.log(
      `No tools or prompts registered from MCP server '${mcpServerName}'. Closing connection.`,
    );
    if (
      transport instanceof StdioClientTransport ||
      transport instanceof SSEClientTransport ||
      transport instanceof StreamableHTTPClientTransport
    ) {
      await transport.close();
      // Update status to disconnected
      updateMCPServerStatus(mcpServerName, MCPServerStatus.DISCONNECTED);
    }
  }
}
