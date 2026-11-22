// A logo or icon is kept inside the database as a small picture. This reads a chosen file and, for a normal
// picture, shrinks it so a big photo-sized logo does not slow every page down. PNG stays PNG so a transparent
// logo stays transparent. SVG and ICO files are used as they are, if they are small.
const KEEP_AS_IS = ["image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon", "image/gif"];

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the picture"));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the picture"));
    img.src = url;
  });
}

/** `maxSide` is the longest side in pixels. `maxChars` is the most the server takes for this picture. */
export async function pictureDataUrl(file: File, maxSide: number, maxChars: number): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture file");
  const original = await readAsDataUrl(file);
  if (KEEP_AS_IS.includes(file.type)) {
    if (original.length > maxChars) throw new Error("That picture is too big. Use a smaller one.");
    return original;
  }
  const image = await loadImage(original);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read the picture");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png");
  if (png.length <= maxChars) return png;
  // A detailed picture is smaller as a JPEG. The transparent parts turn white.
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const flatContext = flat.getContext("2d");
  if (!flatContext) throw new Error("Could not read the picture");
  flatContext.fillStyle = "#ffffff";
  flatContext.fillRect(0, 0, flat.width, flat.height);
  flatContext.drawImage(canvas, 0, 0);
  for (const quality of [0.9, 0.75, 0.6]) {
    const jpeg = flat.toDataURL("image/jpeg", quality);
    if (jpeg.length <= maxChars) return jpeg;
  }
  throw new Error("That picture is too big. Use a smaller one.");
}
