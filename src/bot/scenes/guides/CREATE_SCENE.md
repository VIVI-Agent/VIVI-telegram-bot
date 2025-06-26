# 🎨 Crear Nueva Escena - Guía Paso a Paso

## 📋 Template Básico

### 1. **Crear Estructura de Carpetas**

```bash
mkdir src/bot/scenes/myScene
```

### 2. **Archivos Requeridos**

```
📁 myScene/
  📄 MySceneSubScene.ts      ← Clase principal
  📄 MySceneServices.ts      ← Lógica de negocio (opcional)
  📄 MySceneMenus.ts         ← Menús (opcional)
  📄 messages.ts             ← Mensajes
  📄 callbacks.ts            ← Constantes de callbacks
```

## 🔧 Templates de Código

### **MySceneSubScene.ts**

```typescript
import { BaseSubScene, GlobalSceneContext } from "@types";
import { MySceneServices } from "./MySceneServices";
import { CALLBACKS } from "./callbacks";
import { MY_SCENE_TEXTS } from "./messages";

interface MySceneData {
  step: "initial" | "processing" | "completed";
  someValue?: string;
}

export class MySceneSubScene extends BaseSubScene<MySceneData> {
  private services: MySceneServices;

  constructor(instanceId: string) {
    super(instanceId, "MyScene");
    this.services = new MySceneServices(instanceId);
  }

  async onActivate(ctx: GlobalSceneContext, data?: any): Promise<void> {
    this.log("info", ctx, "Activating MyScene");

    try {
      // Inicializar scene data
      this.updateSceneData(ctx, { step: "initial" });

      // Lógica específica de activación
      await this.showInitialMenu(ctx);
    } catch (error) {
      this.log("error", ctx, `Error during activation: ${error}`);
      await ctx.reply("❌ Error initializing scene");
    }
  }

  async handleCallback(
    ctx: GlobalSceneContext,
    callback: string
  ): Promise<boolean> {
    this.log("debug", ctx, `Handling callback: ${callback}`);

    const validation = this.validateCallbackInstanceId(callback);
    if (!validation) {
      this.log("debug", ctx, "InstanceId mismatch, skipping");
      return false;
    }

    const { action } = validation;
    this.log("info", ctx, `Processing action: ${action}`);

    try {
      switch (action) {
        case CALLBACKS.ACTION_1:
          return await this.handleAction1(ctx);
        case CALLBACKS.ACTION_2:
          return await this.handleAction2(ctx);
        default:
          this.log("warn", ctx, `Unknown action: ${action}`);
          return false;
      }
    } catch (error) {
      await this.handleCallbackError(ctx, action, error);
      return true;
    }
  }

  async handleText(ctx: GlobalSceneContext, text: string): Promise<boolean> {
    this.log("debug", ctx, `Handling text: ${text}`);
    // Implementar si la escena maneja texto
    return false;
  }

  // Métodos privados específicos
  private async showInitialMenu(ctx: GlobalSceneContext): Promise<void> {
    // Implementación específica
  }

  private async handleAction1(ctx: GlobalSceneContext): Promise<boolean> {
    this.log("info", ctx, "Handling action 1");
    // Implementación específica
    return true;
  }

  private async handleAction2(ctx: GlobalSceneContext): Promise<boolean> {
    this.log("info", ctx, "Handling action 2");
    // Implementación específica
    return true;
  }
}
```

### **MySceneServices.ts**

```typescript
import { BaseService, GlobalSceneContext } from "@types";

export class MySceneServices extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "MySceneServices");
  }

  async doSomething(ctx: GlobalSceneContext): Promise<any> {
    this.log("info", ctx, "Doing something");

    try {
      // Lógica de negocio
      const result = await this.performBusinessLogic();

      this.log("info", ctx, "Operation completed successfully");
      return result;
    } catch (error) {
      this.logError(ctx, "doSomething", error);
      throw error;
    }
  }

  private async performBusinessLogic(): Promise<any> {
    // Implementación específica
    return {};
  }
}
```

### **MySceneMenus.ts** (opcional)

```typescript
import { BaseMenus, GlobalSceneContext } from "@types";
import { Markup } from "telegraf";
import { CALLBACKS } from "./callbacks";

export class MySceneMenus extends BaseMenus {
  constructor(instanceId: string) {
    super(instanceId, "MySceneMenus");
  }

  async showMainMenu(ctx: GlobalSceneContext): Promise<number> {
    this.log("info", ctx, "Showing main menu");

    try {
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "Option 1",
            this.createCallback(CALLBACKS.ACTION_1)
          ),
        ],
        [
          Markup.button.callback(
            "Option 2",
            this.createCallback(CALLBACKS.ACTION_2)
          ),
        ],
      ]);

      const sent = await ctx.reply("Choose an option:", keyboard);
      return sent.message_id;
    } catch (error) {
      this.logError(ctx, "showMainMenu", error);
      return 0;
    }
  }
}
```

### **callbacks.ts**

```typescript
export const CALLBACKS = {
  ACTION_1: "action_1",
  ACTION_2: "action_2",
  CANCEL: "cancel",
} as const;

export type MySceneCallbackAction = (typeof CALLBACKS)[keyof typeof CALLBACKS];

export function createMySceneCallback(
  instanceId: string,
  action: MySceneCallbackAction
): string {
  return `${instanceId}:${action}`;
}
```

### **messages.ts**

```typescript
export const MY_SCENE_TEXTS = {
  MESSAGES: {
    WELCOME: "Welcome to MyScene!",
    SUCCESS: "Operation completed successfully!",
    ERROR: "Something went wrong, please try again.",
  },

  FUNCTIONS: {
    getWelcomeMessage(userName: string): string {
      return `Hello ${userName}, welcome to MyScene!`;
    },

    getStatusMessage(status: string): string {
      return `Current status: ${status}`;
    },
  },
} as const;
```

## 🔄 Integración con GlobalSceneManager

### **Agregar al GlobalSceneManager**

En `src/bot/core/GlobalSceneManager.ts`, agregar el case:

```typescript
switch (sceneType) {
  case "InitUser":
  // ... existing cases
  case "MyScene":
    const { MySceneSubScene } = await import(
      "../scenes/myScene/MySceneSubScene"
    );
    scene = new MySceneSubScene(instanceId);
    break;
  default:
    throw new Error(`Unknown scene type: ${sceneType}`);
}
```

### **Activar la Escena**

```typescript
// Desde otra escena o middleware
await ctx.sceneManager.activateScene(ctx, "MyScene", { someData: "value" });
```

## ✅ Checklist

- [ ] Crear estructura de carpetas
- [ ] Implementar SubScene extendiendo BaseSubScene
- [ ] Crear Services si es necesario (extiende BaseService)
- [ ] Crear Menus si es necesario (extiende BaseMenus)
- [ ] Definir callbacks en callbacks.ts
- [ ] Centralizar mensajes en messages.ts
- [ ] Agregar case en GlobalSceneManager
- [ ] Probar activación y navegación
- [ ] Verificar cleanup y transiciones

## 💡 Tips

1. **Siempre usar this.log()** para logging consistente
2. **Validar callbacks** con validateCallbackInstanceId()
3. **Manejar errores** con try-catch y handleCallbackError()
4. **Actualizar scene data** con updateSceneData()
5. **Cleanup automático** se maneja por BaseSubScene, solo override si necesitas algo específico
