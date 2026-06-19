import { Episode, SkillDefinition, Outcome, OutcomeEvaluator, EvaluatorConfig } from "./types";

const EVALUATOR_VERSION = "1.0.0";

export class LLMOutcomeEvaluator implements OutcomeEvaluator {
  private config: EvaluatorConfig;

  constructor(config: EvaluatorConfig) {
    this.config = config;
  }

  async evaluate(episode: Episode, skill: SkillDefinition, goal: string): Promise<Outcome> {
    const prompt = this.buildPrompt(episode, skill, goal);
    
    try {
      const result = await this.callLLM(prompt);
      return result;
    } catch (firstError) {
      // Retry once
      try {
        const result = await this.callLLM(prompt);
        return result;
      } catch (secondError) {
        return this.fallbackOutcome(firstError);
      }
    }
  }

  private buildPrompt(episode: Episode, skill: SkillDefinition, goal: string): string {
    const messages = episode.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    return `Analyze this episode.

Goal:
${goal}

Skill:
${skill.name} - ${skill.description}

Episode:
${messages}

Tasks:
1. Was user satisfied? (look for: thanks, accepted, no retry needed)
2. Did agent fail? (look for: repeated ask, user correction, complaint, user had to fix)
3. Any novel learning? (something the skill should know but doesn't)

Output ONLY valid JSON (no markdown, no backticks):
{
  "success_score": 0.0,
  "failure_score": 0.0,
  "novelty_score": 0.0,
  "summary": "brief analysis",
  "suggested_rule": "new rule or empty string"
}`;
  }

  private async callLLM(prompt: string): Promise<Outcome> {
    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = (data as any).choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM response missing content");
    }

    // Parse JSON, stripping any markdown code fences
    const jsonStr = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    this.validateOutcome(parsed);

    return {
      successScore: parsed.success_score,
      failureScore: parsed.failure_score,
      noveltyScore: parsed.novelty_score,
      summary: parsed.summary || "",
      suggestedRule: parsed.suggested_rule || "",
    };
  }

  private validateOutcome(data: any): void {
    const required = ["success_score", "failure_score", "novelty_score", "summary", "suggested_rule"];
    for (const field of required) {
      if (!(field in data)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    // Validate score ranges
    if (typeof data.success_score !== "number" || data.success_score < 0 || data.success_score > 1) {
      throw new Error("success_score must be a number between 0 and 1");
    }
    if (typeof data.failure_score !== "number" || data.failure_score < 0 || data.failure_score > 1) {
      throw new Error("failure_score must be a number between 0 and 1");
    }
    if (typeof data.novelty_score !== "number" || data.novelty_score < 0 || data.novelty_score > 1) {
      throw new Error("novelty_score must be a number between 0 and 1");
    }
  }

  private fallbackOutcome(error: unknown): Outcome {
    const message = error instanceof Error ? error.message : String(error);
    return {
      successScore: 0,
      failureScore: 0,
      noveltyScore: 0,
      summary: `Evaluation failed: ${message}`,
      suggestedRule: "",
    };
  }

  getEvaluatorVersion(): string {
    return EVALUATOR_VERSION;
  }
}
