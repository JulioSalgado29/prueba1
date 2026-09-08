const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// 1. Listar tienda de un inventario
// Petición: GET /api/tienda/inventario/:id_inventario
router.get('/inventario/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_tienda,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        nombre,
        usuario_creacion
      FROM tienda
      WHERE estado = true AND 
            id_inventario = $1
      ORDER BY nombre DESC`,
      [id_inventario]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/tienda/inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Buscar tienda por ID
// Petición: GET /api/tienda/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_tienda,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        nombre,
        usuario_creacion
      FROM tienda
      WHERE estado = true AND 
            id_tienda = $1
      ORDER BY nombre DESC`,
      [id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/tienda/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Insertar tienda
// Petición: POST /api/tienda
router.post('/', async (req, res) => {
  const { email_usuario, id_inventario, nombre, usuario_creacion } = req.body;

  const emailLimpio = email_usuario.trim().toLowerCase();

  try {
    const nuevo = await pool.query(
      'INSERT INTO tienda (email_usuario, id_inventario, nombre, usuario_creacion) VALUES ($1, $2, $3, $4) RETURNING *',
      [emailLimpio, id_inventario, nombre, usuario_creacion]
    );

    res.status(201).json(nuevo.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/tienda:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 4. Editar tienda
// Petición: PUT /api/tienda/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { email_usuario, nombre, usuario_creacion } = req.body;

  const emailLimpio = email_usuario.trim().toLowerCase();

  try {
    const resultado = await pool.query(
      'UPDATE tienda SET email_usuario = $1, nombre = $2, usuario_creacion = $3 WHERE id_tienda = $4 RETURNING *',
      [emailLimpio, nombre, usuario_creacion, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'tienda no encontrada' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en PUT /api/tienda/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 5. Eliminar tienda (Baja lógica)
// Petición: DELETE /api/tienda/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      'UPDATE tienda SET estado = $2 WHERE id_tienda = $1 RETURNING *',
      [id, false]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'tienda no encontrada' });
    }

    res.json({ mensaje: 'tienda eliminada correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/tienda/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;