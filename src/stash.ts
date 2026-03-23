import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"

export const STASH_FILE = path.join(".pi", "stash.md")

export function getPendingStashPath(cwd: string): string {
  return path.join(cwd, STASH_FILE)
}

export async function savePendingStash(cwd: string, text: string): Promise<string> {
  const stashPath = getPendingStashPath(cwd)
  await mkdir(path.dirname(stashPath), { recursive: true })
  await writeFile(stashPath, text, "utf8")
  return stashPath
}

export async function popPendingStash(cwd: string): Promise<string | null> {
  const stashPath = getPendingStashPath(cwd)

  try {
    const text = await readFile(stashPath, "utf8")
    await rm(stashPath, { force: true })
    return text
  } catch {
    return null
  }
}

type NotifyType = "info" | "warning" | "error" | "success"

type ShortcutContext = {
  cwd?: string
  ui: {
    getEditorText(): string
    setEditorText(text: string): void
    notify(message: string, type?: NotifyType): void
  }
}

function getCwd(cwd?: string): string {
  return cwd || process.cwd()
}

export default function stashExtension(pi: ExtensionAPI) {
  let armed = false

  async function restorePendingStash(ctx: ShortcutContext, notifyOnMissing: boolean): Promise<void> {
    const stashedPrompt = await popPendingStash(getCwd(ctx.cwd))

    if (stashedPrompt === null) {
      if (notifyOnMissing) {
        ctx.ui.notify("The editor is empty and there is no pending stash to restore.", "warning")
      }
      return
    }

    ctx.ui.setEditorText(stashedPrompt)
    ctx.ui.notify("Restored stashed prompt to the editor.", "info")
  }

  pi.registerShortcut("ctrl+s", {
    description: "Stash the current prompt, or restore a pending stash when the editor is empty",
    handler: async (ctx) => {
      const cwd = getCwd(ctx.cwd)
      const editorText = ctx.ui.getEditorText()

      if (editorText.trim().length === 0) {
        armed = false
        await restorePendingStash(ctx, true)
        return
      }

      const stashPath = await savePendingStash(cwd, editorText)
      armed = false
      ctx.ui.setEditorText("")
      ctx.ui.notify(
        `Stashed current prompt to ${path.relative(cwd, stashPath)}. It will return after the next prompt is sent.`,
        "info",
      )
    },
  })

  pi.on("input", async (event, ctx) => {
    if (event.source === "interactive") {
      try {
        await access(getPendingStashPath(getCwd(ctx.cwd)))
        armed = true
      } catch {
        armed = false
      }
    }

    return { action: "continue" as const }
  })

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!armed) {
      return
    }

    armed = false
    await restorePendingStash(ctx, false)
  })
}
