import { afterEach, expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import stashExtension, {
  DEFAULT_SHORTCUT,
  getPendingStashPath,
  popPendingStash,
  readShortcutFromKeybindings,
  resolveShortcut,
  SHORTCUT_KEYBINDING_ID,
  savePendingStash,
} from "./stash.ts"

type NotifyType = "info" | "warning" | "error" | "success"

type Notification = {
  message: string
  type?: NotifyType
}

type TestContext = {
  cwd?: string
  ui: {
    getEditorText(): string
    setEditorText(text: string): void
    notify(message: string, type?: NotifyType): void
  }
}

type InputEvent = {
  source: "interactive" | "rpc" | "extension"
}

type ContinueResult = {
  action: "continue"
}

type ShortcutHandler = (ctx: TestContext) => Promise<void>
type InputHandler = (event: InputEvent, ctx: TestContext) => Promise<ContinueResult>
type BeforeAgentStartHandler = (event: unknown, ctx: TestContext) => Promise<void>

type Harness = {
  registeredShortcut: string
  shortcut: ShortcutHandler
  input: InputHandler
  beforeAgentStart: BeforeAgentStartHandler
}

const originalCwd = process.cwd()
const originalHome = process.env.HOME

afterEach(async () => {
  process.chdir(originalCwd)
  await rm(path.join(originalCwd, ".pi", "stash.md"), { force: true })

  if (originalHome === undefined) {
    process.env.HOME = undefined
  } else {
    process.env.HOME = originalHome
  }
})

function createHarness(): Harness {
  let registeredShortcut: string | undefined
  let shortcut: ShortcutHandler | undefined
  let input: InputHandler | undefined
  let beforeAgentStart: BeforeAgentStartHandler | undefined

  const pi = {
    registerShortcut(shortcutKey: string, options: { description: string; handler: ShortcutHandler }) {
      registeredShortcut = shortcutKey
      shortcut = options.handler
    },
    on(event: string, handler: unknown) {
      if (event === "input") {
        input = handler as InputHandler
        return
      }

      if (event === "before_agent_start") {
        beforeAgentStart = handler as BeforeAgentStartHandler
        return
      }

      throw new Error(`Unexpected event registration: ${event}`)
    },
  } as unknown as ExtensionAPI

  stashExtension(pi)

  if (!(registeredShortcut && shortcut && input && beforeAgentStart)) {
    throw new Error("Extension did not register all expected handlers")
  }

  return { registeredShortcut, shortcut, input, beforeAgentStart }
}

function createContext(
  initialText: string,
  cwd?: string,
): {
  ctx: TestContext
  notifications: Notification[]
  getEditorText(): string
} {
  let editorText = initialText
  const notifications: Notification[] = []

  const ctx: TestContext = {
    ui: {
      getEditorText: () => editorText,
      setEditorText: (text: string) => {
        editorText = text
      },
      notify: (message: string, type?: NotifyType) => {
        notifications.push(type === undefined ? { message } : { message, type })
      },
    },
  }

  if (cwd !== undefined) {
    ctx.cwd = cwd
  }

  return {
    ctx,
    notifications,
    getEditorText: () => editorText,
  }
}

async function writeKeybindings(homeDir: string, content: unknown): Promise<string> {
  const keybindingsPath = path.join(homeDir, ".pi", "agent", "keybindings.json")
  await mkdir(path.dirname(keybindingsPath), { recursive: true })
  await writeFile(keybindingsPath, JSON.stringify(content, null, 2), "utf8")
  return keybindingsPath
}

test("getPendingStashPath stores the stash at .pi/stash.md", () => {
  expect(getPendingStashPath("/tmp/project")).toBe("/tmp/project/.pi/stash.md")
})

test("resolveShortcut uses alt+s by default", () => {
  expect(resolveShortcut("/tmp/does-not-exist.json")).toBe(DEFAULT_SHORTCUT)
})

test("readShortcutFromKeybindings reads a string shortcut", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "pi-stash-home-"))

  try {
    const keybindingsPath = await writeKeybindings(tempHome, {
      [SHORTCUT_KEYBINDING_ID]: "ctrl+s",
    })

    expect(readShortcutFromKeybindings(keybindingsPath)).toBe("ctrl+s")
    expect(resolveShortcut(keybindingsPath)).toBe("ctrl+s")
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

test("readShortcutFromKeybindings reads the first shortcut from an array", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "pi-stash-home-"))

  try {
    const keybindingsPath = await writeKeybindings(tempHome, {
      [SHORTCUT_KEYBINDING_ID]: ["ctrl+s", "alt+s"],
    })

    expect(readShortcutFromKeybindings(keybindingsPath)).toBe("ctrl+s")
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

test("readShortcutFromKeybindings ignores invalid values", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "pi-stash-home-"))

  try {
    const keybindingsPath = await writeKeybindings(tempHome, {
      [SHORTCUT_KEYBINDING_ID]: [123, "", null],
    })

    expect(readShortcutFromKeybindings(keybindingsPath)).toBeNull()
    expect(resolveShortcut(keybindingsPath)).toBe(DEFAULT_SHORTCUT)
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

test("extension registers alt+s by default", () => {
  const harness = createHarness()
  expect(harness.registeredShortcut).toBe(DEFAULT_SHORTCUT)
})

test("extension registers the configured shortcut from keybindings.json", async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), "pi-stash-home-"))

  try {
    process.env.HOME = tempHome
    await writeKeybindings(tempHome, {
      [SHORTCUT_KEYBINDING_ID]: "ctrl+s",
    })

    const harness = createHarness()
    expect(harness.registeredShortcut).toBe("ctrl+s")
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
})

