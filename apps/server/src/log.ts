const stamp = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (...args: unknown[]) => console.log(`${stamp()} info `, ...args),
  warn: (...args: unknown[]) => console.warn(`${stamp()} warn `, ...args),
  error: (...args: unknown[]) => console.error(`${stamp()} error`, ...args),
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG) console.log(`${stamp()} debug`, ...args);
  },
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
