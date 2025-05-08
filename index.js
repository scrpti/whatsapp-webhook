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
  const texto = (Body || '').trim();
  const lower = texto.toLowerCase();

  const iniciarMenu = async () => {
    try {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        new URLSearchParams({
          To: From,
          From: process.env.TWILIO_WHATSAPP_NUMBER,
          Body: "Selecciona una opción:\n1️⃣ Crear producto\n2️⃣ Consultar productos\n3️⃣ Salir"
        }),
        {
          auth: {
            username: process.env.TWILIO_ACCOUNT_SID,
            password: process.env.TWILIO_AUTH_TOKEN
          }
        }
      );
    } catch (error) {
      console.error("❌ Error enviando menú:", error.message);
    }
  };

  // Si no está en sesión, mostramos menú
  if (!sesiones.has(From)) {
    if (lower === '1' || lower.includes('crear')) {
      sesiones.set(From, { paso: 'nombre', data: {} });
      return res.send(`<Response><Message>👍 Empecemos. ¿Cuál es el nombre del producto?</Message></Response>`);
    }
    if (lower === '2' || lower.includes('consultar')) {
      return res.send(`<Response><Message>🔎 Funcionalidad de consulta próximamente...</Message></Response>`);
    }
    if (lower === '3' || lower.includes('salir')) {
      return res.send(`<Response><Message>👋 ¡Hasta luego!</Message></Response>`);
    }

    await iniciarMenu();
    return res.send('<Response></Response>');
  }

  // Aquí continúa tu flujo normal (crear producto)
  const sesion = sesiones.get(From);

  if (sesion.paso === 'nombre') {
    sesion.data.nombre = texto;
    sesion.paso = 'urlImagen';
    return res.send(`<Response><Message>📷 ¿Cuál es la URL de la imagen? (o pon N/A)</Message></Response>`);
  }

  if (sesion.paso === 'urlImagen') {
    const numMedia = parseInt(req.body.NumMedia || '0', 10);
    if (numMedia > 0) {
      const mediaUrl = req.body.MediaUrl0;
      try {
        const image = await axios.get(mediaUrl, {
          responseType: 'arraybuffer',
          auth: {
            username: process.env.TWILIO_ACCOUNT_SID,
            password: process.env.TWILIO_AUTH_TOKEN
          }
        });

        const upload = await cloudinary.uploader.upload_stream({ resource_type: "image" }, (error, result) => {
          if (error) throw error;
          sesion.data.urlImagen = result.secure_url;
          sesion.paso = 'alergenos';
          res.send(`<Response><Message>✅ Imagen recibida. Ahora dime los 14 alérgenos separados por comas (ej: 1,0,0,...)</Message></Response>`);
        });
        upload.end(Buffer.from(image.data));
      } catch (err) {
        console.error(err);
        return res.send(`<Response><Message>❌ Error al subir la imagen. ¿Querés intentar otra vez?</Message></Response>`);
      }
      return;
    }

    sesion.data.urlImagen = texto === 'N/A' ? '' : texto;
    sesion.paso = 'alergenos';
    return res.send(`<Response><Message>🧬 Dame los 14 alérgenos como 0 o 1 separados por comas (ej: 1,0,0,...)</Message></Response>`);
  }

  if (sesion.paso === 'alergenos') {
    const ALERGENOS = [
      'gluten', 'crustaceos', 'huevo', 'pescado', 'cacahuetes',
      'soja', 'lacteos', 'frutos de cascara', 'apio', 'mostaza',
      'sesamo', 'sulfitos', 'altramuces', 'moluscos'
    ];

    const mencionados = texto.toLowerCase().split(',').map(x => x.trim()).filter(x => x.length > 0);
    const alergenosArr = ALERGENOS.map(a => mencionados.includes(a));

    sesion.data.alergenos = alergenosArr;
    sesion.paso = 'trazas';

    return res.send(`<Response><Message>📌 ¿Qué trazas quieres indicar?</Message></Response>`);
  }

  if (sesion.paso === 'trazas') {
    sesion.data.trazas = texto;
    const Producto = require('./models/Producto');
    const nuevo = new Producto(sesion.data);
    await nuevo.save();
    sesiones.delete(From);

    return res.send(`<Response><Message>✅ Producto creado correctamente. ¡Gracias!</Message></Response>`);
  }

  sesiones.delete(From);
  return res.send(`<Response><Message>⚠️ Algo salió mal. Empezá de nuevo.</Message></Response>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));
