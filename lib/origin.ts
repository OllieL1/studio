/**
 * Where Studio lives.
 *
 * One place for the port, because it turns up in the launcher, in the OAuth
 * redirect URIs registered with Google and Spotify, and in the instructions
 * printed on the settings page. Those three have to agree exactly or signing
 * in fails with an error that doesn't say why.
 *
 * `studio` is a friendlier name than `localhost`, but it only resolves on a
 * machine that has been told about it:
 *
 *   echo "127.0.0.1  studio" | sudo tee -a /etc/hosts
 *
 * The launcher checks whether it resolves and opens whichever name works, so
 * the stick still behaves on a borrowed computer.
 */

/** Fixed: the sign-in redirects registered with Google and Spotify point here. */
export const PORT = Number(process.env.PORT) || 3111;

/** The friendly name, when /etc/hosts (or the Windows equivalent) knows it. */
export const HOST_ALIAS = "studio";

/** Google accepts `localhost` for a loopback redirect. */
export const LOOPBACK_ORIGIN = `http://localhost:${PORT}`;

/** Spotify insists on the literal IP; it rejects `localhost` outright. */
export const SPOTIFY_LOOPBACK_ORIGIN = `http://127.0.0.1:${PORT}`;

export const GOOGLE_REDIRECT_URI = `${LOOPBACK_ORIGIN}/api/google/callback`;
export const SPOTIFY_REDIRECT_URI = `${SPOTIFY_LOOPBACK_ORIGIN}/api/spotify/callback`;
