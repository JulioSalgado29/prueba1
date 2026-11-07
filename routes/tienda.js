const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// Helper: normaliza el nombre para comparar (sin espacios extra)
const limpiarNombreTienda = (texto) => {
  if (!texto) return '';
  return String(texto).trim().replace(/\s+/g, ' ');
};

// Helper: ¿ya existe una tienda ACTIVA con ese nombre en el inventario?
// Compara sin distinguir mayúsculas/minúsculas ni espacios repetidos.
// `excluirId` permite ignorar la propia tienda al editar.
async function existeNombreTienda(idInventario, nombreLimpio, excluirId = null) {
  const resultado = await pool.query(
    `SELECT 1
       FROM tienda
      WHERE estado = true
        AND id_inventario = $1
        AND LOWER(regexp_replace(TRIM(nombre), '\\s+', ' ', 'g')) = LOWER($2)
        AND ($3::int IS NULL OR id_tienda <> $3::int)
      LIMIT 1`,
    [idInventario, nombreLimpio, excluirId]
  );
  return resultado.rowCount > 0;
}

// 0. Verificar si ya existe una tienda con ese nombre
// Petición: GET /api/tienda/existe-nombre?id_inventario=1&nombre=Central
// (debe ir ANTES de '/:id')
router.get('/existe-nombre', async (req, res) => {
  try {
    const { id_inventario, nombre } = req.query;
    const nombreLimpio = limpiarNombreTienda(nombre);
    const parsedIdInventario = id_inventario ? parseInt(id_inventario, 10) : null;

    if (!parsedIdInventario || !nombreLimpio) {
      return res.status(400).json({ error: 'id_inventario y nombre son requeridos' });
    }

    const existe = await existeNombreTienda(parsedIdInventario, nombreLimpio);
    return res.json({ existe });
  } catch (error) {
    console.error('Error en GET /api/tienda/existe-nombre:', error.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

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
      ORDER BY nombre ASC`,
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
      ORDER BY nombre ASC`,
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
    // 🚫 No permitir nombres repetidos dentro del mismo inventario
    const nombreLimpio = limpiarNombreTienda(nombre);
    const parsedIdInventario = id_inventario ? parseInt(id_inventario, 10) : null;
    if (parsedIdInventario && nombreLimpio) {
      const duplicado = await existeNombreTienda(parsedIdInventario, nombreLimpio);
      if (duplicado) {
        return res.status(409).json({
          error: 'duplicado',
          mensaje: `Ya existe una tienda creada con el nombre "${nombreLimpio}".`
        });
      }
    }

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
    // 🚫 No permitir renombrar a un nombre que ya usa otra tienda del inventario
    const actual = await pool.query(
      'SELECT nombre, id_inventario FROM tienda WHERE id_tienda = $1',
      [id]
    );
    if (actual.rows.length === 0) {
      return res.status(404).json({ error: 'tienda no encontrada' });
    }
    const { nombre: nombreActual, id_inventario: idInventarioActual } = actual.rows[0];
    const nombreNuevo = limpiarNombreTienda(nombre);
    const cambioNombre =
      limpiarNombreTienda(nombreActual).toLowerCase() !== nombreNuevo.toLowerCase();
    if (cambioNombre && idInventarioActual && nombreNuevo) {
      const duplicado = await existeNombreTienda(idInventarioActual, nombreNuevo, parseInt(id, 10));
      if (duplicado) {
        return res.status(409).json({
          error: 'duplicado',
          mensaje: `Ya existe una tienda creada con el nombre "${nombreNuevo}".`
        });
      }
    }

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