// src/bot/types/globalSceneTypes.ts

import { Context } from "telegraf";
import { GlobalSessionData } from "./GlobalSessionData";
import { MyServices } from "@domain";
import { GlobalSceneManager } from "../sceneManager/GlobalSceneManager";

// Main Scene Context
export interface GlobalSceneContext extends Context {
  user?: any; // User Authenticated
  walletCreated?: boolean; // Wallet Created

  session: GlobalSessionData; // Global Session Data
  services: MyServices; // Services Injected by the GlobalSceneManager
  sceneManager: GlobalSceneManager; // Scene Manager for transitions
}
