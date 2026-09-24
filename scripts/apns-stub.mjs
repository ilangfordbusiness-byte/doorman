#!/usr/bin/env node
// Local stand-in for the APNs provider API, so the push fan-out in the edge
// functions can be exercised without Apple. Logs every request and answers
// by token prefix:
//   bad0…  -> 400 {"reason":"BadDeviceToken"}   (sender deletes the row)
//   dead…  -> 410 {"reason":"Unregistered"}     (sender deletes the row)
//   slow…  -> 429 {"reason":"TooManyRequests"}  (sender only logs)
//   else   -> 200 with an apns-id header
//
//   node scripts/apns-stub.mjs            # listens on :8788
//   # supabase/functions/.env.local:
//   #   APNS_BASE=http://host.docker.internal:8788   (edge runtime is in Docker)
//   #   APNS_ENV=sandbox APNS_TEAM_ID=TEAMID0000 APNS_KEY_ID=KEYID00000
//   #   APNS_PRIVATE_KEY="$(openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt)"
import http from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.PORT || 8788);
let n = 0;

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    n += 1;
    const token = (req.url || "").split("/3/device/")[1] || "";
    const auth = req.headers.authorization || "";
    console.log(`#${n} ${req.method} ${req.url}`);
    console.log(`   topic=${req.headers["apns-topic"]} type=${req.headers["apns-push-type"]} ` +
      `collapse=${req.headers["apns-collapse-id"] || "-"} jwt=${auth.startsWith("bearer ") ? auth.split(".").length + " parts" : "MISSING"}`);
    console.log(`   ${body}`);
    let status = 200, payload = "";
    if (token.startsWith("bad0")) { status = 400; payload = JSON.stringify({ reason: "BadDeviceToken" }); }
    else if (token.startsWith("dead")) { status = 410; payload = JSON.stringify({ reason: "Unregistered", timestamp: Date.now() }); }
    else if (token.startsWith("slow")) { status = 429; payload = JSON.stringify({ reason: "TooManyRequests" }); }
    res.writeHead(status, { "apns-id": randomUUID(), "content-type": "application/json" });
    res.end(payload);
  });
}).listen(port, () => console.log(`APNs stub listening on http://127.0.0.1:${port}`));
