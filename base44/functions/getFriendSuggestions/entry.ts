import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Returns suggested users (everyone on the app the current user isn't already
// friends with or pending a request with), ranked by mutual-friend count desc.
//
// Pagination is server-side: the client requests 20 at a time via `offset`.
//
// Mutual counts are computed efficiently with a friends-of-friends traversal
// (for each of my friends, their friends are candidates; each shared friend
// increments the count) rather than scanning every user's friend list. The
// remaining cost is fetching all users + all accepted friend requests per call,
// which is fine at current scale but should be precomputed (a denormalized
// mutual-count cache refreshed on friendship changes, or a nightly batch) as
// the user base grows.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const offset = Math.max(0, Number(body.offset || 0));
    const limit = Math.min(100, Math.max(1, Number(body.limit || 20)));
    const myEmail = String(user.email || '').toLowerCase();

    // 1. My friends (accepted) + pending requests involving me (to exclude).
    const [sent, received] = await Promise.all([
      base44.asServiceRole.entities.FriendRequest.filter({ sender_email: myEmail }),
      base44.asServiceRole.entities.FriendRequest.filter({ receiver_email: myEmail }),
    ]);
    const friends = new Set();
    const pending = new Set();
    for (const r of sent) {
      const e = String(r.receiver_email || '').toLowerCase();
      if (!e) continue;
      if (r.status === 'accepted') friends.add(e);
      else if (r.status === 'pending') pending.add(e);
    }
    for (const r of received) {
      const e = String(r.sender_email || '').toLowerCase();
      if (!e) continue;
      if (r.status === 'accepted') friends.add(e);
      else if (r.status === 'pending') pending.add(e);
    }

    // 2. Build the full friendship graph from ALL accepted friend requests.
    const graph = new Map(); // email -> Set(friendEmails)
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.FriendRequest.filter(
        { status: 'accepted' }, '-created_date', 5000, skip
      );
      if (!batch.length) break;
      for (const r of batch) {
        const a = String(r.sender_email || '').toLowerCase();
        const b = String(r.receiver_email || '').toLowerCase();
        if (!a || !b || a === b) continue;
        if (!graph.has(a)) graph.set(a, new Set());
        if (!graph.has(b)) graph.set(b, new Set());
        graph.get(a).add(b);
        graph.get(b).add(a);
      }
      skip += batch.length;
      if (batch.length < 5000) break;
    }

    // 3. Mutual counts via friends-of-friends.
    const mutualMap = new Map();
    for (const f of friends) {
      const fFriends = graph.get(f);
      if (!fFriends) continue;
      for (const g of fFriends) {
        if (g === myEmail || friends.has(g)) continue;
        mutualMap.set(g, (mutualMap.get(g) || 0) + 1);
      }
    }

    // 4. All users -> candidate list (exclude self, friends, pending).
    const candidates = [];
    let uskip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.User.list('-created_date', 5000, uskip);
      if (!batch.length) break;
      for (const u of batch) {
        const email = String(u.email || '').toLowerCase();
        if (!email) continue;
        if (email === myEmail) continue;
        if (friends.has(email)) continue;
        if (pending.has(email)) continue;
        candidates.push({
          email,
          full_name: u.full_name || email,
          profile_picture: u.profile_picture || '',
          mutual: mutualMap.get(email) || 0,
        });
      }
      uskip += batch.length;
      if (batch.length < 5000) break;
    }

    // 5. Sort by mutual desc, then name asc (consistent tiebreaker).
    candidates.sort(
      (a, b) => b.mutual - a.mutual || String(a.full_name).localeCompare(String(b.full_name))
    );

    const total = candidates.length;
    const start = Math.min(offset, total);
    const end = Math.min(start + limit, total);
    const items = candidates.slice(start, end);

    return Response.json({ items, total, hasMore: end < total, offset: start });
  } catch (error) {
    console.log('getFriendSuggestions error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});