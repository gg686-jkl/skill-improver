import * as fs from "node:fs";
import * as path from "node:path";
import { Session, SkillDefinition, SkillRouter } from "./types";

const SKILLS_PATH = path.resolve(__dirname, "../../config/skills.json");

export class KeywordSkillRouter implements SkillRouter {
  private skills: SkillDefinition[];

  constructor() {
    const raw = fs.readFileSync(SKILLS_PATH, "utf-8");
    this.skills = JSON.parse(raw) as SkillDefinition[];
  }

  route(session: Session): string {
    const userText = session.events
      .filter((e) => e.role === "user")
      .map((e) => e.content)
      .join(" ")
      .toLowerCase();

    if (userText.trim().length === 0) {
      return "general";
    }

    for (const skill of this.skills) {
      for (const trigger of skill.triggers) {
        if (userText.includes(trigger.toLowerCase())) {
          return skill.name;
        }
      }
    }

    return "general";
  }

  getRouterVersion(): string {
    return "1.0.0";
  }
}