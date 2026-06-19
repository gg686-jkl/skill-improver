// Skill Improver MVP — Session Monitor
// Collects session events and saves on session end.

import * as crypto from "node:crypto";
import { Session, SessionEvent, StorageRepository } from "./types";

export class SessionMonitor {
  private storage: StorageRepository;
  private currentSession: Session | null = null;

  constructor(storage: StorageRepository) {
    this.storage = storage;
  }

  start(): void {
    if (this.currentSession !== null) {
      throw new Error("Session already started. Call end() first.");
    }
    this.currentSession = {
      sessionId: crypto.randomUUID(),
      events: [],
    };
  }

  recordEvent(event: SessionEvent): void {
    if (this.currentSession === null) {
      throw new Error("No active session. Call start() first.");
    }
    this.currentSession.events.push(event);
  }

  end(): string | null {
    if (this.currentSession === null) {
      return null;
    }
    const session = this.currentSession;
    this.currentSession = null;
    this.storage.saveSession(session);
    return session.sessionId;
  }
}