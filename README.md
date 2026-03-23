# pi-stash

A [pi](https://github.com/badlogic/pi-mono) extension that temporarily stashes the current editor draft with a keyboard shortcut. Inspired by Claude Code.

## Install

```bash
pi install npm:pi-stash
```

Or from GitHub:

```bash
pi install git:github.com/maxpetretta/pi-stash
```

## Usage

Press `Alt+S` while typing a prompt to stash the current editor contents into:

```text
.pi/stash.md
```

When you do that, `pi-stash`:

1. saves the current draft
2. clears the editor
3. waits for your next prompt submission
4. automatically restores the stashed draft into the editor right after that prompt is sent

If the editor is empty, pressing `Alt+S` again will immediately restore the pending stashed prompt instead.

This is useful when you want to quickly shelve one prompt, send another one first, and then continue where you left off.

### Configuring the shortcut

`pi-stash` reads its shortcut from `~/.pi/agent/keybindings.json` at startup. If `pi-stash.shortcut` is not set, it defaults to `Alt+S`.

Note: `pi-stash.shortcut` is a custom extension-owned key that `pi-stash` reads itself at startup. It is not a built-in pi action id.

Example:

```json
{
  "pi-stash.shortcut": ["ctrl+s"],
  "app.session.toggleSort": ["alt+s"]
}
```

You can also use a single string instead of an array:

```json
{
  "pi-stash.shortcut": "ctrl+s"
}
```

If you remap `pi-stash` to `Ctrl+S`, also rebind pi's built-in session sort toggle off of `Ctrl+S` to avoid the shortcut conflict warning. After editing `keybindings.json`, run `/reload` in pi.

## Development

This package uses Bun for local development.

```bash
bun install
bun run lint
bun run typecheck
bun run test
```

## License

MIT
