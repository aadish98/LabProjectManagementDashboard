import { open } from "@tauri-apps/plugin-shell";
import { cancel, onUrl, start } from "@fabianlars/tauri-plugin-oauth";
import type { DesktopAuthPlatform, OAuthRedirectRequest } from "../contracts";

export const tauriAuthPlatform: DesktopAuthPlatform = {
  async waitForOAuthRedirect({
    authorizationUrl,
    port: expectedPort,
    timeoutMs
  }: OAuthRedirectRequest): Promise<string> {
    let activePort: number | null = null;
    let resolveRedirect!: (url: string) => void;
    let rejectRedirect!: (error: Error) => void;
    const redirectPromise = new Promise<string>((resolve, reject) => {
      resolveRedirect = resolve;
      rejectRedirect = reject;
    });
    const timeoutId = window.setTimeout(() => {
      rejectRedirect(new Error("Timed out waiting for Google sign-in to finish."));
    }, timeoutMs);
    const unlisten = await onUrl(resolveRedirect);

    try {
      activePort = await start({ ports: [expectedPort] });
      if (activePort !== expectedPort) {
        throw new Error(`Google sign-in opened on unexpected local port ${activePort}.`);
      }
      await open(authorizationUrl);
      return await redirectPromise;
    } finally {
      window.clearTimeout(timeoutId);
      unlisten();
      if (activePort !== null) {
        await cancel(activePort).catch(() => undefined);
      }
    }
  }
};
