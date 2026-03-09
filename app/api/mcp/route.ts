import { z } from 'zod';
import { createMcpHandler } from 'mcp-handler';

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'roll_dice',
      'Rolls an N-sided die',
      { sides: z.number().int().min(2).default(6) },
      async ({ sides }) => {
        const value = 1 + Math.floor(Math.random() * sides);
        return {
          content: [{ type: 'text', text: `🎲 You rolled a ${value}!` }],
        };
      },
    );

    server.tool(
      'status_check',
      'Checks the status of the MCP server',
      {},
      async () => {
        return {
          content: [{ type: 'text', text: '✅ MCP Server is online and stable!' }],
        };
      },
    );
  },
  {},
  { basePath: '/api/mcp' },
);

export const GET = async (req: Request) => (handler as any)(req);
export const POST = async (req: Request) => (handler as any)(req);
export const DELETE = async (req: Request) => (handler as any)(req);
