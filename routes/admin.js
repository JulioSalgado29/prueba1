const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// En app.js / server.js:
//   const adminRoutes = require('./routes/admin');
//   app.use('/api/admin', adminRoutes);
// Ese prefijo debe coincidir con _prefijo en lib/services/API/admin_service.dart

// 1. Listar inventarios con el nombre del propietario
// Petición: GET /api/admin/inventarios-listar
router.get('/inventarios-listar', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         i.id_inventario,
         i.id_propietario,
         i.id_plan,
         i.nombre AS inventario_nombre,
         p.nombre AS propietario_nombre
       FROM inventario i
       INNER JOIN propietario p ON i.id_propietario = p.id_propietario
       ORDER BY i.id_inventario`,
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /inventarios-listar:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Cambiar el inventario asociado a un usuario
// Petición: PUT /api/admin/usuario-inventario/:id_usuario
// Body: { "id_inventario": 1, "id_usuario_rol": 2 }   (id_usuario_rol es opcional)
router.put('/usuario-inventario/:id_usuario', async (req, res) => {
  try {
    const idUsuario = parseInt(req.params.id_usuario);
    const idInventario = parseInt(req.body.id_inventario);
    const idUsuarioRol =
      req.body.id_usuario_rol !== undefined && req.body.id_usuario_rol !== null
        ? parseInt(req.body.id_usuario_rol)
        : null;

    if (!Number.isInteger(idUsuario) || !Number.isInteger(idInventario)) {
      return res.status(400).json({ error: 'id_usuario e id_inventario son obligatorios' });
    }
    if (idUsuarioRol !== null && !Number.isInteger(idUsuarioRol)) {
      return res.status(400).json({ error: 'id_usuario_rol no es válido' });
    }

    // El inventario manda: de él sacamos el propietario al que se vinculará el usuario
    const inv = await pool.query(
      `SELECT id_propietario FROM inventario WHERE id_inventario = $1`,
      [idInventario]
    );
    if (inv.rows.length === 0) {
      return res.status(404).json({ error: 'Inventario no encontrado' });
    }

    const resultado = await pool.query(
      `UPDATE usuario
          SET id_propietario = $1,
              id_usuario_rol = COALESCE($2, id_usuario_rol)
        WHERE id_usuario = $3
        RETURNING id_usuario, id_propietario, id_usuario_rol`,
      [inv.rows[0].id_propietario, idUsuarioRol, idUsuario]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ ok: true, usuario: resultado.rows[0] });
  } catch (error) {
    console.error('Error en PUT /usuario-inventario/:id_usuario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Usuarios ocultos con su inventario actual
// Petición: GET /api/admin/usuarios-ocultos-listar
router.get('/usuarios-ocultos-listar', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT 
        co.id AS id_correo_oculto,
        co.email,
        u.id_usuario,
        u.nombre AS usuario_nombre,
        i.id_propietario,
        i.id_inventario,
        i.nombre AS inventario_nombre 
      FROM correos_ocultos co
      INNER JOIN usuario u ON co.email = u.email
      INNER JOIN inventario i ON i.id_propietario = u.id_propietario
      ORDER BY co.id`,
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /usuarios-ocultos-listar:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 4. Sesiones de Google agrupadas por día, con paginación
// Petición: GET /api/admin/sesiones-google?page=1&limit=30
router.get('/sesiones-google', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    const resultado = await pool.query(
      `SELECT 
        CASE EXTRACT(ISODOW FROM fecha_ingreso)
            WHEN 1 THEN 'Lunes'
            WHEN 2 THEN 'Martes'
            WHEN 3 THEN 'Miércoles'
            WHEN 4 THEN 'Jueves'
            WHEN 5 THEN 'Viernes'
            WHEN 6 THEN 'Sábado'
            WHEN 7 THEN 'Domingo'
        END AS nombre_dia,
        fecha_ingreso::date AS dia,
        email, 
        name, 
        COUNT(*) AS cantidad
      FROM sesion_google_log
      GROUP BY 
        EXTRACT(ISODOW FROM fecha_ingreso),
        fecha_ingreso::date, 
        email, 
        name
      ORDER BY dia DESC, cantidad DESC 
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      page,
      limit,
      totalRegistros: resultado.rows.length,
      data: resultado.rows
    });
  } catch (error) {
    console.error('Error en GET /sesiones-google:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 5. Historial de sesiones de Google, con paginación
// Petición: GET /api/admin/sesiones-google-historial?page=1&limit=30
router.get('/sesiones-google-historial', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    const resultado = await pool.query(
      `SELECT * 
       FROM sesion_google_log 
       ORDER BY fecha_ingreso DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      page,
      limit,
      totalRegistros: resultado.rows.length,
      data: resultado.rows
    });
  } catch (error) {
    console.error('Error en GET /sesiones-google-historial:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;