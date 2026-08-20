import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const emails = Array.isArray(body.emails)
      ? body.emails.map((e) => (e || "").toString().trim().toLowerCase()).filter(Boolean)
      : [];
    if (!emails.length) return Response.json({ profiles: {} });

    const srv = base44.asServiceRole;
    const users = await srv.entities.User.filter({ email: { $in: emails } });
    const profiles = {};
    for (const u of users) {
      if (!u.email) continue;
      profiles[u.email.toLowerCase()] = {
        name: u.full_name || "",
        picture: u.profile_picture || "",
      };
    }
    return Response.json({ profiles });
  } catch (error) {
    console.error('getProfiles error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}