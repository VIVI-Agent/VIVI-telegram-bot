# 📝 Patrones de Logging - Sistema de Escenas

## 🎯 Objetivo

El sistema de logging de VIVI proporciona **contexto rico** y **formato consistente** en todas las clases del sistema de escenas.

## 📋 Formato Estándar

Todos los logs siguen este formato:

```
[ClassName:instanceId] User userId (@username) - Message
```

**Ejemplo:**

```
[MainMenuServices:MainMenu_1735123456789_abc123] User 123456 (@johndoe) - Loading user data
```

## 🔧 Métodos de Logging

### **En BaseSubScene, BaseService, BaseMenus**

#### **this.log(level, ctx, message)**

```typescript
// Logging con contexto completo de usuario
this.log("info", ctx, "Starting operation");
this.log("warn", ctx, "User not found in database");
this.log("error", ctx, "Failed to process request");
this.log("debug", ctx, "Processing callback: refresh");
```

#### **this.logWithoutContext(level, message)**

```typescript
// Cuando no hay contexto disponible (poco común)
this.logWithoutContext("info", "System starting up");
this.logWithoutContext("error", "Configuration missing");
```

#### **this.logError(ctx, methodName, error)**

```typescript
// Para manejo estandarizado de errores
try {
  await someOperation();
} catch (error) {
  this.logError(ctx, "someOperation", error);
  throw error;
}
```

## 🎨 Ejemplos por Tipo de Clase

### **En SubScenes (BaseSubScene)**

```typescript
export class MySceneSubScene extends BaseSubScene<MySceneData> {
  async onActivate(ctx: GlobalSceneContext): Promise<void> {
    this.log("info", ctx, "Activating scene");
    this.log("debug", ctx, `Scene data: ${JSON.stringify(data)}`);
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

    this.log("info", ctx, `Processing action: ${validation.action}`);

    try {
      // ... logic
    } catch (error) {
      await this.handleCallbackError(ctx, validation.action, error);
    }
  }
}
```

### **En Services (BaseService)**

```typescript
export class MySceneServices extends BaseService {
  async processData(ctx: GlobalSceneContext, data: any): Promise<void> {
    this.log("info", ctx, "Processing user data");

    try {
      this.log("debug", ctx, `Data size: ${data.length} items`);

      const result = await this.performOperation(data);

      this.log("info", ctx, "Data processed successfully");
      return result;
    } catch (error) {
      this.logError(ctx, "processData", error);
      throw error;
    }
  }
}
```

### **En Menus (BaseMenus)**

```typescript
export class MySceneMenus extends BaseMenus {
  async showMenu(ctx: GlobalSceneContext): Promise<number> {
    this.log("info", ctx, "Displaying menu");

    try {
      const sent = await ctx.reply("Menu text", keyboard);

      this.log(
        "info",
        ctx,
        `Menu displayed with message ID: ${sent.message_id}`
      );
      return sent.message_id;
    } catch (error) {
      this.logError(ctx, "showMenu", error);
      return 0;
    }
  }
}
```

## 📊 Niveles de Log

### **INFO** - Operaciones importantes

```typescript
this.log("info", ctx, "User data loaded successfully");
this.log("info", ctx, "Transitioning to MainMenu");
this.log("info", ctx, "Wallet created");
```

### **WARN** - Situaciones atípicas pero manejables

```typescript
this.log("warn", ctx, "User not found in database");
this.log("warn", ctx, "Failed to delete temp message");
this.log("warn", ctx, "Unknown callback action");
```

### **ERROR** - Errores que requieren atención

```typescript
this.log("error", ctx, "Database connection failed");
this.log("error", ctx, "Invalid user session");
```

### **DEBUG** - Información detallada para desarrollo

```typescript
this.log("debug", ctx, `Processing ${items.length} items`);
this.log("debug", ctx, "Callback validation successful");
this.log("debug", ctx, `Scene data updated: ${JSON.stringify(newData)}`);
```

## 🚫 Qué NO Hacer

### **❌ Logging Directo**

```typescript
// ❌ NUNCA hagas esto en clases de escena
import { logger } from "@logger";
logger.info("Something happened");
```

### **❌ Formato Inconsistente**

```typescript
// ❌ No uses formatos custom
this.log("info", ctx, `[CustomFormat] User ${userId} did something`);
```

### **❌ Información Sensible**

```typescript
// ❌ No logees información sensible
this.log("info", ctx, `Private key: ${privateKey}`);
this.log("info", ctx, `Password: ${password}`);
```

## ✅ Mejores Prácticas

### **1. Log al inicio de operaciones importantes**

```typescript
async createWallet(ctx: GlobalSceneContext): Promise<void> {
  this.log("info", ctx, "Creating wallet"); // ← Aquí
  // ... lógica
}
```

### **2. Log resultados exitosos**

```typescript
const wallet = await createWallet();
this.log("info", ctx, `Wallet created successfully: ${wallet.address}`);
```

### **3. Log en transiciones de estado**

```typescript
this.updateSceneData(ctx, { step: "completed" });
this.log("info", ctx, "Scene completed, transitioning to MainMenu");
```

### **4. Log errores con contexto**

```typescript
catch (error) {
  this.logError(ctx, "createWallet", error); // ← Incluye método
  throw error;
}
```

### **5. Debug para desarrollo**

```typescript
this.log(
  "debug",
  ctx,
  `Active scenes: ${Object.keys(ctx.session.activeSubScenes).join(", ")}`
);
```

## 🔍 Ejemplo Completo

```typescript
export class WalletServices extends BaseService {
  constructor(instanceId: string) {
    super(instanceId, "WalletServices");
  }

  async createUserWallet(
    ctx: GlobalSceneContext,
    address: string
  ): Promise<void> {
    this.log("info", ctx, "Creating user wallet");
    this.log("debug", ctx, `Wallet address: ${address}`);

    try {
      // Validación
      if (!this.isValidAddress(address)) {
        this.log("warn", ctx, "Invalid wallet address provided");
        throw new Error("Invalid address");
      }

      // Operación
      const wallet = await this.saveWallet(ctx.user.id, address);

      // Éxito
      this.log("info", ctx, "Wallet created and saved successfully");
      this.log("debug", ctx, `Wallet ID: ${wallet.id}`);

      return wallet;
    } catch (error) {
      this.logError(ctx, "createUserWallet", error);
      throw error;
    }
  }
}
```

## 📈 Beneficios

- ✅ **Debugging fácil** con contexto rico
- ✅ **Tracking de usuarios** en logs
- ✅ **Identificación de instancias** con instanceId
- ✅ **Formato consistente** en toda la aplicación
- ✅ **Información estructurada** para análisis
