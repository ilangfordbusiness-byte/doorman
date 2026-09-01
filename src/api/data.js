// DoorMan data layer (entities.filter/create/update/subscribe, auth.me,
// functions.invoke, Core.UploadFile) implemented on Supabase. All schema
// translation lives here — pages keep speaking the legacy field names
// (cover_image, host_email, price, sender_name, ...) while the database
// speaks the new ones (cover_image_url, host_id, price_minor, joins).
import { supabase } from "./client";
import { normalizePhone } from "@/lib/phone";

// ---------------------------------------------------------------------------
// Session + lookups
// ---------------------------------------------------------------------------
let cachedUid = null;

async function uid() {
  if (cachedUid) return cachedUid;
  const { data } = await supabase.auth.getSession();
  cachedUid = data.session?.user?.id ?? null;
  return cachedUid;
}

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUid = session?.user?.id ?? null;
  emailToId.clear();
});

const emailToId = new Map();

async function resolveUserId(email) {
  if (!email) return null;
  const key = String(email).toLowerCase();
  if (emailToId.has(key)) return emailToId.get(key);
  const { data } = await supabase
    .from("profiles").select("id").eq("email", key).maybeSingle();
  const id = data?.id ?? null;
  if (id) emailToId.set(key, id);
  return id;
}

const minorToMajor = (m) => (m == null ? m : Number(m) / 100);
const hhmm = (t) => (typeof t === "string" ? t.slice(0, 5) : t);
const throwOn = (error) => {
  if (error) throw new Error(error.message || String(error));
};

// ---------------------------------------------------------------------------
// Entity definitions: select shape, old<->new mapping, filter-key translation
// ---------------------------------------------------------------------------
const PROFILE_JOIN = "email, full_name, avatar_url";

