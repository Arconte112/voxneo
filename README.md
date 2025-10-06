# VoxNeo – Transcriptor de Escritorio Potenciado por Groq

VoxNeo es una aplicación de escritorio (Electron + Vite + React) que ofrece **transcripción instantánea**, atajos globales y un historial consultable para creadores de contenido, periodistas y equipos de soporte. La captura se realiza localmente y la transcripción se procesa con la API de **Groq Whisper** para obtener respuestas rápidas y asequibles.

## Características principales
- **Overlay flotante** siempre visible que indica el estado de grabación.
- **Icono en la bandeja del sistema** con controles rápidos (historial, ajustes, salir).
- **Atajos globales configurables** (`Ctrl + Space` por defecto) para iniciar/detener transcripciones.
- **Copia automática al portapapeles** y guardado en base local SQLite.
- **Historial paginado** con búsqueda, favoritos, exportación y filtros.
- **Sincronización opcional** a través de webhooks personalizados.

## Stack tecnológico
- **Electron 30** con Vite + React 19 + TypeScript.
- **Base de datos local**: better-sqlite3 a través de `TranscriptDatabase` (persistencia offline).
- **Transcripción**: Groq API (`https://api.groq.com/openai/v1/audio/transcriptions`).
- **UI/UX**: Tailwind CSS, Zustand, Radix UI (en la capa renderer).

## Estructura relevante
```
src/
 ├─ main/            # Procesos principales (ventanas, bandeja, atajos)
 ├─ preload/         # Bridges seguros entre main y renderer
 ├─ renderer/        # UI React (overlay, history, settings)
 ├─ shared/types.ts  # Tipado compartido para IPC
 └─ types/           # Zod schemas y DTOs
assets/              # Iconos (tray, app)
```

## Instalación y ejecución
```bash
npm install
npm run dev      # Arranca Electron + Vite en modo desarrollo
npm run lint
npm run typecheck
```
Para generar la app de escritorio en producción:
```bash
npm run build
npm run make     # Requiere electron-builder o forge según configuración
```

## Configuración
Cree un archivo `.env` en la raíz del proyecto con la siguiente estructura:
```
GROQ_API_KEY=tu_clave_de_groq
ELECTRON_RENDERER_URL=http://localhost:5173  # (solo en desarrollo)
```
Los ajustes de la aplicación se almacenan en `electron-store` (`settings.json`). El usuario puede cambiarlos desde la ventana de ajustes.

## Uso
1. Inicie VoxNeo.
2. Active/desactive la grabación con `Ctrl + Space` (configurable).
3. Los resultados se copian al portapapeles y quedan disponibles en el historial.
4. Pulse `Ctrl + H` (configurable vía UI) para abrir el dashboard de transcripciones.

## Seguridad y privacidad
- El audio se procesa localmente y solo se sube a Groq para transcripción (no se almacena en la nube).
- La base de datos local se guarda en el directorio de usuario (`AppData/Roaming/VoxNeo`).
- No se incluyen claves ni tokens en el repositorio; todas las credenciales se leen desde variables de entorno.

## Roadmap
- Soporte multiidioma con detección automática.
- Exportación del historial a Markdown/CSV.
- Integraciones con Notion, Obsidian o Google Docs.
- Publicación de binarios firmados para Windows/macOS.

## Licencia
Distribuido bajo licencia **MIT**.
