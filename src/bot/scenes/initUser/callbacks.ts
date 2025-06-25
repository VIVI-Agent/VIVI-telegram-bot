export const CALLBACKS = {
  CONFIRM_PRIVATE_KEY: "confirm_private_key",
} as const;

export type InitUserCallbackAction = (typeof CALLBACKS)[keyof typeof CALLBACKS];

export function createInitUserCallback(
  instanceId: string,
  action: InitUserCallbackAction
): string {
  return `${instanceId}:${action}`;
}
