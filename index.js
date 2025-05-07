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
  const texto = Body.trim();
  const lower = texto.toLowerCase();

  const ALERGENOS = [
    'gluten', 'crustaceos', 'huevo', 'pescado', 'cacahuetes',
    'soja', 'lacteos', 'frutos de cascara', 'apio', 'mostaza',
    'sesamo', 'sulfitos', 'altramuces', 'moluscos'
  ];
  
  // --- Si el cliente escribe "alergenos", enviamos botones ---
  if (texto === 'alergenos') {
    try {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          to: From,
          from: process.env.TWILIO_WHATSAPP_NUMBER,
          type: "interactive",
          interactive: {
            type: "button",
            body: {
              text: "¿Qué alérgeno quieres evitar?"
            },
            action: {
              buttons: [
                {
                  type: "reply",
                  reply: {
                    id: "sin_gluten",
                    title: "Gluten"
                  }
                },
                {
                  type: "reply",
                  reply: {
                    id: "sin_soja",
                    title: "Soja"
                  }
                },
                {
                  type: "reply",
                  reply: {
                    id: "sin_lacteos",
                    title: "Lácteos"
                  }
                }
              ]
            }
          }
        },
        {
          auth: {
            username: process.env.TWILIO_ACCOUNT_SID,
            password: process.env.TWILIO_AUTH_TOKEN
          },
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      return res.send('<Response></Response>'); // No doble respuesta
    } catch (err) {
      console.error("❌ Error al enviar botones:", err.message);
      return res.send(`<Response><Message>❌ No pude mostrar las opciones. Intentá otra vez.</Message></Response>`);
    }
  }

  if (texto === 'sin_gluten' || texto === 'sin_soja' || texto === 'sin_lacteos') {
    const Producto = require('./models/Producto');
  
    const alergenoId = {
      sin_gluten: 0,
      sin_soja: 5,
      sin_lacteos: 6
    };
  
    const index = alergenoId[texto];
  
    const productos = await Producto.find();
    const filtrados = productos.filter(p => !p.alergenos[index]);
  
    if (filtrados.length === 0) {
      return res.send(`<Response><Message>❌ No hay productos sin ese alérgeno.</Message></Response>`);
    }
  
    const nombres = filtrados.map(p => `- ${p.nombre}`).join('\n');
    return res.send(`<Response><Message>✅ Productos disponibles:\n${nombres}</Message></Response>`);
  }
  

  // --- Nueva función ---
  if (texto.startsWith('alergenos sin')) {
    const alergenoBuscado = texto.replace('alergenos sin', '').trim();
    const index = ALERGENOS.indexOf(alergenoBuscado);

    if (index === -1) {
      return res.send(`<Response><Message>❌ No reconozco ese alérgeno. Prueba con: ${ALERGENOS.join(', ')}</Message></Response>`);
    }

    const Producto = require('./models/Producto');
    const productos = await Producto.find();

    const filtrados = productos.filter(prod => !prod.alergenos[index]);

    if (filtrados.length === 0) {
      return res.send(`<Response><Message>❌ No hay productos sin ${alergenoBuscado}.</Message></Response>`);
    }

    const nombres = filtrados.map(p => `- ${p.nombre}`).join('\n');

    return res.send(`<Response><Message>✅ Productos sin ${alergenoBuscado}:\n${nombres}</Message></Response>`);
  }

  if (!sesiones.has(From)) {
    // iniciar autenticación
    sesiones.set(From, { paso: 'auth_user', data: {} });
    return res.send(`<Response><Message>🔐 Bienvenido. Por favor, decime tu usuario:</Message></Response>`);
  }

  const sesion = sesiones.get(From);

  // 🔐 Paso 1: pedir usuario
  if (sesion.paso === 'auth_user') {
    sesion.data.user = texto;
    sesion.paso = 'auth_pass';
    return res.send(`<Response><Message>🔐 Gracias. Ahora decime tu contraseña:</Message></Response>`);
  }

  // 🔐 Paso 2: pedir contraseña
  if (sesion.paso === 'auth_pass') {
    const userOK = sesion.data.user === process.env.BOT_USER;
    const passOK = texto === process.env.BOT_PASS;

    if (userOK && passOK) {
      sesion.autenticado = true;
      sesion.paso = null;
      return res.send(`<Response><Message>✅ Autenticación exitosa. Escribí "crearproducto" para comenzar.</Message></Response>`);
    } else {
      sesiones.delete(From);
      return res.send(`<Response><Message>❌ Usuario o contraseña incorrectos. Intentalo de nuevo.</Message></Response>`);
    }
  }

  // ❌ Si no está autenticado, se reinicia
  if (!sesion.autenticado) {
    sesiones.delete(From);
    return res.send(`<Response><Message>⚠️ Necesitás autenticarte primero. Volvé a escribir para iniciar sesión.</Message></Response>`);
  }

  // ✅ Flujo normal de creación
  if (!sesion.paso && lower === 'crearproducto') {
    sesion.paso = 'nombre';
    sesion.data = {};
    return res.send(`<Response><Message>👍 Empecemos. ¿Cuál es el nombre del producto?</Message></Response>`);
  }

  if (!sesion.paso) {
    return res.send(`<Response><Message>
¿Querés crear un producto nuevo?
Escribí "crearproducto" para comenzar.
</Message></Response>`);
  }

  if (sesion.paso === 'nombre') {
    sesion.data.nombre = texto;
    sesion.paso = 'urlImagen';
    return res.send(`<Response><Message>📷 ¿Cuál es la URL de la imagen? (o pon N/A, o envía la imagen directamente)</Message></Response>`);
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

        const upload = cloudinary.uploader.upload_stream({ resource_type: "image" }, (error, result) => {
          if (error) throw error;
          sesion.data.urlImagen = result.secure_url;
          sesion.paso = 'alergenos';
          res.send(`<Response><Message>✅ Imagen recibida. Ahora decime los alérgenos separados por comas (ej: gluten,huevo,...)</Message></Response>`);
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
    return res.send(`<Response><Message>🧬 Ahora decime los alérgenos separados por comas (ej: gluten,huevo,...)</Message></Response>`);
  }

  if (sesion.paso === 'alergenos') {
    const ALERGENOS = [
      'gluten', 'crustaceos', 'huevo', 'pescado', 'cacahuetes',
      'soja', 'lacteos', 'frutos de cascara', 'apio', 'mostaza',
      'sesamo', 'sulfitos', 'altramuces', 'moluscos'
    ];

    const mencionados = texto
      .toLowerCase()
      .split(',')
      .map(x => x.trim())
      .filter(x => x.length > 0);

    const alergenosArr = ALERGENOS.map(a => mencionados.includes(a));
    sesion.data.alergenos = alergenosArr;
    sesion.paso = 'trazas';

    return res.send(`<Response><Message>📌 ¿Qué trazas querés indicar?</Message></Response>`);
  }

  if (sesion.paso === 'trazas') {
    sesion.data.trazas = texto;

    const ALERGENOS = [
      'gluten', 'crustaceos', 'huevo', 'pescado', 'cacahuetes',
      'soja', 'lacteos', 'frutos de cascara', 'apio', 'mostaza',
      'sesamo', 'sulfitos', 'altramuces', 'moluscos'
    ];

    const alergenosMarcados = ALERGENOS.filter((a, i) => sesion.data.alergenos[i]);

    sesion.paso = 'confirmacion';

    return res.send(`<Response><Message>
✅ Este es el resumen del producto:

🧾 Nombre: ${sesion.data.nombre}
🖼 Imagen: ${sesion.data.urlImagen || 'Sin imagen'}
⚠️ Alérgenos: ${alergenosMarcados.join(', ') || 'Ninguno'}
📌 Trazas: ${sesion.data.trazas}

¿Querés guardarlo? (sí / no)
</Message></Response>`);
  }

  if (sesion.paso === 'confirmacion') {
    if (lower === 'sí' || lower === 'si') {
      try {
        const Producto = require('./models/Producto');
        const nuevo = new Producto(sesion.data);
        await nuevo.save();
        sesiones.delete(From);
        return res.send(`<Response><Message>✅ Producto guardado correctamente.</Message></Response>`);
      } catch (err) {
        console.error(err);
        sesiones.delete(From);
        return res.send(`<Response><Message>❌ Error al guardar el producto: ${err.message}</Message></Response>`);
      }
    } else if (lower === 'no') {
      sesiones.delete(From);
      return res.send(`<Response><Message>🚫 Operación cancelada. El producto no fue guardado.</Message></Response>`);
    } else {
      return res.send(`<Response><Message>❓ Responde "sí" para guardar o "no" para cancelar.</Message></Response>`);
    }
  }

  sesiones.delete(From);
  return res.send(`<Response><Message>⚠️ Algo salió mal. Empezá de nuevo con "crearproducto"</Message></Response>`);

  
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});

app.get('/', (req, res) => {
  res.send('🟢 Bot activo');
});


process.on('uncaughtException', err => {
  console.error('💥 uncaughtException:', err);
});

process.on('unhandledRejection', err => {
  console.error('💥 unhandledRejection:', err);
});

