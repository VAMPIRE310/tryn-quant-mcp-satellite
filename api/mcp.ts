import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";

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

let transport: SSEServerTransport;

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    transport = new SSEServerTransport("/api/mcp", res);
    await server.connect(transport);
  } else if (req.method === 'POST') {
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).send("No active transport");
    }
  }
}
