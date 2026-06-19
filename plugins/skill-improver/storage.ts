import * as fs from "fs";
import * as path from "path";
import { Session, Observation, StorageRepository } from "./types";

const DATA_DIR = path.resolve(__dirname, "../../data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const OBSERVATIONS_DIR = path.join(DATA_DIR, "observations");

export class JsonStorageRepository implements StorageRepository {
  constructor() {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    if (!fs.existsSync(OBSERVATIONS_DIR)) {
      fs.mkdirSync(OBSERVATIONS_DIR, { recursive: true });
    }
  }

  saveSession(session: Session): void {
    const filePath = path.join(SESSIONS_DIR, `${session.sessionId}.json`);
    const tmpPath = filePath + ".tmp";
    const json = JSON.stringify(session, null, 2);
    fs.writeFileSync(tmpPath, json, "utf-8");
    fs.renameSync(tmpPath, filePath);
  }

  getSession(sessionId: string): Session | null {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const json = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(json) as Session;
  }

  saveObservation(observation: Observation): void {
    const filePath = path.join(OBSERVATIONS_DIR, `${observation.skillId}.json`);
    const tmpPath = filePath + ".tmp";

    let observations: Observation[] = [];
    if (fs.existsSync(filePath)) {
      const json = fs.readFileSync(filePath, "utf-8");
      observations = JSON.parse(json) as Observation[];
    }

    observations.push(observation);
    const json = JSON.stringify(observations, null, 2);
    fs.writeFileSync(tmpPath, json, "utf-8");
    fs.renameSync(tmpPath, filePath);
  }

  getObservations(skillId: string): Observation[] {
    const filePath = path.join(OBSERVATIONS_DIR, `${skillId}.json`);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const json = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(json) as Observation[];
  }
}