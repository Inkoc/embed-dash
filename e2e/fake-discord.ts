import { createServer } from "node:http";

const botId = "123456789012345678";

export const fakeUsers = {
  allowed: {
    id: "111111111111111111",
    username: "ada",
    global_name: "Ada Lovelace",
    avatar: null,
  },
  blocked: {
    id: "222222222222222222",
    username: "grace",
    global_name: "Grace Hopper",
    avatar: null,
  },
};
export const fakeOAuth = {
  clientId: "999999999999999999",
  secret: "e2e-secret",
};
const view = 1 << 10;
const send = 1 << 11;
const embed = 1 << 14;
const attach = 1 << 15;
const posting = String(view | send | embed | attach);

interface FakeChannel {
  id: string;
  name: string;
  type: 0 | 4 | 5 | 15;
  position: number;
  parent_id?: string;
  permission_overwrites?: {
    id: string;
    type: 0 | 1;
    allow: string;
    deny: string;
  }[];
}
interface FakeGuild {
  id: string;
  name: string;
  system_channel_id: string | null;
  channels: FakeChannel[];
}

/** Snowflake-like IDs: a fixed prefix per server so call numbers read naturally. */
const id = (guild: number, n: number) =>
  `11034829155${String(guild).padStart(2, "0")}${String(n).padStart(5, "0")}`;

function guild(
  n: number,
  name: string,
  channels: [string, FakeChannel["type"], Partial<FakeChannel>?][],
  systemIndex: number | null = null,
): FakeGuild {
  const listed = channels.map(([channelName, type, extra], i) => ({
    id: id(n, i + 1),
    name: channelName,
    type,
    position: i,
    ...extra,
  }));
  return {
    id: id(n, 0),
    name,
    system_channel_id: systemIndex === null ? null : listed[systemIndex].id,
    channels: listed,
  };
}

const denySend = (guildN: number) => ({
  permission_overwrites: [
    { id: id(guildN, 0), type: 0 as const, allow: "0", deny: String(send) },
  ],
});

/** Servers for the end-to-end tests: names, IDs and permissions the specs rely on. */
export const fakeGuilds: FakeGuild[] = [
  guild(
    1,
    "Lanternfall Community",
    [
      ["Info", 4],
      ["announcements", 5, { parent_id: id(1, 1) }],
      ["patch-notes", 0, { parent_id: id(1, 1) }],
      ["Chat", 4],
      ["general", 0, { parent_id: id(1, 4) }],
      ["events", 0, { parent_id: id(1, 4) }],
      ["bug-reports", 15, { parent_id: id(1, 4) }],
      ["moderators", 0, { parent_id: id(1, 4), ...denySend(1) }],
    ],
    4,
  ),
  guild(2, "Lanternfall Modding Guild", [
    ["mod-announcements", 5],
    ["release-notes", 0],
    ["toolkit-help", 15],
    [
      "staff-only",
      0,
      {
        permission_overwrites: [
          { id: id(2, 0), type: 0, allow: "0", deny: String(view) },
        ],
      },
    ],
  ]),
  guild(
    3,
    "Lanternfall Cup EU",
    [
      ["news", 0],
      ["match-schedule", 0],
      ["results", 0],
    ],
    0,
  ),
  guild(4, "Saltmarsh Wiki Editors", [
    ["edits", 0],
    [
      "wiki-news",
      0,
      {
        permission_overwrites: [
          { id: botId, type: 1, allow: "0", deny: String(embed) },
        ],
      },
    ],
  ]),
  // A large server, so the drawer folds and the catalogue stays short.
  guild(
    5,
    "Heron Keepers RP",
    Array.from({ length: 40 }, (_, i): [string, 0] => [
      `story-${String(i + 1).padStart(2, "0")}`,
      0,
    ]),
  ),
  // Enough servers that the rail gets its filter and the phone strip has to scroll.
  ...[
    "DE",
    "FR",
    "NA",
    "Speedruns",
    "Tidal Caves",
    "Oil Economy",
    "Archive",
  ].map((region, i) => guild(6 + i, `Lanternfall ${region}`, [["lobby", 0]])),
];

export function startFakeDiscord(port: number) {
  const server = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    const reply = (body: unknown, status = 200) => {
      response.statusCode = status;
      response.end(JSON.stringify(body));
    };
    const url = new URL(request.url ?? "/", "http://fake");
    const bearer = request.headers.authorization?.match(
      /^Bearer e2e-access-(\w+)$/,
    );
    if (url.pathname === "/oauth2/authorize") {
      // Stands in for Discord's consent screen: approve at once as the chosen user.
      const target = new URL(url.searchParams.get("redirect_uri") ?? "");
      // Browser cookies ignore ports, so a spec picks the user with a plain cookie.
      const chosen = request.headers.cookie?.match(/(?:^|; )fake_user=(\w+)/);
      target.searchParams.set("code", chosen?.[1] ?? "allowed");
      target.searchParams.set("state", url.searchParams.get("state") ?? "");
      response.statusCode = 302;
      response.setHeader("location", target.toString());
      return response.end();
    }
    if (url.pathname === "/api/oauth2/token" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const form = new URLSearchParams(body);
      const user = form.get("code");
      if (
        form.get("client_secret") === fakeOAuth.secret &&
        form.get("client_id") === fakeOAuth.clientId &&
        (user === "allowed" || user === "blocked")
      )
        return reply({
          access_token: `e2e-access-${user}`,
          refresh_token: "e2e-refresh",
          scope: "identify",
        });
      return reply({ error: "invalid_grant" }, 400);
    }
    if (url.pathname === "/api/oauth2/token/revoke") return reply({});
    if (url.pathname === "/api/v10/users/@me" && bearer)
      return reply(fakeUsers[bearer[1] as keyof typeof fakeUsers]);
    if (request.headers.authorization !== "Bot e2e-test-token")
      return reply({ message: "401: Unauthorized" }, 401);
    const path = url.pathname.replace(/^\/api\/v10/, "");
    if (path === "/users/@me")
      return reply({
        id: botId,
        username: "Walking Skeleton Bot",
        avatar: null,
      });
    if (path === "/users/@me/guilds") {
      const after = url.searchParams.get("after");
      const limit = Number(url.searchParams.get("limit") ?? 200);
      const start = after ? fakeGuilds.findIndex((g) => g.id === after) + 1 : 0;
      return reply(
        fakeGuilds
          .slice(start, start + limit)
          .map((g) => ({ id: g.id, name: g.name, icon: null })),
      );
    }
    const [, section, guildId, sub, memberId] = path.split("/");
    const found = fakeGuilds.find((g) => g.id === guildId);
    if (section !== "guilds" || !found)
      return reply({ message: "Unknown Guild" }, 404);
    if (!sub)
      return reply({
        id: found.id,
        name: found.name,
        icon: null,
        owner_id: "1",
        system_channel_id: found.system_channel_id,
        roles: [{ id: found.id, permissions: posting }],
      });
    if (sub === "members" && memberId === botId) return reply({ roles: [] });
    if (sub === "channels") return reply(found.channels);
    reply({ message: "Not found" }, 404);
  });
  return server.listen(port, "127.0.0.1");
}
