# 🤖 Bot de WhatsApp para Panadería Inma

Este bot automatiza la atención al cliente de la panadería Inma mediante WhatsApp. Permite realizar pedidos, consultar productos según alérgenos, obtener información de contacto y gestionar productos desde un panel de administración.

---

## 📋 Funcionalidades

- ✅ **Menú interactivo inicial**
- 👤 **Autenticación de administrador**
- 🛒 **Pedidos personalizados** de tartas y empanadas
- ⚠️ **Filtro de productos según alérgenos**
- 🧾 **Visualización de productos** con imagen y trazas
- 📍 **Información de contacto según ubicación**
- 🔐 **Formulario de login para administración**
- 🔚 **Opción de salir y reiniciar conversación**

---

## 🧭 Diagrama de flujo del bot

El siguiente diagrama muestra el flujo de conversación:

![Diagrama de flujo del bot](./Flowchart%20Bot%20WP%20Inma.png)

---

## 🛠️ Requisitos

- Node.js >= 18
- Cuenta de Twilio con WhatsApp Business API
- MongoDB Atlas o local
- Cuenta en [Cloudinary](https://cloudinary.com) (para imágenes)

---

## 🔧 Instalación

1. Clona el repositorio:

```bash
git clone https://github.com/tuusuario/whatsapp-inma-bot.git
cd whatsapp-inma-bot
```

2. Instala las dependencias:

```bash
npm install
```

3. Crea un archivo `.env` con tus credenciales:

```env
PORT=8080
MONGO_URI=tu_url_de_mongodb
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=...
TWILIO_SELECTOR_WELCOME_SID=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
```

4. Inicia el servidor:

```bash
node index.js
```

---

## 📦 Estructura del proyecto

```
.
├── index.js               # Lógica principal del bot
├── models/
│   └── Producto.js        # Modelo de producto
├── .env                   # Variables de entorno (no se sube al repo)
├── .gitignore             # Ignora node_modules y .env
├── Flowchart Bot WP Inma.png
└── README.md
```

---

## 🧪 Ejemplo de conversación

```
Cliente: Hola
Bot: ¿Qué deseas hacer?
- Soy alérgico a...
- Ver producto
- Admin

Cliente: Soy alérgico a...
Bot: ¿A qué alérgenos? (ej: gluten, soja)
...
```

---

## 📬 Contacto

Este proyecto ha sido desarrollado por [Pedro Scarpati](mailto:pedroscarpati@proton.me) como parte del sistema de automatización de pedidos de PyMWare.

---

## 🧾 Licencia

MIT © 2025