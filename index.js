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

// Estado de conversación por número
const sesiones = new Map();

app.post('/webhook', async (req, res) => {
  const { From, Body } = req.body;
  const texto = Body.trim();
  const lower = texto.toLowerCase();

  if (!sesiones.has(From)) {
    if (lower === 'crearproducto') {
      sesiones.set(From, { paso: 'nombre', data: {} });
      return res.send(`<Response><Message>👍 Empecemos. ¿Cuál es el nombre del producto?</Message></Response>`);
    } else {
      return res.send(`<Response><Message>Escribe "crearproducto" para comenzar a crear un nuevo producto.</Message></Response>`);
    }
  }

  const sesion = sesiones.get(From);

  if (sesion.paso === 'nombre') {
    sesion.data.nombre = texto;
    sesion.paso = 'urlImagen';
    return res.send(`<Response><Message>📷 ¿Cuál es la URL de la imagen? (o pon N/A)</Message></Response>`);
  }

  if (sesion.paso === 'urlImagen') {
    // Si viene con imagen desde WhatsApp
    const numMedia = parseInt(req.body.NumMedia || '0', 10);
    if (numMedia > 0) {
      const mediaUrl = req.body.MediaUrl0;
      try {
        // Descargar imagen de Twilio
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
      return; // importante para evitar doble respuesta
    }
  
    // Si no mandó imagen, tratamos texto (por compatibilidad)
    sesion.data.urlImagen = texto === 'N/A' ? '' : texto;
    sesion.paso = 'alergenos';
    return res.send(`<Response><Message>🧬 Dame los 14 alérgenos como 0 o 1 separados por comas (ej: 1,0,0,...)</Message></Response>`);
  }
  

  if (sesion.paso === 'alergenos') {
    const alergenosArr = texto.split(',').map(x => x.trim() === '1');
    if (alergenosArr.length !== 14) {
      return res.send(`<Response><Message>❌ Error: deben ser exactamente 14 alérgenos (0 o 1)</Message></Response>`);
    }
    sesion.data.alergenos = alergenosArr;
    sesion.paso = 'trazas';
    return res.send(`<Response><Message>📌 ¿Qué trazas quieres indicar?</Message></Response>`);
  }

  if (sesion.paso === 'trazas') {
    sesion.data.trazas = texto;

    try {
      const Producto = require('./models/Producto');
      const nuevo = new Producto(sesion.data);
      await nuevo.save();
      sesiones.delete(From);
      return res.send(`<Response><Message>✅ Producto "${sesion.data.nombre}" creado correctamente.</Message></Response>`);
    } catch (err) {
      console.error(err);
      sesiones.delete(From);
      return res.send(`<Response><Message>❌ Error al guardar el producto: ${err.message}</Message></Response>`);
    }
  }

  sesiones.delete(From);
  return res.send(`<Response><Message>⚠️ Algo salió mal. Empezá de nuevo con "crearproducto"</Message></Response>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
