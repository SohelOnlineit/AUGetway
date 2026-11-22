/**
 * Only these routes carry a picture inside the JSON body (QR code, link photo, logo, receipt).
 * Every other route is small text, so it gets a small limit and cannot be used to push big bodies at us.
 */
const picturePaths = [
  /^\/api\/desk\/methods(?:\/[^/]+)?\/?$/,
  /^\/api\/desk\/links(?:\/[^/]+)?\/?$/,
  /^\/api\/desk\/settings\/?$/,
  /^\/api\/desk\/domains(?:\/[^/]+)?\/?$/,
  /^\/api\/public\/pay\/[^/]+\/proof\/?$/,
];

export const smallBodyLimit = "256kb";
export const pictureBodyLimit = "3mb";

export function needsPictureBody(method: string, path: string) {
  if (method !== "POST" && method !== "PATCH" && method !== "PUT") return false;
  return picturePaths.some((pattern) => pattern.test(path));
}
