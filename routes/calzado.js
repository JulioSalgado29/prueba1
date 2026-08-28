const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Listar calzados activos por inventario
// Petición: GET /api/calzado/inventario/:id_inventario
router.get('/inventario/:id_inventario', async (req, res) => {
    const { id_inventario } = req.params;
    try {
        const resultado = await pool.query(
            `SELECT 
        id_calzado,
        nombre,
        icono,
        precio_real,
        taco,
        plataforma,
        colores,
        id_tipo_calzado,
        usuario_creacion,
        email_usuario,
        activo,
        fecha_creacion,
        id_inventario
      FROM calzado
      WHERE activo = true AND 
            id_inventario = $1
      ORDER BY fecha_creacion DESC`,
            [id_inventario]
        );
        res.json(resultado.rows);
    } catch (error) {
        console.error('Error en GET /api/calzado/inventario:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 2. Listar calzados activos por inventario QUE TENGAN COLORES EN TRUE
// Petición: GET /api/calzado/inventario/:id_inventario/colores
router.get('/inventario/:id_inventario/colores', async (req, res) => {
    const { id_inventario } = req.params;
    try {
        const resultado = await pool.query(
            `SELECT 
        id_calzado,
        nombre,
        icono,
        precio_real,
        taco,
        plataforma,
        colores,
        id_tipo_calzado,
        usuario_creacion,
        email_usuario,
        activo,
        fecha_creacion,
        id_inventario
      FROM calzado
      WHERE activo = true 
        AND colores = true
        AND id_inventario = $1
      ORDER BY nombre ASC`,
            [id_inventario]
        );
        res.json(resultado.rows);
    } catch (error) {
        console.error('Error en GET /api/calzado/inventario/:id_inventario/colores:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener un calzado por ID
// Petición: GET /api/calzado/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      `SELECT 
        id_calzado,
        nombre,
        icono,
        precio_real,
        taco,
        plataforma,
        colores,
        id_tipo_calzado,
        usuario_creacion,
        email_usuario,
        activo,
        fecha_creacion,
        id_inventario
      FROM calzado
      WHERE id_calzado = $1 AND activo = true`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Calzado no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en GET /api/calzado/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear un nuevo calzado
// POST /api/calzado
router.post('/', async (req, res) => {
  try {
    const {
      nombre,
      icono,
      precio_real,
      taco,
      plataforma,
      colores,
      id_tipo_calzado,
      usuario_creacion,
      email_usuario,
      id_inventario
    } = req.body;

    // Conversión e higienización segura de tipos
    const parsedPrecioReal = parseFloat(precio_real) || 0.0;
    const parsedTipoCalzadoId = id_tipo_calzado ? parseInt(id_tipo_calzado, 10) : null;
    const parsedInventarioId = id_inventario ? parseInt(id_inventario, 10) : null;

    const query = `
      INSERT INTO calzado (
        nombre, 
        icono, 
        precio_real, 
        taco, 
        plataforma, 
        colores,
        id_tipo_calzado, 
        usuario_creacion, 
        email_usuario, 
        id_inventario, 
        activo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING id_calzado;
    `;

    const values = [
      nombre || '',
      icono || '',
      parsedPrecioReal,
      Boolean(taco),
      Boolean(plataforma),
      Boolean(colores),
      parsedTipoCalzadoId,
      usuario_creacion || null,
      email_usuario || null,
      parsedInventarioId
    ];

    const result = await pool.query(query, values);

    return res.status(201).json({
      message: 'Calzado creado exitosamente',
      id_calzado: result.rows[0].id_calzado
    });
  } catch (error) {
    console.error('Error detallado al crear calzado:', error.message);
    return res.status(500).json({ 
      error: 'Error interno del servidor', 
      detalle: error.message 
    });
  }
});

// Editar un calzado existente
// PUT /api/calzado/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      icono,
      precio_real,
      taco,
      plataforma,
      colores,
      id_tipo_calzado,
      usuario_creacion,
      email_usuario
    } = req.body;

    // Conversión e higienización segura de tipos
    const parsedCalzadoId = parseInt(id, 10);
    const parsedPrecioReal = parseFloat(precio_real) || 0.0;
    const parsedTipoCalzadoId = id_tipo_calzado ? parseInt(id_tipo_calzado, 10) : null;

    const query = `
      UPDATE calzado SET
        nombre = $1,
        icono = $2,
        precio_real = $3,
        taco = $4,
        plataforma = $5,
        colores = $6,
        id_tipo_calzado = $7,
        usuario_creacion = $8,
        email_usuario = $9
      WHERE id_calzado = $10;
    `;

    const values = [
      nombre || '',
      icono || '',
      parsedPrecioReal,
      Boolean(taco),
      Boolean(plataforma),
      Boolean(colores),
      parsedTipoCalzadoId,
      usuario_creacion || null,
      email_usuario || null,
      parsedCalzadoId
    ];

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Calzado no encontrado' });
    }

    return res.status(200).json({ message: 'Calzado actualizado correctamente' });
  } catch (error) {
    console.error('Error detallado al actualizar calzado:', error.message);
    return res.status(500).json({ 
      error: 'Error interno del servidor', 
      detalle: error.message 
    });
  }
});

// Eliminar calzado (Baja lógica)
// Petición: DELETE /api/calzado/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      'UPDATE calzado SET activo = $2 WHERE id_calzado = $1 RETURNING *',
      [id, false]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'calzado no encontrado' });
    }

    res.json({ mensaje: 'calzado eliminado correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/calzado/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;