const ENTITIES = {
  Event: {
    table: "events",
    select: `id, host_id, business_id, title, cover_image_url, date, start_time,
      end_time, venue_name, address, venue_lat, venue_lng, dress_code,
      description, entry_notes, instagram, is_public, discoverable, capacity,
      requests_open, plus_one_allowed, status, is_paid, currency, fee_mode,
      visibility, created_at, updated_at,
      host:profiles!events_host_id_fkey(${PROFILE_JOIN}),
      co_host_rows:event_co_hosts(id, email, status, user_id,
        profile:profiles(full_name, avatar_url))`,
    toApp(r) {
      const coHosts = (r.co_host_rows ?? []).map((c) => ({
        email: c.email,
        name: c.profile?.full_name || c.email,
        picture: c.profile?.avatar_url || "",
        status: c.status,
      }));
      return {
        ...base(r),
        title: r.title,
        cover_image: r.cover_image_url,
        date: r.date,
        start_time: hhmm(r.start_time),
        end_time: hhmm(r.end_time),
        venue_name: r.venue_name,
        address: r.address,
        venue_lat: r.venue_lat,
        venue_lng: r.venue_lng,
        dress_code: r.dress_code,
        description: r.description,
        entry_notes: r.entry_notes,
        instagram: r.instagram,
        is_public: r.is_public,
        discoverable: r.discoverable,
        capacity: r.capacity,
        requests_open: r.requests_open,
        plus_one_allowed: r.plus_one_allowed,
        status: r.status,
        is_paid: r.is_paid,
        currency: r.currency,
        fee_mode: r.fee_mode,
        visibility: r.visibility,
        business_id: r.business_id,
        host_id: r.host_id,
        host_email: r.host?.email ?? null,
        host_name: r.host?.full_name ?? "",
        host_picture: r.host?.avatar_url ?? "",
        host_is_business: false,
        co_hosts: coHosts,
        co_host_emails: coHosts.filter((c) => c.status === "accepted").map((c) => c.email),
      };
    },
    async fromApp(obj, isCreate) {
      const out = {};
      const copy = [
        "title", "date", "venue_name", "address", "venue_lat", "venue_lng",
        "dress_code", "description", "entry_notes", "host_notes", "instagram",
        "is_public", "discoverable", "capacity", "requests_open",
        "plus_one_allowed", "status", "is_paid", "currency", "fee_mode",
        "visibility", "business_id",
      ];
      for (const k of copy) if (k in obj) out[k] = obj[k];
      // The legacy platform tolerated "" in typed columns; Postgres uuid/numeric/date do not.
      for (const k of ["business_id", "venue_lat", "venue_lng", "capacity", "date"]) {
        if (out[k] === "") out[k] = null;
      }
      if ("cover_image" in obj) out.cover_image_url = obj.cover_image;
      if ("start_time" in obj) out.start_time = obj.start_time;
      if ("end_time" in obj) out.end_time = obj.end_time || null;
      if (isCreate) out.host_id = (await resolveUserId(obj.host_email)) ?? (await uid());
      return out;
    },
    // co_hosts array updates are synced to the event_co_hosts table.
    async afterWrite(eventId, obj) {
      if (!("co_hosts" in obj)) return;
      const wanted = (obj.co_hosts ?? []).filter((c) => c?.email);
      const { data: existing } = await supabase
        .from("event_co_hosts").select("id, email").eq("event_id", eventId);
      const wantedEmails = new Set(wanted.map((c) => c.email.toLowerCase()));
      const existingByEmail = new Map(
        (existing ?? []).map((c) => [c.email.toLowerCase(), c]),
      );
      const toDelete = (existing ?? []).filter((c) => !wantedEmails.has(c.email.toLowerCase()));
      if (toDelete.length) {
        await supabase.from("event_co_hosts").delete()
          .in("id", toDelete.map((c) => c.id));
      }
      for (const c of wanted) {
        if (!existingByEmail.has(c.email.toLowerCase())) {
          await supabase.from("event_co_hosts").insert({
            event_id: eventId,
            email: c.email.toLowerCase(),
            user_id: await resolveUserId(c.email),
            status: c.status || "pending",
          });
        }
      }
    },
    async filterKey(key, value) {
      if (key === "host_email") return ["host_id", await resolveUserId(value)];
      return [key, value];
    },
    // Managers additionally get invite_code / staff_code / host_notes.
    async enrich(rows) {
      // Business-hosted events show the business's name + picture as the host.
      // business_accounts is owner-only, so read the safe display fields from
      // the business_public view (works for guests and anon too).
      const bizIds = [...new Set(rows.filter((r) => r.business_id).map((r) => r.business_id))];
      if (bizIds.length) {
        const { data: bz } = await supabase
          .from("business_public")
          .select("id, business_name, business_picture_url")
          .in("id", bizIds);
        const m = new Map((bz ?? []).map((b) => [b.id, b]));
        rows = rows.map((r) => {
          const b = r.business_id && m.get(r.business_id);
          return b
            ? { ...r, host_name: b.business_name, host_picture: b.business_picture_url || "", host_is_business: true }
            : r;
        });
      }

      const me = await uid();
      if (!me) return rows;
      const { data: myEmailRow } = await supabase
        .from("profiles").select("email").eq("id", me).maybeSingle();
      const myEmail = myEmailRow?.email?.toLowerCase();
      return Promise.all(rows.map(async (ev) => {
        const isManager = ev.host_id === me ||
          (ev.co_host_emails ?? []).some((e) => e.toLowerCase() === myEmail);
        if (!isManager) return ev;
        const { data, error } = await supabase.rpc("get_event_private", {
          p_event_id: ev.id,
        });
        if (error || !data?.length) return ev;
        return { ...ev, ...data[0] };
      }));
    },
  },

  GuestlistEntry: {
    table: "guestlist_entries",
    readTable: "guestlist_entries_view",
    select: "*",
    // Spread the whole row: pages consume nearly every column of the view.
    toApp: (r) => ({ ...r, ...base(r) }),
    async fromApp(obj, isCreate) {
      const out = {};
      const copy = [
        "event_id", "guest_email", "guest_name", "guest_phone", "status",
        "source", "plus_one", "plus_one_name", "can_chat", "checked_in_at",
        "checked_out_at", "notes",
      ];
      for (const k of copy) if (k in obj) out[k] = obj[k];
      if (out.guest_email) out.guest_email = String(out.guest_email).toLowerCase();
      if (out.guest_phone) out.guest_phone = normalizePhone(out.guest_phone);
      if ("checked_in_by" in obj) out.checked_in_by = await uid();
      if (isCreate) {
        out.created_by = await uid();
        if (out.guest_email) out.guest_user_id = await resolveUserId(out.guest_email);
      }
      return out;
    },
  },

  EventStaff: {
    table: "event_staff",
    select: "*",
    toApp: (r) => ({
      ...base(r),
      event_id: r.event_id,
      staff_email: r.email,
      staff_phone: r.phone,
      staff_name: r.name,
      role: r.role,
      user_id: r.user_id,
    }),
    async fromApp(obj, isCreate) {
      const out = {};
      if ("event_id" in obj) out.event_id = obj.event_id;
      if ("staff_email" in obj) out.email = obj.staff_email ? String(obj.staff_email).toLowerCase() : null;
      if ("staff_phone" in obj) out.phone = obj.staff_phone ? normalizePhone(obj.staff_phone) : null;
      if ("staff_name" in obj) out.name = obj.staff_name;
      if ("role" in obj) out.role = obj.role;
      if (isCreate) {
        out.created_by = await uid();
        if (out.email) out.user_id = await resolveUserId(out.email);
      }
      return out;
    },
    async filterKey(key, value) {
      if (key === "staff_email") return ["email", String(value).toLowerCase()];
      if (key === "staff_phone") return ["phone", normalizePhone(value)];
      return [key, value];
    },
  },

  FriendRequest: {
    table: "friend_requests",
    select: `id, status, created_at, updated_at,
      sender:profiles!friend_requests_sender_id_fkey(${PROFILE_JOIN}),
      receiver:profiles!friend_requests_receiver_id_fkey(${PROFILE_JOIN})`,
    toApp: (r) => ({
      ...base(r),
      status: r.status,
      sender_email: r.sender?.email ?? null,
      sender_name: r.sender?.full_name ?? "",
      sender_picture: r.sender?.avatar_url ?? "",
      receiver_email: r.receiver?.email ?? null,
      receiver_name: r.receiver?.full_name ?? "",
      receiver_picture: r.receiver?.avatar_url ?? "",
    }),
    async fromApp(obj, isCreate) {
      const out = {};
      if ("status" in obj) out.status = obj.status;
      if (isCreate) {
        out.sender_id = (await resolveUserId(obj.sender_email)) ?? (await uid());
        out.receiver_id = await resolveUserId(obj.receiver_email);
        if (!out.receiver_id) throw new Error("User not found");
        out.status = obj.status || "pending";
      }
      return out;
    },
    async filterKey(key, value) {
      if (key === "sender_email") return ["sender_id", await resolveUserId(value)];
      if (key === "receiver_email") return ["receiver_id", await resolveUserId(value)];
      return [key, value];
    },
  },

  EventMessage: {
    table: "event_messages",
    select: `id, event_id, sender_id, text, created_at,
      sender:profiles(${PROFILE_JOIN}), event:events(host_id)`,
    toApp: (r) => ({
      ...base(r),
      event_id: r.event_id,
      text: r.text,
      sender_email: r.sender?.email ?? null,
      sender_name: r.sender?.full_name ?? "",
      sender_picture: r.sender?.avatar_url ?? "",
      is_host: r.event?.host_id != null && r.sender_id === r.event.host_id,
    }),
    async fromApp(obj, isCreate) {
      const out = {};
      if ("event_id" in obj) out.event_id = obj.event_id;
      if ("text" in obj) out.text = obj.text;
      if (isCreate) out.sender_id = await uid();
      return out;
    },
  },

  TicketTier: {
    table: "ticket_tiers",
    select: "*",
    toApp: (r) => ({
      ...base(r),
      event_id: r.event_id,
      name: r.name,
      price: minorToMajor(r.price_minor),
      quantity: r.quantity,
      sold: r.sold,
      sales_status: r.sales_status,
      sort_order: r.sort_order,
      hide_remaining: r.hide_remaining,
    }),
    // Writes must go through the manageTicketCatalog edge function (RLS blocks
    // direct client writes to tiers).
    async create(obj) {
      const { data } = await invokeEdge("manageTicketCatalog", {
        action: "create_tier",
        event_id: obj.event_id,
        name: obj.name,
        price: obj.price,
        quantity: obj.quantity,
        sort_order: obj.sort_order ?? 0,
        hide_remaining: obj.hide_remaining ?? false,
      });
      return ENTITIES.TicketTier.toApp(data.tier);
    },
    async update(id, obj) {
      const { data } = await invokeEdge("manageTicketCatalog", {
        action: "update_tier",
        id,
        hide_remaining: obj.hide_remaining,
      });
      return ENTITIES.TicketTier.toApp(data.tier);
    },
    async delete(id) {
      await invokeEdge("manageTicketCatalog", { action: "delete_tier", id });
      return { ok: true };
    },
  },

  PromoCode: {
    table: "promo_codes",
    select: "*",
    toApp: (r) => ({
      ...base(r),
      event_id: r.event_id,
      code: r.code,
      discount_percent: Number(r.discount_percent),
      max_uses: r.max_uses,
      used_count: r.used_count,
      total_discount_given: minorToMajor(r.total_discount_given_minor),
      status: r.status,
    }),
    async fromApp(obj, isCreate) {
      const out = {};
      if ("code" in obj) out.code = String(obj.code).trim().toUpperCase();
      for (const k of ["discount_percent", "max_uses", "status", "event_id"]) {
        if (k in obj) out[k] = obj[k];
      }
      if (isCreate) out.created_by = await uid();
      return out;
    },
  },

  Promoter: {
    table: "promoters",
    select: "*",
    toApp: (r) => ({
      ...base(r),
      event_id: r.event_id,
      name: r.name,
      email: r.email,
      commission_type: r.commission_type,
      commission_value: r.commission_type === "flat"
        ? minorToMajor(r.commission_flat_minor)
        : Number(r.commission_percent ?? 0),
      tracking_code: r.tracking_code,
      status: r.status,
      tickets_sold: r.tickets_sold,
      total_sales: minorToMajor(r.total_sales_minor),
      commission_owed: minorToMajor(r.commission_owed_minor),
      commission_paid: minorToMajor(r.commission_paid_minor),
      clicks: r.clicks,
      discount_type: r.discount_type,
      discount_value: r.discount_type === "flat"
        ? minorToMajor(r.discount_flat_minor)
        : Number(r.discount_percent ?? 0),
      discount_max_uses: r.discount_max_uses,
      discount_used_count: r.discount_used_count,
      discount_given: minorToMajor(r.discount_given_minor),
    }),
    async fromApp(obj, isCreate) {
      const out = {};
      for (const k of ["event_id", "name", "email", "status", "tracking_code",
        "commission_type", "discount_type", "discount_max_uses"]) {
        if (k in obj) out[k] = obj[k];
      }
      const ctype = obj.commission_type;
      if ("commission_value" in obj) {
        if (ctype === "flat") out.commission_flat_minor = Math.round(Number(obj.commission_value) * 100);
        else out.commission_percent = Number(obj.commission_value);
      }
      const dtype = obj.discount_type;
      if ("discount_value" in obj) {
        if (dtype === "flat") out.discount_flat_minor = Math.round(Number(obj.discount_value) * 100);
        else out.discount_percent = Number(obj.discount_value);
      }
      if (isCreate) {
        out.created_by = await uid();
        if (out.email) out.user_id = await resolveUserId(out.email);
      }
      return out;
    },
  },

  TicketOrder: {
    table: "ticket_orders",
    select: `*, tier:ticket_tiers(name), promoter:promoters(tracking_code)`,
    toApp: (r) => ({
      ...base(r),
      event_id: r.event_id,
      tier_id: r.tier_id,
      tier_name: r.tier?.name ?? "",
      guest_email: r.guest_email,
      guest_name: r.guest_name,
      promo_code_id: r.promo_code_id,
      quantity: r.quantity,
      unit_price: minorToMajor(r.unit_price_minor),
      discount_amount: minorToMajor(r.discount_minor),
      promoter_discount_amount: minorToMajor(r.promoter_discount_minor),
      paid_amount: minorToMajor(r.paid_minor),
      platform_fee: minorToMajor(r.platform_fee_minor),
      commission_amount: minorToMajor(r.commission_minor),
      host_net: minorToMajor(r.host_net_minor),
      currency: r.currency,
      promoter_id: r.promoter_id,
      promoter_code: r.promoter?.tracking_code ?? null,
      stripe_session_id: r.stripe_session_id,
      guestlist_entry_id: r.guestlist_entry_id,
      status: r.status,
      refunded_at: r.refunded_at,
    }),
  },

  TicketTransfer: {
    table: "ticket_transfers",
    select: `id, guestlist_entry_id, event_id, recipient_email, status,
      accepted_at, cancelled_at, created_at,
      sender:profiles!ticket_transfers_sender_id_fkey(${PROFILE_JOIN}),
      recipient:profiles!ticket_transfers_recipient_id_fkey(${PROFILE_JOIN}),
      event:events(title)`,
    toApp: (r) => ({
      ...base(r),
      guestlist_entry_id: r.guestlist_entry_id,
      event_id: r.event_id,
      event_title: r.event?.title ?? "",
      sender_email: r.sender?.email ?? null,
      sender_name: r.sender?.full_name ?? "",
      recipient_email: r.recipient_email,
      recipient_name: r.recipient?.full_name || r.recipient_email,
      status: r.status,
      accepted_at: r.accepted_at,
      cancelled_at: r.cancelled_at,
    }),
    async fromApp(obj) {
      // Clients may only decline/cancel; creation and acceptance go through
      // the transfer edge functions.
      const out = {};
      if ("status" in obj) out.status = obj.status;
      if ("cancelled_at" in obj) out.cancelled_at = obj.cancelled_at;
      if (obj.status === "cancelled" && !out.cancelled_at) {
        out.cancelled_at = new Date().toISOString();
      }
      return out;
    },
    async filterKey(key, value) {
      if (key === "sender_email") return ["sender_id", await resolveUserId(value)];
      return [key, value];
    },
  },

  BusinessAccount: {
    table: "business_accounts",
    select: `*, owner:profiles!business_accounts_owner_id_fkey(email)`,
    toApp: (r) => ({
      ...base(r),
      owner_email: r.owner?.email ?? null,
      business_email: r.business_email,
      business_name: r.business_name,
      business_picture: r.business_picture_url,
      stripe_mode: r.stripe_mode,
      stripe_account_id: r.stripe_account_id,
      stripe_onboarding_status: r.stripe_onboarding_status,
    }),
    async fromApp(obj, isCreate) {
      const out = {};
      for (const k of ["business_email", "business_name", "stripe_mode"]) {
        if (k in obj) out[k] = obj[k];
      }
      if ("business_picture" in obj) out.business_picture_url = obj.business_picture;
      if (isCreate) out.owner_id = (await resolveUserId(obj.owner_email)) ?? (await uid());
      return out;
    },
    async filterKey(key, value) {
      if (key === "owner_email") return ["owner_id", await resolveUserId(value)];
      return [key, value];
    },
  },

  Payout: {
    table: "payouts",
    select: "*",
    toApp: (r) => ({
      ...base(r),
      role: r.role,
      amount: minorToMajor(r.amount_minor),
      currency: r.currency,
      status: r.status,
      stripe_transfer_id: r.stripe_transfer_id,
    }),
  },
};

