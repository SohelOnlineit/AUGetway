// The server accepts a receipt up to 400,000 characters as a JPG, PNG or WEBP picture.
// A phone photo is several megabytes, so it is shrunk to a JPEG in the browser first. Without this, a normal photo
// was refused by the server with a confusing "longer than 400000 characters" message.
const SERVER_LIMIT = 400_000;
const TARGET = 380_000;
const RAW_FILE_LIMIT = 25 * 1024 * 1024;
const RAW_OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the receipt"));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the receipt"));
    img.src = url;
  });
}

/** Returns a data URL the server will accept, or "" when no file was chosen. */
export async function receiptDataUrl(value: FormDataEntryValue | null): Promise<string> {
  if (!(value instanceof File) || value.size === 0) return "";
  if (!value.type.startsWith("image/")) throw new Error("Receipt must be an image");
  if (value.size > RAW_FILE_LIMIT) throw new Error("Receipt picture is too large");

  const original = await readAsDataUrl(value);
  let image: HTMLImageElement;
  try {
    image = await loadImage(original);
  } catch {
    // The browser cannot draw this picture (for example a HEIC photo). Send it as it is only if the server would take it.
    if (RAW_OK_TYPES.includes(value.type) && original.length <= SERVER_LIMIT) return original;
    throw new Error("Could not read this picture. Take a screenshot of the receipt, or use a JPG or PNG.");
  }

  let side = Math.min(1600, Math.max(image.width, image.height));
  for (let round = 0; round < 5; round += 1) {
    const scale = Math.min(1, side / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not read the receipt");
    // A transparent PNG would turn black as a JPEG, so paint white first.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.72, 0.6, 0.5]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.startsWith("data:image/jpeg;base64,") && data.length <= TARGET) return data;
    }
    side = Math.round(side * 0.75);
  }
  throw new Error("Receipt picture is too detailed. Take a smaller screenshot of it.");
}
