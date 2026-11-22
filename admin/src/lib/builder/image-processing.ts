import sharp from "sharp";
export async function optimizeImage(bytes: Buffer) {
  const image = sharp(bytes, { limitInputPixels: 40000000, failOn: "error" });
  const metadata = await image.metadata();
  if ((metadata.pages || 1) > 1)
    throw new Error("Animated images are not supported. Choose a still image.");
  const main = await image
    .rotate()
    .resize({
      width: 2560,
      height: 2560,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 84, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await sharp(main.data)
    .resize({
      width: 480,
      height: 480,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 76 })
    .toBuffer({ resolveWithObject: true });
  return { main, thumbnail };
}
