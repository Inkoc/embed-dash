import { createServer } from "node:http";
export function startFakeDiscord(port: number) {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (
      request.url === "/api/v10/users/@me" &&
      request.headers.authorization === "Bot e2e-test-token"
    ) {
      response.end(
        JSON.stringify({
          id: "123456789012345678",
          username: "Walking Skeleton Bot",
          avatar: null,
        }),
      );
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ message: "Not found" }));
    }
  });
  return server.listen(port, "127.0.0.1");
}
