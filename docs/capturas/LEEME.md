# Capturas de pantalla — Ensaya IA

Actualizado: **17 de noviembre de 2026**.
Fuente: `http://localhost:8080` (viewport 1280×800, zoom 100 %, tema por defecto).
Cuenta: **Cuenta demo** (`demo@ensaya-ia.local`). Libreto de ejemplo: *Romeo y Julieta*, escena del balcón (*Escena 2 - Balcon*).
No se muestran contraseñas ni claves. En `/login` se ocultó solo en la captura la ayuda que repetía la contraseña de demostración (sin cambiar código).

## Cambios respecto a la lista anterior

- Interfaz actualizada (sidebar *Inicio / Libretos / Ensayos / Grupos / Configuración*, banner «Modo sin conexión», tipografía y botones nuevos).
- Ya no aparece «Escena corta de ejemplo»; el libreto de demostración es *Romeo y Julieta* (y una copia editable).
- `05-guion-nuevo.png`: el libreto demo no se puede editar («Solo puedes modificar libretos importados…»), así que el formulario se abrió sobre *Romeo y Julieta (copia)*.
- Nombre del grupo: **Compañía Demo** (con tilde), no «Compania Demo».
- `16-pagina-404.png`: el 404 pasó a español (`Página no encontrada` / `Ir al inicio`); antes estaba en inglés.
- Detalle de grupo: nueva URL `/grupos/f99593e9-db0b-4971-9f6f-aece3b01076d` (pestaña **Grabaciones**).

## Índice

### 01-registro.png

- **Pantalla:** Crear cuenta (`/register`).
- **Pasos:** Abrir `/register`. Completar nombre «Usuario Demo», correo `usuario.demo@ensaya-ia.local`, contraseña enmascarada y términos marcados. No se envió el formulario.
- **URL:** http://localhost:8080/register

### 02-inicio-sesion.png

- **Pantalla:** Iniciar sesión (`/login`).
- **Pasos:** Abrir `/login`. Correo `demo@ensaya-ia.local` y contraseña enmascarada. Se ocultó el texto de ayuda que repetía la contraseña de demostración.
- **URL:** http://localhost:8080/login

### 03-inicio.png

- **Pantalla:** Inicio autenticado.
- **Pasos:** Entrar con la cuenta de demostración y abrir `/`.
- **URL:** http://localhost:8080/

### 04-guiones-lista.png

- **Pantalla:** Gestión de libretos.
- **Pasos:** Abrir `/libretos`. Seleccionar *Romeo y Julieta* con el panel de detalle visible (también aparece *Romeo y Julieta (copia)*).
- **URL:** http://localhost:8080/libretos

### 05-guion-nuevo.png

- **Pantalla:** Formulario de metadatos del libreto (título, autor, género, descripción).
- **Pasos:** En `/libretos` seleccionar *Romeo y Julieta (copia)* → **Editar libreto**. Sin guardar.
- **URL:** http://localhost:8080/libretos

### 06-seleccion-personaje.png

- **Pantalla:** Configuración de ensayo, bloque de personajes.
- **Pasos:** Abrir `/configuracion-ensayo`, libreto *Romeo y Julieta*, *Escena 2 - Balcon*, personaje Romeo (**Tú**).
- **URL:** http://localhost:8080/configuracion-ensayo

### 07-ensayo-voz.png

- **Pantalla:** Modo ensayo individual (voz / micrófono), listo para empezar.
- **Pasos:** En configuración, modo **Individual** → **Iniciar ensayo**. Antes de pulsar el micrófono.
- **URL:** http://localhost:8080/ensayo

### 08-ensayo-lectura.png

- **Pantalla:** Modo ensayo lectura (TTS, sin micrófono para avanzar).
- **Pasos:** `/configuracion-ensayo?mode=lectura` → elegir **Lectura** → **Iniciar ensayo** → **Iniciar lectura** (lectura en curso).
- **URL:** http://localhost:8080/ensayo

### 09-finalizado-notas.png

- **Pantalla:** Ensayo finalizado con resumen, desempeño y notas del director (Ensayín).
- **Pasos:** En modo lectura, **Finalizar ensayo**.
- **URL:** http://localhost:8080/finalizado

### 10-historial.png

- **Pantalla:** Historial de ensayos (*Mis ensayos*).
- **Pasos:** Menú → **Ensayos**.
- **URL:** http://localhost:8080/ensayos

### 11-grupos-lista.png

- **Pantalla:** Mis grupos (vacío) con **Unirme con código** y **Crear grupo**.
- **Pasos:** Menú → **Grupos** (sin grupos creados).
- **URL:** http://localhost:8080/grupos

### 12-grupo-crear-unirse.png

- **Pantalla:** Modal **Crear grupo** (nombre «Compañía Demo»).
- **Pasos:** En `/grupos` → **Crear grupo** → escribir el nombre. Sin enviar todavía en la captura.
- **URL:** http://localhost:8080/grupos

### 13-grabaciones-grupo.png

- **Pantalla:** Detalle del grupo, pestaña **Grabaciones** (aún sin tomas).
- **Pasos:** Crear «Compañía Demo» → **Ver grupo** → **Grabaciones**.
- **URL:** http://localhost:8080/grupos/f99593e9-db0b-4971-9f6f-aece3b01076d

### 14-perfil-voz.png

- **Pantalla:** Configuración / perfil y voz del director.
- **Pasos:** Menú → **Configuración**.
- **URL:** http://localhost:8080/configuracion

### 15-error-sin-microfono.png

- **Pantalla:** Ensayo por voz con el aviso «No se pudo escuchar el micrófono.».
- **Pasos:** `/ensayo` (modo individual) → pulsar el micrófono con permiso denegado / fallo de captura.
- **URL:** http://localhost:8080/ensayo

### 16-pagina-404.png

- **Pantalla:** Página no encontrada (texto en español).
- **Pasos:** Abrir una ruta que no existe.
- **URL:** http://localhost:8080/pagina-inexistente
