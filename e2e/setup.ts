import { request, type FullConfig } from "@playwright/test";

export default async function setup(config: FullConfig) {
  const use = config.projects[0].use;
  const client = await request.newContext({ baseURL: use.baseURL });
  try {
    const session = await client.get("/api/session");
    const { csrfToken, authMode } = await session.json();
    if (authMode === "password") {
      const response = await client.post("/api/auth/login", {
        headers: { origin: use.baseURL!, "x-csrf-token": csrfToken },
        data: { password: "e2e-password" },
      });
      if (!response.ok()) throw new Error("E2E login failed");
    }
    await client.storageState({ path: use.storageState as string });
  } finally {
    await client.dispose();
  }
}
