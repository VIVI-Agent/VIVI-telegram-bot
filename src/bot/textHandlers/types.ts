import { Address } from "viem";
import { GlobalSceneContext } from "@types";

/**
 * Pattern match result with extracted parameters
 */
export interface TextMatch {
  command: string;
  params: Record<string, any>;
}

/**
 * Text handler function signature
 */
export type TextHandler = (
  ctx: GlobalSceneContext,
  match: TextMatch,
  overrideAdditionalFeeReceivers?: Array<{ receiver: Address; bps: bigint }>
) => Promise<boolean>;

/**
 * Text pattern definition
 */
export interface TextPattern {
  name: string;
  pattern: RegExp;
  handler: TextHandler;
  description?: string;
  examples?: string[];
}

/**
 * Text manager interface
 */
export interface ITextManager {
  registerPattern(pattern: TextPattern): void;
  routeText(ctx: GlobalSceneContext, text: string): Promise<boolean>;
  getRegisteredPatterns(): TextPattern[];
}
