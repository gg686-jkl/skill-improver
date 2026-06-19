import type { Episode, Skill, SkillConfig } from "./types.js";
import { loadSkillConfig } from "./config.js";
import { readYAML } from "./storage.js";

// ============================================================================
// Keyword-based skill router
// ============================================================================

/**
 * Matches episode messages against skill triggers (case-insensitive).
 * Returns the first matching skillId, or null if no match.
 */
export function route(episode: Episode): string | null {
  const config: SkillConfig = loadSkillConfig();

  for (const skill of config.skills) {
    for (const trigger of skill.triggers) {
      const triggerLower = trigger.toLowerCase();
      for (const message of episode.messages) {
        if (message.toLowerCase().includes(triggerLower)) {
          return skill.id;
        }
      }
    }
  }

  return null;
}

/**
 * Loads a skill definition by ID from the skill config.
 * Reads the YAML file at the skill's configured path and returns
 * a fully populated Skill object, or null if not found.
 */
export function loadSkill(skillId: string): Skill | null {
  const config: SkillConfig = loadSkillConfig();
  const skillEntry = config.skills.find((s) => s.id === skillId);

  if (!skillEntry) {
    return null;
  }

  const yamlData = readYAML<Record<string, unknown>>(skillEntry.path);

  return {
    id: skillEntry.id,
    name: (yamlData.name as string) ?? skillEntry.name,
    path: skillEntry.path,
    triggers: (yamlData.triggers as string[]) ?? skillEntry.triggers,
    rules: (yamlData.rules as string[]) ?? [],
    antiPatterns: (yamlData.antiPatterns as string[]) ?? [],
    examples: (yamlData.examples as string[]) ?? [],
  };
}
