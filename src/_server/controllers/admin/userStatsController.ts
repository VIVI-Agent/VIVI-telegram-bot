// src/server/controllers/admin/userStatsController.ts
import { Request, Response } from "express";
import { apiLogger } from "../../../logger/logger";

/**
 * Get basic user statistics
 */
export async function getUserStats(req: Request, res: Response): Promise<void> {
  try {
    // Get total count of users
    const totalUsers = await req.prisma.user.count();

    // Get count of registered users (with tgUsername and tgUserId)
    const registeredUsers = await req.prisma.user.count({
      where: {
        tgUsername: { not: null },
        tgUserId: { not: null },
      },
    });

    // Get count of pending users (without tgUsername or tgUserId)
    const pendingUsers = await req.prisma.user.count({
      where: {
        OR: [{ tgUsername: null }, { tgUserId: null }],
      },
    });

    res.json({
      totalUsers,
      registeredUsers,
      pendingUsers,
    });
  } catch (error) {
    apiLogger.error("Error fetching user stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Get user registration counts by day
 */
export async function getUserRegistrationsByDay(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Get date range from query params or use last 30 days as default
    const { days } = req.query;
    const daysToLookBack = days ? parseInt(days as string) : 30;

    // Calculate the start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToLookBack);
    startDate.setHours(0, 0, 0, 0);

    // Get all users created after the start date
    const users = await req.prisma.user.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Create a map to hold counts by day
    const registrationsByDay = new Map();

    // Prepare all dates in the range
    for (let i = 0; i <= daysToLookBack; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateString = date.toISOString().split("T")[0];
      registrationsByDay.set(dateString, 0);
    }

    // Count users by day
    users.forEach((user: any) => {
      const dateString = user.createdAt.toISOString().split("T")[0];
      const currentCount = registrationsByDay.get(dateString) || 0;
      registrationsByDay.set(dateString, currentCount + 1);
    });

    // Convert the map to an array of objects for the response
    const result = Array.from(registrationsByDay.entries()).map(
      ([date, count]) => ({
        date,
        count,
      })
    );

    res.json(result);
  } catch (error) {
    apiLogger.error("Error fetching user registrations by day:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Get cumulative user data with real totals (not just within time range)
 */
export async function getUserCumulativeData(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Get date range from query params or use last 30 days as default
    const { days } = req.query;
    const daysToLookBack = days ? parseInt(days as string) : 30;

    // Calculate the start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToLookBack);
    startDate.setHours(0, 0, 0, 0);

    // Get all users from the beginning of time up to each date in our range
    const result = [];

    for (let i = 0; i <= daysToLookBack; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      currentDate.setHours(23, 59, 59, 999); // End of the day

      // Count all users created up to this date
      const cumulativeCount = await req.prisma.user.count({
        where: {
          createdAt: { lte: currentDate },
        },
      });

      const dateString = currentDate.toISOString().split("T")[0];
      result.push({
        date: dateString,
        cumulativeUsers: cumulativeCount,
      });
    }

    res.json(result);
  } catch (error) {
    apiLogger.error("Error fetching cumulative user data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Get user timeline information (first user date, max days available)
 */
export async function getUserTimeline(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Get the first user's creation date
    const firstUser = await req.prisma.user.findFirst({
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!firstUser) {
      res.json({
        firstUserDate: null,
        maxDaysAvailable: 0,
      });
      return;
    }

    // Calculate maximum days available
    const now = new Date();
    const firstUserDate = new Date(firstUser.createdAt);
    const timeDiff = now.getTime() - firstUserDate.getTime();
    const maxDaysAvailable = Math.ceil(timeDiff / (1000 * 3600 * 24));

    res.json({
      firstUserDate: firstUserDate.toISOString().split("T")[0],
      maxDaysAvailable,
    });
  } catch (error) {
    apiLogger.error("Error fetching user timeline:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
