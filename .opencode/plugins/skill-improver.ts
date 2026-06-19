import type { Plugin } from "@opencode-ai/plugin";
import { isMonitored, getSessionState } from "./skill-improver/monitor.js";
import { extractEpisode } from "./skill-improver/extractor.js";
import { route, loadSkill } from "./skill-improver/router.js";
import { evaluate } from "./skill-improver/evaluator.js";
import { addObservation } from "./skill-improver/store.js";
import { shouldConsolidate, consolidate } from "./skill-improver/consolidator.js";
import { generateCandidate } from "./skill-improver/updater.js";
import { evaluateRegression } from "./skill-improver/regression.js";
import { loadSkillConfig } from "./skill-improver/config.js";

// ============================================================================
// Helpers
// ============================================================================

/** Build monitored sessions list from skill config. */
function buildMonitoredList(): Array<{ title: string; directory: string }> {
  const config = loadSkillConfig();
  const dir = process.cwd();
  const list: Array<{ title: string; directory: string }> = [];

  for (const skill of config.skills) {
    list.push({ title: skill.name, directory: dir });
    for (const trigger of skill.triggers) {
      list.push({ title: trigger, directory: dir });
    }
  }

  return list;
}

// ============================================================================
// Plugin
// ============================================================================

export const SkillImprover: Plugin = async (ctx) => {
  const { client } = ctx;
  const inFlight = new Set<string>();

  /** Structured log via client.app.log(). */
  const log = async (level: "info" | "warn" | "error", message: string): Promise<void> => {
    await client.app.log({
      body: { service: "skill-improver", level, message },
    });
  };

  return {
    event: async ({ event }) => {
      // ── Trigger: session.idle only ────────────────────────────────────
      if (event.type !== "session.idle") return;

      const { sessionID } = event.properties as { sessionID: string };

      // ── Guard: prevent concurrent processing of same session ─────────
      if (inFlight.has(sessionID)) return;
      inFlight.add(sessionID);

      try {
        // ── Guard: skip analysis sessions ───────────────────────────────
        const session = await client.session.get({
          path: { id: sessionID },
          query: { directory: ctx.directory },
        });
        const title = session.data?.title ?? "";

        if (title.startsWith("Skill Improver -")) {
          await log("info", `[${sessionID}] Skipped: analysis session`);
          return;
        }

        // ── Guard: check if session is monitored ───────────────────────
        const monitoredList = buildMonitoredList();
        if (!isMonitored(title, ctx.directory, monitoredList)) {
          return;
        }

        await log("info", `[${sessionID}] Processing: "${title}"`);

        // ── Step 1: Extract new messages (incremental) ──────────────────
        let episode: ReturnType<typeof extractEpisode> extends infer R ? R : never;
        try {
          const msgs = await client.session.messages({
            path: { id: sessionID },
            query: { directory: ctx.directory },
          });
          const state = getSessionState();
          episode = extractEpisode(sessionID, msgs.data ?? [], state);

          if (!episode) {
            await log("info", `[${sessionID}] No new messages, skipping`);
            return;
          }
          await log("info", `[${sessionID}] Extracted ${episode.messages.length} new messages`);
        } catch (err) {
          await log("error", `[${sessionID}] Extract failed: ${err}`);
          return;
        }

        // ── Step 2: Route to skill ──────────────────────────────────────
        let skillId: string | null;
        try {
          skillId = route(episode);
          if (!skillId) {
            await log("info", `[${sessionID}] No matching skill found`);
            return;
          }
          await log("info", `[${sessionID}] Matched skill: ${skillId}`);
        } catch (err) {
          await log("error", `[${sessionID}] Route failed: ${err}`);
          return;
        }

        // ── Step 3: Load skill and evaluate ─────────────────────────────
        let outcome: NonNullable<Awaited<ReturnType<typeof evaluate>>>;
        try {
          const skill = loadSkill(skillId);
          if (!skill) {
            await log("warn", `[${sessionID}] Skill "${skillId}" not found`);
            return;
          }

          const goal = `Evaluate skill "${skill.name}" usage in session "${title}"`;
          const result = await evaluate(episode, skill, goal);
          if (!result) {
            await log("warn", `[${sessionID}] Evaluation returned null`);
            return;
          }
          outcome = result;
          await log(
            "info",
            `[${sessionID}] Evaluation: success=${outcome.successScore.toFixed(2)} failure=${outcome.failureScore.toFixed(2)} novelty=${outcome.noveltyScore.toFixed(2)}`,
          );
        } catch (err) {
          await log("error", `[${sessionID}] Evaluate failed: ${err}`);
          return;
        }

        // ── Step 4: Store observation ───────────────────────────────────
        try {
          addObservation({
            observationId: "",
            skillId,
            sessionId: sessionID,
            episodeId: episode.episodeId,
            failureScore: outcome.failureScore,
            noveltyScore: outcome.noveltyScore,
            summary: outcome.summary,
            suggestedRule: outcome.suggestedRule,
            timestamp: "",
          });
          await log("info", `[${sessionID}] Observation stored for skill "${skillId}"`);
        } catch (err) {
          await log("error", `[${sessionID}] Store failed: ${err}`);
          return;
        }

        // ── Step 5: Check consolidation ─────────────────────────────────
        try {
          if (!shouldConsolidate(skillId)) {
            await log("info", `[${sessionID}] Consolidation threshold not reached for "${skillId}"`);
            return;
          }
          await log("info", `[${sessionID}] Consolidation triggered for "${skillId}"`);
        } catch (err) {
          await log("error", `[${sessionID}] shouldConsolidate failed: ${err}`);
          return;
        }

        // ── Step 6: Consolidate observations ────────────────────────────
        let consolidatedRules: string[];
        try {
          const rules = await consolidate(skillId);
          if (!rules || rules.length === 0) {
            await log("info", `[${sessionID}] Consolidation produced no rules for "${skillId}"`);
            return;
          }
          consolidatedRules = rules;
          await log("info", `[${sessionID}] Consolidated ${consolidatedRules.length} rules for "${skillId}"`);
        } catch (err) {
          await log("error", `[${sessionID}] Consolidate failed: ${err}`);
          return;
        }

        // ── Step 7: Generate candidate ──────────────────────────────────
        let candidate: NonNullable<Awaited<ReturnType<typeof generateCandidate>>>;
        try {
          const result = await generateCandidate(skillId, consolidatedRules);
          if (!result) {
            await log("warn", `[${sessionID}] Candidate generation returned null for "${skillId}"`);
            return;
          }
          candidate = result;
          await log("info", `[${sessionID}] Candidate generated: ${candidate.candidatePath}`);
        } catch (err) {
          await log("error", `[${sessionID}] generateCandidate failed: ${err}`);
          return;
        }

        // ── Step 8: Regression evaluation ───────────────────────────────
        try {
          const regression = await evaluateRegression(skillId, candidate.candidatePath);
          if (!regression) {
            await log("warn", `[${sessionID}] Regression evaluation returned null for "${skillId}"`);
            return;
          }
          await log(
            "info",
            `[${sessionID}] Regression: oldScore=${regression.oldScore.toFixed(2)} newScore=${regression.newScore.toFixed(2)} better=${regression.better}`,
          );

          if (regression.better) {
            await log("info", `[${sessionID}] Candidate improves skill "${skillId}" — ready for review at ${candidate.candidatePath}`);
          } else {
            await log("info", `[${sessionID}] Candidate does NOT improve skill "${skillId}" — keeping current version`);
          }
        } catch (err) {
          await log("error", `[${sessionID}] evaluateRegression failed: ${err}`);
          return;
        }

        await log("info", `[${sessionID}] Pipeline complete for skill "${skillId}"`);
      } catch (err) {
        await log("error", `[${sessionID}] Unexpected error: ${err}`);
      } finally {
        inFlight.delete(sessionID);
      }
    },

    dispose: async () => {
      inFlight.clear();
    },
  };
};
