# Rideout – backend + app

One Node.js server (no npm install, Node 18+) that serves the app and a JSON API. Anyone can create an account – no Claude account needed.

## Run locally
    node server.js        # http://localhost:3000

Data is saved in ./data (db.json + uploads/). Back this folder up.
Env vars: PORT, DATA_DIR.

## Put it live
Any host that runs Node works. Two things matter: use the start command `node server.js`, and give it a **persistent disk** (otherwise accounts and photos vanish on restart).

- **Render:** New Web Service from your repo, start command `node server.js`, add a Disk mounted at `/data`, set env `DATA_DIR=/data`. HTTPS is automatic. (Disks need a paid instance.)
- **Railway / Fly.io:** same idea – attach a volume, point `DATA_DIR` at it.
- **VPS:** `DATA_DIR=/var/rideout PORT=3000 node server.js` behind Caddy or nginx for HTTPS, kept alive with pm2 or systemd.

Always serve over HTTPS: passwords and sign-in tokens travel with each request.

## Limits
Single server, JSON-file storage: fine for a riding community of hundreds. Past that, move storage to Postgres/SQLite.
