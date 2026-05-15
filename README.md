# pi-simple-notify

A [Pi](https://pi.dev) package that sends a desktop notification when the agent finishes processing and is ready for input.

## Why

Use this when you switch away from the terminal while Pi works on a long task.

## Behavior

The package listens for completed agent turns. When a turn ends, it can:

- write a terminal bell (`\x07`);
- run a configured notification command, such as `notify-send`.

## Installation

### From git

```bash
pi install git:github.com/punzik/pi-simple-notify
```

### From a local checkout

```bash
pi install /path/to/pi-simple-notify
```

### Project-local install

```bash
pi install -l /path/to/pi-simple-notify
```

### Try without installing

```bash
pi -e /path/to/pi-simple-notify
```

If Pi is already running, reload packages and extensions with:

```text
/reload
```

## Configuration

The extension loads JSON config files and merges them in this order:

1. packaged defaults;
2. global config;
3. project-local config.

Project-local config overrides global config. Global config overrides packaged defaults. Invalid fields are ignored and logged.

For safety, project-local config cannot override `command` or `args` unless `allowProjectCommand` is enabled in packaged or global config. A project-local `allowProjectCommand` value is ignored.

| Path | Scope |
|------|-------|
| `extensions/simple-notify.config.json` | Packaged defaults |
| `~/.pi/agent/simple-notify.config.json` | Global, for all projects |
| `<project>/.pi/simple-notify.config.json` | Project-local |

`~` means your home directory, for example `/home/alice`.

### Fields

| Field | Default | Description |
|-------|---------|-------------|
| `bell` | `false` | Write terminal BEL (`\x07`) when notification fires |
| `command` | `"notify-send"` | Program to execute |
| `args` | `["--app-name=Pi", "Pi [{session}]", "{cwd}"]` | Arguments passed to `command` |
| `allowProjectCommand` | `false` | Allow project-local config to override `command` and `args`; only trusted packaged/global config can enable this |

### Template variables

| Variable | Description |
|----------|-------------|
| `{session}` | Current session name or `(unnamed)` |
| `{cwd}` | Current working directory |
| `{configPath}` | Highest-priority existing config file path |

### Examples

Default libnotify setup:

```json
{
  "bell": false,
  "command": "notify-send",
  "args": ["--app-name=Pi", "Pi [{session}]", "{cwd}"],
  "allowProjectCommand": false
}
```

Terminal bell only:

```json
{
  "bell": true,
  "command": "true",
  "args": []
}
```

macOS with `osascript`:

```json
{
  "command": "osascript",
  "args": ["-e", "display notification \"Ready for input — {cwd}\" with title \"Pi [{session}]\""]
}
```

Notification with sound:

```json
{
  "command": "sh",
  "args": ["-c", "notify-send 'Pi [{session}]' 'Done!' && paplay /usr/share/sounds/freedesktop/stereo/bell.oga"]
}
```

Allow a project's `.pi/simple-notify.config.json` to choose the notification command (put this in global config, not project-local config):

```json
{
  "allowProjectCommand": true
}
```

## Usage

Install or load the package. It runs automatically for each Pi session.

For the default configuration on Linux, make sure `notify-send` is available in `$PATH`.

## How it works

The extension subscribes to Pi's `agent_end` event, which fires once per user prompt when the agent loop completes. It optionally writes BEL to stdout, then spawns the configured command as a detached fire-and-forget process.

## Limitations

- The default command requires `notify-send` from `libnotify`.
- Pi does not wait for the notification command to finish.
- Command failures are logged to stderr, not shown in the Pi UI.

## Package layout

```text
.
├── extensions/
│   ├── simple-notify.ts
│   └── simple-notify.config.json
├── LICENSE
├── package.json
└── README.md
```

## License

GPL-3.0-only. See [LICENSE](LICENSE).
