const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Importar rutas de cada tabla
const colorRoutes = require('./routes/colores');
const tiendaRoutes = require('./routes/tienda');
const duenoMuestraRoutes = require('./routes/dueno_muestra');
const sesionGoogleLogRoutes = require('./routes/sesion_google_log');
const usuarioRoutes = require('./routes/usuario');
const inventarioRoutes = require('./routes/inventario');
const tipoCalzadoRoutes = require('./routes/tipo_calzado');
const calzadoRoutes = require('./routes/calzado');
const filaInventarioRoutes = require('./routes/fila_inventario');
const subfilaInventarioRoutes = require('./routes/subfila_inventario');
const filaVentaRoutes = require('./routes/fila_venta');
const filaVentaMultiplesRoutes = require('./routes/fila_venta_multiple');
const gastoRoutes = require('./routes/gasto');
const cierreCajaRoutes = require('./routes/cierre_caja');
const stockRoutes = require('./routes/stock');
const notificacionRoutes = require('./routes/notificacion');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Ruta principal de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'API corriendo localmente' });
});

app.use('/api/color', colorRoutes);
app.use('/api/dueno_muestra', duenoMuestraRoutes);
app.use('/api/sesion_google_log', sesionGoogleLogRoutes);
app.use('/api/usuario', usuarioRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/tipo_calzado', tipoCalzadoRoutes);
app.use('/api/calzado', calzadoRoutes);
app.use('/api/tienda', tiendaRoutes);
app.use('/api/fila_inventario', filaInventarioRoutes);
app.use('/api/subfila_inventario', subfilaInventarioRoutes);
app.use('/api/fila_venta', filaVentaRoutes);
app.use('/api/fila_venta_multiple', filaVentaMultiplesRoutes);
app.use('/api/gasto', gastoRoutes);
app.use('/api/cierre_caja', cierreCajaRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/notificacion', notificacionRoutes);

// Escuchar peticiones
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
});