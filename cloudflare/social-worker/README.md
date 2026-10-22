# Zucify Friends service

This Cloudflare Worker stores friend requests, messages, shared playlists, per-song reactions, and listening-room state. Shared playlist tracks show who added them. Music and Liner accounts remain on the existing Liner API. The Worker checks each request's Liner access token with `/v1/me`; it does not store access or refresh tokens. People become searchable after opening Friends in Zucify once, which registers their public profile in the social directory. Accepted friends can message each other, and playlist access is limited to playlist members.

An existing Liner playlist can be made collaborative from its playlist page. The Worker stores a linked snapshot keyed by the original playlist ID, so songs friends add, their attribution, and reactions show in that same Zucify view. The original playlist continues to belong to its Liner owner; songs added by friends are stored in this Worker collaboration layer and are not written into Liner automatically. The owner can invite accepted friends from the playlist sidebar. Linked playlists support up to 1,000 tracks.

Invited members see the shared playlist in their Zucify Library and open a social-backed playlist view, even when the original Liner playlist is not in their account.

Shared playlists can host playlist parties. Members accept the invite from Friends → Listening together; playback starts at the first song, and any connected member can change tracks or pause. Friends also has open listening parties that accepted friends can join; only the host controls playback in those rooms.

## Deploy to your Cloudflare account

Wrangler must be logged in (`pnpm dlx wrangler login` if needed).

1. For a separate Cloudflare account, create a D1 database with `pnpm social:d1:create` and replace `d1_databases[0].database_id` in `wrangler.jsonc` with its ID. The current Zucify deployment already has its database configured.
2. Apply the schema: `pnpm social:d1:migrate`.
3. Deploy the Worker: `pnpm social:deploy`.
4. Copy the `workers.dev` URL and add it to the app's `.env.local`:

   ```dotenv
   VITE_SOCIAL_API_URL=https://zucify-social.<your-subdomain>.workers.dev
   ```

5. Restart Zucify with `pnpm dev`. Friends must also use a build configured with the same Worker URL.

## Local Worker development

After creating the D1 database and setting its ID, run `pnpm social:dev`. Wrangler uses a local D1 copy by default. Apply the migration locally with:

```powershell
pnpm dlx wrangler d1 migrations apply zucify-social --config cloudflare/social-worker/wrangler.jsonc --local
```

The Worker provides JSON endpoints under `/api/` and a Durable Object WebSocket for each listening room. Leaving a Friends party as host ends that room; playlist-party members can leave independently. The room connection stays active while you use other parts of Zucify; a network disconnect can reconnect for up to one minute. Each device streams its own copy of the audio, and the room syncs track, play/pause, and seek state.
