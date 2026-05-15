/**
 * pi-simple-notify — sends a notification when Pi is ready for input.
 *
 * The extension loads a small JSON config from packaged, global, and
 * project-local locations, then runs the configured notification command
 * after each completed agent turn.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface NotifyConfig {
  bell: boolean;
  command: string;
  args: string[];
  allowProjectCommand: boolean;
}

interface LoadedConfig {
  config: NotifyConfig;
  configPath: string;
}

const CONFIG_FILE_NAME = "simple-notify.config.json";
const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));

const BUILTIN_DEFAULT_CONFIG: NotifyConfig = {
  bell: false,
  command: "notify-send",
  args: ["--app-name=Pi", "Pi [{session}]", "{cwd}"],
  allowProjectCommand: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function warnInvalidField(path: string, field: keyof NotifyConfig, expected: string): void {
  console.error(`[simple-notify] Ignoring invalid "${field}" in ${path}: expected ${expected}`);
}

function parseConfig(value: unknown, path: string): Partial<NotifyConfig> {
  if (!isRecord(value)) {
    console.error(`[simple-notify] Ignoring invalid config from ${path}: expected a JSON object`);
    return {};
  }

  const config: Partial<NotifyConfig> = {};

  if ("bell" in value) {
    if (typeof value.bell === "boolean") {
      config.bell = value.bell;
    } else {
      warnInvalidField(path, "bell", "a boolean");
    }
  }

  if ("command" in value) {
    if (typeof value.command === "string" && value.command.trim() !== "") {
      config.command = value.command;
    } else {
      warnInvalidField(path, "command", "a non-empty string");
    }
  }

  if ("args" in value) {
    if (Array.isArray(value.args) && value.args.every((arg) => typeof arg === "string")) {
      config.args = value.args;
    } else {
      warnInvalidField(path, "args", "an array of strings");
    }
  }

  if ("allowProjectCommand" in value) {
    if (typeof value.allowProjectCommand === "boolean") {
      config.allowProjectCommand = value.allowProjectCommand;
    } else {
      warnInvalidField(path, "allowProjectCommand", "a boolean");
    }
  }

  return config;
}

function readConfigFile(path: string): Partial<NotifyConfig> {
  if (!existsSync(path)) return {};

  try {
    const content = readFileSync(path, "utf-8");
    return parseConfig(JSON.parse(content), path);
  } catch (err) {
    console.error(`[simple-notify] Failed to load config from ${path}: ${err}`);
    return {};
  }
}

function loadConfig(cwd: string): LoadedConfig {
  const defaultPath = join(EXTENSION_DIR, CONFIG_FILE_NAME);
  const globalPath = join(getAgentDir(), CONFIG_FILE_NAME);
  const projectPath = join(cwd, ".pi", CONFIG_FILE_NAME);

  let merged: NotifyConfig = { ...BUILTIN_DEFAULT_CONFIG };
  let configPath = "<builtin>";

  for (const path of [defaultPath, globalPath]) {
    if (!existsSync(path)) continue;

    configPath = path;
    merged = { ...merged, ...readConfigFile(path) };
  }

  if (existsSync(projectPath)) {
    configPath = projectPath;
    const projectConfig = readConfigFile(projectPath);
    const { allowProjectCommand: _ignored, ...projectOverrides } = projectConfig;

    if (!merged.allowProjectCommand && ("command" in projectOverrides || "args" in projectOverrides)) {
      console.error(
        `[simple-notify] Ignoring project-local command/args in ${projectPath}: ` +
          `set allowProjectCommand=true in global config to allow them`,
      );
      delete projectOverrides.command;
      delete projectOverrides.args;
    }

    merged = { ...merged, ...projectOverrides };
  }

  return { config: merged, configPath };
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{${key}}`, value);
  }
  return rendered;
}

function logSpawnError(loggedSpawnErrors: Set<string>, command: string, err: unknown): void {
  if (loggedSpawnErrors.has(command)) return;
  loggedSpawnErrors.add(command);

  const message = err instanceof Error ? err.message : String(err);
  console.error(`[simple-notify] Failed to spawn "${command}": ${message}`);
}

function sendTerminalBell(): void {
  process.stdout.write("\x07");
}

function notifyStatus(
  config: NotifyConfig,
  sessionName: string,
  cwd: string,
  configPath: string,
  loggedSpawnErrors: Set<string>,
): void {
  const values = {
    session: sessionName,
    cwd,
    configPath,
  };
  const args = config.args.map((arg) => renderTemplate(arg, values));

  try {
    const child = spawn(config.command, args, {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", (err) => logSpawnError(loggedSpawnErrors, config.command, err));
    child.unref();
  } catch (err) {
    logSpawnError(loggedSpawnErrors, config.command, err);
  }
}

export default function (pi: ExtensionAPI) {
  let loadedConfig = loadConfig(process.cwd());
  let sessionName = "(unnamed)";
  let cwd = process.cwd();
  const loggedSpawnErrors = new Set<string>();

  pi.on("session_start", async (_event, ctx) => {
    loadedConfig = loadConfig(ctx.cwd);
    sessionName = pi.getSessionName() ?? "(unnamed)";
    cwd = ctx.cwd;
  });

  pi.on("agent_end", async () => {
    if (loadedConfig.config.bell) {
      sendTerminalBell();
    }
    notifyStatus(loadedConfig.config, sessionName, cwd, loadedConfig.configPath, loggedSpawnErrors);
  });
}
