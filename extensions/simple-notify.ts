/**
 * Pi Simple Notify Extension
 *
 * Sends a notification when Pi finishes processing
 * and is waiting for user input.
 *
 * Config files (merged, project takes precedence):
 * - extensions/simple-notify.config.json      (packaged defaults)
 * - ~/.pi/agent/simple-notify.config.json    (global)
 * - <cwd>/.pi/simple-notify.config.json      (project-local)
 *
 * Template placeholders available in args:
 *   {session}    - current session name or "(unnamed)"
 *   {cwd}        - current working directory
 *   {configPath} - highest-priority existing config file path
 *
 * Example simple-notify.config.json:
 * ```json
 * {
 *   "bell": true,
 *   "command": "notify-send",
 *   "args": ["--app-name=Pi", "Pi [{session}]", "{cwd}"]
 * }
 * ```
 *
 * Place extension in: ~/.pi/agent/extensions/simple-notify.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

interface NotifyConfig {
	/** Write terminal BEL (\x07) when notification fires. Default: false */
	bell: boolean;
	/** Program to run. Default: "notify-send" */
	command: string;
	/** Arguments template. {session}, {cwd}, {configPath} are replaced. Default: ["--app-name=Pi", "Pi [{session}]", "{cwd}"] */
	args: string[];
}

interface LoadedConfig {
	config: NotifyConfig;
	/** Highest-priority existing config file path. Falls back to "<builtin>" if no config file exists. */
	configPath: string;
}

const CONFIG_FILE_NAME = "simple-notify.config.json";
const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));

const BUILTIN_DEFAULT_CONFIG: NotifyConfig = {
	bell: false,
	command: "notify-send",
	args: ["--app-name=Pi", "Pi [{session}]", "{cwd}"],
};

const loggedSpawnErrors = new Set<string>();

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

	for (const path of [defaultPath, globalPath, projectPath]) {
		if (!existsSync(path)) continue;
		configPath = path;
		merged = { ...merged, ...readConfigFile(path) };
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

function logSpawnError(command: string, err: unknown): void {
	if (loggedSpawnErrors.has(command)) return;
	loggedSpawnErrors.add(command);

	const message = err instanceof Error ? err.message : String(err);
	console.error(`[simple-notify] Failed to spawn "${command}": ${message}`);
}

function sendTerminalBell(): void {
	process.stdout.write("\x07");
}

function sendNotification(config: NotifyConfig, sessionName: string, cwd: string, configPath: string): void {
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
		child.on("error", (err) => logSpawnError(config.command, err));
		child.unref();
	} catch (err) {
		logSpawnError(config.command, err);
	}
}

export default function (pi: ExtensionAPI) {
	let loadedConfig = loadConfig(process.cwd());
	let sessionName = "(unnamed)";
	let cwd = process.cwd();

	pi.on("session_start", async (_event, ctx) => {
		loadedConfig = loadConfig(ctx.cwd);
		sessionName = pi.getSessionName() ?? "(unnamed)";
		cwd = ctx.cwd;
	});

	pi.on("agent_end", async () => {
		if (loadedConfig.config.bell) {
			sendTerminalBell();
		}
		sendNotification(loadedConfig.config, sessionName, cwd, loadedConfig.configPath);
	});
}
