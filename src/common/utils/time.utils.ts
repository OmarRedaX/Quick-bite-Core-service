
export interface Duration {
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
}

export function toMilliseconds(duration: Duration): number {
  return (
        (duration.days ?? 0) * 24 * 60 * 60 * 1000 +
        (duration.hours ?? 0) * 60 * 60 * 1000 +
        (duration.minutes ?? 0) * 60 * 1000 +
        (duration.seconds ?? 0) * 1000
    );
}