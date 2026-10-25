export type HexColor = `#${string}`;

export interface BrandPalette {
  primary: HexColor;
  secondary: HexColor;
  alternative: HexColor;
}

export interface LogoAnalysis {
  file: File;
  width: number;
  height: number;
  palette: BrandPalette;
}

export const DEFAULT_BRAND_PALETTE: BrandPalette = {
  primary: "#111111",
  secondary: "#FFFFFF",
  alternative: "#888888",
};

export const MAX_LOGO_FILE_SIZE = 5 * 1024 * 1024;

const MAX_IMAGE_EDGE = 12_000;
const MAX_IMAGE_PIXELS = 50_000_000;
const SAMPLE_EDGE = 192;
const SUPPORTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

interface Rgb {
  red: number;
  green: number;
  blue: number;
}

interface ColorCluster extends Rgb {
  count: number;
  saturation: number;
  lightness: number;
  score: number;
}

export class LogoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogoValidationError";
  }
}

export function normalizeHexColor(value: string): HexColor | null {
  const normalized = value.trim().replace(/^#/, "");

  if (/^[\da-f]{3}$/i.test(normalized)) {
    return `#${normalized
      .split("")
      .map((character) => `${character}${character}`)
      .join("")
      .toUpperCase()}` as HexColor;
  }

  if (/^[\da-f]{6}$/i.test(normalized)) {
    return `#${normalized.toUpperCase()}` as HexColor;
  }

  return null;
}

export function contrastRatio(first: string, second: string): number | null {
  const firstColor = hexToRgb(first);
  const secondColor = hexToRgb(second);

  if (!firstColor || !secondColor) return null;

  const light = Math.max(relativeLuminance(firstColor), relativeLuminance(secondColor));
  const dark = Math.min(relativeLuminance(firstColor), relativeLuminance(secondColor));

  return (light + 0.05) / (dark + 0.05);
}

export async function analyzeLogo(file: File): Promise<LogoAnalysis> {
  const safeFile = await prepareLogoFile(file);
  const { image, release } = await loadImage(safeFile);

  try {
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    if (!width || !height) {
      throw new LogoValidationError("The image has no readable dimensions.");
    }

    if (
      width > MAX_IMAGE_EDGE ||
      height > MAX_IMAGE_EDGE ||
      width * height > MAX_IMAGE_PIXELS
    ) {
      throw new LogoValidationError(
        "The logo dimensions are too large. Use an image under 12,000 px per side.",
      );
    }

    const scale = Math.min(SAMPLE_EDGE / width, SAMPLE_EDGE / height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context = canvas.getContext("2d", {
      alpha: true,
      willReadFrequently: true,
    });

    if (!context) {
      throw new Error("Your browser could not create an image analysis canvas.");
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const palette = extractPalette(pixels.data);

    return { file: safeFile, width, height, palette };
  } finally {
    release();
  }
}

async function prepareLogoFile(file: File): Promise<File> {
  if (!file.size) {
    throw new LogoValidationError("The selected file is empty.");
  }

  if (file.size > MAX_LOGO_FILE_SIZE) {
    throw new LogoValidationError("The logo must be smaller than 5 MB.");
  }

  const detectedType = await detectImageType(file);

  if (!detectedType || !SUPPORTED_TYPES.has(detectedType)) {
    throw new LogoValidationError("Use a valid PNG, JPEG, WebP, or SVG file.");
  }

  if (detectedType === "image/svg+xml") {
    return sanitizeSvg(file);
  }

  return new File([file], file.name, {
    type: detectedType,
    lastModified: file.lastModified,
  });
}

async function detectImageType(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  const textStart = (await file.slice(0, 4096).text())
    .replace(/^\uFEFF/, "")
    .trimStart();

  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[^]*?-->\s*)*<svg[\s>]/i.test(textStart)) {
    return "image/svg+xml";
  }

  return null;
}

async function sanitizeSvg(file: File): Promise<File> {
  const source = await file.text();
  const parser = new DOMParser();
  const document = parser.parseFromString(source, "image/svg+xml");
  const root = document.documentElement;

  if (document.querySelector("parsererror") || root.localName.toLowerCase() !== "svg") {
    throw new LogoValidationError("The SVG file is malformed.");
  }

  if (document.querySelector("script, foreignObject, iframe, object, embed")) {
    throw new LogoValidationError("The SVG contains unsupported active content.");
  }

  const elements = [root, ...Array.from(root.querySelectorAll("*"))];

  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (name.startsWith("on") || /javascript:/i.test(value)) {
        throw new LogoValidationError("The SVG contains unsafe attributes.");
      }

      if ((name === "href" || name === "xlink:href") && !isSafeSvgReference(value)) {
        throw new LogoValidationError("The SVG contains an external resource reference.");
      }

      if (containsExternalCssReference(value)) {
        throw new LogoValidationError("The SVG contains an external CSS resource.");
      }
    }
  }

  for (const style of Array.from(document.querySelectorAll("style"))) {
    if (/@import|javascript:/i.test(style.textContent ?? "") || containsExternalCssReference(style.textContent ?? "")) {
      throw new LogoValidationError("The SVG stylesheet contains an external resource.");
    }
  }

  const sanitized = new XMLSerializer().serializeToString(root);

  return new File([sanitized], file.name, {
    type: "image/svg+xml",
    lastModified: file.lastModified,
  });
}

