import { OAuth2Client } from "google-auth-library";
import { ApiError } from "../http/errors.js";
import type { Identity } from "../domain/types.js";

export interface IdentityVerifier {
  verify(idToken: string): Promise<Identity>;
}

export class GoogleIdentityVerifier implements IdentityVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly audiences: string[]) {
    if (audiences.length === 0) {
      throw new Error("At least one Google OAuth client ID is required.");
    }
  }

  async verify(idToken: string): Promise<Identity> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audiences
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        throw new Error("Missing verified identity claims.");
      }
      return {
        subject: payload.sub,
        email: payload.email.trim().toLowerCase(),
        emailVerified: true,
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.picture ? { picture: payload.picture } : {})
      };
    } catch {
      throw new ApiError({
        status: 401,
        code: "INVALID_ID_TOKEN",
        message: "The Google identity token is invalid, expired, or for a different OAuth client.",
        action: "Sign in with Google again and send the fresh ID token as a Bearer token."
      });
    }
  }
}
