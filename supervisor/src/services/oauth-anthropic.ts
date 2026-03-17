// ============================================================
// ClaudeOS Supervisor - Anthropic OAuth PKCE Service
// ============================================================
// Direct OAuth PKCE flow for Anthropic authentication.
// Bypasses the `claude` CLI entirely. Generates PKCE
// code_verifier/code_challenge (S256), exchanges auth codes
// for tokens, and supports token refresh.
// ============================================================

import { randomBytes, createHash } from "node:crypto";

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";
const REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const SCOPES =
  "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class OAuthAnthropicService {
  private codeVerifier: string | null = null;
  private state: string | null = null;

  /**
   * Generate a PKCE authorize URL.
   * Returns the URL the user should visit and the state parameter.
   */
  generateAuthUrl(): { url: string; state: string } {
    // Generate cryptographic random code_verifier (43-128 chars, base64url)
    this.codeVerifier = base64url(randomBytes(32));

    // S256 code_challenge = BASE64URL(SHA256(code_verifier))
    const codeChallenge = base64url(
      createHash("sha256").update(this.codeVerifier).digest(),
    );

    // Random state for CSRF protection
    this.state = base64url(randomBytes(16));

    const params = new URLSearchParams({
      code: "true",
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state: this.state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const url = `${AUTHORIZE_URL}?${params.toString()}`;
    return { url, state: this.state };
  }

  /**
   * Exchange an authorization code for tokens.
   * Accepts the full code string in the format `{code}#{state}`.
   */
  async exchangeCode(fullCode: string): Promise<OAuthTokenResult> {
    if (!this.codeVerifier) {
      throw new Error("No PKCE session active. Call generateAuthUrl() first.");
    }

    // Split code and state on '#'
    const hashIndex = fullCode.indexOf("#");
    if (hashIndex === -1) {
      throw new Error("Invalid code format. Expected {code}#{state}.");
    }

    const code = fullCode.substring(0, hashIndex);
    const returnedState = fullCode.substring(hashIndex + 1);

    // Validate state matches
    if (returnedState !== this.state) {
      throw new Error("OAuth state mismatch. Possible CSRF attack.");
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: this.codeVerifier,
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Token exchange failed (${response.status}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Clear PKCE session after successful exchange
    this.codeVerifier = null;
    this.state = null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Refresh an expired access token using a refresh token.
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<OAuthTokenResult> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Token refresh failed (${response.status}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }
}
