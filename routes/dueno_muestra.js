const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// Helper: normaliza el nombre para comparar (sin espacios extra)
const limpiarNombreDueno = (texto) => {
  if (!texto) return '';
  return String(texto).trim().replace(/\s+/g, ' ');
};

// Helper: ¿ya existe un dueño de muestra ACTIVO con ese nombre en el inventario?
// Compara sin distinguir mayúsculas/minúsculas ni espacios repetidos.
async function existeNombreDueno(idInventario, nombreLimpio) {
  const resultado = await pool.query(
    `SELECT 1
       FROM dueno_muestra
      WHERE estado = true
        AND id_inventario = $1
        AND LOWER(regexp_replace(TRIM(nombre), '\\s+', ' ', 'g')) = LOWER($2)
      LIMIT 1`,
    [idInventario, nombreLimpio]
  );
  return resultado.rowCount > 0;
}

// 0. Verificar si ya existe un dueño de muestra con ese nombre
// Petición: GET /api/dueno_muestra/existe-nombre?id_inventario=1&nombre=Juan
// (debe ir ANTES de '/:id')
router.get('/existe-nombre', async (req, res) => {
  try {
    const { id_inventario, nombre } = req.query;
    const nombreLimpio = limpiarNombreDueno(nombre);
    const parsedIdInventario = id_inventario ? parseInt(id_inventario, 10) : null;

    if (!parsedIdInventario || !nombreLimpio) {
      return res.status(400).json({ error: 'id_inventario y nombre son requeridos' });
    }

    const existe = await existeNombreDueno(parsedIdInventario, nombreLimpio);
    return res.json({ existe });
  } catch (error) {
    console.error('Error en GET /api/dueno_muestra/existe-nombre:', error.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 1. Listar dueno_muestra de un inventario
// Petición: GET /api/dueno_muestra/inventario/:id_inventario
router.get('/inventario/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_dueno_muestra,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        nombre,
        usuario_creacion
      FROM dueno_muestra
      WHERE estado = true AND 
            id_inventario = $1
      ORDER BY nombre DESC`,
      [id_inventario]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/dueno_muestra/inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Buscar dueno_muestra por ID
// Petición: GET /api/dueno_muestra/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT 
        id_dueno_muestra,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        nombre,
        usuario_creacion
      FROM dueno_muestra
      WHERE estado = true AND 
            id_dueno_muestra = $1
      ORDER BY nombre DESC`,
      [id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/dueno_muestra/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Insertar dueno_muestra
// Petición: POST /api/dueno_muestra
router.post('/', async (req, res) => {
  const { email_usuario, id_inventario, nombre, usuario_creacion } = req.body;

  const emailLimpio = email_usuario.trim().toLowerCase();

  try {
    // 🚫 No permitir nombres repetidos dentro del mismo inventario
    const nombreLimpio = limpiarNombreDueno(nombre);
    const parsedIdInventario = id_inventario ? parseInt(id_inventario, 10) : null;
    if (parsedIdInventario && nombreLimpio) {
      const duplicado = await existeNombreDueno(parsedIdInventario, nombreLimpio);
      if (duplicado) {
        return res.status(409).json({
          error: 'duplicado',
          mensaje: `Ya existe un dueño creado con el nombre "${nombreLimpio}".`
        });
      }
    }

    const nuevo = await pool.query(
      'INSERT INTO dueno_muestra (email_usuario, id_inventario, nombre, usuario_creacion) VALUES ($1, $2, $3, $4) RETURNING *',
      [emailLimpio, id_inventario, nombre, usuario_creacion]
    );

    res.status(201).json(nuevo.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/dueno_muestra:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 4. Editar dueno_muestra
// Petición: PUT /api/dueno_muestra/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { email_usuario, nombre, usuario_creacion } = req.body;

  const emailLimpio = email_usuario.trim().toLowerCase();

  try {
    const resultado = await pool.query(
      'UPDATE dueno_muestra SET email_usuario = $1, nombre = $2, usuario_creacion = $3 WHERE id_dueno_muestra = $4 RETURNING *',
      [emailLimpio, nombre, usuario_creacion, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'dueno_muestra no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en PUT /api/dueno_muestra/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 5. Eliminar dueno_muestra (Baja lógica)
// Petición: DELETE /api/dueno_muestra/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      'UPDATE dueno_muestra SET estado = $2 WHERE id_dueno_muestra = $1 RETURNING *',
      [id, false]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'dueno_muestra no encontrado' });
    }

    res.json({ mensaje: 'dueno_muestra eliminado correctamente' });
  } catch (error) {
    console.error('Error en DELETE /api/dueno_muestra/:id:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;