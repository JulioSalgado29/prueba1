const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// 1. Listar gastos de un inventario
// Petición: GET /api/gasto/inventario/:id_inventario
router.get('/inventario/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_gasto,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        monto,
        descripcion,
        usuario_creacion
      FROM gasto
      WHERE estado = true AND 
            id_inventario = $1
      ORDER BY fecha_creacion DESC`,
      [id_inventario]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/gasto/inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Buscar gasto por ID
// Petición: GET /api/gasto/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_gasto,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        monto,
        descripcion,
        usuario_creacion
      FROM gasto
      WHERE estado = true AND 
            id_gasto = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en GET /api/gasto/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Insertar gasto
// Petición: POST /api/gasto
router.post('/', async (req, res) => {
  const { email_usuario, id_inventario, monto, descripcion, usuario_creacion } = req.body;

  const emailLimpio = email_usuario ? email_usuario.trim().toLowerCase() : 'anon';

  try {
    const nuevo = await pool.query(
      `INSERT INTO gasto (email_usuario, id_inventario, monto, descripcion, usuario_creacion) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [emailLimpio, id_inventario, monto, descripcion || null, usuario_creacion]
    );

    res.status(201).json(nuevo.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/gasto:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 4. Editar gasto
// Petición: PUT /api/gasto/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { email_usuario, monto, descripcion, usuario_creacion } = req.body;

  const emailLimpio = email_usuario ? email_usuario.trim().toLowerCase() : 'anon';

  try {
    const resultado = await pool.query(
      `UPDATE gasto 
       SET email_usuario = $1, monto = $2, descripcion = $3, usuario_creacion = $4 
       WHERE id_gasto = $5 
       RETURNING *`,
      [emailLimpio, monto, descripcion || null, usuario_creacion, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en PUT /api/gasto/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 5. Eliminar gasto (Baja lógica)
// Petición: DELETE /api/gasto/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      'UPDATE gasto SET estado = $2 WHERE id_gasto = $1 RETURNING *',
      [id, false]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }

    res.json({ mensaje: 'Gasto eliminado correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/gasto/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;