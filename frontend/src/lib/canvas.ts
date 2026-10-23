export const K = 1.15;
export const W = Math.round(1920 * K);
export const H = Math.round(1321 * K);

export function canvasPosition(
  desktop: boolean,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  return desktop
    ? {
        position: "absolute" as const,
        left: left * K,
        top: top * K,
        width: width * K,
        height: height * K,
      }
    : undefined;
}
