// src/server/controllers/admin/feeWhitelistController.ts
import { Request, Response } from "express";
import { apiLogger } from "../../../logger/logger";
import { WhitelistType } from "@prisma/client";

export async function getAllFeeWhitelists(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const whitelists =
      await req.services.feeWhitelistService.getAllWhitelists();

    // Extract addresses from whitelists
    const addresses = whitelists.map((whitelist) => whitelist.address as any);

    // Get all tokens in a single query
    const tokens = await req.services.tokenService.getTokensByAddresses(
      addresses
    );

    // Create a map for quick lookup
    const tokenMap = new Map(
      tokens.map((token) => [token.address.toLowerCase(), token])
    );

    // Enrich whitelist entries with token symbols
    const enrichedWhitelists = whitelists.map((whitelist) => {
      const token = tokenMap.get(whitelist.address.toLowerCase());
      return {
        ...whitelist,
        tokenSymbol: token?.symbol || null,
        tokenName: token?.name || null,
      };
    });

    res.json(enrichedWhitelists);
  } catch (error) {
    apiLogger.error("Error fetching fee whitelists:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function createFeeWhitelist(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      address,
      feeBps = 100,
      bonusPointsPercent = 0,
      type = "OTHER",
    } = req.body;

    if (!address) {
      res.status(400).json({ error: "Address is required" });
      return;
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ error: "Invalid Ethereum address format" });
      return;
    }

    // Normalize and validate other inputs
    const normalizedFeeBps = Number(feeBps);
    const normalizedBonusPoints = Number(bonusPointsPercent);
    const normalizedType = (type || "OTHER").toUpperCase() as WhitelistType;

    if (
      isNaN(normalizedFeeBps) ||
      normalizedFeeBps < 0 ||
      normalizedFeeBps > 9500
    ) {
      res.status(400).json({ error: "Fee BPS must be between 0 and 9500" });
      return;
    }

    if (isNaN(normalizedBonusPoints) || normalizedBonusPoints < 0) {
      res
        .status(400)
        .json({ error: "Bonus points percentage must be a positive number" });
      return;
    }

    if (!["DAOSWORLD", "OTHER", "STABLE"].includes(normalizedType)) {
      res
        .status(400)
        .json({ error: "Type must be one of: DAOSWORLD, OTHER, STABLE" });
      return;
    }

    // Check if address already exists in whitelist
    const existing = await req.services.feeWhitelistService.getTokenWhitelist(
      address
    );
    if (existing) {
      res.status(409).json({ error: "Address already whitelisted" });
      return;
    }

    // Check if token exists in database
    let token = await req.services.tokenService.getTokenByAddress(
      address.toLowerCase() as any
    );

    if (!token) {
      // If token doesn't exist, we'll need to fetch it from blockchain
      // For now, we'll just check if the address is valid
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        res.status(400).json({ error: "Invalid token address format" });
        return;
      }

      // Create a basic token entry (you might want to fetch real token info here)
      token = await req.services.tokenService.createToken(
        address.toLowerCase() as any,
        {
          address: address.toLowerCase(),
          name: "Unknown Token",
          symbol: "UNK",
          decimals: 18,
        }
      );
    }

    // Now that we have the token, check for symbol conflicts with existing whitelisted tokens
    const allWhitelists =
      await req.services.feeWhitelistService.getAllWhitelists();
    const whitelistedAddresses = allWhitelists.map((w: any) => w.address);

    // Get tokens for all whitelisted addresses
    const tokenPromises = whitelistedAddresses.map((addr: any) =>
      req.services.tokenService.getTokenByAddress(addr)
    );
    const whitelistedTokens = await Promise.all(tokenPromises);
    const validWhitelistedTokens = whitelistedTokens.filter(
      (t: any) => t !== null
    );

    // Check if any whitelisted token has the same symbol
    const conflictingToken = validWhitelistedTokens.find(
      (t: any) =>
        t.symbol.trim().toLowerCase() === token!.symbol.trim().toLowerCase() &&
        t.address.toLowerCase() !== address.toLowerCase()
    );

    if (conflictingToken) {
      res.status(409).json({
        error: `Cannot add token: A token with symbol "${token.symbol.trim()}" is already whitelisted at address ${
          conflictingToken.address
        }. Duplicate symbols are not allowed in the whitelist.`,
      });
      return;
    }

    const whitelist = await req.services.feeWhitelistService.createWhitelist({
      address: address.toLowerCase(),
      feeBps: normalizedFeeBps,
      bonusPointsPercent: normalizedBonusPoints,
      type: normalizedType,
    });

    res.status(201).json(whitelist);
  } catch (error) {
    apiLogger.error("Error creating fee whitelist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateFeeWhitelist(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { feeBps, bonusPointsPercent, type } = req.body;

    if (!id || isNaN(Number(id))) {
      res.status(400).json({ error: "Valid whitelist ID is required" });
      return;
    }

    // Check if whitelist exists
    const existing = await req.services.feeWhitelistService.getWhitelistById(
      Number(id)
    );
    if (!existing) {
      res.status(404).json({ error: "Whitelist entry not found" });
      return;
    }

    // Validate and normalize inputs
    const updates: any = {};

    if (feeBps !== undefined) {
      const normalizedFeeBps = Number(feeBps);
      if (
        isNaN(normalizedFeeBps) ||
        normalizedFeeBps < 0 ||
        normalizedFeeBps > 9500
      ) {
        res.status(400).json({ error: "Fee BPS must be between 0 and 9500" });
        return;
      }
      updates.feeBps = normalizedFeeBps;
    }

    if (bonusPointsPercent !== undefined) {
      const normalizedBonusPoints = Number(bonusPointsPercent);
      if (isNaN(normalizedBonusPoints) || normalizedBonusPoints < 0) {
        res
          .status(400)
          .json({ error: "Bonus points percentage must be a positive number" });
        return;
      }
      updates.bonusPointsPercent = normalizedBonusPoints;
    }

    if (type !== undefined) {
      const normalizedType = type.toUpperCase();
      if (!["DAOSWORLD", "OTHER", "STABLE"].includes(normalizedType)) {
        res
          .status(400)
          .json({ error: "Type must be one of: DAOSWORLD, OTHER, STABLE" });
        return;
      }
      updates.type = normalizedType;
    }

    const updatedWhitelist =
      await req.services.feeWhitelistService.updateWhitelist(
        Number(id),
        updates
      );

    res.json(updatedWhitelist);
  } catch (error) {
    apiLogger.error("Error updating fee whitelist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteFeeWhitelist(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      res.status(400).json({ error: "Valid whitelist ID is required" });
      return;
    }

    // Check if whitelist exists
    const existing = await req.services.feeWhitelistService.getWhitelistById(
      Number(id)
    );
    if (!existing) {
      res.status(404).json({ error: "Whitelist entry not found" });
      return;
    }

    await req.services.feeWhitelistService.deleteWhitelist(Number(id));

    res.status(204).send();
  } catch (error) {
    apiLogger.error("Error deleting fee whitelist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
