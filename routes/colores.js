const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// 1. Listar colores de un inventario
// Petición: GET /api/colores/inventario/:id_inventario
router.get('/inventario/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_color,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        nombre,
        usuario_creacion
      FROM colores
      WHERE estado = true AND 
            id_inventario = $1
      ORDER BY nombre DESC`,
      [id_inventario]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/colores/inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Buscar color por ID
// Petición: GET /api/colores/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_color,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        nombre,
        usuario_creacion
      FROM colores
      WHERE estado = true AND 
            id_color = $1
      ORDER BY nombre DESC`,
      [id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/colores/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Insertar color
// Petición: POST /api/colores
router.post('/', async (req, res) => {
  const { email_usuario, id_inventario, nombre, usuario_creacion } = req.body;

  const emailLimpio = email_usuario.trim().toLowerCase();

  try {
    const nuevo = await pool.query(
      'INSERT INTO colores (email_usuario, id_inventario, nombre, usuario_creacion) VALUES ($1, $2, $3, $4) RETURNING *',
      [emailLimpio, id_inventario, nombre, usuario_creacion]
    );

    res.status(201).json(nuevo.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/colores:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 4. Editar color
// Petición: PUT /api/colores/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { email_usuario, nombre, usuario_creacion } = req.body;

  const emailLimpio = email_usuario.trim().toLowerCase();

  try {
    const resultado = await pool.query(
      'UPDATE colores SET email_usuario = $1, nombre = $2, usuario_creacion = $3 WHERE id_color = $4 RETURNING *',
      [emailLimpio, nombre, usuario_creacion, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'color no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en PUT /api/colores/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 5. Eliminar color (Baja lógica)
// Petición: DELETE /api/colores/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      'UPDATE colores SET estado = $2 WHERE id_color = $1 RETURNING *',
      [id, false]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'color no encontrado' });
    }

    res.json({ mensaje: 'color eliminado correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/colores/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;