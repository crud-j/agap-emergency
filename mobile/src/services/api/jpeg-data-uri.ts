/**
 * Turns a private JPEG response into a `data:` URI an <Image> can show. Private photos
 * can't be plain image URLs: the request must go through authedFetch, which refreshes an
 * expired token on a 401 (a plain <Image> request can't, and would just fail).
 * In memory only: these are people's faces, never written to disk.
 */
export async function responseToJpegDataUri(res: Response): Promise<string> {
  const blob = await res.blob();
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo'));
    reader.readAsDataURL(blob);
  });
  // Some runtimes lose the blob's type; the server always sends JPEG.
  return dataUri.replace(/^data:[^;,]*(;base64,)/, 'data:image/jpeg$1');
}
