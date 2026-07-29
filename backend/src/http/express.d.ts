import type { Identity } from "../domain/types.js";

declare global {
  namespace Express {
    interface Request {
      id: string;
      identity: Identity;
    }
  }
}

export {};
