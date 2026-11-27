import { createServer } from "node:http";

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

export function startFakeDiscord(port: number) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://fake.invalid");
    response.setHeader("content-type", "application/json");
    const bearer = request.headers.authorization?.match(
      /^Bearer e2e-access-(\w+)$/,
    );
    if (
      url.pathname === "/api/v10/users/@me" &&
      request.headers.authorization === "Bot e2e-test-token"
    ) {
      response.end(
        JSON.stringify({
          id: "123456789012345678",
          username: "Walking Skeleton Bot",
          avatar: null,
        }),
      );
    } else if (url.pathname === "/oauth2/authorize") {
      // Stands in for Discord's consent screen: approve at once as the chosen user.
      const target = new URL(url.searchParams.get("redirect_uri") ?? "");
      // Browser cookies ignore ports, so a spec picks the user with a plain cookie.
      const chosen = request.headers.cookie?.match(/(?:^|; )fake_user=(\w+)/);
      target.searchParams.set("code", chosen?.[1] ?? "allowed");
      target.searchParams.set("state", url.searchParams.get("state") ?? "");
      response.statusCode = 302;
      response.setHeader("location", target.toString());
      response.end();
    } else if (
      url.pathname === "/api/oauth2/token" &&
      request.method === "POST"
    ) {
      let body = "";
      for await (const chunk of request) body += chunk;
      const form = new URLSearchParams(body);
      const user = form.get("code");
      if (
        form.get("client_secret") === fakeOAuth.secret &&
        form.get("client_id") === fakeOAuth.clientId &&
        (user === "allowed" || user === "blocked")
      )
        response.end(
          JSON.stringify({
            access_token: `e2e-access-${user}`,
            refresh_token: "e2e-refresh",
            scope: "identify",
          }),
        );
      else {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: "invalid_grant" }));
      }
    } else if (url.pathname === "/api/v10/users/@me" && bearer) {
      response.end(
        JSON.stringify(fakeUsers[bearer[1] as keyof typeof fakeUsers]),
      );
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ message: "Not found" }));
    }
  });
  return server.listen(port, "127.0.0.1");
}
