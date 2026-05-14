# Pi Simple Notify

A [Pi](https://github.com/badlogic/pi-mono) extension that sends a notification when the agent finishes processing and is waiting for user input. Useful when you switch away from the terminal while Pi is working on a long task.

## Installation

```bash
# Option 1: install as a Pi package
pi install ./pi-simple-notify

# Option 2: install from git
pi install git:github.com/punzik/pi-simple-notify

# Option 3: try without installing
pi -e ./pi-simple-notify

# Option 4: symlink into Pi's extensions directory
ln -s "$(pwd)/extensions/simple-notify.ts" ~/.pi/agent/extensions/simple-notify.ts
```

## Configuration

The extension loads settings from JSON config files. Project-local config overrides global config, and invalid fields are ignored.

Because config files are merged, the `{configPath}` template variable points to the highest-priority existing config file used for the current notification: project-local, then global, then packaged defaults.

| Path | Scope |
|------|-------|
| `extensions/simple-notify.config.json` | Packaged defaults, next to the shipped extension file |
| `~/.pi/agent/simple-notify.config.json` | Global (all projects) |
| `<project>/.pi/simple-notify.config.json` | Project-local |

`~` means your home directory, for example `/home/alice`.

If no user config file exists, the defaults from [`simple-notify.config.json`](extensions/simple-notify.config.json) are used.

### Fields

| Field | Default | Description |
|-------|---------|-------------|
| `command` | `"notify-send"` | Program to execute |
| `args` | `["--app-name=Pi", "Pi [{session}]", "Done — {cwd}"]` | Arguments. `{session}`, `{cwd}`, and `{configPath}` are replaced with actual values |

### Template variables

| Variable | Description |
|----------|-------------|
| `{session}` | Current session name or `(unnamed)` |
| `{cwd}` | Current working directory |
| `{configPath}` | Highest-priority existing config file path |

### Examples

**Default (libnotify):**

```json
{
  "command": "notify-send",
  "args": ["--app-name=Pi", "Pi [{session}]", "Done — {cwd}"]
}
```

**macOS (`osascript`):**

```json
{
  "command": "osascript",
  "args": ["-e", "display notification \"Ready for input — {cwd}\" with title \"Pi [{session}]\""]
}
```

**With sound:**

```json
{
  "command": "sh",
  "args": ["-c", "notify-send 'Pi [{session}]' 'Done!' && paplay /usr/share/sounds/freedesktop/stereo/bell.oga"]
}
```

## How it works

The extension subscribes to Pi's `agent_end` event, which fires once per user prompt when the agent loop completes. It spawns the configured command as a detached, fire-and-forget process so Pi is never blocked waiting for it.

## Requirements

- **Linux with `notify-send`** (from `libnotify`) — default setup
- Or any custom notification command available in `$PATH`