function isSafeSvgReference(value: string): boolean {
  return !value || value.startsWith("#") || /^data:image\/(?:png|jpeg|webp);base64,/i.test(value);
}

function containsExternalCssReference(value: string): boolean {
  const references = value.matchAll(/url\(([^)]+)\)/gi);

  for (const reference of references) {
    const target = reference[1].trim().replace(/^['"]|['"]$/g, "");
    if (!target.startsWith("#") && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(target)) {
      return true;
    }
  }

  return false;
}

async function loadImage(
  file: File,
): Promise<{ image: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new LogoValidationError("The image took too long to decode."));
      }, 10_000);

      image.onload = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      image.onerror = () => {
        window.clearTimeout(timeout);
        reject(new LogoValidationError("The browser could not decode this image."));
      };
      image.src = url;
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }

  return {
    image,
    release: () => URL.revokeObjectURL(url),
  };
}

function extractPalette(data: Uint8ClampedArray): BrandPalette {
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>();
  let visiblePixels = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha < 160) continue;

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    const weight = alpha / 255;

    bucket.count += weight;
    bucket.red += red * weight;
    bucket.green += green * weight;
    bucket.blue += blue * weight;
    buckets.set(key, bucket);
    visiblePixels += weight;
  }

  if (visiblePixels < 8) {
    throw new LogoValidationError("The logo does not contain enough visible pixels.");
  }

  let clusters = Array.from(buckets.values())
    .filter((bucket) => bucket.count >= Math.max(1, visiblePixels * 0.0005))
    .map<ColorCluster>((bucket) => {
      const color = {
        red: Math.round(bucket.red / bucket.count),
        green: Math.round(bucket.green / bucket.count),
        blue: Math.round(bucket.blue / bucket.count),
      };
      const { saturation, lightness } = rgbToHsl(color);
      const middleToneWeight = 0.65 + Math.min(lightness, 1 - lightness) * 0.7;

      return {
        ...color,
        count: bucket.count,
        saturation,
        lightness,
        score: bucket.count * (1 + saturation * 1.8) * middleToneWeight,
      };
    });

  const meaningful = clusters.filter(
    (cluster) => cluster.saturation >= 0.06 || (cluster.lightness >= 0.06 && cluster.lightness <= 0.94),
  );

  if (meaningful.length) clusters = meaningful;
  clusters.sort((first, second) => second.score - first.score);

  const selected: Rgb[] = [];

  for (const cluster of clusters) {
    if (selected.every((color) => colorDistance(color, cluster) >= 58)) {
      selected.push(cluster);
    }
    if (selected.length === 3) break;
  }

  if (!selected.length) {
    selected.push(clusters[0] ?? { red: 17, green: 17, blue: 17 });
  }

  const primary = selected[0];
  const secondary = selected[1] ?? contrastColor(primary);
  const alternative = selected[2] ?? deriveAlternative(primary, secondary);

  return {
    primary: rgbToHex(primary),
    secondary: rgbToHex(secondary),
    alternative: rgbToHex(alternative),
  };
}

function rgbToHsl({ red, green, blue }: Rgb): { saturation: number; lightness: number } {
  const normalized = [red / 255, green / 255, blue / 255];
  const maximum = Math.max(...normalized);
  const minimum = Math.min(...normalized);
  const lightness = (maximum + minimum) / 2;
  const difference = maximum - minimum;
  const saturation = difference === 0 ? 0 : difference / (1 - Math.abs(2 * lightness - 1));

  return { saturation, lightness };
}

function colorDistance(first: Rgb, second: Rgb): number {
  const red = first.red - second.red;
  const green = first.green - second.green;
  const blue = first.blue - second.blue;
  return Math.sqrt(red * red * 0.3 + green * green * 0.59 + blue * blue * 0.11);
}

function contrastColor(color: Rgb): Rgb {
  return relativeLuminance(color) > 0.4
    ? { red: 17, green: 17, blue: 17 }
    : { red: 255, green: 255, blue: 255 };
}

function deriveAlternative(primary: Rgb, secondary: Rgb): Rgb {
  const primaryLuminance = relativeLuminance(primary);
  const target = primaryLuminance < 0.35 ? { red: 160, green: 160, blue: 160 } : { red: 80, green: 80, blue: 80 };
  const base = colorDistance(primary, secondary) < 58 ? target : secondary;

  return {
    red: Math.round(primary.red * 0.45 + base.red * 0.55),
    green: Math.round(primary.green * 0.45 + base.green * 0.55),
    blue: Math.round(primary.blue * 0.45 + base.blue * 0.55),
  };
}

function rgbToHex({ red, green, blue }: Rgb): HexColor {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase() as HexColor;
}

function hexToRgb(value: string): Rgb | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;

  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function relativeLuminance({ red, green, blue }: Rgb): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return channel(red) * 0.2126 + channel(green) * 0.7152 + channel(blue) * 0.0722;
}
