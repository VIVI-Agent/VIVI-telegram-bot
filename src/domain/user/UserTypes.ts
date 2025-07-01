// src/domain/user/UserTypes.ts

import { Holding, Prisma, Token, User, Wallet } from "@prisma/client";

export type UserWithReferralsCount = Prisma.UserGetPayload<{
  include: {
    _count: {
      select: {
        referrals: true;
      };
    };
  };
}>;

export type UserWithAll = Prisma.UserGetPayload<{
  include: {
    buySettings: true;
    sellSettings: true;
  };
}>;

export type UserWithSettings = Prisma.UserGetPayload<{
  include: {
    buySettings: true;
    sellSettings: true;
  };
}>;

export type UserWithBuySettings = Prisma.UserGetPayload<{
  include: {
    buySettings: true;
  };
}>;

export type UserWithSellSettings = Prisma.UserGetPayload<{
  include: {
    sellSettings: true;
  };
}>;

export type UserWithWallets = Prisma.UserGetPayload<{
  include: {
    wallets: true;
  };
}>;

export type UserWithSelectedWalletAndSettings = Prisma.UserGetPayload<{
  include: {
    wallets: { where: { isSelected: true; isDeleted: false } };
    buySettings: true;
    sellSettings: true;
  };
}>;

export type UserWithWalletAndHoldings = User & {
  wallets: Array<
    Wallet & {
      holdings: Array<
        Holding & {
          token: Token;
        }
      >;
    }
  >;
};

export type UserWithWalletsAndHolding = User & {
  wallets: Array<
    Wallet & {
      holdings: (Holding & { token: Token }) | null;
    }
  >;
};

export type UserWithSelectedWalletAndHoldings = User & {
  wallets: Array<
    Wallet & {
      holdings: Array<
        Holding & {
          token: Token;
        }
      >;
    }
  >;
};
