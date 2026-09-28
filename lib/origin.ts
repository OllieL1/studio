/**
 * Where Studio lives.
 *
 * One place for the port, because it turns up in the launcher, in the OAuth
 * redirect URIs registered with Google and Spotify, and in the instructions
 * printed on the settings page. Those three have to agree exactly or signing
 * in fails with an error that doesn't say why.
 *
 * `studio.localhost` is a friendlier name than `localhost`, but it only
 * resolves on a machine that has been told about it:
 *
 *   echo "127.0.0.1  studio.localhost" | sudo tee -a /etc/hosts
 *
 * The `.localhost` suffix is load-bearing, not decoration. Safari upgrades a
 * bare name like `studio` to HTTPS even when handed an explicit http:// URL -
 * it sends a TLS ClientHello and then reports that it "cannot establish a
 * secure connection" - but it exempts the `.localhost` domain and speaks plain
 * HTTP to it. Verified on 28 Sep 2026 by watching the first bytes arrive.
 *
 * The launcher checks whether the name resolves and opens whichever works, so
 * the stick still behaves on a borrowed computer.
 */

/** Fixed: the sign-in redirects registered with Google and Spotify point here. */
export const PORT = Number(process.env.PORT) || 3111;

/** The friendly name, when /etc/hosts (or the Windows equivalent) knows it. */
export const HOST_ALIAS = "studio.localhost";

/** Google accepts `localhost` for a loopback redirect. */
export const LOOPBACK_ORIGIN = `http://localhost:${PORT}`;

/** Spotify insists on the literal IP; it rejects `localhost` outright. */
export const SPOTIFY_LOOPBACK_ORIGIN = `http://127.0.0.1:${PORT}`;

export const GOOGLE_REDIRECT_URI = `${LOOPBACK_ORIGIN}/api/google/callback`;
export const SPOTIFY_REDIRECT_URI = `${SPOTIFY_LOOPBACK_ORIGIN}/api/spotify/callback`;
