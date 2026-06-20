import { execSync } from "node:child_process";
import * as path from "node:path";


function debugLog(msg: string): void {
  try {
    const fs = require("node:fs"); const path = require("node:path");
    const p = path.resolve(process.cwd(), "data", "debug.log");
    fs.appendFileSync(p, `[${new Date().toISOString()}] [GIT] ${msg}\n`, "utf-8");
  } catch {}
}

// ============================================================================
// Git operations for skill-improver
// ============================================================================

/**
 * Commit a skill file change to git.
 *
 * @param skillPath - Absolute or relative path to the skill file (e.g., SKILL.md)
 * @param message - Commit message
 * @returns Object with success status and optional error message
 */
export function commitSkillChange(
  skillPath: string,
  message: string
): { success: boolean; error?: string } {
  debugLog("Committing: " + skillPath);
  try {
    // Resolve to absolute path if relative
    const absolutePath = path.isAbsolute(skillPath)
      ? skillPath
      : path.resolve(process.cwd(), skillPath);

    // Stage the file
    execSync(`git add "${absolutePath}"`, {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    // Commit with message
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

/**
 * Check if a path is inside a git repository.
 */
export function isGitRepo(dirPath?: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: dirPath ?? process.cwd(),
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current git branch name.
 */
export function getCurrentBranch(): string | null {
  try {
    const result = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return result.toString().trim();
  } catch {
    return null;
  }
}

/**
 * Check if there are uncommitted changes for a specific file.
 */
export function hasUncommittedChanges(filePath: string): boolean {
  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    const result = execSync(`git status --porcelain "${absolutePath}"`, {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return result.toString().trim().length > 0;
  } catch {
    return false;
  }
}
