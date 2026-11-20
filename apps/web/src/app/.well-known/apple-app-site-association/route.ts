import { headers } from "next/headers";

export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) return new Response("Not found", { status: 404 });
  const headerList = await headers();
  const host = (headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "").toLowerCase();
  const bundle = host.includes("uniqbd") ? "com.uniqbd.app" : "com.amarpin.app";
  return Response.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.${bundle}`,
            paths: ["NOT /admin/*", "NOT /api/*", "*"],
          },
        ],
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
