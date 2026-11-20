import { headers } from "next/headers";

export async function GET() {
  const headerList = await headers();
  const host = (headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "").toLowerCase();
  const uniqbd = host.includes("uniqbd");
  const fingerprints = (process.env[uniqbd ? "ANDROID_SHA256_UNIQBD" : "ANDROID_SHA256_AMARPIN"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!fingerprints.length) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: uniqbd ? "com.uniqbd.app" : "com.amarpin.app",
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