test("savePendingStash writes the current draft", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-stash-"))

  try {
    await savePendingStash(tempRoot, "draft text")
    const stashPath = path.join(tempRoot, ".pi", "stash.md")
    expect(await readFile(stashPath, "utf8")).toBe("draft text")
    await expect(access(stashPath)).resolves.toBeNull()
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("popPendingStash returns the draft and deletes the stash file", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-stash-"))

  try {
    await savePendingStash(tempRoot, "draft text")
    const stashPath = path.join(tempRoot, ".pi", "stash.md")
    expect(await popPendingStash(tempRoot)).toBe("draft text")
    await expect(access(stashPath)).rejects.toBeDefined()
    expect(await popPendingStash(tempRoot)).toBeNull()
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("shortcut stashes the current editor text and clears the editor", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-stash-"))
  const harness = createHarness()
  const { ctx, notifications, getEditorText } = createContext("draft text", tempRoot)

  try {
    await harness.shortcut(ctx)

    expect(getEditorText()).toBe("")
    expect(await readFile(path.join(tempRoot, ".pi", "stash.md"), "utf8")).toBe("draft text")
    expect(notifications).toEqual([
      {
        message: "Stashed prompt (auto-restores after submit)",
        type: "info",
      },
    ])
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("shortcut restores a pending stash when the editor is empty", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-stash-"))
  const harness = createHarness()
  const { ctx, notifications, getEditorText } = createContext("", tempRoot)

  try {
    await savePendingStash(tempRoot, "draft text")
    await harness.shortcut(ctx)

    expect(getEditorText()).toBe("draft text")
    expect(notifications).toEqual([{ message: "Restored stashed prompt to the editor", type: "info" }])
    await expect(access(path.join(tempRoot, ".pi", "stash.md"))).rejects.toBeDefined()
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("shortcut warns when the editor is empty and nothing is stashed", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-stash-"))
  const harness = createHarness()
  const { ctx, notifications, getEditorText } = createContext("", tempRoot)

  try {
    await harness.shortcut(ctx)

    expect(getEditorText()).toBe("")
    expect(notifications).toEqual([{ message: "Both the editor and stash are empty", type: "warning" }])
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("interactive input arms auto-restore and before_agent_start restores the stash", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-stash-"))
  const harness = createHarness()
  const { ctx, notifications, getEditorText } = createContext("", tempRoot)

  try {
    await savePendingStash(tempRoot, "draft text")

    await expect(harness.input({ source: "interactive" }, ctx)).resolves.toEqual({ action: "continue" })
    await harness.beforeAgentStart({}, ctx)

    expect(getEditorText()).toBe("draft text")
    expect(notifications).toEqual([{ message: "Restored stashed prompt to the editor", type: "info" }])
    await expect(access(path.join(tempRoot, ".pi", "stash.md"))).rejects.toBeDefined()
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("interactive input disarms auto-restore when no stash exists", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-stash-"))
  const harness = createHarness()
  const { ctx, notifications, getEditorText } = createContext("", tempRoot)

  try {
    await expect(harness.input({ source: "interactive" }, ctx)).resolves.toEqual({ action: "continue" })
    await harness.beforeAgentStart({}, ctx)

    expect(getEditorText()).toBe("")
    expect(notifications).toEqual([])
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("non-interactive input leaves auto-restore disarmed", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-stash-"))
  const harness = createHarness()
  const { ctx, notifications, getEditorText } = createContext("", tempRoot)

  try {
    await savePendingStash(tempRoot, "draft text")

    await expect(harness.input({ source: "rpc" }, ctx)).resolves.toEqual({ action: "continue" })
    await harness.beforeAgentStart({}, ctx)

    expect(getEditorText()).toBe("")
    expect(notifications).toEqual([])
    expect(await readFile(path.join(tempRoot, ".pi", "stash.md"), "utf8")).toBe("draft text")
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("before_agent_start quietly skips restore when armed but stash is already gone", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-stash-"))
  const harness = createHarness()
  const { ctx, notifications, getEditorText } = createContext("", tempRoot)

  try {
    await savePendingStash(tempRoot, "draft text")
    await harness.input({ source: "interactive" }, ctx)
    await expect(popPendingStash(tempRoot)).resolves.toBe("draft text")

    await harness.beforeAgentStart({}, ctx)

    expect(getEditorText()).toBe("")
    expect(notifications).toEqual([])
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("extension falls back to process.cwd when ctx.cwd is missing", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-stash-"))
  const harness = createHarness()
  const { ctx, notifications, getEditorText } = createContext("draft text")

  try {
    process.chdir(tempRoot)
    await harness.shortcut(ctx)

    expect(getEditorText()).toBe("")
    expect(await readFile(path.join(tempRoot, ".pi", "stash.md"), "utf8")).toBe("draft text")
    expect(notifications).toEqual([
      {
        message: "Stashed prompt (auto-restores after submit)",
        type: "info",
      },
    ])
  } finally {
    process.chdir(originalCwd)
    await rm(tempRoot, { recursive: true, force: true })
  }
})
