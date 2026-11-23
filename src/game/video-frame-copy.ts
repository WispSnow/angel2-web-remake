/**
 * Safari draws a `<video>` onto a 2D canvas as `source-over` whatever `globalCompositeOperation` says (user
 * report 2026-11-22, confirmed on a probe page; the encode before `REMAKE-214` fails the same way). The stacked
 * alpha videos are composited as `multiply` of the `1 − alpha` half, then `lighter` of the colour half, so in
 * Safari both passes simply painted over the scene: the HD title's women and the story illustrations with
 * clouds stood on black. Copying the current frame onto a canvas first and compositing from that canvas works
 * in every browser.
 *
 * The copy is redone only when the video has moved on from the frame it copied last, so a paused video costs
 * one copy, not one per animation frame.
 */
export class VideoFrameCopy {
  private readonly canvas = document.createElement("canvas");
  private readonly context = this.canvas.getContext("2d");
  private copied?: { readonly video: HTMLVideoElement; readonly source: string; readonly time: number };

  /** The video's current frame at its natural size, or `undefined` while it has no frame to show. */
  frame(video: HTMLVideoElement): HTMLCanvasElement | undefined {
    const { videoWidth: width, videoHeight: height } = video;
    if (!this.context || width === 0 || height === 0 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return undefined;
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.copied = undefined;
    }
    const source = video.currentSrc;
    const time = video.currentTime;
    const copied = this.copied;
    if (copied?.video !== video || copied.source !== source || copied.time !== time) {
      // The video is opaque and covers the whole copy, so a plain draw replaces the previous frame.
      this.context.drawImage(video, 0, 0);
      // While a seek is still decoding, the shown frame may not belong to `time` yet: copy again next time.
      this.copied = video.seeking ? undefined : { video, source, time };
    }
    return this.canvas;
  }

  /** Frees the copy's backing store; the next `frame` call sizes it again. */
  release(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.copied = undefined;
  }
}
