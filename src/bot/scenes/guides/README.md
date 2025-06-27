# 🎭 Sistema de Escenas - VIVI Telegram Bot

## 📋 Visión General

El sistema de escenas de VIVI utiliza una arquitectura modular y basada en herencia que permite manejar flujos complejos de usuario de manera consistente y mantenible.

## 🏗️ Arquitectura

### **GlobalSceneManager**

- **Ubicación:** `src/bot/core/GlobalSceneManager.ts`
- **Función:** Maneja múltiples instancias de escenas por usuario con sistema FIFO (máximo 5)
- **Características:**
  - Dynamic imports para optimización
  - Routing automático de callbacks con `instanceId`
  - Sesiones persistentes en Redis
  - Cleanup automático de escenas antiguas

### **Clases Base**

#### **BaseSubScene<TSceneData>**

- **Ubicación:** `src/bot/types/sceneManager/BaseSubScene.ts`
- **Propósito:** Clase base para todas las escenas principales
- **Características:**
  - Logging consistente con contexto de usuario
  - Helpers para manejo de scene data tipados
  - Validación automática de callbacks con instanceId
  - Gestión de mensajes principales y temporales
  - Manejo robusto de errores en callbacks
  - Sistema de cleanup automático
  - Tracking de actividad de usuario

#### **BaseService**

- **Ubicación:** `src/bot/types/sceneManager/BaseService.ts`
- **Propósito:** Clase base para servicios de negocio
- **Características:**
  - Logging consistente
  - Manejo de errores estandarizado
  - Sin dependencias de UI

#### **BaseMenus**

- **Ubicación:** `src/bot/types/sceneManager/BaseMenus.ts`
- **Propósito:** Clase base para gestión de menús
- **Características:**
  - Creación automática de callbacks con instanceId
  - Logging consistente
  - Helpers para UI

## 📁 Estructura Estándar de Escenas

```
📁 scenes/
  📁 sceneName/
    📄 SceneNameSubScene.ts     ← Clase principal (extiende BaseSubScene)
    📄 SceneNameServices.ts     ← Lógica de negocio (extiende BaseService)
    📄 SceneNameMenus.ts        ← Gestión de menús (extiende BaseMenus)
    📄 messages.ts              ← Mensajes centralizados
    📄 callbacks.ts             ← Constantes de callbacks
```

## 🔄 Flujo del Sistema

1. **Activación:** `GlobalSceneManager.activateScene()` crea instancia única
2. **Routing:** Callbacks con formato `instanceId:action` se enrutan automáticamente
3. **Lifecycle:** `onActivate()` → `handleCallback()/handleText()` → `cleanup()`
4. **Transición:** Escenas pueden activar/desactivar otras escenas

## 📖 Guías Específicas

- **[Crear Nueva Escena](./CREATE_SCENE.md)** - Template paso a paso
- **[Referencia BaseSubScene](./BASESUBSCENE_METHODS.md)** - Documentación completa de métodos
- **[Patrones de Logging](./LOGGING.md)** - Cómo usar el sistema de logs
- **[Mejores Prácticas](./BEST_PRACTICES.md)** - Convenciones y tips

## 🎯 Escenas Implementadas

### **InitUser**

- **Propósito:** Registro de nuevos usuarios y creación de wallet
- **Flujo:** Creación de wallet → Mostrar clave privada → Confirmación → Transición a MainMenu
- **Archivos:** `initUser/InitUserSubScene.ts`, `initUser/InitUserServices.ts`

### **MainMenu**

- **Propósito:** Menú principal con navegación
- **Flujo:** Carga de datos → Mostrar menú → Manejar acciones
- **Archivos:** `mainMenu/MainMenuSubScene.ts`, `mainMenu/MainMenuServices.ts`, `mainMenu/MainMenuMenus.ts`

## 🔧 Tecnologías

- **TypeScript** con typing fuerte
- **Telegraf** para API de Telegram
- **Redis** para persistencia de sesiones
- **Prisma** para base de datos
- **Winston** para logging

## 📊 Beneficios del Sistema

- ✅ **Consistencia:** Patrones uniformes en todas las escenas
- ✅ **Mantenibilidad:** Cambios centralizados en clases base
- ✅ **Escalabilidad:** Fácil agregar nuevas escenas
- ✅ **Debugging:** Logging rico con contexto
- ✅ **Type Safety:** TypeScript en toda la arquitectura
