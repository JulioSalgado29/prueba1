const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Listar tipos de calzado activos por inventario
// Petición: GET /api/tipo_calzado/inventario/:id_inventario
router.get('/inventario/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_tipo_calzado,
        nombre,
        icono,
        taco,
        plataforma,
        colores,
        usuario_creacion,
        email_usuario,
        activo,
        fecha_creacion,
        id_inventario
      FROM tipo_calzado
      WHERE activo = true AND 
            id_inventario = $1
      ORDER BY fecha_creacion DESC`,
      [id_inventario]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/tipo_calzado/inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Obtener un tipo de calzado por ID
// Petición: GET /api/tipo_calzado/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_tipo_calzado,
        nombre,
        icono,
        taco,
        plataforma,
        colores,
        usuario_creacion,
        email_usuario,
        activo,
        fecha_creacion,
        id_inventario
      FROM tipo_calzado 
      WHERE id_tipo_calzado = $1 AND activo = true`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Tipo de calzado no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en GET /api/tipo_calzado/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Insertar tipo de calzado (Crear)
// Petición: POST /api/tipo_calzado
router.post('/', async (req, res) => {
  const {
    nombre,
    icono,
    usuario_creacion,
    email_usuario,
    taco,
    plataforma,
    colores,
    id_inventario
  } = req.body;

  try {
    const resultado = await pool.query(
      `INSERT INTO tipo_calzado (
        nombre,
        icono,
        usuario_creacion,
        email_usuario,
        taco,
        plataforma,
        colores,
        id_inventario,
        activo,
        fecha_creacion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())
      RETURNING *`,
      [
        nombre,
        icono,
        usuario_creacion,
        email_usuario,
        taco ?? false,
        plataforma ?? false,
        colores ?? false,
        id_inventario
      ]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/tipo_calzado:', error.message);
    res.status(500).json({ error: 'Error al registrar tipo de calzado' });
  }
});

// 4. Actualizar tipo de calzado por ID
// Petición: PUT /api/tipo_calzado/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    nombre,
    icono,
    usuario_creacion,
    email_usuario,
    taco,
    plataforma,
    colores
  } = req.body;

  try {
    const resultado = await pool.query(
      `UPDATE tipo_calzado SET
        nombre = $1,
        icono = $2,
        usuario_creacion = $3,
        email_usuario = $4,
        taco = $5,
        plataforma = $6,
        colores = $7
      WHERE id_tipo_calzado = $8 AND activo = true
      RETURNING *`,
      [
        nombre,
        icono,
        usuario_creacion,
        email_usuario,
        taco ?? false,
        plataforma ?? false,
        colores ?? false,
        id
      ]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Tipo de calzado no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en PUT /api/tipo_calzado/:id:', error.message);
    res.status(500).json({ error: 'Error al actualizar tipo de calzado' });
  }
});

// 5. Eliminar tipo de calzado (Baja lógica)
// Petición: DELETE /api/tipo_calzado/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      'UPDATE tipo_calzado SET activo = $2 WHERE id_tipo_calzado = $1 RETURNING *',
      [id, false]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'tipo_calzado no encontrado' });
    }

    res.json({ mensaje: 'tipo_calzado eliminado correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/tipo_calzado/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;