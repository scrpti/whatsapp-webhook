require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch(err => console.error("❌ Error al conectar MongoDB:", err));

const sesiones = new Map();

app.post('/webhook', async (req, res) => {
  console.log("🟢 Mensaje recibido");
  console.log(req.body);

  const { From, Body } = req.body;
  const texto = (Body || '').trim().toLowerCase();

  if (!sesiones.has(From)) {
    try {
      await enviarMenuInicio(From);
      return res.send('<Response></Response>');
    } catch (err) {
      console.error("❌ Error mostrando menú:", err.message);
      return res.send(`<Response><Message>❌ Error. Intenta otra vez.</Message></Response>`);
    }
  }

  const sesion = sesiones.get(From);

  if (sesion.fase === 'inicio') {
    if (texto.includes('admin')) {
      sesiones.set(From, { fase: 'login', paso: 'usuario' });
      return res.send(`<Response><Message>🔐 Por favor, ingresa tu usuario:</Message></Response>`);
    }
    if (texto.includes('soy') || texto.includes('alergico')) {
      sesiones.set(From, { fase: 'consulta', paso: 'esperar_alergeno' });
      return res.send(`<Response><Message>🍽 ¿A qué alérgeno quieres evitar?</Message></Response>`);
    }
    if (texto.includes('salir')) {
      sesiones.delete(From);
      return res.send(`<Response><Message>👋 ¡Hasta luego!</Message></Response>`);
    }

    await enviarMenuInicio(From);
    return res.send('<Response></Response>');
  }

  // Flujo de Login de Admin
  if (sesion.fase === 'login') {
    if (sesion.paso === 'usuario') {
      sesion.usuario = texto;
      sesion.paso = 'password';
      return res.send(`<Response><Message>🔒 Ahora ingresa tu contraseña:</Message></Response>`);
    }
    if (sesion.paso === 'password') {
      if (sesion.usuario === process.env.ADMIN_USER && texto === process.env.ADMIN_PASSWORD) {
        sesiones.set(From, { fase: 'admin', paso: 'nombre', data: {} });
        return res.send(`<Response><Message>✅ Bienvenido, Admin. ¿Cuál es el nombre del producto?</Message></Response>`);
      } else {
        sesiones.delete(From);
        return res.send(`<Response><Message>❌ Usuario o contraseña incorrectos. Volviendo al menú principal.</Message></Response>`);
      }
    }
  }

  // Flujo de Admin (crear productos)
  if (sesion.fase === 'admin') {
    if (sesion.paso === 'nombre') {
      sesion.data.nombre = texto;
      sesion.paso = 'urlImagen';
      return res.send(`<Response><Message>📷 ¿Cuál es la URL de la imagen? (o pon N/A)</Message></Response>`);
    }

    if (sesion.paso === 'urlImagen') {
      sesion.data.urlImagen = texto === 'n/a' ? '' : texto;
      sesion.paso = 'alergenos';
      return res.send(`<Response><Message>🧬 Dame los alérgenos separados por comas (gluten, soja, lacteos, etc)</Message></Response>`);
    }

    if (sesion.paso === 'alergenos') {
      sesion.data.alergenos = texto.split(',').map(x => x.trim());
      sesion.paso = 'trazas';
      return res.send(`<Response><Message>📌 ¿Qué trazas quieres indicar?</Message></Response>`);
    }

    if (sesion.paso === 'trazas') {
      sesion.data.trazas = texto;
      const Producto = require('./models/Producto');
      try {
        const nuevo = new Producto(sesion.data);
        await nuevo.save();
        sesiones.delete(From);
        return res.send(`<Response><Message>✅ Producto guardado exitosamente.</Message></Response>`);
      } catch (err) {
        console.error(err);
        sesiones.delete(From);
        return res.send(`<Response><Message>❌ Error al guardar el producto: ${err.message}</Message></Response>`);
      }
    }
  }

  // Flujo de Consulta (soy alérgico a)
  if (sesion.fase === 'consulta') {
    if (sesion.paso === 'esperar_alergeno') {
      const Producto = require('./models/Producto');
      const alergenos = texto.split(',').map(x => x.trim().toLowerCase());

      try {
        const productos = await Producto.find();
        const filtrados = productos.filter(p =>
          !p.alergenos.some(a => typeof a === 'string' && alergenos.includes(a.toLowerCase()))
        );

        if (filtrados.length === 0) {
          sesiones.delete(From);
          return res.send(`<Response><Message>😢 No hay productos compatibles.</Message></Response>`);
        }

        const lista = filtrados.map(p => `- ${p.nombre}`).join('\n');
        sesiones.delete(From);
        return res.send(`<Response><Message>📋 Productos compatibles:\n${lista}</Message></Response>`);

      } catch (err) {
        console.error(err);
        sesiones.delete(From);
        return res.send(`<Response><Message>❌ Error al consultar: ${err.message}</Message></Response>`);
      }
    }
  }

  sesiones.delete(From);
  return res.send(`<Response><Message>⚠️ Algo salió mal. Empezá de nuevo.</Message></Response>`);
});

async function enviarMenuInicio(to) {
  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
    new URLSearchParams({
      MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
      To: to,
      ContentSid: process.env.TWILIO_CONTENT_SID_WELCOME,
      ContentVariables: '{}'
    }),
    {
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  sesiones.set(to, { fase: 'inicio' });
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