function base(r) {
  return {
    id: r.id,
    created_date: r.created_at,
    updated_date: r.updated_at,
    created_at: r.created_at,
  };
}

const SORT_FIELD_MAP = { created_date: "created_at", updated_date: "updated_at" };

function applySort(q, sort) {
  if (!sort) return q;
  const desc = sort.startsWith("-");
  const raw = desc ? sort.slice(1) : sort;
  const col = SORT_FIELD_MAP[raw] || raw;
  return q.order(col, { ascending: !desc });
}

// ---------------------------------------------------------------------------
// Entity factory
// ---------------------------------------------------------------------------
function makeEntity(name) {
  const def = ENTITIES[name];
  const readTable = def.readTable || def.table;

  async function runFilter(query = {}, sort, limit, skip) {
    // Special case: event lookup by invite code goes through the public RPC
    // (the column itself is never client-readable).
    if (name === "Event" && query.invite_code) {
      const { data, error } = await supabase.rpc("get_event_by_invite", {
        p_invite_code: query.invite_code,
      });
      throwOn(error);
      return data ? [{ ...data }] : [];
    }

    let q = supabase.from(readTable).select(def.select);
    for (const [key, value] of Object.entries(query)) {
      let col = key;
      let val = value;
      if (def.filterKey) [col, val] = await def.filterKey(key, value);
      if (val === null || val === undefined) {
        if (col !== key) return []; // e.g. unknown email resolved to null
        q = q.is(col, null);
      } else if (typeof val === "object" && "$in" in val) {
        q = q.in(col, val.$in);
      } else {
        q = q.eq(col, val);
      }
    }
    q = applySort(q, sort);
    if (limit) q = q.limit(limit);
    if (skip) q = q.range(skip, skip + (limit || 100) - 1);
    const { data, error } = await q;
    throwOn(error);
    let rows = (data ?? []).map(def.toApp);
    if (def.enrich) rows = await def.enrich(rows);
    return rows;
  }

  return {
    filter: runFilter,
    list: (sort, limit, skip) => runFilter({}, sort, limit, skip),
    async get(id) {
      const rows = await runFilter({ id });
      return rows[0] ?? null;
    },
    async create(obj) {
      if (def.create) return def.create(obj);
      // Joining a public event auto-approves — a privileged write that goes
      // through its validating RPC instead of a direct (RLS-blocked) insert.
      if (name === "GuestlistEntry" && obj.status === "approved" && obj.source === "invite_link") {
        const { data: entryId, error } = await supabase.rpc("join_public_event", {
          p_event_id: obj.event_id,
        });
        throwOn(error);
        const rows = await runFilter({ id: entryId });
        return rows[0] ?? { id: entryId };
      }
      const row = await def.fromApp(obj, true);
      // Entities that read through a view can't RETURNING their protected
      // base table (select('*') is blocked by column grants) — take the id
      // and re-read via the view.
      if (def.readTable) {
        const { data, error } = await supabase
          .from(def.table).insert(row).select("id").single();
        throwOn(error);
        if (def.afterWrite) await def.afterWrite(data.id, obj);
        const rows = await runFilter({ id: data.id });
        return rows[0] ?? { id: data.id };
      }
      const { data, error } = await supabase
        .from(def.table).insert(row).select(def.select).single();
      throwOn(error);
      const mapped = def.toApp(data);
      if (def.afterWrite) await def.afterWrite(mapped.id, obj);
      return mapped;
    },
    async bulkCreate(objs) {
      const rows = await Promise.all(objs.map((o) => def.fromApp(o, true)));
      if (def.readTable) {
        const { data, error } = await supabase
          .from(def.table).insert(rows).select("id");
        throwOn(error);
        const ids = (data ?? []).map((r) => r.id);
        return ids.length ? runFilter({ id: { $in: ids } }) : [];
      }
      const { data, error } = await supabase
        .from(def.table).insert(rows).select(def.select);
      throwOn(error);
      return (data ?? []).map(def.toApp);
    },
    async update(id, patch) {
      const row = await def.fromApp(patch, false);
      if (Object.keys(row).length) {
        const { error } = await supabase.from(def.table).update(row).eq("id", id);
        throwOn(error);
      }
      if (def.afterWrite) await def.afterWrite(id, patch);
      const rows = await runFilter({ id });
      return rows[0] ?? { id };
    },
    async delete(id) {
      if (def.delete) return def.delete(id);
      const { error } = await supabase.from(def.table).delete().eq("id", id);
      throwOn(error);
      return { ok: true };
    },
    // `filter` (optional) scopes the subscription server-side to matching rows,
    // e.g. "event_id=eq.<uuid>" — without it a client wakes on every change to
    // the whole table. Always pass one when the relevant id is known.
    subscribe(cb, filter) {
      const channel = supabase
        .channel(`sub-${def.table}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: def.table, ...(filter ? { filter } : {}) },
          async (payload) => {
            const type = { INSERT: "create", UPDATE: "update", DELETE: "delete" }[
              payload.eventType
            ];
            let data = payload.new?.id
              ? await this?.get?.(payload.new.id).catch(() => null)
              : null;
            if (!data) {
              const raw = payload.new?.id ? payload.new : payload.old ?? {};
              try {
                data = def.toApp(raw);
              } catch {
                data = raw;
              }
            }
            cb({ type, event: type, data });
          })
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
}

const entities = Object.fromEntries(
  Object.keys(ENTITIES).map((name) => {
    const e = makeEntity(name);
    // rebind subscribe so `this.get` resolves to the entity
    e.subscribe = e.subscribe.bind(e);
    return [name, e];
  }),
);

// ---------------------------------------------------------------------------
// Auth (old surface: me / updateMe / logout / redirectToLogin)
// ---------------------------------------------------------------------------
const PROFILE_COLS =
  "id, email, full_name, phone, instagram, avatar_url, role, stripe_onboarding_status, active_business_id, created_at";

function profileToUser(p) {
  return {
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    phone: p.phone,
    instagram: p.instagram,
    profile_picture: p.avatar_url,
    role: p.role,
    stripe_onboarding_status: p.stripe_onboarding_status,
    active_business_id: p.active_business_id,
    created_date: p.created_at,
  };
}

const auth = {
  async me() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Not authenticated");
    const { data: profile, error } = await supabase
      .from("profiles").select(PROFILE_COLS)
      .eq("id", data.session.user.id).single();
    throwOn(error);
    return profileToUser(profile);
  },
  // Look up another user's public profile by email. profiles is readable by any
  // signed-in user (profiles_select policy), so this powers instagram/name on
  // the profile modals. Returns null when no such profile exists.
  async getProfile(email) {
    if (!email) return null;
    const { data, error } = await supabase
      .from("profiles").select(PROFILE_COLS)
      .eq("email", String(email).toLowerCase()).maybeSingle();
    throwOn(error);
    return data ? profileToUser(data) : null;
  },
  // Search every account by name or Instagram handle. profiles is readable by
  // any signed-in user (profiles_select policy), so this finds anyone with an
  // account — not just people who've appeared on a guestlist.
  async searchProfiles(query, limit = 20) {
    // Split into whitespace tokens so a multi-word / out-of-order name query
    // still matches (e.g. "jess john" -> "Jessica Johnson"). Each token is
    // sanitized for the PostgREST .or() filter string and must be >= 2 chars;
    // chaining an .or() per token ANDs them, so every token must appear in the
    // name or the instagram handle.
    const tokens = String(query || "")
      .trim()
      .split(/\s+/)
      .map((t) => t.replace(/[,()*%]/g, "").trim())
      .filter((t) => t.length >= 2);
    if (tokens.length === 0) return [];
    let q = supabase.from("profiles").select(PROFILE_COLS);
    for (const tok of tokens) {
      q = q.or(`full_name.ilike.%${tok}%,instagram.ilike.%${tok}%`);
    }
    const { data, error } = await q.limit(limit);
    throwOn(error);
    return (data ?? []).map(profileToUser);
  },
  async updateMe(fields) {
    const id = await uid();
    if (!id) throw new Error("Not authenticated");
    const patch = {};
    for (const k of ["full_name", "phone", "instagram", "active_business_id"]) {
      if (k in fields) patch[k] = fields[k];
    }
    if (patch.active_business_id === "") patch.active_business_id = null;
    if (patch.phone) patch.phone = normalizePhone(patch.phone);
    if ("profile_picture" in fields) patch.avatar_url = fields.profile_picture;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      throwOn(error);
    }
    return auth.me();
  },
  async signInWithGoogle(redirectTo) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo || window.location.origin },
    });
    throwOn(error);
  },
  async signInWithPassword(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    throwOn(error);
  },
  // Email sign-up. full_name/phone/instagram ride in user metadata so the
  // on_auth_user_created trigger pre-fills the profile (skips those onboarding
  // steps). The avatar can't be set here — there's no session until the user
  // confirms their email — so it's collected on first sign-in by the gate.
  async signUp(email, password, fullName, extra = {}) {
    const { data, error } = await supabase.auth.signUp({
      email: String(email).trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName,
          phone: extra.phone ? normalizePhone(extra.phone) : undefined,
          instagram: extra.instagram || undefined,
        },
        // Return to the page the user signed up from (e.g. an event page with
        // a promoter ?ref=), not the bare homepage.
        emailRedirectTo: window.location.href,
      },
    });
    throwOn(error);
    // With confirmations on, a duplicate email still "succeeds" but comes back
    // with no identities — don't tell the user a confirmation email was sent.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      throw new Error("An account with this email already exists — sign in instead.");
    }
    return { needsConfirmation: !data.session };
  },
  async resendConfirmation(email) {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: String(email).trim().toLowerCase(),
    });
    throwOn(error);
  },
  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(
      String(email).trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    throwOn(error);
  },
  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    throwOn(error);
  },
  async logout() {
    await supabase.auth.signOut();
    window.location.assign("/");
  },
  // Deletes the account server-side (a client can't remove an auth user): the
  // deleteAccount edge function frees the email, blocks sign-in and scrubs
  // personal data. Then sign out.
  async deleteAccount() {
    await invokeEdge("deleteAccount", {});
    await auth.logout();
  },
  async isAuthenticated() {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  },
  redirectToLogin(nextUrl) {
    try {
      sessionStorage.setItem("login_next", nextUrl || window.location.href);
    } catch { /* storage unavailable */ }
    // No /login route exists — the app root renders the Login screen when
    // there is no session. The Login screen returns to login_next on success.
    window.location.assign("/");
  },
};

// ---------------------------------------------------------------------------
// Functions: dashboard reads route to SQL RPCs, the rest to edge functions.
// Returns { data }-shaped results (legacy calling convention).
// ---------------------------------------------------------------------------
async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  throwOn(error);
  return { data };
}

async function invokeEdge(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) {
    // FunctionsHttpError carries the response; surface the server's message.
    let message = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) message = ctx.error;
    } catch { /* no body */ }
    throw new Error(message);
  }
  return { data };
}

const functions = {
  async invoke(name, body = {}) {
    switch (name) {
      case "getHomeDashboard":
        return rpc("get_home_dashboard");
      case "getGuestDashboard":
        return rpc("get_guest_dashboard");
      case "getNotifications":
        return rpc("get_notifications");
      case "getEventAttendees":
        return rpc("get_event_attendees", {
          p_event_id: body.event_id,
          p_offset: body.offset ?? 0,
          p_limit: body.limit ?? 50,
        });
      case "getFriendSuggestions":
        return rpc("get_friend_suggestions", {
          p_offset: body.offset ?? 0,
          p_limit: body.limit ?? 20,
        });
      case "resolvePromoterRef": {
        const res = await rpc("resolve_promoter_ref", {
          p_event_id: body.event_id,
          p_code: body.code,
          p_count_click: !!body.count_click,
        });
        // Old shape had a single discount_value keyed by discount_type.
        const p = res.data?.promoter;
        if (p) {
          res.data.promoter = {
            ...p,
            discount_value: p.discount_type === "flat"
              ? minorToMajor(p.discount_flat_minor)
              : Number(p.discount_percent ?? 0),
          };
        }
        return res;
      }
      case "myQrPayload":
        return rpc("my_qr_payload", { p_entry_id: body.entry_id });
      case "registerStaffByCode":
        return rpc("register_staff_by_code", { p_code: body.code });
      case "getProfiles": {
        const emails = (body.emails ?? []).map((e) => String(e).toLowerCase());
        if (!emails.length) return { data: { profiles: {} } };
        const { data, error } = await supabase
          .from("profiles").select("email, full_name, avatar_url")
          .in("email", emails);
        throwOn(error);
        const profiles = {};
        for (const p of data ?? []) {
          profiles[p.email.toLowerCase()] = {
            name: p.full_name || "",
            picture: p.avatar_url || "",
          };
        }
        return { data: { profiles } };
      }
      default:
        return invokeEdge(name, body);
    }
  },
};

// ---------------------------------------------------------------------------
// File upload (old surface: integrations.Core.UploadFile({ file }))
// ---------------------------------------------------------------------------
async function resizeImage(file, maxDim = 1600) {
  if (!file.type?.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    if (Math.max(bitmap.width, bitmap.height) <= maxDim) return file;
    const scale = maxDim / Math.max(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const id = await uid();
      if (!id) throw new Error("Not authenticated");
      const resized = await resizeImage(file);
      const ext = resized.type === "image/png" ? "png" : "jpg";
      const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, resized, {
        contentType: resized.type || "image/jpeg",
        upsert: false,
      });
      throwOn(error);
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      return { file_url: data.publicUrl };
    },
  },
};

// ---------------------------------------------------------------------------
// Admin surface. Reads use the already-client-readable profiles/events tables
// and the admin-gated audit log + metrics RPC; every mutation goes through a
// service-role edge function that re-checks the admin role server-side.
// ---------------------------------------------------------------------------
const admin = {
  async metrics() {
    const { data } = await rpc("admin_dashboard_metrics");
    return data;
  },
  async listUsers({ search } = {}) {
    let q = supabase
      .from("profiles")
      .select("id, email, full_name, phone, instagram, avatar_url, role, banned_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (search) q = q.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    const { data, error } = await q;
    throwOn(error);
    return (data ?? []).map((p) => ({ ...profileToUser(p), banned_at: p.banned_at }));
  },
  setRole(userId, role) {
    return invokeEdge("adminUsers", { action: "set_role", user_id: userId, role });
  },
  updateUser(userId, fields) {
    return invokeEdge("adminUsers", { action: "update_profile", user_id: userId, ...fields });
  },
  banUser(userId) {
    return invokeEdge("adminUsers", { action: "ban", user_id: userId });
  },
  unbanUser(userId) {
    return invokeEdge("adminUsers", { action: "unban", user_id: userId });
  },
  // Super-admin only. Returns { email, token_hash } to mint a session as the
  // target user (see src/lib/impersonation.js).
  async impersonate(userId) {
    const { data } = await invokeEdge("adminUsers", { action: "impersonate", user_id: userId });
    return data;
  },
  async listEvents({ search } = {}) {
    let q = supabase
      .from("events")
      .select("id, title, date, status, host_id, business_id, is_paid, currency, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (search) q = q.ilike("title", `%${search}%`);
    const { data, error } = await q;
    throwOn(error);
    return data ?? [];
  },
  updateEventStatus(eventId, action) {
    return invokeEdge("adminEvents", { action, event_id: eventId });
  },
  deleteEvent(eventId) {
    return invokeEdge("adminEvents", { action: "delete", event_id: eventId });
  },
  deleteMessage(messageId) {
    return invokeEdge("adminEvents", { action: "delete_message", message_id: messageId });
  },
  async listAuditLog() {
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    throwOn(error);
    return data ?? [];
  },
};

export const api = { entities, auth, functions, integrations, admin };
