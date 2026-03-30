import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// ─── Vercel REST API ───────────────────────────────────────────────────────────
const VCL_TOKEN = process.env.VCL_TOKEN ?? "";
const VCL_TEAM_ID = process.env.VCL_TEAM_ID ?? "";

async function vclFetch(path: string, options: RequestInit = {}) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (VCL_TEAM_ID) url.searchParams.set("teamId", VCL_TEAM_ID);
  const res = await fetch(url.toString(), {
    ...options,
    headers: {
      Authorization: `Bearer ${VCL_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error(`Vercel: ${JSON.stringify(data)}`);
  return data;
}

// ─── Railway GraphQL API ──────────────────────────────────────────────────────
const RW_TOKEN = process.env.RW_TOKEN ?? "";

async function rwGQL(query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch("https://backboard.railway.com/graphql/v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RW_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json() as { data?: unknown; errors?: Array<{ message: string }> };
  if (data.errors?.length) throw new Error(`Railway: ${data.errors.map(e => e.message).join(", ")}`);
  return data.data as Record<string, unknown>;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SB_URL = process.env.SB_URL ?? "";
const SB_SERVICE_KEY = process.env.SB_SERVICE_KEY ?? "";
const SB_PROJECT_REF = process.env.SB_PROJECT_REF ?? "";
const SB_MGMT_TOKEN = process.env.SB_MGMT_TOKEN ?? "";

async function sbSQL(sql: string) {
  if (!SB_MGMT_TOKEN) throw new Error("SB_MGMT_TOKEN not set — required for SQL execution");
  const res = await fetch(`https://api.supabase.com/v1/projects/${SB_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_MGMT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Supabase SQL: ${JSON.stringify(data)}`);
  return data;
}

async function sbFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SB_URL}${path}`, {
    ...options,
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Supabase: ${JSON.stringify(data)}`);
  return data;
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────
const TOOLS: Tool[] = [
  // ── Vercel (6) ──────────────────────────────────────────────────────────────
  {
    name: "vercel_list_projects",
    description: "List all Vercel projects with latest deployment info",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max results (default 20)" } },
    },
  },
  {
    name: "vercel_list_deployments",
    description: "List recent deployments for a Vercel project",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
  {
    name: "vercel_get_deployment",
    description: "Get full details and status of a specific Vercel deployment",
    inputSchema: {
      type: "object",
      required: ["deploymentId"],
      properties: { deploymentId: { type: "string" } },
    },
  },
  {
    name: "vercel_list_env",
    description: "List environment variables for a Vercel project (values redacted unless decrypt=true)",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string" },
        decrypt: { type: "boolean" },
      },
    },
  },
  {
    name: "vercel_upsert_env",
    description: "Create or update an environment variable for a Vercel project",
    inputSchema: {
      type: "object",
      required: ["projectId", "key", "value"],
      properties: {
        projectId: { type: "string" },
        key: { type: "string" },
        value: { type: "string" },
        target: {
          type: "array",
          items: { type: "string", enum: ["production", "preview", "development"] },
          description: "Defaults to all three",
        },
        type: { type: "string", enum: ["plain", "secret", "encrypted"], description: "Default: encrypted" },
      },
    },
  },
  {
    name: "vercel_list_domains",
    description: "List all domains attached to a Vercel project",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: { projectId: { type: "string" } },
    },
  },

  // ── Railway (8) ─────────────────────────────────────────────────────────────
  {
    name: "railway_list_projects",
    description: "List all Railway projects with their services",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "railway_list_services",
    description: "List all services in a Railway project",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: { projectId: { type: "string" } },
    },
  },
  {
    name: "railway_list_environments",
    description: "List environments in a Railway project",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: { projectId: { type: "string" } },
    },
  },
  {
    name: "railway_list_deployments",
    description: "List recent deployments for a Railway service",
    inputSchema: {
      type: "object",
      required: ["projectId", "serviceId", "environmentId"],
      properties: {
        projectId: { type: "string" },
        serviceId: { type: "string" },
        environmentId: { type: "string" },
        limit: { type: "number", description: "Default 5" },
      },
    },
  },
  {
    name: "railway_get_deployment_logs",
    description: "Get runtime logs for a Railway deployment",
    inputSchema: {
      type: "object",
      required: ["deploymentId"],
      properties: {
        deploymentId: { type: "string" },
        limit: { type: "number", description: "Default 100" },
      },
    },
  },
  {
    name: "railway_list_variables",
    description: "List environment variables for a Railway service in a specific environment",
    inputSchema: {
      type: "object",
      required: ["projectId", "serviceId", "environmentId"],
      properties: {
        projectId: { type: "string" },
        serviceId: { type: "string" },
        environmentId: { type: "string" },
      },
    },
  },
  {
    name: "railway_set_variable",
    description: "Set an environment variable for a Railway service",
    inputSchema: {
      type: "object",
      required: ["projectId", "serviceId", "environmentId", "name", "value"],
      properties: {
        projectId: { type: "string" },
        serviceId: { type: "string" },
        environmentId: { type: "string" },
        name: { type: "string" },
        value: { type: "string" },
      },
    },
  },
  {
    name: "railway_service_restart",
    description: "Restart (redeploy) a Railway service in a given environment",
    inputSchema: {
      type: "object",
      required: ["serviceId", "environmentId"],
      properties: {
        serviceId: { type: "string" },
        environmentId: { type: "string" },
      },
    },
  },

  // ── Supabase (6) ────────────────────────────────────────────────────────────
  {
    name: "supabase_query",
    description: "Execute arbitrary SQL against the Supabase database (requires SB_MGMT_TOKEN)",
    inputSchema: {
      type: "object",
      required: ["sql"],
      properties: { sql: { type: "string" } },
    },
  },
  {
    name: "supabase_list_tables",
    description: "List all tables in a Supabase schema",
    inputSchema: {
      type: "object",
      properties: { schema: { type: "string", description: "Default: public" } },
    },
  },
  {
    name: "supabase_get_logs",
    description: "Get logs for a Supabase service (requires SB_MGMT_TOKEN)",
    inputSchema: {
      type: "object",
      required: ["service"],
      properties: {
        service: {
          type: "string",
          enum: ["postgres", "api", "auth", "storage", "realtime", "edge-function"],
        },
        limit: { type: "number", description: "Default 100" },
      },
    },
  },
  {
    name: "supabase_list_auth_users",
    description: "List authenticated users in Supabase (uses service key)",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Default 1" },
        per_page: { type: "number", description: "Default 50" },
      },
    },
  },
  {
    name: "supabase_rest_get",
    description: "Fetch rows from a Supabase table via REST API",
    inputSchema: {
      type: "object",
      required: ["table"],
      properties: {
        table: { type: "string" },
        select: { type: "string", description: "Columns to return (default: *)" },
        filter: { type: "string", description: "PostgREST filter e.g. id=eq.123" },
        limit: { type: "number", description: "Default 50" },
      },
    },
  },

  // ── Satellite ────────────────────────────────────────────────────────────────
  {
    name: "status_check",
    description: "Check the satellite hub status and which service credentials are configured",
    inputSchema: { type: "object", properties: {} },
  },
];

