// majorPermits.ts
import { PermitFlagService } from "./permitFlagService";
import { db } from "./db";

// Export a singleton instance for major permits
export const majorPermitsService = new PermitFlagService(db.majorPermits, "major");
