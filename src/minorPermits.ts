// minorPermits.ts
import { PermitFlagService } from "./permitFlagService";
import { db } from "./db";

// Export a singleton instance for minor permits
export const minorPermitsService = new PermitFlagService(db.minorPermits, "minor");
