import { WebSocket } from "ws";
import { exec } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";

// Configuration from environment or defaults
const HUB_URL = process.env.HUB_URL || "https://tryn-quant-mcp-satellite.up.railway.app/bridge";
const AUTH_TOKEN = process.env.SAT_API_KEY || "cd97601ae2fb4583";
const MACHINE_ID = process.env.MACHINE_ID || "RTX4090-CORE";

console.error(`[Bridge] Starting local bridge for ${MACHINE_ID}...`);

function connect() {
  const ws = new WebSocket(HUB_URL, {
    headers: {
      "Authorization": `Bearer ${AUTH_TOKEN}`,
      "x-machine-id": MACHINE_ID
    }
  });

  ws.on("open", () => {
    console.error("[Bridge] Connected to Railway Hub.");
  });

  ws.on("message", async (data) => {
    try {
      const request = JSON.parse(data.toString());
      console.error(`[Bridge] Received request: ${request.method}`);

      let result;
      switch (request.method) {
        case "local_shell":
          result = await handleShell(request.params.command);
          break;
        case "local_read_file":
          result = await handleReadFile(request.params.path);
          break;
        case "local_write_file":
          result = await handleWriteFile(request.params.path, request.params.content);
          break;
        case "local_list_dir":
          result = await handleListDir(request.params.path);
          break;
        case "local_machine_info":
          result = await handleMachineInfo();
          result = await handleListDir(request.params.path);
          break;
        default:
          result = { error: "Unknown method" };
      }

      ws.send(JSON.stringify({
        id: request.id,
        result
      }));
    } catch (err) {
      console.error("[Bridge] Error processing message:", err);
    }
  });

  ws.on("close", () => {
    console.error("[Bridge] Disconnected. Reconnecting in 5s...");
    setTimeout(connect, 5000);
  });

  ws.on("error", (err) => {
    console.error("[Bridge] WebSocket Error:", err.message);
  });
}

async function handleShell(command: string) {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      resolve({
        stdout,
        stderr,
        exitCode: error ? error.code : 0
      });
    });
  });
}

async function handleReadFile(filePath: string) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return { content };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function handleWriteFile(filePath: string, content: string) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function handleListDir(dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return {
      entries: entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? "dir" : "file"
      }))
    };
  } catch (err: any) {
    return { error: err.message };
  }
}


async function handleMachineInfo() {
  try {
    const { stdout: gpu } = await handleShell("nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits") as any;
    const { stdout: disk } = await handleShell("wmic logicaldisk get size,freespace,caption") as any;
    const uptime = process.uptime();
    return {
      machineId: MACHINE_ID,
      gpu: gpu?.trim(),
      disk: disk?.trim(),
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      status: "online"
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

connect();
