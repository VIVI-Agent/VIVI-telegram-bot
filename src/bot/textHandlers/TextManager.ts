import { logger } from "@logger";
import { GlobalSceneContext } from "@types";
import { ITextManager, TextPattern, TextMatch } from "./types";

export class TextManager implements ITextManager {
  private patterns: TextPattern[] = [];
  private readonly logPrefix = "[TextManager]";

  /**
   * Register a new text pattern handler
   */
  registerPattern(pattern: TextPattern): void {
    logger.debug(`${this.logPrefix} Registering pattern: ${pattern.name}`);
    this.patterns.push(pattern);
  }

  /**
   * Route incoming text to appropriate handler
   * @param ctx Telegram context
   * @param text User input text
   * @returns true if text was handled, false otherwise
   */
  async routeText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    const trimmedText = text.trim();

    logger.info(`${this.logPrefix} 🔄 Routing text: "${trimmedText}"`);

    // Try each registered pattern
    for (const textPattern of this.patterns) {
      const match = trimmedText.match(textPattern.pattern);

      if (match) {
        logger.info(
          `${this.logPrefix} ✅ Pattern matched: ${textPattern.name}`
        );

        try {
          // Extract parameters from the match
          const params = this.extractParams(match, textPattern);

          const textMatch: TextMatch = {
            command: textPattern.name,
            params,
          };

          // Execute the handler
          const handled = await textPattern.handler(ctx, textMatch);

          if (handled) {
            logger.info(
              `${this.logPrefix} ✅ Text handled by ${textPattern.name}`
            );
            return true;
          } else {
            logger.debug(
              `${this.logPrefix} Handler ${textPattern.name} returned false, continuing to next pattern`
            );
          }
        } catch (error) {
          logger.error(
            `${this.logPrefix} Error executing handler ${textPattern.name}:`,
            error
          );
          // Continue to next pattern instead of throwing
          continue;
        }
      }
    }

    logger.debug(
      `${this.logPrefix} ❌ No pattern matched for: "${trimmedText}"`
    );
    return false;
  }

  /**
   * Get all registered patterns (useful for debugging/admin)
   */
  getRegisteredPatterns(): TextPattern[] {
    return [...this.patterns];
  }

  /**
   * Extract named parameters from regex match
   */
  private extractParams(
    match: RegExpMatchArray,
    pattern: TextPattern
  ): Record<string, any> {
    const params: Record<string, any> = {};

    // Add the full match
    params.fullMatch = match[0];

    // Add numbered groups
    if (match.length > 1) {
      for (let i = 1; i < match.length; i++) {
        params[`group${i}`] = match[i];
      }
    }

    // Add named groups if available
    if (match.groups) {
      Object.assign(params, match.groups);
    }

    logger.debug(
      `${this.logPrefix} Extracted params for ${pattern.name}:`,
      params
    );
    return params;
  }

  /**
   * Get pattern count (useful for monitoring)
   */
  getPatternCount(): number {
    return this.patterns.length;
  }

  /**
   * Clear all patterns (useful for testing)
   */
  clearPatterns(): void {
    logger.debug(`${this.logPrefix} Clearing all patterns`);
    this.patterns = [];
  }
}
