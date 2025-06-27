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

## 🔧 Métodos Disponibles de BaseSubScene

### **Logging y Debugging**

```typescript
// Logging consistente con contexto de usuario
protected log(level: "info" | "warn" | "error" | "debug", ctx: GlobalSceneContext, message: string): void

// Ejemplo de uso
this.log("info", ctx, "Processing user request");
this.log("error", ctx, `Failed to load data: ${error.message}`);
```

### **Manejo de Scene Data**

```typescript
// Obtener datos tipados de la escena
protected getSceneData(ctx: GlobalSceneContext): TSceneData

// Actualizar datos de la escena parcialmente
protected updateSceneData(ctx: GlobalSceneContext, data: Partial<TSceneData>): void

// Ejemplo de uso
const sceneData = this.getSceneData(ctx);
this.updateSceneData(ctx, { step: "completed", result: data });
```

### **Gestión de Mensajes**

```typescript
// Establecer el mensaje principal de la escena (para navegación single-message)
protected setMainMessageId(ctx: GlobalSceneContext, messageId: number): void

// Obtener el ID del mensaje principal
protected getMainMessageId(ctx: GlobalSceneContext): number | undefined

// Agregar mensaje temporal para cleanup automático
protected addTempMessageId(ctx: GlobalSceneContext, messageId: number): void

// Ejemplo de uso
const mainMsg = await ctx.reply("Menu principal", keyboard);
this.setMainMessageId(ctx, mainMsg.message_id);

const tempMsg = await ctx.reply("Loading...");
this.addTempMessageId(ctx, tempMsg.message_id);
```

### **Callbacks y Validación**

```typescript
// Crear callback con instanceId para routing correcto
protected createCallback(action: string): string

// Validar que el callback pertenece a esta instancia
protected validateCallbackInstanceId(callback: string): { instanceId: string; action: string } | null

// Ejemplo de uso
const keyboard = Markup.inlineKeyboard([
  Markup.button.callback("Confirmar", this.createCallback("confirm"))
]);

// En handleCallback
const validation = this.validateCallbackInstanceId(callback);
if (!validation) return false;
const { action } = validation;
```

### **Manejo de Errores**

```typescript
// Manejo consistente de errores en callbacks
protected async handleCallbackError(
  ctx: GlobalSceneContext,
  action: string,
  error: unknown,
  userMessage?: string
): Promise<void>

// Ejemplo de uso
try {
  await this.processAction(ctx);
} catch (error) {
  await this.handleCallbackError(ctx, action, error, "❌ No se pudo procesar la acción");
  return true;
}
```

### **Actividad y Cleanup**

```typescript
// Actualizar timestamp de última actividad
protected updateLastActivity(ctx: GlobalSceneContext): void

// Limpiar mensajes temporales automáticamente
protected async cleanupTempMessages(ctx: GlobalSceneContext): Promise<void>

// Limpiar mensaje principal
protected async cleanupMainMessage(ctx: GlobalSceneContext): Promise<void>

// Override del cleanup general (opcional)
async cleanup(ctx: GlobalSceneContext): Promise<void>

// Ejemplo de uso personalizado
async cleanup(ctx: GlobalSceneContext): Promise<void> {
  // Cleanup personalizado primero
  await this.cancelPendingOperations(ctx);

  // Luego el cleanup estándar
  await super.cleanup(ctx);
}
```

## 💡 Tips

1. **Siempre usar this.log()** para logging consistente con contexto de usuario
2. **Validar callbacks** con validateCallbackInstanceId() antes de procesarlos
3. **Manejar errores** con try-catch y handleCallbackError() para UX consistente
4. **Actualizar scene data** con updateSceneData() para mantener estado tipado
5. **Usar setMainMessageId()** para patrones de navegación single-message
6. **Agregar temp messages** con addTempMessageId() para cleanup automático
7. **Cleanup automático** se maneja por BaseSubScene, solo override si necesitas lógica específica
8. **Actualizar actividad** con updateLastActivity() en operaciones importantes
