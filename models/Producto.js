const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  urlImagen: { type: String, required: true },
  alergenos: {
    type: [Boolean],
    validate: [arr => arr.length === 14, 'Debe tener exactamente 14 alérgenos'],
    required: true,
  },
  trazas: { type: String, required: true },
}, {
  timestamps: true
});

const Producto = mongoose.model('Producto', productoSchema);

module.exports = Producto;
