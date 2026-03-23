# pi-stash

A [pi](https://github.com/badlogic/pi-mono) extension that temporarily stashes the current editor draft with a keyboard shortcut.

## Install

```bash
pi install npm:pi-stash
```

Or from GitHub:

```bash
pi install git:github.com/maxpetretta/pi-stash
```

## Usage

Press `Ctrl+S` while typing a prompt to stash the current editor contents into:

```text
.pi/stash.md
```

When you do that, `pi-stash`:

1. saves the current draft
2. clears the editor
3. waits for your next prompt submission
4. automatically restores the stashed draft into the editor right after that prompt is sent

If the editor is empty, pressing `Ctrl+S` again will immediately restore the pending stashed prompt instead.

This is useful when you want to quickly shelve one prompt, send another one first, and then continue where you left off.

## Notes

On some terminals, `Ctrl+S` is captured by XON/XOFF flow control and freezes terminal output. If that happens, run:

```bash
stty -ixon
```

Then restart your shell or terminal session if needed.

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
