import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { computeAuthStatus } from "./auth.ts";
import { getAuthRow, getPost, getQueueTimezone, getSlots, listPosts, USER_STATUSES } from "./db.ts";
import type { Env } from "./env.ts";
import { MAX_POST_LENGTH } from "./linkedin.ts";
import {
  NEXT_FREE_SLOT,
  OpError,
  opConfirm,
  opCreate,
  opDelete,
  opEdit,
  opPublishNow,
  opSetSlots,
  opSetTime,
  view,
} from "./ops.ts";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof OpError) return { content: [{ type: "text", text: e.message }], isError: true };
    throw e;
  }
}

const WHEN_DESC =
  `Either "${NEXT_FREE_SLOT}" (earliest open queue slot) or a time: ISO 8601 with offset ` +
  `("2026-11-03T12:00:00-05:00", "...Z") or local wall-clock ("2026-11-03T12:00"), which is read in the queue timezone.`;

export function buildServer(env: Env): McpServer {
  const server = new McpServer({ name: "postline", version: "0.1.0" });
  const db = env.DB;
  const tz = () => getQueueTimezone(db);
  const publishDeps = { db, encKey: env.TOKEN_ENCRYPTION_KEY, linkedinVersion: env.LINKEDIN_VERSION };
  const id = z.string().describe("Post id, e.g. p_1a2b3c4d5e6f7a8b");

  server.registerTool(
    "create_post",
    {
      description: `Create a LinkedIn post as a draft (never publishes). Plain text, max ${MAX_POST_LENGTH} characters; #hashtags become clickable. To date it, follow up with schedule_post or plan_post.`,
      inputSchema: { text: z.string().min(1) },
    },
    ({ text }) => run(async () => view(await opCreate(db, text), await tz())),
  );

  server.registerTool(
    "list_posts",
    {
      description: "List posts, optionally filtered by status. Times are shown in UTC and in the queue timezone.",
      inputSchema: {
        status: z.enum(USER_STATUSES).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ status, limit }) =>
      run(async () => {
        const zone = await tz();
        return (await listPosts(db, status, limit ?? 50)).map((p) => view(p, zone));
      }),
  );

  server.registerTool(
    "get_post",
    { description: "Get one post by id.", inputSchema: { id }, annotations: { readOnlyHint: true } },
    ({ id }) =>
      run(async () => {
        const post = await getPost(db, id);
        if (!post) throw new OpError(`No post with id ${id}.`);
        return view(post, await tz());
      }),
  );

  server.registerTool(
    "edit_post",
    {
      description: "Replace a post's text. Works for draft, planned, scheduled and error posts; keeps its status and time.",
      inputSchema: { id, text: z.string().min(1) },
    },
    ({ id, text }) => run(async () => view(await opEdit(db, id, text), await tz())),
  );

  server.registerTool(
    "delete_post",
    {
      description:
        "Delete a post from Postline. For an already-published post this only removes the local record; it does NOT delete it from LinkedIn.",
      inputSchema: { id },
      annotations: { destructiveHint: true },
    },
    ({ id }) => run(async () => ({ deleted: view(await opDelete(db, id), await tz()) })),
  );

  server.registerTool(
    "schedule_post",
    {
      description:
        "Schedule a post to publish AUTOMATICALLY at a time. Use plan_post instead if the user wants to approve it first.",
      inputSchema: { id, when: z.string().describe(WHEN_DESC) },
    },
    ({ id, when }) => run(async () => view(await opSetTime(db, id, when, "scheduled"), await tz())),
  );

  server.registerTool(
    "plan_post",
    {
      description:
        "Give a post a date WITHOUT committing to publish it (status 'planned'). It will not publish until confirm_post is called.",
      inputSchema: { id, when: z.string().describe(WHEN_DESC) },
    },
    ({ id, when }) => run(async () => view(await opSetTime(db, id, when, "planned"), await tz())),
  );

  server.registerTool(
    "confirm_post",
    {
      description:
        "Approve a planned post so it publishes automatically at its planned time. Only call this when the user has explicitly approved that post.",
      inputSchema: { id },
    },
    ({ id }) => run(async () => view(await opConfirm(db, id), await tz())),
  );

  server.registerTool(
    "publish_now",
    {
      description:
        "Publish a post to LinkedIn IMMEDIATELY. This is public and irreversible. BEFORE calling, show the user the exact post text and ask them to confirm publishing now; only then call with confirm=true. Never set confirm=true on your own initiative.",
      inputSchema: {
        id,
        confirm: z.boolean().describe("Must be true, and only after the user explicitly said to publish now."),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    ({ id, confirm }) =>
      run(async () => {
        if (confirm !== true) {
          throw new OpError("Not published. Ask the user to confirm, then call publish_now with confirm=true.");
        }
        return view(await opPublishNow(publishDeps, id), await tz());
      }),
  );

  server.registerTool(
    "get_queue_slots",
    {
      description: "Get the weekly queue slots (weekday 1=Mon..7=Sun, HH:MM local) and the queue timezone.",
      annotations: { readOnlyHint: true },
    },
    () => run(async () => ({ timezone: await tz(), slots: await getSlots(db) })),
  );

  server.registerTool(
    "set_queue_slots",
    {
      description:
        "Replace ALL weekly queue slots. Existing scheduled posts keep their times. Optionally change the queue timezone (IANA name).",
      inputSchema: {
        slots: z
          .array(z.object({ weekday: z.number().int().min(1).max(7), time: z.string().regex(/^\d{2}:\d{2}$/) }))
          .describe("e.g. [{weekday:1,time:'12:00'}]"),
        timezone: z.string().optional(),
      },
    },
    ({ slots, timezone }) => run(() => opSetSlots(db, slots, timezone)),
  );

  server.registerTool(
    "auth_status",
    {
      description:
        "LinkedIn connection status and token expiry. If state is expiring_soon or expired, tell the user to re-authorize at the given URL.",
      annotations: { readOnlyHint: true },
    },
    () => run(async () => computeAuthStatus(await getAuthRow(db), Date.now(), `${env.PUBLIC_URL}/reauth`)),
  );

  return server;
}

/** Stateless Streamable HTTP: a fresh server + transport per request. */
export const mcpApiHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const server = buildServer(env);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