// ─── Tool Handlers ────────────────────────────────────────────────────────────
async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {

    // ── Vercel ──────────────────────────────────────────────────────────────────
    case "vercel_list_projects": {
      const limit = (args.limit as number) ?? 20;
      const data = await vclFetch(`/v9/projects?limit=${limit}`);
      return (data.projects as any[]).map((p: any) => ({
        id: p.id,
        name: p.name,
        framework: p.framework,
        updatedAt: new Date(p.updatedAt).toISOString(),
        latestDeploymentUrl: p.latestDeployments?.[0]?.url ?? null,
      }));
    }

    case "vercel_list_deployments": {
      const limit = (args.limit as number) ?? 10;
      const data = await vclFetch(`/v6/deployments?projectId=${args.projectId}&limit=${limit}`);
      return (data.deployments as any[]).map((d: any) => ({
        id: d.uid,
        url: d.url,
        state: d.state,
        created: new Date(d.created).toISOString(),
        creator: d.creator?.username,
      }));
    }

    case "vercel_get_deployment":
      return await vclFetch(`/v13/deployments/${args.deploymentId}`);

    case "vercel_list_env": {
      const decrypt = args.decrypt ? "&decrypt=1" : "";
      const data = await vclFetch(`/v9/projects/${args.projectId}/env${decrypt}`);
      return (data.envs as any[]).map((e: any) => ({
        id: e.id,
        key: e.key,
        type: e.type,
        target: e.target,
        value: args.decrypt ? e.value : "***",
      }));
    }

    case "vercel_upsert_env": {
      const target = (args.target as string[]) ?? ["production", "preview", "development"];
      const type = (args.type as string) ?? "encrypted";
      const existing = await vclFetch(`/v9/projects/${args.projectId}/env`);
      const found = (existing.envs as any[])?.find((e: any) => e.key === args.key);
      if (found) {
        return await vclFetch(`/v9/projects/${args.projectId}/env/${found.id}`, {
          method: "PATCH",
          body: JSON.stringify({ value: args.value, type, target }),
        });
      }
      return await vclFetch(`/v10/projects/${args.projectId}/env`, {
        method: "POST",
        body: JSON.stringify({ key: args.key, value: args.value, type, target }),
      });
    }

    case "vercel_list_domains": {
      const data = await vclFetch(`/v9/projects/${args.projectId}/domains`);
      return (data.domains as any[]).map((d: any) => ({
        name: d.name,
        verified: d.verified,
        redirect: d.redirect ?? null,
      }));
    }

    // ── Railway ─────────────────────────────────────────────────────────────────
    case "railway_list_projects": {
      const data = await rwGQL(`
        query {
          projects {
            edges {
              node {
                id name createdAt
                services { edges { node { id name } } }
              }
            }
          }
        }
      `);
      return (data.projects as any).edges.map((e: any) => e.node);
    }

    case "railway_list_services": {
      const data = await rwGQL(
        `query($id: String!) { project(id: $id) { services { edges { node { id name createdAt } } } } }`,
        { id: args.projectId }
      );
      return (data.project as any).services.edges.map((e: any) => e.node);
    }

    case "railway_list_environments": {
      const data = await rwGQL(
        `query($id: String!) { project(id: $id) { environments { edges { node { id name } } } } }`,
        { id: args.projectId }
      );
      return (data.project as any).environments.edges.map((e: any) => e.node);
    }

    case "railway_list_deployments": {
      const limit = (args.limit as number) ?? 5;
      const data = await rwGQL(
        `query($svc: String!, $env: String!) {
          deployments(first: ${limit}, input: { serviceId: $svc, environmentId: $env }) {
            edges {
              node {
                id status createdAt url
                meta { commitMessage commitAuthor }
              }
            }
          }
        }`,
        { svc: args.serviceId, env: args.environmentId }
      );
      return (data.deployments as any).edges.map((e: any) => e.node);
    }

    case "railway_get_deployment_logs": {
      const limit = (args.limit as number) ?? 100;
      const data = await rwGQL(
        `query($id: String!) {
          deploymentLogs(deploymentId: $id, limit: ${limit}) {
            timestamp message severity
          }
        }`,
        { id: args.deploymentId }
      );
      return data.deploymentLogs;
    }

    case "railway_list_variables": {
      const data = await rwGQL(
        `query($proj: String!, $svc: String!, $env: String!) {
          variables(projectId: $proj, serviceId: $svc, environmentId: $env)
        }`,
        { proj: args.projectId, svc: args.serviceId, env: args.environmentId }
      );
      return data.variables;
    }

    case "railway_set_variable": {
      const data = await rwGQL(
        `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
        {
          input: {
            projectId: args.projectId,
            serviceId: args.serviceId,
            environmentId: args.environmentId,
            name: args.name,
            value: args.value,
          },
        }
      );
      return { success: data.variableUpsert };
    }

    case "railway_service_restart": {
      const data = await rwGQL(
        `mutation($svc: String!, $env: String!) {
          serviceInstanceRedeploy(serviceId: $svc, environmentId: $env)
        }`,
        { svc: args.serviceId, env: args.environmentId }
      );
      return { success: data.serviceInstanceRedeploy };
    }

    // ── Supabase ─────────────────────────────────────────────────────────────────
    case "supabase_query":
      return await sbSQL(args.sql as string);

    case "supabase_list_tables": {
      const schema = (args.schema as string) ?? "public";
      return await sbSQL(
        `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = '${schema.replace(/'/g, "''")}' ORDER BY table_name`
      );
    }

    case "supabase_get_logs": {
      if (!SB_MGMT_TOKEN) throw new Error("SB_MGMT_TOKEN not set");
      const limit = (args.limit as number) ?? 100;
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${SB_PROJECT_REF}/logs?service=${args.service}&limit=${limit}`,
        { headers: { Authorization: `Bearer ${SB_MGMT_TOKEN}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(`Supabase logs: ${JSON.stringify(data)}`);
      return data;
    }

    case "supabase_list_auth_users": {
      const page = (args.page as number) ?? 1;
      const per_page = (args.per_page as number) ?? 50;
      return await sbFetch(`/auth/v1/admin/users?page=${page}&per_page=${per_page}`);
    }

    case "supabase_rest_get": {
      const table = args.table as string;
      const select = (args.select as string) ?? "*";
      const limit = (args.limit as number) ?? 50;
      const filter = args.filter ? `&${args.filter}` : "";
      return await sbFetch(`/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${limit}${filter}`);
    }

    case "status_check":
      return {
        status: "online",
        version: "2.0.0",
        services: {
          vercel: !!VCL_TOKEN,
          railway: !!RW_TOKEN,
          supabase: !!SB_SERVICE_KEY,
          supabase_sql: !!SB_MGMT_TOKEN,
        },
        timestamp: new Date().toISOString(),
      };

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
}

// ─── MCP Server Factory ───────────────────────────────────────────────────────
function createServer() {
  const server = new Server(
    { name: "tryn-quant-satellite", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      const result = await handleTool(request.params.name, args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  });

  return server;
}

// ─── Request Handler ──────────────────────────────────────────────────────────
const SAT_API_KEY = process.env.SAT_API_KEY ?? "";

async function handleMcpRequest(request: Request): Promise<Response> {
  if (SAT_API_KEY) {
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${SAT_API_KEY}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = createServer();
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  await server.close();
  return response;
}

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
export const DELETE = handleMcpRequest;
