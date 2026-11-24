import "server-only";

/**
 * Entry point for other server code (T10: right after `complete_onboarding`):
 * `seedDefaultCategories(db: Db, weddingId?: string): Promise<void>`, run with the user's session.
 */
export { seedDefaultCategories } from "./data";
export type { Db } from "./data";
