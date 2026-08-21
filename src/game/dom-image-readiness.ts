/** Establishes a clock barrier on the images used by one visible DOM segment. */
export async function prepareDomImageElements(
  images: Iterable<HTMLImageElement>,
): Promise<void> {
  const pendingImages = [...images];
  let cursor = 0;
  const worker = async () => {
    while (cursor < pendingImages.length) {
      const image = pendingImages[cursor];
      cursor += 1;
      await image.decode();
      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        throw new Error(`DOM image decoded empty: ${image.src}`);
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(6, pendingImages.length) },
    () => worker(),
  ));
}
