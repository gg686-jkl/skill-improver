import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import * as fs from "node:fs";
import * as path from "node:path";
import { isMonitored, getSessionState } from "./skill-improver/monitor.js";
import { extractEpisode } from "./skill-improver/extractor.js";
import { route, loadSkill } from "./skill-improver/router.js";
import { evaluate } from "./skill-improver/evaluator.js";
import { addObservation, clearObservations } from "./skill-improver/store.js";
import { shouldConsolidate, consolidate } from "./skill-improver/consolidator.js";
import { generateCandidate } from "./skill-improver/updater.js";
import { evaluateRegression } from "./skill-improver/regression.js";
import { loadSkillConfig } from "./skill-improver/config.js";
import { readJSON, writeJSON } from "./skill-improver/storage.js";
import type { Review } from "./skill-improver/types.js";

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
    tool: {
      skill_improver_approve: tool({
        description: "Approve a skill improvement review. Replaces the old skill file with the candidate, clears observations, and updates review status.",
        args: { reviewId: tool.schema.string() },
        async execute(args) {
          const { reviewId } = args;
          const reviewPath = path.resolve(process.cwd(), "data", "reviews", `${reviewId}.json`);
          const review = readJSON<Review>(reviewPath);

          if (!review || !review.reviewId) {
            return `Error: Review ${reviewId} not found`;
          }

          if (review.status !== "pending") {
            return `Error: Review ${reviewId} is already ${review.status}`;
          }

          // Copy candidate to old skill path
          if (fs.existsSync(review.candidatePath)) {
            fs.copyFileSync(review.candidatePath, review.oldPath);
            fs.unlinkSync(review.candidatePath);
          }

          // Clear observations for the skill
          clearObservations(review.skillId);

          // Update review status
          review.status = "approved";
          writeJSON(reviewPath, review);

          return `Review ${reviewId} approved. Skill ${review.skillId} updated and observations cleared.`;
        },
      }),

      skill_improver_reject: tool({
        description: "Reject a skill improvement review. Deletes the candidate file and updates review status.",
        args: { reviewId: tool.schema.string() },
        async execute(args) {
          const { reviewId } = args;
          const reviewPath = path.resolve(process.cwd(), "data", "reviews", `${reviewId}.json`);
          const review = readJSON<Review>(reviewPath);

          if (!review || !review.reviewId) {
            return `Error: Review ${reviewId} not found`;
          }

          if (review.status !== "pending") {
            return `Error: Review ${reviewId} is already ${review.status}`;
          }

          // Delete candidate file
          if (fs.existsSync(review.candidatePath)) {
            fs.unlinkSync(review.candidatePath);
          }

          // Update review status
          review.status = "rejected";
          writeJSON(reviewPath, review);

          return `Review ${reviewId} rejected. Candidate file deleted.`;
        },
      }),
    },
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
            await log("info", `[${sessionID}] Candidate improves skill "${skillId}" — creating review session`);

            // ── Step 9: Create review session ─────────────────────────
            try {
              const reviewSession = await client.session.create({
                query: { directory: ctx.directory },
                body: { title: `Skill Improver - Review ${skillId}` },
              });
              const sessionId = reviewSession.data?.id;
              if (!sessionId) {
                await log("error", `[${sessionID}] Review session creation returned no ID`);
                return;
              }
              await client.session.prompt({
                path: { id: sessionId },
                query: { directory: ctx.directory },
                body: {
                  parts: [{
                    type: "text",
                    text: `You are reviewing a proposed skill improvement.\n\nReview ID: ${candidate.reviewId}\nSkill: ${skillId}\n\nSummary of changes:\n${candidate.diff}\n\nInstructions:\n1. Explain the change to the user\n2. Show the diff\n3. Ask user to reply \"approve\" or \"reject\"\n4. If user approves, call skill_improver_approve with reviewId=\"${candidate.reviewId}\"\n5. If user rejects, call skill_improver_reject with reviewId=\"${candidate.reviewId}\"\n6. Do NOT run git or edit files yourself`,
                  }],
                },
              });
              await log("info", `[${sessionID}] Review session created: ${sessionId}`);
            } catch (err) {
              await log("error", `[${sessionID}] Review session creation failed: ${err}`);
            }
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
