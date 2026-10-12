const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// 1. Listar ingresos de un inventario y filtrado opcional por fecha (YYYY-MM-DD)
// Petición: GET /api/ingreso/inventario/:id_inventario?fecha=2026-08-24
router.get('/inventario/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  const { fecha } = req.query;

  try {
    let queryText = `
      SELECT 
        id_ingreso,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        id_tienda,
        monto,
        descripcion,
        usuario_creacion
      FROM ingreso
      WHERE estado = true AND 
            id_inventario = $1
    `;

    const queryParams = [id_inventario];

    if (fecha) {
      // Convierte fecha_creacion a hora Perú (UTC-5) y compara solo el día
      queryText += ` AND (fecha_creacion - INTERVAL '5 hours')::date = $2::date`;
      queryParams.push(fecha);
    }

    queryText += ` ORDER BY fecha_creacion DESC`;

    const resultado = await pool.query(queryText, queryParams);
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/ingreso/inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Buscar ingreso por ID
// Petición: GET /api/ingreso/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_ingreso,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        id_tienda,
        monto,
        descripcion,
        usuario_creacion
      FROM ingreso
      WHERE estado = true AND 
            id_ingreso = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Ingreso no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en GET /api/ingreso/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Insertar ingreso
// Petición: POST /api/ingreso
router.post('/', async (req, res) => {
  const { email_usuario, id_inventario, id_tienda, monto, descripcion, usuario_creacion, fecha_creacion } = req.body;

  // Validación rápida obligatoria para id_tienda, monto y descripción
  if (!id_tienda || !monto || !descripcion || descripcion.trim() === '') {
    return res.status(400).json({ error: 'Faltan campos obligatorios (tienda, monto o descripción)' });
  }

  const emailLimpio = email_usuario ? email_usuario.trim().toLowerCase() : 'anon';

  try {
    let queryText;
    let queryValues;

    // Si viene fecha_creacion personalizada, la incluimos; si no, dejamos que la BD use la hora actual
    if (fecha_creacion && fecha_creacion.trim() !== '') {
      queryText = `
        INSERT INTO ingreso (email_usuario, id_inventario, id_tienda, monto, descripcion, usuario_creacion, fecha_creacion) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) 
        RETURNING *
      `;
      queryValues = [emailLimpio, id_inventario, id_tienda, monto, descripcion.trim(), usuario_creacion, fecha_creacion];
    } else {
      queryText = `
        INSERT INTO ingreso (email_usuario, id_inventario, id_tienda, monto, descripcion, usuario_creacion) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING *
      `;
      queryValues = [emailLimpio, id_inventario, id_tienda, monto, descripcion.trim(), usuario_creacion];
    }

    const nuevo = await pool.query(queryText, queryValues);

    res.status(201).json(nuevo.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/ingreso:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 4. Editar ingreso
// Petición: PUT /api/ingreso/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { email_usuario, id_tienda, monto, descripcion, usuario_creacion, fecha_creacion } = req.body;

  // Validación rápida obligatoria
  if (!id_tienda || !monto || !descripcion || descripcion.trim() === '') {
    return res.status(400).json({ error: 'Faltan campos obligatorios (tienda, monto o descripción)' });
  }

  const emailLimpio = email_usuario ? email_usuario.trim().toLowerCase() : 'anon';

  try {
    let resultado;

    // Si se envió una fecha personalizada, actualizamos también fecha_creacion, de lo contrario la respetamos tal cual está
    if (fecha_creacion && fecha_creacion.trim() !== '') {
      resultado = await pool.query(
        `UPDATE ingreso 
         SET email_usuario = $1, id_tienda = $2, monto = $3, descripcion = $4, usuario_creacion = $5, fecha_creacion = $6 
         WHERE id_ingreso = $7 
         RETURNING *`,
        [emailLimpio, id_tienda, monto, descripcion.trim(), usuario_creacion, fecha_creacion, id]
      );
    } else {
      resultado = await pool.query(
        `UPDATE ingreso 
         SET email_usuario = $1, id_tienda = $2, monto = $3, descripcion = $4, usuario_creacion = $5 
         WHERE id_ingreso = $6 
         RETURNING *`,
        [emailLimpio, id_tienda, monto, descripcion.trim(), usuario_creacion, id]
      );
    }

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Ingreso no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en PUT /api/ingreso/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 5. Eliminar ingreso (Baja lógica)
// Petición: DELETE /api/ingreso/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      'UPDATE ingreso SET estado = $2 WHERE id_ingreso = $1 RETURNING *',
      [id, false]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Ingreso no encontrado' });
    }

    res.json({ mensaje: 'Ingreso eliminado correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/ingreso/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;