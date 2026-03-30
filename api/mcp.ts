import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";

function createServer() {
  const server = new Server(
    { name: "tryn-quant-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "status_check",
        description: "Checks the status of the satellite MCP server",
        inputSchema: { type: "object", properties: {} }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "status_check") {
      return {
        content: [{ type: "text", text: "✅ Satellite MCP Server is online and stable!" }]
      };
    }
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
  });

  return server;
}

// Stateless mode: each request gets a fresh server+transport instance.
// This is required for Vercel serverless — no shared module-level state.
export default async function handler(request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = createServer();
  await server.connect(transport);

  const response = await transport.handleRequest(request);

  await server.close();

  return response;
}
